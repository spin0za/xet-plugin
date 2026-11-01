(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.liveCountdown) return;
  function createLiveCountdownController({ request = m => chrome.runtime.sendMessage(m) } = {}) {
    let started = false, timer = null, pending = false, installed = null;
    function stopMain() {
      installed = null;
      window.dispatchEvent(new Event("xet:live-countdown-stop"));
    }
    async function sync() {
      if (!started || pending) return;
      const path = location.pathname;
      const root = /^\/detail\/l_[\w-]+\/4\/?$/.test(path) ? document.querySelector(".status-wrapper") : null;
      if (!root) { if (installed) stopMain(); return; }
      if (installed?.root === root && installed.path === path && Date.now() - installed.checkedAt < 5000) return;
      pending = true;
      try {
        const result = await request({ type: "xet:live-countdown", path });
        if (result?.ok) installed = { root, path, checkedAt: Date.now() };
      } catch { /* Retry after Vue mounts or the extension wakes. */ }
      finally { pending = false; if (!started || location.pathname !== path) stopMain(); }
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
  modules.liveCountdown = Object.freeze({ createLiveCountdownController });
})();
