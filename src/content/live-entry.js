(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.liveEntry) return;
  function createLiveEntryController({ request = message => chrome.runtime.sendMessage(message) } = {}) {
    const PATH = /^(?:\/p\/t_pc\/course_pc_detail\/(?:camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/[\w-]+|\/detail\/l_[\w-]+\/4)\/?$/;
    let started = false, installed = "", pending = false;
    const stopMain = () => window.dispatchEvent(new Event("xet:live-entry-stop"));
    async function sync() {
      if (!started || pending) return;
      const url = location.href, path = location.pathname;
      if (url === installed) return;
      if (installed) { installed = ""; stopMain(); }
      if (!PATH.test(path)) return;
      pending = true;
      try {
        const result = await request({ type: "xet:live-entry", path });
        if (started && location.href === url && result?.ok) installed = url;
        else if (result?.ok) stopMain();
      } catch { /* Use the native catalog when injection is unavailable. */ }
      finally {
        pending = false;
        if (started && location.href !== url) void sync();
      }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      window.navigation?.addEventListener("currententrychange", sync);
      window.addEventListener("popstate", sync);
      window.addEventListener("pageshow", sync);
      void sync();
    }
    function stop() {
      started = false;
      installed = "";
      window.navigation?.removeEventListener("currententrychange", sync);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pageshow", sync);
      stopMain();
    }
    return Object.freeze({ start, stop, wake: sync });
  }
  modules.liveEntry = Object.freeze({ createLiveEntryController });
})();
