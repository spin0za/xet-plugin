(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceScroll) return;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/practice_sheet\/[\w-]+\/?$/;
  const SELECTOR = ".practice-sheet .all-questions-container";
  function createPracticeScrollController() {
    let observer, frame = null, retry = null, scroller, route = "", installed = false, pending = false;
    let revision = 0, tries = 0;
    const uninstall = () => window.dispatchEvent(new Event("xet:practice-scroll-stop"));

    async function sync() {
      frame = null;
      if (!observer) return;
      const path = PATH.test(location.pathname) ? location.pathname + location.search : "";
      const next = path ? document.querySelector(SELECTOR) : null;
      if (path !== route || next !== scroller) {
        revision++; route = path; scroller = next; installed = false; tries = 0;
        clearTimeout(retry); retry = null;
        uninstall();
      }
      if (!scroller || installed || pending || retry !== null || tries >= 5 ||
          !scroller.querySelector(":scope > .question-wrapper[id^='practice-question-anchor-']")) return;
      const current = revision;
      pending = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: "xet:practice-scroll", route });
        if (current === revision) installed = result?.ok === true;
      } catch { /* Readiness or extension reload; native behavior remains. */ }
      finally {
        pending = false;
        if (current !== revision) { uninstall(); wake(); }
        else if (!installed && ++tries <= 4) retry = setTimeout(() => { retry = null; wake(); }, 300);
      }
    }

    function wake() {
      if (observer && frame === null) frame = requestAnimationFrame(sync);
    }

    function start() {
      if (observer || window.top !== window) return;
      observer = new MutationObserver(() => {
        if (installed && scroller?.isConnected && route === location.pathname + location.search) return;
        if (PATH.test(location.pathname) || scroller) wake();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", wake);
      window.addEventListener("pageshow", wake);
      window.navigation?.addEventListener("currententrychange", wake);
      wake();
    }

    function stop() {
      if (!observer) return;
      observer.disconnect(); observer = null; revision++;
      window.removeEventListener("popstate", wake);
      window.removeEventListener("pageshow", wake);
      window.navigation?.removeEventListener("currententrychange", wake);
      if (frame !== null) cancelAnimationFrame(frame);
      clearTimeout(retry); retry = frame = null;
      scroller = null; route = ""; installed = false; tries = 0;
      uninstall();
    }
    return Object.freeze({ start, stop, wake });
  }
  modules.practiceScroll = Object.freeze({ createPracticeScrollController });
})();
