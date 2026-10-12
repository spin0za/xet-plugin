(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.pageTitle) return;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/errbook\/detail\/[\w-]+\/?$/;
  const ROOT = ".errbook-detail-page";
  const HEADER = `${ROOT} .page-header .back-btn span`;
  const WATCH = `${ROOT} .page-header, title`;

  function createPageTitleController() {
    let started = false, queued = false, observer = null, timer = null;
    let key = "", original = null, applied = "";
    const routeKey = () => PATH.test(location.pathname) ? location.pathname + location.search : "";
    function restore() {
      // Do not undo a newer title assigned by the site during navigation.
      if (original !== null && document.title === applied) document.title = original;
      original = null; applied = "";
    }
    function update() {
      queued = false;
      if (!started) return;
      const next = routeKey();
      if (next !== key) { restore(); key = next; }
      if (!key) return;
      const text = document.querySelector(HEADER)?.textContent.replace(/\s+/g, " ").trim();
      if (!text) { restore(); return; }
      if (original === null || document.title !== applied) original = document.title;
      applied = text;
      if (document.title !== text) document.title = text;
    }
    function schedule() {
      if (!started || queued) return;
      queued = true;
      // One metadata write, not a visual DOM batch: rAF can pause in background
      // tabs, but their tab title still needs to be correct while loading.
      queueMicrotask(update);
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      observer = new MutationObserver(records => {
        if (routeKey() !== key || records.some(r => r.target.closest?.(WATCH) ||
          r.target.parentElement?.closest(WATCH) ||
          [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 &&
            (n.matches(`${ROOT}, .page-header, title`) || n.querySelector(`${ROOT}, .page-header, title`))))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      window.addEventListener("popstate", schedule);
      window.addEventListener("pageshow", schedule);
      window.navigation?.addEventListener("currententrychange", schedule);
      // Fallback for route changes without a DOM mutation or Navigation API.
      timer = setInterval(() => { if (routeKey() !== key) schedule(); }, 1000);
      update();
    }
    function stop() {
      if (!started) return;
      started = false; queued = false;
      observer.disconnect(); observer = null;
      clearInterval(timer); timer = null;
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("pageshow", schedule);
      window.navigation?.removeEventListener("currententrychange", schedule);
      restore(); key = "";
    }
    return Object.freeze({ start, stop });
  }
  modules.pageTitle = Object.freeze({ createPageTitleController });
})();
