(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceMarks) return;
  function routeKey() {
    if (!/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/[\w-]+\/?$/.test(location.pathname)) return "";
    return `${location.pathname}|${new URLSearchParams(location.search).get("task_id") || ""}`;
  }
  function createPracticeMarksController({ request = m => chrome.runtime.sendMessage(m) } = {}) {
    let started = false, timer = null, observer = null, pending = false;
    async function submitted(event) {
      const joinId = event.detail;
      if (!started || !routeKey() || typeof joinId !== "string" || !/^[\w-]{1,160}$/.test(joinId)) return;
      let result;
      try {
        result = await request({ type: "xet:practice-history", action: "capture", key: location.pathname + location.search });
      } catch { /* Inform the caller that durable storage did not succeed. */ }
      window.dispatchEvent(new CustomEvent("xet:practice-history-saved", { detail: JSON.stringify({
        joinId, ok: result?.ok === true && result.context?.joinId === joinId, synced: result?.synced === true,
      }) }));
    }
    async function sync() {
      if (!started || pending) return;
      const key = routeKey();
      if (!key) { window.dispatchEvent(new Event("xet:practice-marks-stop")); return; }
      pending = true;
      try { await request({ type: "xet:practice-marks", action: "start", key }); }
      catch { /* Extension reload/navigation; the next readiness check retries. */ }
      finally { pending = false; if (!started) window.dispatchEvent(new Event("xet:practice-marks-stop")); }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      window.addEventListener("popstate", sync);
      window.addEventListener("xet:practice-submitted", submitted);
      observer = new MutationObserver(records => {
        if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element &&
            (n.matches(".practice-sheet") || n.querySelector(".practice-sheet"))))) void sync();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      timer = setInterval(sync, 1000);
      void sync();
    }
    function stop() {
      started = false; clearInterval(timer); observer?.disconnect();
      window.removeEventListener("popstate", sync);
      window.removeEventListener("xet:practice-submitted", submitted);
      window.dispatchEvent(new Event("xet:practice-marks-stop"));
    }
    return Object.freeze({ start, stop });
  }
  modules.practiceMarks = Object.freeze({ createPracticeMarksController });
})();
