(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.analysisActions) return;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/practice_analysis\/[\w-]+\/?$/;
  const CLASS = "xet-analysis-actions";
  const BUTTON = "xet-analysis-action";
  const HEADER = "data-xet-analysis-action-header";
  const ICONS = modules.analysisIcons;
  if (!ICONS || !modules.analysisFeedback) return;

  function routeKey() {
    if (!PATH.test(location.pathname)) return "";
    const query = new URLSearchParams(location.search);
    const joinId = query.get("join_id") || "", taskId = query.get("task_id") || "";
    if (!/^[\w-]{1,160}$/.test(joinId) || (taskId && !/^[\w-]{1,160}$/.test(taskId))) return "";
    return `${location.pathname}|${joinId}|${taskId}`;
  }

  function flag(value) { return value === true || value === 1 || value === "1"; }

  function createAnalysisActionsController({ request = message =>
    chrome.runtime.sendMessage(message) } = {}) {
    let started = false;
    let timer = null;
    let observer = null;
    let frame = null;
    let key = "";
    let context = null;
    let abort = null;
    let loading = false;
    let retryAt = 0;
    let generation = 0;
    let refreshTimer = null;
    let unavailable = false, needsReload = false, reconcile = false, revision = 0, lastLoadError = "";
    const questions = new Map();
    const mounts = new Map();
    const cardMarks = new Map();
    const feedback = modules.analysisFeedback.createFeedbackController({
      request, getKey: () => key, isEnabled: () => started && Boolean(key) && routeKey() === key,
      onRuntimeLost: suspend,
    });
    function runtimeLost(error) {
      return !globalThis.chrome?.runtime?.id || /extension context invalidated/i.test(error?.message || "");
    }
    function detach() {
      clearInterval(timer); timer = null; clearTimeout(refreshTimer); refreshTimer = null;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      observer?.disconnect();
      document.removeEventListener("click", toggle, true);
      window.removeEventListener("popstate", schedule); window.removeEventListener("hashchange", schedule);
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh);
    }
    function suspend() {
      if (unavailable || !started) return;
      unavailable = true; generation++; abort?.abort(); loading = false;
      detach(); feedback.clear();
      // Keep last confirmed flags visible, but never leave orphaned controls
      // pretending that a write is still possible after extension reload.
      for (const mount of mounts.values()) for (const button of mount.group.children) {
        button.disabled = true; button.setAttribute("aria-disabled", "true"); button.setAttribute("aria-busy", "false");
      }
      feedback.showUnavailable();
    }

    async function post(path, payload, signal, priority = "auto") {
      // All endpoints and payload shapes are extension-owned, same-origin,
      // and limited to this practice. No background arbitrary-URL proxy.
      const timeout = AbortSignal.timeout(15_000);
      const controller = new AbortController();
      const cancel = () => controller.abort();
      timeout.addEventListener("abort", cancel, { once: true });
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) controller.abort();
      try {
        const response = await fetch(path, {
          method: "POST", credentials: "same-origin", redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal: controller.signal, priority,
        });
        if (!response.ok) throw new Error("请求失败，请确认网络和登录状态");
        const result = await response.json();
        if (result.code !== 0) throw new Error("网站未能保存，请稍后重试");
        return result.data;
      } finally {
        timeout.removeEventListener("abort", cancel);
        signal.removeEventListener("abort", cancel);
      }
    }

    function clear() {
      generation++;
      abort?.abort();
      abort = null;
      loading = false;
      context = null;
      needsReload = false; reconcile = false; lastLoadError = ""; revision++;
      feedback.clear();
      questions.clear();
      for (const [item, mount] of mounts) {
        mount.group.remove();
        mount.header.removeAttribute(HEADER);
        item.removeAttribute("data-xet-analysis-marked");
      }
      mounts.clear();
      for (const [cell, marker] of cardMarks) {
        marker.remove();
        cell.removeAttribute("data-xet-analysis-card-marked");
      }
      cardMarks.clear();
    }

    function renderButton(button, question, action) {
      const active = question[action];
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-disabled", String(question.pending || reconcile));
      button.setAttribute("aria-busy", String(question.pending));
      const label = action === "mark" ? "标记" : "收藏";
      button.setAttribute("aria-label", `第 ${question.index + 1} 题${label}`);
      const icon = button.firstElementChild;
      const source = ICONS[action][Number(active)];
      if (icon.getAttribute("src") !== source) icon.src = source;
    }

    function makeIcon(action) {
      const icon = document.createElement("img");
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      icon.width = 20; icon.height = 20;
      icon.src = ICONS[action][0];
      return icon;
    }

    function makeButton(action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON;
      button.dataset.xetAction = action;
      button.append(makeIcon(action));
      return button;
    }

    function renderCardMarks() {
      for (const [cell, marker] of cardMarks) {
        const index = Number(cell.querySelector("span")?.textContent.trim()) - 1;
        if (!cell.isConnected || !marker.isConnected || !questions.get(index)?.mark || cell.querySelector(".mark-icon")) {
          marker.remove();
          cell.removeAttribute("data-xet-analysis-card-marked");
          cardMarks.delete(cell);
        }
      }
      for (const cell of document.querySelectorAll(".practice-analysis .answer-card__content__card__item")) {
        const index = Number(cell.querySelector("span")?.textContent.trim()) - 1;
        if (!questions.get(index)?.mark || cardMarks.has(cell) || cell.querySelector(".mark-icon")) continue;
        const marker = document.createElement("img");
        marker.className = "xet-analysis-card-mark";
        marker.alt = "已标记";
        marker.src = ICONS.cardMark;
        marker.width = 20; marker.height = 20;
        cell.setAttribute("data-xet-analysis-card-marked", "");
        cell.append(marker);
        cardMarks.set(cell, marker);
      }
    }

    async function render() {
      if (!context || unavailable || routeKey() !== key) return;
      const current = generation;
      renderCardMarks();
      for (const [item, mount] of mounts) {
        if (!item.isConnected || !mount.group.isConnected || !questions.has(Number(item.id.slice(9)) - 1)) {
          mount.group.remove();
          mount.header.removeAttribute(HEADER);
          item.removeAttribute("data-xet-analysis-marked");
          mounts.delete(item);
        }
      }
      let batchSize = 0;
      for (const item of document.querySelectorAll(".practice-analysis .analysis-item")) {
        if (!started || unavailable || current !== generation || routeKey() !== key) return;
        const index = Number(item.id.match(/^analysis-(\d+)$/)?.[1]) - 1;
        const question = questions.get(index);
        if (!question) continue;
        // Only the top-level header, not material sub-questions or rich text.
        const header = item.querySelector(".question-header");
        if (!header || !header.querySelector(".question-type")) continue;
        let mount = mounts.get(item);
        if (!mount) {
          const group = document.createElement("div");
          group.className = CLASS;
          group.append(makeButton("mark"), makeButton("collect"));
          header.setAttribute(HEADER, "");
          header.append(group);
          mount = { group, header };
          mounts.set(item, mount);
        }
        for (const button of mount.group.children) renderButton(button, question, button.dataset.xetAction);
        item.toggleAttribute("data-xet-analysis-marked", question.mark);
        if (++batchSize % 20 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }

    async function load() {
      if (unavailable || loading || !key || Date.now() < retryAt || [...questions.values()].some(q => q.pending)) return;
      if (runtimeLost()) { suspend(); return; }
      const background = Boolean(context), savedRevision = revision;
      let phase = "bridge";
      needsReload = false;
      loading = true;
      for (const mount of mounts.values()) {
        for (const button of mount.group.children) button.setAttribute("aria-disabled", "true");
      }
      abort ||= new AbortController();
      const signal = abort.signal;
      const current = generation;
      try {
        const result = await request({ type: "xet:analysis-context", key });
        if (!started || current !== generation || routeKey() !== key) return;
        if (!result?.ok) {
          needsReload = true; retryAt = Date.now() + 5000;
          if (result?.error && !background && lastLoadError !== "bridge-error") {
            lastLoadError = "bridge-error"; void feedback.show("bridge-error");
          }
          return;
        }
        const next = result.context;
        if (next.key !== key) return;
        phase = "request";
        const payload = { practice_id: next.resourceId, join_id: next.joinId,
          task_id: next.taskId, filter_delete: true };
        const [records, paper] = await Promise.all([
          post("/evaluation_wechat/practices/commit_record", payload, signal, background ? "low" : "auto"),
          post("/evaluation_wechat/practices/get_paper_question", { ...payload, start: -1, end: -1 }, signal, background ? "low" : "auto"),
        ]);
        if (!started || current !== generation || routeKey() !== key) return;
        if (savedRevision !== revision || [...questions.values()].some(q => q.pending)) { needsReload = true; return; }
        if (!Array.isArray(records?.list) || !Array.isArray(paper?.practice_list)) {
          throw new Error("无法读取题目状态");
        }
        const marks = new Map(records.list.map(q => [q.id, q]));
        const collected = new Map(paper.practice_list.map(q => [q.id, q]));
        questions.clear();
        for (const q of next.questions) {
          const record = marks.get(q.id), question = collected.get(q.id);
          // Missing data is unknown, never pretend it is an unselected flag.
          if (!record || !("is_marked" in record) || !question || !("is_collected" in question)) continue;
          questions.set(q.index, { ...q, mark: flag(record.is_marked), collect: flag(question.is_collected), pending: false });
        }
        context = next;
        reconcile = false;
        lastLoadError = "";
        render();
      } catch (error) {
        if (current === generation && !signal.aborted) {
          if (runtimeLost(error)) { suspend(); return; }
          retryAt = Date.now() + 10_000;
          needsReload = true;
          const reason = phase === "bridge" ? "bridge-error" : "load-error";
          if (!background && lastLoadError !== reason) { lastLoadError = reason; void feedback.show(reason); }
        }
      } finally {
        if (current === generation) { loading = false; if (context) render(); }
      }
    }

    async function toggle(event) {
      const button = event.target.closest?.(`.${BUTTON}`);
      if (!button || !event.isTrusted || !started || unavailable || reconcile || !context || routeKey() !== key) return;
      if (runtimeLost()) { suspend(); return; }
      const item = button.closest(".analysis-item");
      if (!item || mounts.get(item)?.group !== button.parentElement) return;
      const question = questions.get(Number(item.id.slice(9)) - 1);
      const action = button.dataset.xetAction;
      if (!question || !["mark", "collect"].includes(action)) return;
      event.stopPropagation();
      if (question.pending) return;
      const current = generation;
      const value = !question[action];
      const signal = abort.signal;
      question.pending = true;
      revision++;
      render();
      try {
        if (action === "mark") {
          await post("/xe.practice.bff/common/question.mark/1.0.0", {
            source_type: context.resourceId.startsWith("wb_drill") ? 4 : 1,
            source_id: context.resourceId, join_id: context.joinId,
            question_id: question.id, is_mark: value ? 1 : 0,
          }, signal);
        } else {
          await post("/evaluation_wechat/xe.qs.coll.question.collect/1.0.0", {
            resource_type: context.resourceId.startsWith("wb_drill") ? 74 : 34,
            resource_id: context.resourceId, task_id: context.taskId,
            question_id: question.id, is_collect: value,
          }, signal);
        }
        if (current !== generation || !started || routeKey() !== key) return;
        question[action] = value;
        void feedback.show(`${value ? "" : "un"}${action}`);
      } catch (error) {
        if (current === generation && !signal.aborted) {
          if (runtimeLost(error)) { suspend(); return; }
          void feedback.show(`${action}-error`);
          // A lost response can follow a successful server write. Re-read
          // instead of guessing and sending an unintended inverse operation.
          needsReload = true;
          reconcile = true;
          retryAt = 0;
        }
      } finally {
        if (current === generation) {
          question.pending = false;
          if (context) render();
          if (!context || needsReload) schedule();
        }
      }
    }

    function update() {
      frame = null;
      if (!started || unavailable) return;
      const nextKey = routeKey();
      if (key !== nextKey) { clear(); key = nextKey; retryAt = 0; }
      if (!key) return;
      if (runtimeLost()) { suspend(); return; }
      if (!context || needsReload) void load();
      else render();
    }

    function schedule() {
      if (started && !unavailable && frame === null) frame = requestAnimationFrame(update);
    }

    function refresh() {
      if (unavailable || !started) return;
      if (runtimeLost()) { suspend(); return; }
      clearTimeout(refreshTimer);
      // Let the click that focused the window finish before refreshing flags.
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (document.visibilityState === "hidden" || !started) return;
        if (![...questions.values()].some(q => q.pending) && !loading) {
          needsReload = true;
          schedule();
        }
      }, 200);
    }

    function start() {
      if (started || window.top !== window) return;
      started = true;
      unavailable = false;
      document.addEventListener("click", toggle, true);
      window.addEventListener("popstate", schedule);
      window.addEventListener("hashchange", schedule);
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      observer = new MutationObserver(records => {
        if (records.some(r => (r.target instanceof Element && r.target.matches(".answer-card__content__card__item")) || [...r.addedNodes, ...r.removedNodes].some(n =>
          n instanceof Element && (n.matches(".practice-analysis, .analysis-item, .question-header, .answer-card__content__card") ||
            n.querySelector(".practice-analysis, .analysis-item, .question-header, .answer-card__content__card"))))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // Poll route/readiness only. Saving requires an actual user click.
      timer = setInterval(() => { if (routeKey() !== key || (key && (!context || needsReload))) schedule(); }, 1000);
      schedule();
    }

    function stop() {
      if (!started) return;
      started = false;
      detach();
      clear();
      key = "";
    }

    return Object.freeze({ start, stop });
  }

  modules.analysisActions = Object.freeze({ createAnalysisActionsController });
})();
