(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.liveChat) return;
  function createLiveChatController({ request = m => chrome.runtime.sendMessage(m) } = {}) {
    let started = false, timer = null, pending = false, installed = null;
    function stopMain() { installed = null; window.dispatchEvent(new Event("xet:live-chat-stop")); }
    async function sync() {
      if (!started || pending) return;
      const path = location.pathname;
      const root = /^\/p\/t_pc\/live_pc\/pc\/l_[\w-]+\/?$/.test(path) ? document.querySelector(".input-container") : null;
      if (installed && (installed.path !== path || installed.root !== root)) stopMain();
      if (!root) { if (installed) stopMain(); return; }
      if (installed?.root === root && installed.path === path && Date.now() - installed.checkedAt < 5000) return;
      pending = true;
      try {
        const result = await request({ type: "xet:live-chat", path });
        if (result?.ok) installed = { root, path, checkedAt: Date.now() };
      } catch { /* Native chat remains usable while the extension wakes. */ }
      finally { pending = false; if (!started || path !== location.pathname) stopMain(); }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true; timer = setInterval(sync, 1000);
      window.addEventListener("popstate", sync); document.addEventListener("visibilitychange", sync); void sync();
    }
    function stop() {
      started = false; clearInterval(timer);
      window.removeEventListener("popstate", sync); document.removeEventListener("visibilitychange", sync); stopMain();
    }
    return Object.freeze({ start, stop });
  }
  modules.liveChat = Object.freeze({ createLiveChatController });
})();
