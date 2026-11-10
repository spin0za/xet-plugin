(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.courseProgress) return;
  function createCourseProgressController({ request = m => chrome.runtime.sendMessage(m) } = {}) {
    let started = false, timer = null, pending = false, installed = null;
    function stopMain() {
      installed = null;
      window.dispatchEvent(new Event("xet:course-progress-stop"));
    }
    function remount() { installed = null; void sync(); }
    async function sync() {
      if (!started || pending) return;
      const path = location.pathname;
      const match = path.match(/^\/p\/t_pc\/course_pc_detail\/(camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/([\w-]+)\/?$/);
      const currentScope = () => {
        const url = new URL(location.href);
        const family = /^\/p\/t_pc\/course_pc_detail\/(video|audio|document|image_text)\/[\w-]+\/?$/.test(url.pathname) ? "content" : url.pathname;
        return JSON.stringify([family, ...["parent_pro_id", "pro_id", "product_id", "content_app_id", "community_id", "type", "resType", "sub_course_id"]
          .map(key => url.searchParams.get(key))]);
      };
      const scope = currentScope();
      const root = match ? document.querySelector("#app") || document.querySelector(".camp_pro") : null;
      if (installed && (installed.root !== root || installed.scope !== scope)) stopMain();
      if (!root) { if (installed) stopMain(); return; }
      // Recheck occasionally because Vue can remount the catalog inside the
      // same outer course element (for example after permission changes).
      if (installed?.root === root && installed.scope === scope && Date.now() - installed.checkedAt < 5000) return;
      pending = true;
      try {
        const result = await request({ type: "xet:course-progress", path, url: location.href });
        if ((result?.ok || result?.reason === "unsupported-catalog") && started && scope === currentScope() &&
            (document.querySelector("#app") || document.querySelector(".camp_pro")) === root) {
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
      window.addEventListener("xet:course-progress-remount", remount);
      document.addEventListener("visibilitychange", sync);
      void sync();
    }
    function stop() {
      started = false; clearInterval(timer);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("xet:course-progress-remount", remount);
      document.removeEventListener("visibilitychange", sync);
      stopMain();
    }
    return Object.freeze({ start, stop });
  }
  modules.courseProgress = Object.freeze({ createCourseProgressController });
})();
