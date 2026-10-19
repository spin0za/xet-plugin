(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceMarks) return;
  function routeKey() {
    if (!/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/[\w-]+\/?$/.test(location.pathname)) return "";
    return `${location.pathname}|${new URLSearchParams(location.search).get("task_id") || ""}`;
  }
  function createPracticeMarksController({ request = m => chrome.runtime.sendMessage(m) } = {}) {
    let started = false, timer = null, observer = null, pending = false;
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
      window.dispatchEvent(new Event("xet:practice-marks-stop"));
    }
    return Object.freeze({ start, stop });
  }
  modules.practiceMarks = Object.freeze({ createPracticeMarksController });
})();
