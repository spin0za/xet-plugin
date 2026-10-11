(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.questionOrder) return;
  const PREFIX = "xetQuestionOrder:";
  const BADGE = "data-xet-original-question-number";
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

  function createQuestionOrderController({ request = message => chrome.runtime.sendMessage(message),
    storage = chrome.storage.local } = {}) {
    let started = false, key = "", timer = null, frame = null, observer = null;
    let generation = 0, loading = false, pending = false, retryAt = 0, capturedJoin = "";
    let abort = null, style = null, hint = null, restoreOrder = [];
    const labels = new Map();
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
      loading = pending = false; capturedJoin = ""; retryAt = 0;
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

    async function capture(context, signal, current) {
      if (capturedJoin === context.joinId) return;
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
        capturedJoin = context.joinId; return;
      }
      const paper = await post("/evaluation_wechat/practices/commit_record", {
        practice_id: context.sourceId, task_id: context.taskId, join_id: context.joinId, filter_delete: false,
      }, signal);
      const record = { version: 1, ids: paper?.list?.map(q => q.id), savedAt: Date.now() };
      if (!validOrder(record) || (context.taskId && record.ids.length !== Number(config.task_total_qs))) return;
      if (!started || current !== generation || routeKey() !== key) return;
      // Keep prior mappings: they restore original numbers, not disposable cache.
      await storage.set({ [cacheKey(context.sourceId, context.taskId)]: record });
      capturedJoin = context.joinId;
    }

    async function render(context, current) {
      const tasks = [...new Set(context.questions.map(q => q.taskId))];
      const names = tasks.map(task => cacheKey(context.sourceId, task));
      const stored = await storage.get(names);
      if (!started || current !== generation || routeKey() !== key) return;
      const maps = new Map(tasks.map((task, i) => [task, validOrder(stored[names[i]])
        ? new Map(stored[names[i]].ids.map((id, index) => [id, index + 1])) : new Map()]));
      const cards = [...document.querySelectorAll(".errbook-detail-page .question-list > .question-card")];
      if (cards.length !== context.cardIds.length) return;
      const byId = new Map(cards.map(card => [card.getAttribute("data-xet-question-order-id"), card]));
      if (byId.size !== cards.length || context.questions.some(q => !byId.has(q.id))) return;
      restoreOrder = context.questions.map(q => byId.get(q.id));
      const parent = cards[0]?.parentElement;
      if (!parent) { hint?.remove(); hint = null; return; }
      const numbered = context.questions.map((q, nativeIndex) => ({ ...q, card: byId.get(q.id), nativeIndex,
        number: maps.get(q.taskId)?.get(q.id) }));
      // Only sort a single source task. Across tasks, identical ordinal numbers
      // are not comparable; retain the native task grouping instead.
      if (tasks.length === 1) numbered.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.nativeIndex - b.nativeIndex);
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
            label.textContent = `原题第 ${number} 题`;
          } else { label?.remove(); labels.delete(card); }
          if (tasks.length === 1 && parent.children[i] !== card) parent.insertBefore(card, parent.children[i] || null);
          if ((i + 1) % 20 === 0) {
            observe();
            await new Promise(resolve => requestAnimationFrame(resolve));
            observer?.disconnect();
          }
        }
        for (const [card, label] of labels) if (!card.isConnected) { label.remove(); labels.delete(card); }
        const unknown = numbered.some(q => !q.number);
        if (unknown && !hint?.isConnected) {
          hint = document.createElement("p"); hint.className = "xet-question-order-hint";
          parent.before(hint);
        }
        if (unknown) hint.textContent = "部分原题号暂不可确定：请先打开原练习或解析一次。随机出题的练习不使用固定题号。";
        else { hint?.remove(); hint = null; }
      } finally { if (started) observe(); }
    }

    async function refresh() {
      const next = routeKey();
      if (next !== key) { clear(); key = next; }
      if (!started || !key || Date.now() < retryAt) return;
      if (loading) { pending = true; return; }
      loading = true; pending = false;
      const current = generation;
      abort ||= new AbortController();
      try {
        const result = await request({ type: "xet:question-order-context", key });
        if (!started || current !== generation || routeKey() !== key) return;
        if (!result?.ok || result.context?.key !== key) { retryAt = Date.now() + 3000; return; }
        retryAt = 0;
        if (result.context.kind === "practice") await capture(result.context, abort.signal, current);
        else await render(result.context, current);
      } catch { if (current === generation) retryAt = Date.now() + 5000; }
      finally { if (current === generation) { loading = false; if (pending) schedule(); } }
    }
    function schedule() {
      if (!started || frame !== null) return;
      if (capturedJoin && routeKey() === key && !location.pathname.includes("/errbook/detail/")) return;
      frame = requestAnimationFrame(() => { frame = null; void refresh(); });
    }
    function storageChanged(changes, area) {
      if (area === "local" && Object.keys(changes).some(name => name.startsWith(PREFIX))) schedule();
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
      timer = setInterval(() => { if (routeKey() !== key || Date.now() >= retryAt && retryAt > 0) schedule(); }, 1000);
      window.addEventListener("popstate", schedule); chrome.storage.onChanged.addListener(storageChanged);
      schedule();
    }
    function stop() {
      if (!started) return;
      started = false; clear(); key = "";
      observer?.disconnect(); observer = null;
      clearInterval(timer); timer = null;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      style?.remove(); style = null;
      window.removeEventListener("popstate", schedule); chrome.storage.onChanged.removeListener(storageChanged);
    }
    return Object.freeze({ start, stop });
  }
  modules.questionOrder = Object.freeze({ createQuestionOrderController, routeKey, validOrder });
})();
