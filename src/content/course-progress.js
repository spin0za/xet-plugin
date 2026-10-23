(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.courseProgress) return;
  function createCourseProgressController({ request = m => chrome.runtime.sendMessage(m) } = {}) {
    let started = false, timer = null, pending = false, installed = null;
    function stopMain() {
      installed = null;
      window.dispatchEvent(new Event("xet:course-progress-stop"));
    }
    async function sync() {
      if (!started || pending) return;
      const path = location.pathname;
      const root = /^\/p\/t_pc\/course_pc_detail\/camp_pro\/[\w-]+\/?$/.test(path)
        ? document.querySelector(".camp_pro") : null;
      if (!root) { if (installed) stopMain(); return; }
      // Recheck occasionally because Vue can remount the catalog inside the
      // same outer course element (for example after permission changes).
      if (installed?.root === root && installed.path === path && Date.now() - installed.checkedAt < 5000) return;
      pending = true;
      try {
        const result = await request({ type: "xet:course-progress", path });
        if (result?.ok) installed = { root, path, checkedAt: Date.now() };
      } catch { /* Retry readiness after extension reload or navigation. */ }
      finally { pending = false; if (!started) stopMain(); }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      timer = setInterval(sync, 1000);
      window.addEventListener("popstate", sync);
      document.addEventListener("visibilitychange", sync);
      void sync();
    }
    function stop() {
      started = false; clearInterval(timer);
      window.removeEventListener("popstate", sync);
      document.removeEventListener("visibilitychange", sync);
      stopMain();
    }
    return Object.freeze({ start, stop });
  }
  modules.courseProgress = Object.freeze({ createCourseProgressController });
})();
