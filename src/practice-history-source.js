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
    if (/^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/.test(url.pathname)) {
      const page = document.querySelector(".practice-record-page");
      const stack = [page?.__vue__]; let v, count = 0;
      while (stack.length && ++count < 500) {
        const current = stack.pop();
        if (!current || current._isDestroyed) continue;
        if (["PracticeHistoryTab", "ErrbookTab", "QuestionCollectTab"].includes(current.$options?.name)) { v = current; break; }
        stack.push(...(current.$children || []));
      }
      if (!v || !Array.isArray(v.list) || v.list.length > 5000) return null;
      if (action === "more") {
        if (!v.loading && !v.noMore && typeof v.loadMore === "function") v.loadMore();
        return { kind: "loading" };
      }
      if (!["read", "sync", "all", "retry-all"].includes(action)) return null;
      const property = "__xetRecordListLoader", stopEvent = "xet:practice-history-stop-all";
      let state = window[property];
      if (state && (state.owner !== v || !state.live())) { state.stop(); state = null; }
      if (["all", "retry-all"].includes(action)) {
        const methods = v.$options.methods;
        const method = v.$options.name === "PracticeHistoryTab" ? "fetchData" : "fetchList";
        if (!state && typeof methods?.[method] === "function" && account && v.pagination &&
            Number.isSafeInteger(v.pagination.page) && v.pagination.page >= 1 &&
            Number.isSafeInteger(v.pagination.pageSize) && v.pagination.pageSize > 0) {
          const subTab = v.activeSubTab, filter = v.filterValue;
          const owner = v, controller = new AbortController();
          let unwatch, removeHook;
          state = { status: "waiting", owner, running: false, signal: controller.signal, originalMore: owner.loadMore };
          const ownsView = () => !owner._isDestroyed &&
            `${location.pathname}${location.search}` === expectedKey && window.USERID === account &&
            owner.activeSubTab === subTab && owner.filterValue === filter;
          const live = () => window[property] === state && !controller.signal.aborted && ownsView();
          state.live = live;
          const changed = () => { if (!live()) state.stop(); };
          state.stop = () => {
            state.release?.();
            if (state.running && ownsView()) owner.loading = false;
            controller.abort(); unwatch?.(); removeHook?.();
            window.removeEventListener(stopEvent, state.stop);
            window.removeEventListener("popstate", changed); window.removeEventListener("pagehide", state.stop);
            window.navigation?.removeEventListener("currententrychange", changed);
            if (window[property] === state) delete window[property];
          };
          window[property] = state;
          unwatch = owner.$watch?.(() => [owner.activeSubTab, owner.filterValue], changed);
          owner.$once?.("hook:beforeDestroy", state.stop);
          removeHook = () => owner.$off?.("hook:beforeDestroy", state.stop);
          window.addEventListener(stopEvent, state.stop); window.addEventListener("pagehide", state.stop);
          window.addEventListener("popstate", changed);
          window.navigation?.addEventListener("currententrychange", changed);
        }
        if (state && action === "retry-all" && state.status === "error") state.status = "waiting";
        if (state && !state.running && state.status === "waiting" && !v.loading) {
          state.running = true; state.status = v.noMore ? "done" : "running";
          const current = state, originalMore = state.originalMore, blockedMore = () => {};
          // Native infinite scroll must not race this reader for the same page.
          v.loadMore = blockedMore;
          current.release = () => { if (v.loadMore === blockedMore) v.loadMore = originalMore; };
          void (async () => {
            const rowKey = item => JSON.stringify([item?.join_id || item?.user_exam_id || "",
              item?.collection_id || item?.id || item?.resource_id || item?.source_id || item]);
            const pageKey = rows => JSON.stringify(rows.map(rowKey));
            const seen = new Set();
            for (let i = 0; i < v.list.length; i += v.pagination.pageSize) seen.add(pageKey(v.list.slice(i, i + v.pagination.pageSize)));
            try {
              while (current.live() && !v.noMore) {
                const before = v.list, beforePage = v.pagination.page, size = v.pagination.pageSize;
                const next = before.length ? beforePage + 1 : 1;
                const staged = { list: before.slice(), pagination: { page: next, pageSize: size },
                  activeSubTab: v.activeSubTab, filterValue: v.filterValue, loading: false, noMore: false };
                let wrote = false, timeout, cancel;
                const receiver = new Proxy(v, {
                  get(target, name) {
                    if (Object.hasOwn(staged, name)) return staged[name];
                    // Vue binds public methods to the real component. Use the
                    // original fetch functions with our receiver, including
                    // fetchData's nested practice/exam/exercise/drill calls.
                    if (typeof name === "string" && name.startsWith("fetch") && typeof methods[name] === "function") {
                      return (...args) => methods[name].apply(receiver, args);
                    }
                    return Reflect.get(target, name, target);
                  },
                  set(_target, name, value) { if (name === "list") wrote = true; staged[name] = value; return true; },
                });
                v.loading = true;
                try {
                  await Promise.race([methods[method].call(receiver), new Promise((_, reject) => {
                    cancel = () => reject(Error("canceled"));
                    current.signal.addEventListener("abort", cancel, { once: true });
                    timeout = setTimeout(() => reject(Error("timeout")), 15000);
                  })]);
                } finally { clearTimeout(timeout); if (cancel) current.signal.removeEventListener("abort", cancel); }
                if (!current.live()) return;
                if (v.list !== before || v.pagination.page !== beforePage) { current.stop(); return; }
                if (!wrote || !Array.isArray(staged.list) || staged.list.length < before.length) throw Error("page-failed");
                const added = staged.list.slice(before.length), fingerprint = pageKey(added);
                if (added.length && seen.has(fingerprint) || !added.length && !staged.noMore) throw Error("no-progress");
                if (staged.list.length > 5000) throw Error("too-many-records");
                seen.add(fingerprint);
                // Never skip a failed page. Commit pagination only with its
                // verified response, keeping existing row objects/click handlers.
                v.list = staged.list;
                v.pagination.page = next; v.noMore = Boolean(staged.noMore);
                if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") await scheduler.yield();
                else await new Promise(resolve => setTimeout(resolve, 0));
              }
              if (current.live()) current.status = "done";
            } catch { if (current.live()) current.status = "error"; }
            finally {
              current.running = false;
              // Leave native infinite-scroll paused on failure too; its
              // optimistic page++ would otherwise skip the failed page.
              if (current.status !== "error") current.release();
              if (current.live()) v.loading = false;
            }
          })();
        }
      }
      const allPages = ["all", "retry-all"].includes(action)
        ? { state: state?.status || "unsupported", count: v.list.length } : undefined;
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
      for (const card of cards) {
        card.removeAttribute("data-xet-history-row");
        const item = card.__vue__?.item;
        const index = v.list.indexOf(item);
        if (index >= 0) card.setAttribute("data-xet-history-row", String(index));
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
