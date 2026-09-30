(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.analysisLayout) return;

  const ANALYSIS_PATH = /\/pc_evaluation\/(?:practice_analysis|exam_analysis)\//;
  const MARKER = "data-xet-analysis-layout";

  function createAnalysisLayoutController() {
    let timer = null;
    let originalMarker = null;

    function update() {
      document.documentElement.toggleAttribute(
        MARKER,
        ANALYSIS_PATH.test(location.pathname),
      );
    }

    function start() {
      if (timer !== null) return;
      originalMarker = document.documentElement.getAttribute(MARKER);
      update();
      // The evaluation app also changes routes without reloading the page.
      timer = setInterval(update, 1_000);
    }

    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      if (originalMarker === null) {
        document.documentElement.removeAttribute(MARKER);
      } else {
        document.documentElement.setAttribute(MARKER, originalMarker);
      }
    }

    return Object.freeze({ start, stop });
  }

  modules.analysisLayout = Object.freeze({ createAnalysisLayoutController });
})();
