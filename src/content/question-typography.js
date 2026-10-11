(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.questionTypography) return;

  const PATH = /^\/p\/t_pc\/pc_evaluation\/(?:practice_sheet|practice_analysis|exam_sheet|exam_analysis|errbook\/(?:practice|detail))\//;
  const MARKER = "data-xet-question-typography";
  const TEXT = ".question-content, .question-option-item__content, .errbook-detail-page .card-content";
  const AUTHORED_FONT = '[style*="font-family" i], [style*="font:" i], font[face]';
  const EXCLUDED = "math, .katex, .MathJax, mjx-container, .math-tex, .ql-formula, code, pre, kbd, samp, svg, .iconfont, .xgplayer, button, [role=button]:not(.question-option-item), input, textarea, select, [contenteditable]:not([contenteditable=false])";
  // Override imported font faces only, leaving the site's font stack and all
  // semantic emphasis, sizes, line heights, formulas and controls unchanged.
  const STYLE = `
    html[${MARKER}] :is(${TEXT}):is(${AUTHORED_FONT}):not(:is(${EXCLUDED})):not(:is(${EXCLUDED}) *),
    html[${MARKER}] :is(${TEXT}) :is(${AUTHORED_FONT}):not(:is(${EXCLUDED})):not(:is(${EXCLUDED}) *) {
      font-family: inherit !important;
    }
  `;

  function createQuestionTypographyController() {
    let timer = null, style = null, originalMarker = null;
    function checkRoute() {
      document.documentElement.toggleAttribute(MARKER, PATH.test(location.pathname));
    }
    function start() {
      if (timer !== null || window.top !== window) return;
      originalMarker = document.documentElement.getAttribute(MARKER);
      style = document.createElement("style");
      style.textContent = STYLE;
      document.documentElement.append(style);
      timer = setInterval(checkRoute, 1000);
      window.addEventListener("popstate", checkRoute);
      window.addEventListener("hashchange", checkRoute);
      checkRoute();
    }
    function stop() {
      if (timer === null) return;
      clearInterval(timer); timer = null;
      window.removeEventListener("popstate", checkRoute);
      window.removeEventListener("hashchange", checkRoute);
      style.remove(); style = null;
      if (originalMarker === null) document.documentElement.removeAttribute(MARKER);
      else document.documentElement.setAttribute(MARKER, originalMarker);
    }
    return Object.freeze({ start, stop });
  }
  modules.questionTypography = Object.freeze({ createQuestionTypographyController });
})();
