(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceUndo) return;
  const READY = "xet:practice-undo-ready", STOP = "xet:practice-undo-stop";
  function routeKey() {
    if (!/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/[\w-]+\/?$/.test(location.pathname)) return "";
    return `${location.pathname}|${new URLSearchParams(location.search).get("task_id") || ""}`;
  }
  function createPracticeUndoController({ request = message => chrome.runtime.sendMessage(message) } = {}) {
    let started = false, key = "", frame = null, observer = null, timer = null;
    let loading = false, dirty = false, generation = 0;
    const mounts = new Map(), pending = new Set();
    function clear() {
      generation++;
      window.dispatchEvent(new Event(STOP));
      for (const button of mounts.values()) button.remove();
      mounts.clear(); pending.clear();
    }
    async function update() {
      frame = null;
      if (!started) return;
      if (loading) { dirty = true; return; }
      const next = routeKey();
      if (next !== key) { clear(); key = next; }
      if (!key) return;
      const current = generation;
      loading = true; dirty = false;
      try {
        const result = await request({ type: "xet:practice-undo", action: "sync", key });
        if (!started || current !== generation || routeKey() !== key) return;
        if (!result?.ok || result.context?.key !== key) {
          for (const button of mounts.values()) button.remove();
          mounts.clear(); return;
        }
        const questions = new Map(result.context.questions.map(q => [q.index, q]));
        for (const [item, button] of mounts) {
          if (!item.isConnected || !button.isConnected) { button.remove(); mounts.delete(item); }
        }
        let count = 0;
        for (const item of document.querySelectorAll(".practice-sheet .question-wrapper")) {
          if (!started || current !== generation) return;
          const index = Number(item.id.match(/^practice-question-anchor-(\d+)$/)?.[1]) - 1;
          const q = questions.get(index), meta = item.querySelector(".question-block__meta");
          if (!q || !meta) continue;
          let button = mounts.get(item);
          if (!button) {
            button = document.createElement("button");
            button.type = "button"; button.className = "xet-practice-undo";
            meta.append(button); mounts.set(item, button);
          }
          button.dataset.xetQuestionId = q.id;
          const working = q.pending || pending.has(q.id);
          button.textContent = working ? "撤销中…" : q.retry ? "重试撤销" : "撤销";
          button.disabled = !q.canUndo || working;
          button.setAttribute("aria-busy", String(working));
          button.setAttribute("aria-label", `撤销第 ${index + 1} 题本次作答`);
          button.title = q.canUndo ? "清空本次作答；只移除本次新增的错题" : "尚未作答";
          if (++count % 20 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
        }
      } catch { /* The page may be navigating or the extension reloading. */ }
      finally { loading = false; if (dirty) schedule(); }
    }
    function schedule() { if (started && frame === null) frame = requestAnimationFrame(update); }
    async function click(event) {
      const button = event.target.closest?.(".xet-practice-undo");
      if (!started || !event.isTrusted || !button || button.disabled || routeKey() !== key ||
          mounts.get(button.closest(".question-wrapper")) !== button) return;
      event.stopPropagation();
      const questionId = button.dataset.xetQuestionId;
      if (pending.has(questionId)) return;
      pending.add(questionId); button.disabled = true; button.textContent = "撤销中…";
      button.setAttribute("aria-busy", "true");
      try { await request({ type: "xet:practice-undo", action: "undo", key, questionId }); }
      catch { modules.toast?.show("无法确认撤销结果，请稍后重试"); }
      finally { pending.delete(questionId); schedule(); }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      document.addEventListener("click", click, true);
      window.addEventListener(READY, schedule); window.addEventListener("popstate", schedule);
      observer = new MutationObserver(records => {
        if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element &&
            (n.matches(".practice-sheet, .question-wrapper, .question-block__meta") ||
             n.querySelector(".practice-sheet, .question-wrapper, .question-block__meta"))))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // Fallback for readiness and route changes, never a delay on updates.
      timer = setInterval(() => { if (routeKey() !== key || !mounts.size) schedule(); }, 1000);
      schedule();
    }
    function stop() {
      if (!started) return;
      started = false; clearInterval(timer); observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; dirty = false;
      document.removeEventListener("click", click, true);
      window.removeEventListener(READY, schedule); window.removeEventListener("popstate", schedule);
      clear(); key = "";
    }
    return Object.freeze({ start, stop });
  }
  modules.practiceUndo = Object.freeze({ createPracticeUndoController });
})();
