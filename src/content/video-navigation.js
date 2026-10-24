(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.videoNavigation) return;
  function createVideoNavigationController() {
    let timer = null, pending = false;
    async function sync() {
      if (timer === null || pending) return;
      if (!/^\/p\/t_pc\/course_pc_detail\/video\/[\w-]+\/?$/.test(location.pathname)) {
        window.dispatchEvent(new Event("xet:video-navigation-stop")); return;
      }
      pending = true;
      try { await chrome.runtime.sendMessage({ type: "xet:video-navigation" }); }
      catch { /* Readiness/reload; retry on the next tick. */ }
      finally { pending = false; if (timer === null) window.dispatchEvent(new Event("xet:video-navigation-stop")); }
    }
    return Object.freeze({
      start() { if (timer !== null || window.top !== window) return; timer = setInterval(sync, 1500); void sync(); },
      stop() { clearInterval(timer); timer = null; window.dispatchEvent(new Event("xet:video-navigation-stop")); },
    });
  }
  modules.videoNavigation = Object.freeze({ createVideoNavigationController });
})();
