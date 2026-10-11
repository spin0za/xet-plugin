(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.questionTypography) return;

  const PATH = /^\/p\/t_pc\/pc_evaluation\/(?:practice_sheet|practice_analysis|exam_sheet|exam_analysis|errbook\/(?:practice|detail))\//;
  const MARKER = "data-xet-question-typography";
  const FULL_BOLD = "data-xet-question-full-bold";
  const TEXT = ".question-content, .question-option-item__content, .errbook-detail-page .card-content";
  const AUTHORED_FONT = '[style*="font-family" i], [style*="font:" i], font[face]';
  const EXCLUDED = "math, .katex, .MathJax, mjx-container, .math-tex, .ql-formula, code, pre, kbd, samp, svg, .iconfont, .xgplayer, button, [role=button]:not(.question-option-item), input, textarea, select, [contenteditable]:not([contenteditable=false])";
  // Keep local emphasis, but undo imported bold covering the entire question.
  const STYLE = `
    html[${MARKER}] :is(${TEXT}):is(${AUTHORED_FONT}):not(:is(${EXCLUDED})):not(:is(${EXCLUDED}) *),
    html[${MARKER}] :is(${TEXT}) :is(${AUTHORED_FONT}):not(:is(${EXCLUDED})):not(:is(${EXCLUDED}) *) {
      font-family: inherit !important;
    }
    html[${MARKER}] [${FULL_BOLD}] { font-weight: inherit !important; }
  `;

  function fullBoldElements(root) {
    const bold = new Set([...root.querySelectorAll("strong, b, [style]")].filter(el =>
      !el.closest(EXCLUDED) && !el.closest("h1, h2, h3, h4, h5, h6") &&
      (el.matches("strong, b") || /^(bold|bolder)$/.test(el.style.fontWeight) || Number(el.style.fontWeight) >= 600)));
    if (!bold.size) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text, hasText = false;
    while ((text = walker.nextNode())) {
      if (!text.textContent.trim() || text.parentElement.closest(EXCLUDED)) continue;
      hasText = true;
      let parent = text.parentElement;
      while (parent !== root && !bold.has(parent)) parent = parent.parentElement;
      if (!bold.has(parent)) return [];
    }
    return hasText ? [...bold] : [];
  }

  function createQuestionTypographyController() {
    let timer = null, style = null, originalMarker = null, observer = null, frame = null;
    let active = false, generation = 0, pending = false;
    const marked = new Set();
    function clearBold() {
      generation++;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; pending = false;
      for (const el of marked) el.removeAttribute(FULL_BOLD);
      marked.clear();
    }
    function schedule() {
      if (!active) return;
      if (frame !== null) { pending = true; return; }
      frame = requestAnimationFrame(() => {
        frame = null; pending = false;
        const roots = [...document.querySelectorAll(TEXT)].flatMap(el => {
          const rich = [...el.querySelectorAll(".xe-preview__content")];
          return rich.length ? rich : [el];
        });
        const current = ++generation, next = new Set();
        function batch(index) {
          if (!active || current !== generation) return;
          for (const root of roots.slice(index, index + 20)) {
            for (const el of fullBoldElements(root)) {
              next.add(el); marked.add(el); el.setAttribute(FULL_BOLD, "");
            }
          }
          if (index + 20 < roots.length) {
            frame = requestAnimationFrame(() => { frame = null; batch(index + 20); });
          } else {
            for (const el of marked) if (!next.has(el)) el.removeAttribute(FULL_BOLD);
            marked.clear(); for (const el of next) marked.add(el);
            if (pending) schedule();
          }
        }
        batch(0);
      });
    }
    function checkRoute() {
      const next = PATH.test(location.pathname);
      document.documentElement.toggleAttribute(MARKER, next);
      if (active === next) return;
      active = next;
      if (active) schedule(); else clearBold();
    }
    function start() {
      if (timer !== null || window.top !== window) return;
      originalMarker = document.documentElement.getAttribute(MARKER);
      style = document.createElement("style");
      style.textContent = STYLE;
      document.documentElement.append(style);
      observer = new MutationObserver(records => {
        if (records.some(r => r.target.parentElement?.closest(TEXT) || r.target.closest?.(TEXT) ||
          [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 &&
            (n.matches(TEXT) || n.querySelector(TEXT))))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["style", "class"] });
      timer = setInterval(checkRoute, 1000);
      window.addEventListener("popstate", checkRoute);
      window.addEventListener("hashchange", checkRoute);
      checkRoute();
    }
    function stop() {
      if (timer === null) return;
      clearInterval(timer); timer = null;
      active = false; observer.disconnect(); observer = null; clearBold();
      window.removeEventListener("popstate", checkRoute);
      window.removeEventListener("hashchange", checkRoute);
      style.remove(); style = null;
      if (originalMarker === null) document.documentElement.removeAttribute(MARKER);
      else document.documentElement.setAttribute(MARKER, originalMarker);
    }
    return Object.freeze({ start, stop });
  }
  modules.questionTypography = Object.freeze({ createQuestionTypographyController, fullBoldElements });
})();
