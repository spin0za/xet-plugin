(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.textSelection) return;

  const EVALUATION_PATH = /\/pc_evaluation\/(?:practice_sheet|practice_analysis|exam_sheet|exam_analysis|errbook\/practice)\//;
  const TEXT = ".question-content, .question-option-item__content";
  // Answer rows themselves have role=button. Their content is selectable text;
  // unrelated buttons (including buttons nested in that content) stay excluded.
  const CONTROLS = "input, textarea, select, button, [role=button]:not(.question-option-item), [contenteditable]:not([contenteditable=false]), video, audio, .xgplayer";
  const MARKER = "data-xet-text-selection";
  const STYLE = `
    html[${MARKER}] :is(${TEXT}),
    html[${MARKER}] :is(${TEXT}) * {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
    }
    html[${MARKER}] :is(${TEXT}),
    html[${MARKER}] :is(${TEXT}) :not(:is(${CONTROLS})):not(:is(${CONTROLS}) *) {
      cursor: text !important;
    }
  `;

  function createTextSelectionController() {
    let timer = null;
    let style = null;
    let originalMarker = null;
    let previousPath = "";
    let pointer = null;
    let drag = null;

    function isActive() {
      return timer !== null && EVALUATION_PATH.test(location.pathname);
    }

    function elementOf(node) {
      return node instanceof Element ? node : node?.parentElement;
    }

    function textRoot(node) {
      const element = elementOf(node);
      if (!element || element.closest(CONTROLS)) return null;
      return element.closest(TEXT);
    }

    function selectedQuestionText() {
      const selection = window.getSelection();
      return selection && !selection.isCollapsed &&
        (textRoot(selection.anchorNode) || textRoot(selection.focusNode));
    }

    function allowNativeEvent(event) {
      if (!isActive()) return;
      if (elementOf(event.target)?.closest(CONTROLS)) return;
      if (!textRoot(event.target) && !(event.type === "copy" && selectedQuestionText())) return;
      // Stop the site's ancestor-level disableCopy handlers, but NOT the
      // browser's default selection, context menu or clipboard behavior.
      // Capture works across the content script/page isolated-world boundary.
      event.stopImmediatePropagation();
    }

    function selectionSnapshot() {
      const selection = window.getSelection();
      return selection ? [selection.anchorNode, selection.anchorOffset,
        selection.focusNode, selection.focusOffset] : [];
    }

    function handlePointerDown(event) {
      pointer = null;
      drag = null;
      // A pushState transition may precede the route poll. Synchronize before
      // tracking a drag so that the next poll cannot erase an active selection.
      checkRoute();
      if (!isActive() || event.button !== 0) return;
      const root = textRoot(event.target);
      const option = root?.closest(".question-option-item, .question-select-item");
      if (option) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        option, selection: selectionSnapshot() };
    }

    function handlePointerUp(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const origin = pointer;
      pointer = null;
      const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 4;
      const changed = selectionSnapshot().some((value, index) => value !== origin.selection[index]);
      if (isActive() && moved && changed && selectedQuestionText()) {
        drag = { option: origin.option, time: Date.now() };
      }
    }

    function handleClick(event) {
      const selectionDrag = drag;
      drag = null;
      if (!isActive() || !selectionDrag || event.detail === 0 ||
          Date.now() - selectionDrag.time > 500 ||
          !selectionDrag.option.contains(elementOf(event.target))) return;
      // Selecting an option's text must not also submit that answer.
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function handlePointerCancel() { pointer = null; drag = null; }

    function checkRoute() {
      if (previousPath === location.pathname) return;
      previousPath = location.pathname;
      document.documentElement.toggleAttribute(MARKER, isActive());
      handlePointerCancel();
    }

    function start() {
      if (timer !== null || window.top !== window) return;
      originalMarker = document.documentElement.getAttribute(MARKER);
      style = document.createElement("style");
      style.textContent = STYLE;
      document.documentElement.append(style);
      previousPath = "";
      timer = setInterval(checkRoute, 1_000);
      for (const type of ["selectstart", "contextmenu", "copy"]) {
        window.addEventListener(type, allowNativeEvent, true);
      }
      window.addEventListener("pointerdown", handlePointerDown, true);
      window.addEventListener("pointerup", handlePointerUp, true);
      window.addEventListener("pointercancel", handlePointerCancel, true);
      window.addEventListener("click", handleClick, true);
      window.addEventListener("popstate", checkRoute);
      window.addEventListener("hashchange", checkRoute);
      checkRoute();
    }

    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      for (const type of ["selectstart", "contextmenu", "copy"]) {
        window.removeEventListener(type, allowNativeEvent, true);
      }
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", checkRoute);
      window.removeEventListener("hashchange", checkRoute);
      style.remove();
      style = null;
      handlePointerCancel();
      if (originalMarker === null) document.documentElement.removeAttribute(MARKER);
      else document.documentElement.setAttribute(MARKER, originalMarker);
    }

    return Object.freeze({ start, stop });
  }

  modules.textSelection = Object.freeze({ createTextSelectionController });
})();
