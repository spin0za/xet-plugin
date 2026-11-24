(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.pageTitle) return;
  const DETAIL_PATH = /^\/p\/t_pc\/pc_evaluation\/errbook\/detail\/[\w-]+\/?$/;
  const REVIEW_PATH = /^\/p\/t_pc\/pc_evaluation\/errbook\/practice\/[\w-]+\/?$/;
  const RECORD_PATH = /^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/;
  const RECORD_ROOT = ".practice-record-page";
  const DETAIL_HEADER = ".errbook-detail-page .page-header";
  const CHAPTER_CLASS = "xet-errbook-chapter-title";
  const ROOT = `.errbook-detail-page, ${RECORD_ROOT}`;
  const HEADER = `${DETAIL_HEADER} .back-btn span`;
  const WATCH = `${DETAIL_HEADER}, title`;
  const WATCH_NODES = `${ROOT}, .page-header, .${CHAPTER_CLASS}, title`;
  const isReadonlyReview = () => REVIEW_PATH.test(location.pathname) &&
    new URLSearchParams(location.search).get("readonly") === "1";

  function createPageTitleController() {
    let started = false, queued = false, observer = null, timer = null;
    let key = "", original = null, applied = "";
    const chapters = modules.practiceRecordTitles?.create(location.origin);
    let chapterHeading = null;
    const routeKey = () => DETAIL_PATH.test(location.pathname) || RECORD_PATH.test(location.pathname) || isReadonlyReview()
      ? location.pathname + location.search : "";
    function renderChapter() {
      const text = DETAIL_PATH.test(location.pathname) && chapters?.resolve({
        sourceId: new URLSearchParams(location.search).get("source_id"),
      });
      const header = text && document.querySelector(DETAIL_HEADER);
      if (!header) { clearChapter(); return; }
      if (!chapterHeading) {
        chapterHeading = document.createElement("h1");
        chapterHeading.className = CHAPTER_CLASS;
      }
      if (chapterHeading.textContent !== text) chapterHeading.textContent = text;
      if (header.nextElementSibling !== chapterHeading) header.after(chapterHeading);
    }
    function clearChapter() {
      chapterHeading?.remove();
      chapterHeading = null;
    }
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
      renderChapter();
      if (!key) return;
      // Read-only reviews have no heading. The record overview has tab
      // headings, but its document title should stay the same across tabs.
      const text = isReadonlyReview() ? "错题详情" : RECORD_PATH.test(location.pathname)
        ? (document.querySelector(RECORD_ROOT) ? "练习记录" : "")
        : document.querySelector(HEADER)?.textContent.replace(/\s+/g, " ").trim();
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
            (n.matches(WATCH_NODES) || n.querySelector(WATCH_NODES))))) schedule();
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
      clearChapter(); restore(); key = "";
    }
    return Object.freeze({ start, stop });
  }
  modules.pageTitle = Object.freeze({ createPageTitleController });
})();
