(() => {
  // Serialized into MAIN. Record identities/metadata only, never answers or
  // credentials. Pagination reuses the site's read-only methods in a staged
  // receiver so a late response cannot modify a different tab/filter.
  function readContext(expectedKey, action = "read") {
    const url = new URL(location.href), id = /^[\w-]{1,160}$/;
    if (window.top !== window || `${url.pathname}${url.search}` !== expectedKey) return null;
    const account = typeof window.USERID === "string" && id.test(window.USERID) &&
      !window.USERID.includes("anonymous") ? window.USERID : "";
    const clean = value => typeof value === "string" && id.test(value) ? value : "";
    const text = value => typeof value === "string" ? value.slice(0, 1000) : "";
    const recordPath = /^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/;
    const tabNames = ["PracticeHistoryTab", "ErrbookTab", "QuestionCollectTab"];
    const fetchName = v => v.$options.name === tabNames[0] ? "fetchData" : "fetchList";
    const pagerKey = "__xetRecordListLoader";
    function createPager(root) {
      const scope = account, cache = new Map(), native = new WeakMap(), undo = new Set();
      const stopEvent = "xet:practice-history-stop-all", maxRows = 5000, freshFor = 120_000;
      const manager = { root, scope, job: null, stopped: false };
      const routeLive = () => recordPath.test(location.pathname) && window.USERID === scope;
      const keyFor = v => JSON.stringify([v.$options.name, v.activeSubTab, String(v.filterValue ?? ""), v.pagination.pageSize]);
      const supported = v => tabNames.includes(v.$options.name) && Array.isArray(v.list) &&
        Number.isSafeInteger(v.pagination?.page) && v.pagination.page >= 1 &&
        Number.isSafeInteger(v.pagination.pageSize) && v.pagination.pageSize > 0 && v.pagination.pageSize <= maxRows;
      const owns = v => !v._isDestroyed && (!root || tabNames[root.activeTab] === v.$options.name);
      const live = job => !manager.stopped && manager.job === job && routeLive() &&
        owns(job.v) && keyFor(job.v) === job.key;
      function remember(key, snapshot) {
        cache.delete(key); cache.set(key, snapshot);
        let rows = [...cache.values()].reduce((sum, value) => sum + value.rows.length, 0);
        while (cache.size > 16 || rows > 10_000) {
          const oldest = cache.keys().next().value;
          rows -= cache.get(oldest).rows.length; cache.delete(oldest);
        }
      }
      function stopJob() {
        const job = manager.job;
        if (!job) return;
        if (job.firstLoading && live(job)) job.v.loading = false;
        manager.job = null;
        job.abort.abort(); job.release?.(); job.unwatch?.();
        job.v.$off?.("hook:beforeDestroy", job.destroy);
      }
      const changedRoute = () => { if (!routeLive()) manager.stop(); };
      const stop = () => {
        stopJob(); manager.stopped = true; cache.clear();
        for (const detach of undo) detach();
        root?.$off?.("hook:beforeDestroy", stop);
        window.removeEventListener(stopEvent, stop); window.removeEventListener("pagehide", stop);
        window.removeEventListener("popstate", changedRoute);
        window.navigation?.removeEventListener("currententrychange", changedRoute);
        if (window[pagerKey] === manager) delete window[pagerKey];
      };
      manager.stop = stop;
      window.addEventListener(stopEvent, stop); window.addEventListener("pagehide", stop);
      window.addEventListener("popstate", changedRoute);
      window.navigation?.addEventListener("currententrychange", changedRoute);
      root?.$once?.("hook:beforeDestroy", stop);
      function show(v, snapshot) {
        if (v.list !== snapshot.rows) v.list = snapshot.rows;
        v.pagination.page = snapshot.page; v.noMore = snapshot.end;
      }
      async function readPage(job, number) {
        const { v, methods, fetch, size, sub, filter } = job;
        // The collection endpoint compares the accumulated length to its total.
        // Reserve the preceding slots without sharing another request's rows.
        const offset = (number - 1) * size;
        const staged = { list: new Array(offset), pagination: { page: number, pageSize: size },
          activeSubTab: sub, filterValue: filter, loading: false, noMore: false };
        let wrote = false, timeout, cancel;
        const receiver = new Proxy(v, {
          get(target, name) {
            if (Object.hasOwn(staged, name)) return staged[name];
            if (typeof name === "string" && name.startsWith("fetch") && typeof methods[name] === "function") {
              return (...args) => methods[name].apply(receiver, args);
            }
            return Reflect.get(target, name, target);
          },
          set(_target, name, value) { if (name === "list") wrote = true; staged[name] = value; return true; },
        });
        try {
          if (!live(job)) return null;
          const deadline = new Promise(resolve => {
            cancel = () => resolve(false);
            job.abort.signal.addEventListener("abort", cancel, { once: true });
            timeout = setTimeout(cancel, 15_000);
          });
          if (!await Promise.race([(async () => { await fetch.call(receiver); return true; })(), deadline])) return null;
          if (!wrote || !Array.isArray(staged.list) || staged.list.length < offset) return null;
          return { rows: staged.list.slice(offset), end: Boolean(staged.noMore) };
        } catch { return null; }
        finally { clearTimeout(timeout); if (cancel) job.abort.signal.removeEventListener("abort", cancel); }
      }
      async function run(job) {
        const { v, size } = job, requests = new Map();
        let snapshot = job.refresh ? null : job.display, terminal = Infinity;
        const fingerprints = new Set();
        const fingerprint = rows => JSON.stringify(rows.map(item => [item?.join_id || item?.user_exam_id || "",
          item?.collection_id || item?.id || item?.resource_id || item?.source_id || item]));
        for (let i = 0; i < (snapshot?.rows.length || 0); i += size) {
          fingerprints.add(fingerprint(snapshot.rows.slice(i, i + size)));
        }
        job.state = "running";
        try {
          while (live(job) && !snapshot?.end) {
            const next = (snapshot?.page || 0) + 1;
            // First page goes alone. Then keep a rolling window of three;
            // even fast later responses cannot commit ahead of a missing page.
            const last = next === 1 ? 1 : Math.min(next + 2, terminal, Math.floor(maxRows / size) + 1);
            if (last < next) throw Error("row limit");
            for (let page = next; page <= last; page++) {
              if (requests.has(page)) continue;
              requests.set(page, (async () => {
                const result = await readPage(job, page);
                if (result?.end) terminal = Math.min(terminal, page);
                return result;
              })());
            }
            const chunk = await requests.get(next); requests.delete(next);
            if (!live(job)) return;
            const key = chunk && fingerprint(chunk.rows);
            if (!chunk || chunk.rows.length > size || !chunk.rows.length && !chunk.end ||
                chunk.rows.length && fingerprints.has(key)) throw Error("incomplete page");
            const rows = (snapshot?.rows || []).concat(chunk.rows);
            if (rows.length > maxRows) throw Error("row limit");
            fingerprints.add(key);
            snapshot = { rows, page: next, end: chunk.end, at: snapshot?.at ?? Date.now() };
            if (!job.refresh || snapshot.end) {
              job.display = snapshot; show(v, snapshot); remember(job.key, snapshot);
            }
            if (job.firstLoading) { v.loading = false; job.firstLoading = false; }
            if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") await scheduler.yield();
            else await new Promise(resolve => setTimeout(resolve, 0));
          }
          if (live(job)) job.state = "done";
        } catch { if (live(job)) job.state = "error"; }
        finally {
          job.abort.abort();
          if (live(job)) {
            if (job.firstLoading) { v.loading = false; job.firstLoading = false; }
            if (job.state === "done") job.release?.();
          }
        }
      }
      function resume(job) {
        if (job.state !== "waiting" || job.v.loading) return;
        const v = job.v;
        if (job.display) show(v, job.display);
        else if (!job.reset && (v.list.length || v.noMore)) {
          job.display = { rows: v.list, page: v.pagination.page, end: Boolean(v.noMore), at: Date.now() };
          remember(job.key, job.display);
        }
        if (job.display?.end && !job.refresh) { job.state = "done"; job.release?.(); }
        else {
          if (!job.display) { job.firstLoading = true; v.loading = true; }
          void run(job);
        }
      }
      function guardMore(job) {
        if (job.release) return;
        const v = job.v, original = v.loadMore, blocked = () => {};
        v.loadMore = blocked;
        job.release = () => {
          if (v.loadMore === blocked) v.loadMore = original;
          job.release = null;
        };
      }
      function select(v, retry = false, reset = false) {
        const method = fetchName(v), methods = v.$options.methods, fetch = native.get(v) || methods?.[method];
        if (manager.stopped || !routeLive() || !owns(v) || !supported(v) || typeof fetch !== "function") return null;
        let job = manager.job;
        const key = keyFor(v);
        if (!job || job.v !== v || job.key !== key) {
          stopJob();
          const saved = cache.get(key);
          job = { v, key, methods, fetch, reset, size: v.pagination.pageSize, sub: v.activeSubTab,
            filter: v.filterValue, display: saved || null, refresh: Boolean(saved && Date.now() - saved.at >= freshFor),
            state: "waiting", abort: new AbortController() };
          manager.job = job;
          job.destroy = () => { if (manager.job === job) stopJob(); };
          v.$once?.("hook:beforeDestroy", job.destroy);
          job.unwatch = v.$watch?.(() => keyFor(v), () => { if (manager.job === job && !live(job)) stopJob(); });
          guardMore(job);
          if (saved) remember(key, saved);
        }
        if (retry && job.state === "error") {
          job.state = "waiting"; job.abort = new AbortController(); guardMore(job);
        }
        resume(job);
        return { state: job.state, count: v.list.length };
      }
      function atFirst(v, fetch, args) {
        if (!manager.stopped && routeLive() && owns(v) && supported(v) && v.pagination.page === 1 && !v.list.length) {
          native.set(v, fetch);
          const current = manager.job;
          if (current?.v === v && current.key === keyFor(v)) {
            if (current.display) show(v, current.display);
            return select(v);
          }
          // Native tab/filter handlers reset the list before calling us.
          // A hit is restored in the same turn, before Vue paints that reset.
          v.loading = false;
          return select(v);
        }
        return fetch.apply(v, args);
      }
      manager.update = (v, retry, reset) => {
        const method = fetchName(v), fetch = v.$options.methods?.[method];
        if (!native.has(v) && !v.loading && typeof fetch === "function" && typeof v[method] === "function") {
          native.set(v, fetch);
          const original = v[method], wrapped = (...args) => atFirst(v, fetch, args);
          v[method] = wrapped;
          const detach = () => {
            if (v[method] === wrapped) v[method] = original;
            v.$off?.("hook:beforeDestroy", detach); undo.delete(detach);
          };
          undo.add(detach); v.$once?.("hook:beforeDestroy", detach);
        }
        return select(v, retry, reset);
      };
      // The site uses v-if for its three main tabs. Override only this page
      // instance's local registrations so new children can hydrate in created().
      const components = root?.$options.components, base = root?.$options._base;
      if (components && typeof base?.extend === "function") {
        const local = Object.create(components);
        for (const name of tabNames) {
          const definition = components[name], options = definition?.options || definition;
          const method = name === tabNames[0] ? "fetchData" : "fetchList", fetch = options?.methods?.[method];
          if (typeof fetch !== "function") continue;
          const ctor = typeof definition === "function" ? definition : base.extend(definition);
          if (typeof ctor.extend === "function") local[name] = ctor.extend({ methods: {
            [method](...args) { return atFirst(this, fetch, args); },
          } });
        }
        root.$options.components = local;
        undo.add(() => { if (root.$options.components === local) root.$options.components = components; });
      }
      return manager;
    }
    const sheet = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/([\w-]+)\/?$/);
    if (sheet && action === "capture") {
      const v = document.querySelector(".practice-sheet")?.__vue__, state = window.__xetPracticeMarks;
      const saved = state?.recovery;
      if (!account || !v || !state?.active || state.owner !== v || state.joinId !== v.join_id ||
          v.resourceId !== sheet[1] || !clean(v.join_id) || !saved?.reported || !saved.submittedAt) return null;
      // The native answer card is populated from the complete commit_record
      // list, independently of lazy-rendered questions. Missing flags are unknown.
      const cards = v.answerSheetArray;
      const complete = Array.isArray(cards) && cards.length > 0 && cards.length === v.totalPracticeNum &&
        cards.every(q => typeof q?.hasAnswer === "boolean");
      return { kind: "attempt", key: expectedKey, account, resourceId: sheet[1], joinId: v.join_id,
        hasAnswers: complete ? cards.some(q => q.hasAnswer) : null,
        taskId: clean(v.taskId), productId: clean(v.course_id || url.searchParams.get("product_id")),
        title: text(v.practiceTitle || v.practice_title || document.title), submittedAt: saved.submittedAt };
    }
    if (recordPath.test(url.pathname)) {
      const page = document.querySelector(".practice-record-page");
      const stack = [page?.__vue__]; let v, count = 0;
      while (stack.length && ++count < 500) {
        const current = stack.pop();
        if (!current || current._isDestroyed) continue;
        if (tabNames.includes(current.$options?.name)) { v = current; break; }
        stack.push(...(current.$children || []));
      }
      if (!v || !Array.isArray(v.list) || v.list.length > 5000) return null;
      if (action === "more") {
        if (!v.loading && !v.noMore && typeof v.loadMore === "function") v.loadMore();
        return { kind: "loading" };
      }
      if (!["read", "sync", "all", "retry-all"].includes(action)) return null;
      let allPages;
      if (["all", "retry-all"].includes(action)) {
        let manager = window[pagerKey];
        const root = v.$parent?.$options?.name === "PracticeRecord" ? v.$parent : null;
        const switchedAccount = Boolean(manager && manager.scope !== account);
        if (manager && (manager.root !== root || switchedAccount)) { manager.stop(); manager = null; }
        if (switchedAccount && v.pagination) {
          v.list = []; v.pagination.page = 1; v.noMore = false;
        }
        if (account && !manager && typeof v.$options.methods?.[fetchName(v)] === "function") {
          manager = window[pagerKey] = createPager(root);
        }
        allPages = manager?.update(v, action === "retry-all", switchedAccount) || { state: "unsupported", count: v.list.length };
      }
      const collections = v.$options.name === "QuestionCollectTab";
      // Missing/invalid counts are unknown, not empty. Never infer emptiness
      // from the card's `qs_count || 0` presentation fallback.
      const questionCount = item => {
        const value = item?.qs_count;
        if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value.trim()))) return null;
        const count = Number(value);
        return Number.isSafeInteger(count) && count >= 0 ? count : null;
      };
      const cards = [...page.querySelectorAll(".resource-card")];
      const rowIndexes = new Map(v.list.map((item, index) => [item, index]));
      for (const card of cards) {
        const item = card.__vue__?.item;
        const index = rowIndexes.get(item) ?? -1;
        if (index < 0) card.removeAttribute("data-xet-history-row");
        else if (card.getAttribute?.("data-xet-history-row") !== String(index)) card.setAttribute("data-xet-history-row", String(index));
        if (collections && index >= 0 && questionCount(item) === 0) card.setAttribute("data-xet-empty-collection", "");
        else card.removeAttribute("data-xet-empty-collection");
      }
      // Keep the native list and raw total intact: its pagination compares
      // list.length with the server total, which includes the empty groups.
      if (collections) return { kind: "collections", account, key: expectedKey, tab: v.activeSubTab, allPages,
        loading: Boolean(v.loading), noMore: Boolean(v.noMore),
        rows: v.list.map(item => ({ resourceId: clean(item.resource_id), questionCount: questionCount(item) })) };
      if (v.$options.name === "ErrbookTab") return { kind: "errors", account, key: expectedKey, tab: v.activeSubTab, allPages,
        loading: Boolean(v.loading), noMore: Boolean(v.noMore), rows: v.list.map(item => ({ resourceId: clean(item.source_id) })) };
      return { kind: "list", account, key: expectedKey, tab: v.activeSubTab, allPages,
        loading: Boolean(v.loading), noMore: Boolean(v.noMore),
        rows: v.list.map(item => ({ resourceId: clean(item.practice_id || item.id),
          title: text(item.name || item.title), productId: clean(item.resource_id || item.product_id),
          taskId: clean(item.task_id), joinId: clean(item.join_id),
          startedAt: ["string", "number"].includes(typeof (item.join_time || item.start_time))
            ? item.join_time || item.start_time : null })) };
    }
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/(practice_result|practice_analysis)\/([\w-]+)\/?$/);
    const joinId = clean(url.searchParams.get("join_id"));
    if (!match || !account || !joinId || !["read", "capture"].includes(action)) return null;
    const root = document.querySelector(match[1] === "practice_analysis" ? ".practice-analysis" : ".practice-result");
    let node = root, v;
    while (node && !v) { v = node.__vue__; node = node.parentElement; }
    if (!v || (v.resourceId || v.practice_id) !== match[2] || v.join_id !== joinId ||
        (match[1] === "practice_analysis" ? !v.practiceList?.length : !(v.resultPageData?.totalNum > 0))) return null;
    return { kind: "attempt", key: expectedKey, account, resourceId: match[2], joinId,
      productId: clean(url.searchParams.get("product_id") || v.course_id),
      taskId: clean(url.searchParams.get("task_id") || v.taskId),
      title: text(v.practice_title || v.practiceTitle || document.title), startedAt: null };
  }

  // This is only an in-flight write lock; records themselves live in storage.
  let writes = Promise.resolve();
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        !["read", "more", "all", "retry-all", "discover", "capture", "sync"].includes(message.action) || typeof message.key !== "string" || message.key.length > 1000) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || settings.disabledSites.includes(site.origin) || !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: readContext,
      args: [message.key, message.action === "discover" ? "read" : message.action] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    const context = result?.result;
    if (!context) return { ok: false, reason: "not-ready" };
    if (["capture", "sync"].includes(message.action)) {
      if (!context.account || (message.action === "capture" ? context.kind !== "attempt" : context.kind !== "list")) return { ok: false };
      const previous = writes;
      const work = (async () => {
        try { await previous; } catch { /* One failed write must not poison later submissions. */ }
        const data = globalThis.__xetPlayerHelperModules.practiceHistoryData;
        if (message.action === "capture" && !await data.save(chrome.storage.local, site.origin, context.account, context)) return { ok: false };
        const status = await data.synchronize(chrome.storage.local, chrome.storage.sync, site.origin, context.account);
        return { ok: true, ...status, context };
      })();
      writes = work;
      return await work;
    }
    if (message.action !== "discover") return { ok: true, context };
    if (context.kind !== "list" || !context.account) return { ok: false };
    // Recover links from already-open result/analysis pages; never open tabs,
    // join a practice, or use another account's stale page as a record source.
    const pages = await chrome.tabs.query({ url: [
      `${site.origin}/p/t_pc/pc_evaluation/practice_result/*`,
      `${site.origin}/p/t_pc/pc_evaluation/practice_analysis/*`,
    ] });
    const attempts = [];
    for (const page of pages) {
      try {
        const url = new URL(page.url);
        if (url.origin !== site.origin) continue;
        const [r] = await chrome.scripting.executeScript({ target: { tabId: page.id, frameIds: [0] },
          world: "MAIN", func: readContext, args: [`${url.pathname}${url.search}`, "read"] });
        if (r?.result?.kind === "attempt" && r.result.account === context.account) attempts.push(r.result);
      } catch { /* A page may close or navigate during discovery. */ }
    }
    return { ok: true, context, attempts };
  }
  globalThis.XetPracticeHistorySource = Object.freeze({ readContext, resolve });
})();
