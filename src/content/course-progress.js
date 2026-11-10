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
      const match = path.match(/^\/p\/t_pc\/course_pc_detail\/(camp_pro|video)\/([\w-]+)\/?$/);
      const currentScope = () => /^\/p\/t_pc\/course_pc_detail\/video\/[\w-]+\/?$/.test(location.pathname)
        ? "/p/t_pc/course_pc_detail/video/" + new URL(location.href).searchParams.get("product_id")
        : location.pathname;
      const scope = currentScope();
      const root = match && (match[1] === "camp_pro" || /^course_[\w-]+$/.test(new URL(location.href).searchParams.get("product_id") || ""))
        ? document.querySelector(match[1] === "camp_pro" ? ".camp_pro" : "#app") : null;
      if (installed && (installed.root !== root || installed.scope !== scope)) stopMain();
      if (!root) { if (installed) stopMain(); return; }
      // Recheck occasionally because Vue can remount the catalog inside the
      // same outer course element (for example after permission changes).
      if (installed?.root === root && installed.scope === scope && Date.now() - installed.checkedAt < 5000) return;
      pending = true;
      try {
        const result = await request({ type: "xet:course-progress", path, url: location.href });
        if (result?.ok && started && scope === currentScope() &&
            document.querySelector(match[1] === "camp_pro" ? ".camp_pro" : "#app") === root) {
          installed = { root, scope, checkedAt: Date.now() };
        } else if (result?.ok) stopMain();
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
