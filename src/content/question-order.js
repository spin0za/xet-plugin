(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.questionOrder) return;
  const PREFIX = "xetQuestionOrder:";
  const BADGE = "data-xet-original-question-number";
  const READY = "xet:question-order-ready";
  const STOP_WATCH = "xet:question-order-stop-watch";
  const STYLE = ".xet-question-order-label{display:inline-block;margin:0 0 8px;color:#333;font:500 16px/1.5 sans-serif}.xet-question-order-hint{margin:12px 0;color:#666;font:14px/1.6 sans-serif}" +
    ".xet-wrong-count{display:inline-block;margin-inline:8px 4px;padding:1px 7px;border:0;border-radius:5px;white-space:nowrap;color:#713d11;background:#fff0df;font:500 13px/1.5 sans-serif}";

  function routeKey() {
    const match = location.pathname.match(/^\/p\/t_pc\/pc_evaluation\/(practice|practice_sheet|practice_analysis|errbook\/(?:detail|practice))\/([\w-]+)\/?$/);
    if (!match) return "";
    const query = new URLSearchParams(location.search);
    const book = match[1].startsWith("errbook/"), review = match[1] === "errbook/practice";
    const source = book ? query.get("source_id") || "" : match[2];
    if (!/^[\w-]{1,160}$/.test(source) || (book && (query.get("tab") || "1") !== "1")) return "";
    const questionId = query.get("question_id") || "";
    if (review && (query.get("readonly") !== "1" || questionId && !/^[\w-]{1,160}$/.test(questionId))) return "";
    return `${location.pathname}|${source}|${query.get("task_id") || ""}|${query.get("join_id") || ""}|${query.get("tab") || "1"}` +
      (review ? `|${questionId}|1` : "");
  }

  function validOrder(record) {
    return record?.version === 1 && Array.isArray(record.ids) && record.ids.length > 0 && record.ids.length <= 2000 &&
      record.ids.every(id => typeof id === "string" && /^[\w-]{1,160}$/.test(id)) &&
      new Set(record.ids).size === record.ids.length;
  }

  function compileOrders(stored, prefix) {
    // A missing task ID is site metadata loss, not evidence of a new task.
    // Fall back only within this origin/source and only to unanimous ordinals.
    return Object.entries(stored).filter(([name, record]) => name.startsWith(prefix) &&
      /^[\w-]{0,160}$/.test(name.slice(prefix.length)) && validOrder(record)).map(([name, record]) => ({
        task: name.slice(prefix.length), signature: JSON.stringify(record.ids),
        numbers: new Map(record.ids.map((id, i) => [id, i + 1])),
      }));
  }

  function resolveOrdering(questions, stored, prefix, records = compileOrders(stored, prefix)) {
    const byTask = new Map(records.map(record => [record.task, record]));
    const usedOrders = new Set();
    const numbers = questions.map(q => {
      const exact = byTask.get(q.taskId);
      const candidates = exact ? [exact] : q.taskId ? [] : records.filter(r => r.numbers.has(q.id));
      const ordinals = new Set(candidates.map(r => r.numbers.get(q.id)).filter(Boolean));
      if (ordinals.size !== 1) return undefined;
      for (const record of candidates) usedOrders.add(record.signature);
      return [...ordinals][0];
    });
    const tasks = new Set(questions.map(q => q.taskId));
    const knownTasks = new Set(questions.map(q => q.taskId).filter(Boolean));
    const sortable = tasks.size === 1 && (!tasks.has("") || byTask.has("")) ||
      knownTasks.size <= 1 && usedOrders.size === 1 && questions.every((q, i) => q.taskId || numbers[i]);
    return { numbers, sortable };
  }

  function createOrderCache(storage, origin) {
    const prefix = `${PREFIX}${origin}|`, indexes = new Map(), updates = new Map();
    let records = null, read = null, epoch = 0;
    async function warm() {
      if (records) return;
      if (read) return read;
      const current = epoch;
      read = (async () => {
        // One disk read per enabled page lifetime, not once per render. Keep
        // only this merchant's numbering metadata, never unrelated settings.
        const all = await storage.get(null);
        if (current !== epoch) return;
        records = Object.fromEntries(Object.entries(all).filter(([name]) => name.startsWith(prefix)));
        for (const [name, value] of updates) {
          if (value === undefined) delete records[name]; else records[name] = value;
        }
        updates.clear();
      })();
      try { await read; } finally { if (current === epoch) read = null; }
    }
    async function index(source) {
      await warm();
      if (!records) return [];
      const sourcePrefix = `${prefix}${source}|`;
      if (!indexes.has(sourcePrefix)) indexes.set(sourcePrefix, compileOrders(records, sourcePrefix));
      return indexes.get(sourcePrefix);
    }
    function update(changes) {
      let affected = false;
      for (const [name, change] of Object.entries(changes)) {
        if (!name.startsWith(prefix)) continue;
        affected = true;
        indexes.delete(name.slice(0, name.lastIndexOf("|") + 1));
        if (!records) updates.set(name, change.newValue);
        else if (change.newValue === undefined) delete records[name];
        else records[name] = change.newValue;
      }
      return affected;
    }
    function clear() { epoch++; records = read = null; indexes.clear(); updates.clear(); }
    return Object.freeze({ warm, index, update, clear });
  }

  function createQuestionOrderController({ request = message => chrome.runtime.sendMessage(message),
    storage = chrome.storage.local, syncStorage = chrome.storage.sync } = {}) {
    let started = false, key = "", timer = null, frame = null, observer = null;
    let generation = 0, loading = false, pending = false, needsRetry = false, capturedJoin = "";
    let abort = null, style = null, hint = null, restoreOrder = [];
    const labels = new Map();
    const badges = new Map(), countCache = new Map();
    let countJob = null;
    let baselineStarted = false, waitingForSheet = false;
    const reviewText = new Map();
    const autoRequested = new Set();
    const autoResults = new Map();
    let helperFinished = false;
    const cache = createOrderCache(storage, location.origin);
    const observe = () => observer?.observe(document.body, { childList: true, subtree: true,
      characterData: location.pathname.includes("/errbook/practice/") });
    const cacheKey = (source, task) => `${PREFIX}${location.origin}|${source}|${task}`;

    async function post(path, payload, signal) {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
      if (!response.ok) throw new Error("Question order unavailable");
      const result = await response.json();
      if (result.code !== 0) throw new Error("Question order unavailable");
      return result.data;
    }

    function wrongCounts(context, current) {
      const api = modules.wrongAttemptCounts, history = modules.practiceHistoryData;
      if (!api || !history || !context.account || !abort) return null;
      const key = JSON.stringify([context.account, context.sourceId, context.questions.map(q => [q.id, q.taskId])]);
      const cached = countCache.get(key);
      if (cached?.until > Date.now()) return cached.result;
      if (countJob?.key === key) return cached?.result || null;
      const job = { key, signal: abort.signal };
      countJob = job;
      void (async () => {
        let result;
        try {
          const records = await history.loadBoth(storage, syncStorage, location.origin, context.account);
          if (job.signal.aborted) return;
          result = await api.readCounts(records, context.sourceId, post, job.signal,
            { storage, origin: location.origin, account: context.account }, context.questions);
        } catch { result = { counts: new Map(), checked: 0, total: 0 }; }
        if (countJob !== job || current !== generation || job.signal.aborted || !started) return;
        countJob = null;
        countCache.delete(key); countCache.set(key, { result, until: Date.now() + 120_000 });
        if (countCache.size > 12) countCache.delete(countCache.keys().next().value);
        schedule();
      })();
      return cached?.result || null;
    }
    function countBadge(owner, question, result, anchor, fallback) {
      const api = modules.wrongAttemptCounts;
      let badge = badges.get(owner);
      if (!api || !question || !(anchor || fallback)) {
        badge?.remove(); badges.delete(owner); return;
      }
      const id = api.keyOf(question.id, question.taskId || null);
      const verified = result?.counts.get(id);
      if (!badge?.isConnected) {
        badge = document.createElement("span"); badge.className = "xet-wrong-count"; badges.set(owner, badge);
      }
      if (anchor && anchor.nextElementSibling !== badge) anchor.after(badge);
      else if (!anchor && fallback.firstElementChild !== badge) fallback.prepend(badge);
      const title = result?.official?.has(id) ? "个人作答次数减去答对次数，来自原站解析。"
        : verified ? "原站个人统计不可用，按已有作答记录统计。" : "已在错题本中，至少错过一次。";
      if (badge.title !== title) badge.title = title;
      const text = `错${verified ?? 1}次`;
      if (badge.textContent !== text) badge.textContent = text;
    }
    function pruneBadges() {
      for (const [owner, badge] of badges) if (!owner.isConnected) { badge.remove(); badges.delete(owner); }
    }

    function restoreReviewText() {
      for (const [node, record] of reviewText) if (node.isConnected && node.data === record.applied) node.data = record.original;
      reviewText.clear();
    }
    function clear() {
      generation++; abort?.abort(); abort = null;
      countJob = null;
      baselineStarted = waitingForSheet = false;
      loading = pending = needsRetry = false; capturedJoin = "";
      autoRequested.clear(); autoResults.clear(); helperFinished = false;
      window.dispatchEvent(new Event(STOP_WATCH));
      observer?.disconnect();
      restoreReviewText();
      for (const label of labels.values()) label.remove();
      labels.clear(); hint?.remove(); hint = null;
      for (const badge of badges.values()) badge.remove();
      badges.clear();
      for (const card of document.querySelectorAll("[data-xet-question-order-id]")) card.removeAttribute("data-xet-question-order-id");
      // Move existing nodes back; never clone cards or replace site event handlers.
      const surviving = restoreOrder.filter(card => card.isConnected);
      const parent = surviving[0]?.parentElement;
      if (parent) {
        for (const card of surviving) if (card.parentElement === parent) parent.append(card);
      }
      restoreOrder = []; observe();
    }

    function setHint(parent, text) {
      if (!text) { hint?.remove(); hint = null; return; }
      if (!hint?.isConnected) {
        hint = document.createElement("p"); hint.className = "xet-question-order-hint";
        hint.setAttribute("role", "status"); parent.before(hint);
      }
      // Repeated readiness retries must not repeatedly announce the same text.
      if (hint.textContent !== text) hint.textContent = text;
    }
    function recognitionFailed() {
      if (!started || routeKey() !== key || !location.pathname.includes("/errbook/detail/")) return;
      const parent = document.querySelectorAll(".errbook-detail-page .question-list > .question-card")[0]?.parentElement;
      // Do not insert errors in a loading/empty page, nor mutate unverified
      // question identities or open a practice while recognition has failed.
      if (!parent) return;
      observer.disconnect();
      try { setHint(parent, "暂时无法识别原题号，插件正在重试。若持续出现，请刷新页面或反馈此问题。"); }
      finally { if (started) observe(); }
    }

    async function capture(context, signal, current) {
      if (capturedJoin === context.joinId) return "ready";
      const records = await cache.index(context.sourceId);
      if (!started || current !== generation || routeKey() !== key) return;
      // Persisted orders are complete, verified fixed-order mappings. Attempts
      // share them only within the exact merchant/source/task, never by join ID
      // or the taskless fallback used to display error-book cards.
      if (records.some(record => record.task === context.taskId)) {
        capturedJoin = context.joinId;
        return "ready";
      }
      // A random practice has attempt-specific numbers, not a single original
      // order. Do not overwrite a reliable mapping with a shuffled attempt.
      const config = await post(context.taskId ? "/xe.practice.bff/task/answer.config.get/1.0.0"
        : "/evaluation_wechat/practices/detail", context.taskId
        ? { practice_id: context.sourceId, task_id: context.taskId } : { resource_id: context.sourceId }, signal);
      if (!started || current !== generation || routeKey() !== key) return;
      const setting = context.taskId ? config.random_setting : config.is_random;
      const fixed = setting === 0 || setting === "0" || setting === -1 || setting === "-1";
      if (!fixed) {
        await storage.remove(cacheKey(context.sourceId, context.taskId));
        cache.update({ [cacheKey(context.sourceId, context.taskId)]: {} });
        capturedJoin = context.joinId; return "random";
      }
      const paper = await post("/evaluation_wechat/practices/commit_record", {
        practice_id: context.sourceId, task_id: context.taskId, join_id: context.joinId, filter_delete: false,
      }, signal);
      const record = { version: 1, ids: paper?.list?.map(q => q.id), savedAt: Date.now() };
      if (!validOrder(record) || (context.taskId && record.ids.length !== Number(config.task_total_qs))) return "failed";
      if (!started || current !== generation || routeKey() !== key) return;
      // Keep prior mappings: they restore original numbers, not disposable cache.
      await storage.set({ [cacheKey(context.sourceId, context.taskId)]: record });
      cache.update({ [cacheKey(context.sourceId, context.taskId)]: { newValue: record } });
      capturedJoin = context.joinId;
      return "ready";
    }

    async function autoLoad(context, records, numbers, current) {
      const tasks = new Set(context.questions.filter((q, i) => q.taskId && !numbers[i]).map(q => q.taskId));
      if (!records.length && context.questions.length && context.questions.every(q => !q.taskId)) tasks.add("");
      for (const taskId of tasks) {
        if (!started || current !== generation) continue;
        const checking = autoRequested.has(taskId);
        if (checking && autoResults.get(taskId) !== "pending") continue;
        autoRequested.add(taskId);
        const previous = autoResults.get(taskId);
        try {
          const result = await request({ type: checking ? "xet:question-order-job-status" : "xet:question-order-auto-load", key: context.key, taskId });
          if (!started || current !== generation || routeKey() !== key) return;
          autoResults.set(taskId, result?.ok ? result.status : "failed");
        } catch {
          if (!started || current !== generation || routeKey() !== key) return;
          autoResults.set(taskId, "failed");
        }
        // Report the outcome, but never retry by creating repeated attempts.
        needsRetry = [...autoResults.values()].includes("pending");
        if (autoResults.get(taskId) !== previous) schedule();
      }
    }

    async function finishHelper(status) {
      if (helperFinished || !new URLSearchParams(location.search).has("xet_order_job")) return;
      helperFinished = true;
      try { await request({ type: "xet:question-order-job-finish", status,
        token: new URLSearchParams(location.search).get("xet_order_job") }); }
      catch { /* The worker's deadline alarm still cleans up this owned tab. */ }
    }

    async function render(context, current) {
      const records = await cache.index(context.sourceId);
      if (!started || current !== generation || routeKey() !== key) return;
      const { numbers, sortable } = resolveOrdering(context.questions, {}, "", records);
      const stats = wrongCounts(context, current);
      const cards = [...document.querySelectorAll(".errbook-detail-page .question-list > .question-card")];
      if (cards.length !== context.cardIds.length) return;
      const byId = new Map(cards.map(card => [card.getAttribute("data-xet-question-order-id"), card]));
      if (byId.size !== cards.length || context.questions.some(q => !byId.has(q.id))) return;
      restoreOrder = context.questions.map(q => byId.get(q.id));
      const parent = cards[0]?.parentElement;
      if (!parent) { hint?.remove(); hint = null; return; }
      const numbered = context.questions.map((q, nativeIndex) => ({ ...q, card: byId.get(q.id), nativeIndex,
        number: numbers[nativeIndex] }));
      // Missing task metadata may share a verified full order. Genuinely
      // different tasks/orders remain incomparable and keep their native order.
      if (sortable) numbered.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.nativeIndex - b.nativeIndex);
      observer.disconnect();
      try {
        for (let i = 0; i < numbered.length; i++) {
          if (!started || current !== generation || routeKey() !== key) return;
          const question = numbered[i], { card, number } = question;
          if (!card.isConnected || card.parentElement !== parent) { pending = true; return; }
          let label = labels.get(card);
          if (number) {
            if (!label || !label.isConnected) {
              label = document.createElement("span"); label.className = "xet-question-order-label";
              label.setAttribute(BADGE, ""); card.querySelector(".card-body")?.prepend(label);
              labels.set(card, label);
            }
            label.textContent = `${number}.`;
          } else { label?.remove(); labels.delete(card); label = null; }
          countBadge(card, question, stats, label, card.querySelector(".card-body"));
          if (parent.children[i] !== card) parent.insertBefore(card, parent.children[i] || null);
          if ((i + 1) % 20 === 0) {
            observe();
            await new Promise(resolve => requestAnimationFrame(resolve));
            observer?.disconnect();
          }
        }
        for (const [card, label] of labels) if (!card.isConnected) { label.remove(); labels.delete(card); }
        pruneBadges();
        const unknown = numbered.some(q => !q.number);
        const outcomes = numbered.filter(q => !q.number).map(q => autoResults.get(q.taskId));
        const feedback = outcomes.includes("failed") ? "原题号后台读取未能完成，请刷新页面重试；插件不会猜填题号。"
          : outcomes.includes("unavailable") ? "无法确认原练习的固定顺序，后台读取未启动；随机或未知顺序的题目不猜填题号。"
          : outcomes.includes("pending") ? "正在后台读取原题号，完成后会自动显示。"
          : "部分原题号尚未取得；缺少来源信息或顺序冲突的题目不猜填题号。";
        setHint(parent, unknown ? feedback : "");
      } finally { if (started) observe(); }
      // Render cache hits before starting any network work or opening a tab.
      void autoLoad(context, records, numbers, current);
    }

    async function renderReview(context, current) {
      const records = await cache.index(context.sourceId);
      if (!started || current !== generation || routeKey() !== key) return;
      const page = document.querySelector(".errbook-practice");
      if (!page) return;
      const wrappers = [...page.querySelectorAll(".all-questions-container > .question-wrapper")];
      const cells = [...page.querySelectorAll(".answer-card__content__card__item")];
      if (wrappers.length !== context.questions.length || cells.length !== context.questions.length ||
          wrappers.some((wrapper, i) => wrapper.getAttribute("data-xet-question-order-id") !== context.questions[i].id)) return;
      const { numbers } = resolveOrdering(context.questions, {}, "", records);
      const stats = wrongCounts(context, current);
      const touched = new Set();
      function display(element, text) {
        // Change only the native number text node, never replace a cell, icon,
        // event handler, anchor ID, Vue answerIndex or internal current index.
        const node = [...(element?.childNodes || [])].find(n => n.nodeType === 3 && n.data.trim());
        if (!node) return;
        let record = reviewText.get(node);
        if (!record) { record = { original: node.data }; reviewText.set(node, record); }
        else if (node.data !== record.applied) record.original = node.data;
        record.applied = text; touched.add(node);
        if (node.data !== text) node.data = text;
      }
      observer.disconnect();
      try {
        for (let i = 0; i < wrappers.length; i++) {
          const wrapper = wrappers[i], number = numbers[i] || "?";
          display(wrapper.querySelector(".question-block__meta > .question-block__index"), `${number}.`);
          // Material subquestion numbers are local to their parent: leave them.
          if (!wrapper.classList.contains("is-material-wrapper")) display(wrapper.querySelector(".question-header .question-index"), `${number}.`);
          const anchor = (!wrapper.classList.contains("is-material-wrapper") && wrapper.querySelector(".question-header .question-index")) ||
            wrapper.querySelector(".question-block__meta > .question-block__index");
          countBadge(wrapper, context.questions[i], stats, anchor);
          display(cells[i].querySelector("span"), String(number));
        }
        pruneBadges();
        for (const [node, record] of reviewText) if (!touched.has(node)) {
          if (node.isConnected && node.data === record.applied) node.data = record.original;
          reviewText.delete(node);
        }
        if (wrappers[0]) setHint(wrappers[0], numbers.some(n => !n)
          ? "原题号尚未取得或存在冲突，请先打开对应错题列表读取；插件不会猜填题号。" : "");
      } finally { if (started) observe(); }
      // Readonly review reuses verified numbering only. Never create a new
      // attempt or invoke the legacy tab helper from a single-question view.
    }

    async function refresh() {
      const next = routeKey();
      if (next !== key) { clear(); key = next; }
      if (!started || !key) return;
      if (loading) { pending = true; return; }
      loading = true; pending = false;
      const current = generation;
      abort ||= new AbortController();
      try {
        if (location.pathname.includes("/errbook/")) void cache.warm().catch(() => {});
        const result = await request({ type: "xet:question-order-context", key });
        if (!started) { window.dispatchEvent(new Event(STOP_WATCH)); return; }
        if (current !== generation || routeKey() !== key) return;
        if (!result?.ok || result.context?.key !== key) { needsRetry = true; restoreReviewText(); recognitionFailed(); return; }
        needsRetry = false;
        if (result.context.kind === "practice") {
          const ctx = result.context;
          if (ctx.account && !baselineStarted && !new URLSearchParams(location.search).has("xet_order_job")) {
            waitingForSheet = ctx.blankSheet === null;
            if (ctx.blankSheet === true) {
              baselineStarted = true;
              void modules.wrongAttemptCounts?.snapshotBefore(ctx, location.origin, storage, post, abort.signal, async () => {
                const fresh = (await request({ type: "xet:question-order-context", key: ctx.key }))?.context;
                return current === generation && routeKey() === ctx.key && fresh?.key === ctx.key &&
                  fresh.account === ctx.account && fresh.taskId === ctx.taskId && fresh.joinId === ctx.joinId && fresh.blankSheet === true;
              }).catch(() => {});
            }
          }
          const status = await capture(result.context, abort.signal, current);
          if (current === generation) needsRetry = status === "failed" || waitingForSheet;
          if (status) await finishHelper(status);
        }
        else if (result.context.kind === "review") await renderReview(result.context, current);
        else await render(result.context, current);
      } catch {
        if (current === generation) { needsRetry = true; recognitionFailed(); await finishHelper("failed"); }
      }
      finally { if (current === generation) { loading = false; if (pending) schedule(); } }
    }
    function schedule() {
      if (!started) return;
      const helper = new URLSearchParams(location.search).has("xet_order_job");
      // A native redirect can lose the marker before the worker restores it.
      // Do not leave its first background animation frame parked indefinitely.
      if (helper && frame !== null && frame !== -1) { cancelAnimationFrame(frame); frame = null; }
      if (frame !== null) return;
      if (capturedJoin && !waitingForSheet && routeKey() === key && !location.pathname.includes("/errbook/detail/") && (!helper || helperFinished)) return;
      // Inactive tabs can suspend animation frames indefinitely. The helper
      // reads metadata only and must not wait for a visible paint to proceed.
      if (helper) {
        frame = -1;
        queueMicrotask(() => { frame = null; void refresh(); });
        return;
      }
      frame = requestAnimationFrame(() => { frame = null; void refresh(); });
    }
    function storageChanged(changes, area) {
      if (["local", "sync"].includes(area) && Object.keys(changes).some(k => k.startsWith(`xetPracticeHistory:${location.origin}|`) ||
        area === "local" && k.startsWith(`xetWrongPrior:${location.origin}|`) && (!k.endsWith(":result") || !countJob))) {
        countCache.clear(); countJob = null;
        if (key.includes("/errbook/")) schedule();
      }
      if (area !== "local" || !cache.update(changes)) return;
      const [path, source, task] = key.split("|");
      const change = changes[cacheKey(source, task)];
      if (path && !path.includes("/errbook/detail/") && change && !validOrder(change.newValue)) {
        // Deleting/corrupting a completed mapping must permit a fresh capture
        // even if this page already skipped extraction for its current attempt.
        capturedJoin = "";
      }
      schedule();
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      style = document.createElement("style"); style.textContent = STYLE; document.documentElement.append(style);
      observer = new MutationObserver(records => {
        if (records.some(r => !r.target.closest?.(`[${BADGE}], .xet-question-order-hint, .xet-wrong-count`) &&
            ([...(r.addedNodes || []), ...(r.removedNodes || [])].some(n => n.nodeType === 1) ||
             r.type === "characterData" && location.pathname.includes("/errbook/practice/") &&
             r.target.parentElement?.closest(".question-block__index, .question-index, .answer-card__content__card__item")))) schedule();
      });
      observe();
      // Fallback only: readiness/DOM/storage/navigation signals always run now,
      // even when the preceding attempt failed. Never impose a cooldown gate.
      timer = setInterval(() => { if (routeKey() !== key || needsRetry) schedule(); }, 1000);
      window.addEventListener("popstate", schedule); window.addEventListener("pageshow", schedule);
      window.addEventListener(READY, schedule); chrome.storage.onChanged.addListener(storageChanged);
      schedule();
    }
    function stop() {
      if (!started) return;
      started = false; clear(); key = "";
      cache.clear(); countCache.clear();
      observer?.disconnect(); observer = null;
      clearInterval(timer); timer = null;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      style?.remove(); style = null;
      window.removeEventListener("popstate", schedule); window.removeEventListener("pageshow", schedule);
      window.removeEventListener(READY, schedule); chrome.storage.onChanged.removeListener(storageChanged);
    }
    return Object.freeze({ start, stop });
  }
  modules.questionOrder = Object.freeze({ createQuestionOrderController, routeKey, validOrder, resolveOrdering, createOrderCache });
})();
