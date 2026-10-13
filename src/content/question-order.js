(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.questionOrder) return;
  const PREFIX = "xetQuestionOrder:";
  const BADGE = "data-xet-original-question-number";
  const READY = "xet:question-order-ready";
  const STOP_WATCH = "xet:question-order-stop-watch";
  const STYLE = ".xet-question-order-label{display:inline-block;margin:0 0 8px;color:#333;font:500 16px/1.5 sans-serif}.xet-question-order-hint{margin:12px 0;color:#666;font:14px/1.6 sans-serif}";

  function routeKey() {
    const match = location.pathname.match(/^\/p\/t_pc\/pc_evaluation\/(practice_sheet|practice_analysis|errbook\/detail)\/([\w-]+)\/?$/);
    if (!match) return "";
    const query = new URLSearchParams(location.search);
    const source = match[1] === "errbook/detail" ? query.get("source_id") || "" : match[2];
    if (!/^[\w-]{1,160}$/.test(source) || (match[1] === "errbook/detail" && (query.get("tab") || "1") !== "1")) return "";
    return `${location.pathname}|${source}|${query.get("task_id") || ""}|${query.get("join_id") || ""}|${query.get("tab") || "1"}`;
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
    storage = chrome.storage.local } = {}) {
    let started = false, key = "", timer = null, frame = null, observer = null;
    let generation = 0, loading = false, pending = false, needsRetry = false, capturedJoin = "";
    let abort = null, style = null, hint = null, restoreOrder = [];
    const labels = new Map();
    const autoRequested = new Set();
    let helperFinished = false;
    const cache = createOrderCache(storage, location.origin);
    const observe = () => observer?.observe(document.body, { childList: true, subtree: true });
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

    function clear() {
      generation++; abort?.abort(); abort = null;
      loading = pending = needsRetry = false; capturedJoin = "";
      autoRequested.clear(); helperFinished = false;
      window.dispatchEvent(new Event(STOP_WATCH));
      observer?.disconnect();
      for (const label of labels.values()) label.remove();
      labels.clear(); hint?.remove(); hint = null;
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
      const fixed = setting === 0 || setting === "0";
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
        if (!started || current !== generation || autoRequested.has(taskId)) continue;
        autoRequested.add(taskId);
        try {
          await request({ type: "xet:question-order-auto-load", key: context.key, taskId });
        } catch { /* Keep existing numbers; do not repeatedly create attempts. */ }
      }
    }

    async function finishHelper(status) {
      if (helperFinished || !new URLSearchParams(location.search).has("xet_order_job")) return;
      helperFinished = true;
      try { await request({ type: "xet:question-order-job-finish", status }); }
      catch { /* The worker's deadline alarm still cleans up this owned tab. */ }
    }

    async function render(context, current) {
      const records = await cache.index(context.sourceId);
      if (!started || current !== generation || routeKey() !== key) return;
      const { numbers, sortable } = resolveOrdering(context.questions, {}, "", records);
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
          const { card, number } = numbered[i];
          if (!card.isConnected || card.parentElement !== parent) { pending = true; return; }
          let label = labels.get(card);
          if (number) {
            if (!label || !label.isConnected) {
              label = document.createElement("span"); label.className = "xet-question-order-label";
              label.setAttribute(BADGE, ""); card.querySelector(".card-body")?.prepend(label);
              labels.set(card, label);
            }
            label.textContent = `${number}.`;
          } else { label?.remove(); labels.delete(card); }
          if (parent.children[i] !== card) parent.insertBefore(card, parent.children[i] || null);
          if ((i + 1) % 20 === 0) {
            observe();
            await new Promise(resolve => requestAnimationFrame(resolve));
            observer?.disconnect();
          }
        }
        for (const [card, label] of labels) if (!card.isConnected) { label.remove(); labels.delete(card); }
        const unknown = numbered.some(q => !q.number);
        setHint(parent, unknown ? "部分原题号尚未取得，插件会尝试后台读取。随机出题、来源缺失或顺序冲突的题目不猜填题号。" : "");
      } finally { if (started) observe(); }
      // Render cache hits before starting any network work or opening a tab.
      void autoLoad(context, records, numbers, current);
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
        if (location.pathname.includes("/errbook/detail/")) void cache.warm().catch(() => {});
        const result = await request({ type: "xet:question-order-context", key });
        if (!started) { window.dispatchEvent(new Event(STOP_WATCH)); return; }
        if (current !== generation || routeKey() !== key) return;
        if (!result?.ok || result.context?.key !== key) { needsRetry = true; recognitionFailed(); return; }
        needsRetry = false;
        if (result.context.kind === "practice") {
          const status = await capture(result.context, abort.signal, current);
          if (current === generation) needsRetry = status === "failed";
          if (status) await finishHelper(status);
        }
        else await render(result.context, current);
      } catch {
        if (current === generation) { needsRetry = true; recognitionFailed(); await finishHelper("failed"); }
      }
      finally { if (current === generation) { loading = false; if (pending) schedule(); } }
    }
    function schedule() {
      if (!started || frame !== null) return;
      if (capturedJoin && routeKey() === key && !location.pathname.includes("/errbook/detail/")) return;
      // Inactive tabs can suspend animation frames indefinitely. The helper
      // reads metadata only and must not wait for a visible paint to proceed.
      if (new URLSearchParams(location.search).has("xet_order_job")) {
        frame = -1;
        queueMicrotask(() => { frame = null; void refresh(); });
        return;
      }
      frame = requestAnimationFrame(() => { frame = null; void refresh(); });
    }
    function storageChanged(changes, area) {
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
        if (records.some(r => !r.target.closest?.(`[${BADGE}], .xet-question-order-hint`) &&
            [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1))) schedule();
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
      cache.clear();
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
