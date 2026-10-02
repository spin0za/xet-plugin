(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.qualityPreference) return;

  const QUALITY_LABEL = /^(原画|原始画质|超清|蓝光|高清|标清|流畅|自动)(\d{3,4}[pP]?)?$|^\d{3,4}[pP]$|^[248][kK]$/;
  const OPTION_SELECTOR = 'li, [role="option"], [role="menuitem"], [definition], [cname], .option-item';

  const qualityLabel = (value) => {
    const label = String(value || "").replace(/\s+/g, "");
    return QUALITY_LABEL.test(label) ? label : "";
  };

  function qualityRank(element) {
    const definition = String(element.getAttribute("definition") || "");
    const labels = [element.textContent, element.getAttribute("cname"), /^\d{3,4}$/.test(definition) ? `${definition}p` : definition]
      .map(qualityLabel).filter(Boolean);
    if (labels.some((label) => label.startsWith("原画") || label.startsWith("原始画质"))) return 100_000;
    if (labels.some((label) => label.startsWith("自动"))) return 0;
    // Prefer explicit resolution metadata over ambiguous marketing labels.
    const resolution = (label) => {
      const pixels = label.match(/(\d{3,4})[pP]?$/);
      if (pixels) return Number(pixels[1]);
      const k = label.match(/^([248])[kK]$/);
      return k ? ({ 2: 1440, 4: 2160, 8: 4320 })[k[1]] : 0;
    };
    const sdkResolution = resolution(qualityLabel(/^\d{3,4}$/.test(definition) ? `${definition}p` : definition));
    if (sdkResolution) return sdkResolution;
    const resolutions = labels.map(resolution);
    if (resolutions.some(Boolean)) return Math.max(...resolutions);
    const named = { 蓝光: 1440, 超清: 1080, 高清: 720, 标清: 480, 流畅: 360 };
    return Math.max(0, ...labels.map((label) => named[label] || 0));
  }

  function qualityOptionFor(target) {
    if (!(target instanceof Element)) return null;
    const option = target.closest(OPTION_SELECTOR);
    if (option?.closest(".xgplayer-definition")) return option;
    const control = option || target.closest("button");
    if (!control || !qualityLabel(control.textContent)) return null;
    if (option) return option;
    // Generic menus sometimes use plain buttons. Require a menu/list or a
    // separate multi-choice container, never the current-quality toggle.
    if (control.closest('[role="menu"], [role="listbox"], ul, ol, .xg-options-list')) return control;
    const parent = control.parentElement;
    if (parent && !parent.querySelector("video") &&
        [...parent.querySelectorAll("button")].filter((button) =>
          qualityLabel(button.textContent),
        ).length >= 2) return control;
    return null;
  }

  function createQualityPreferenceTracker({ playerDom, isEnabled, onManualSelection }) {
    const states = new WeakMap();
    let started = false;
    const route = () => location.href.split("#")[0];

    function scopeFor(element) {
      const root = playerDom.findPlayerRoot(element);
      if (root) return root;
      let ancestor = element.tagName === "VIDEO" ? element.parentElement : element;
      while (ancestor instanceof Element) {
        if (ancestor.querySelector("video")) return ancestor;
        ancestor = playerDom.composedParent(ancestor);
      }
      return null;
    }

    function stateFor(element) {
      const scope = scopeFor(element);
      if (!scope) return null;
      // Identity checks must not call the active-player helper: that helper
      // reads layout/visibility, whereas duration is a cheap media property.
      const video = scope.tagName === "VIDEO" ? scope : scope.querySelector("video");
      const duration = video && Number.isFinite(video.duration) ? video.duration : null;
      let state = states.get(scope);
      // A rendition/source change alone is NOT a new lesson. Keep ownership
      // through emptied/loadstart, SDK rebuilds, and small duration variations.
      if (!state || state.route !== route() ||
          (duration !== null && state.duration !== null &&
            Math.abs(duration - state.duration) > Math.max(1, state.duration * 0.01))) {
        state = { route: route(), duration, manual: false };
        states.set(scope, state);
      } else if (duration !== null && state.duration === null) state.duration = duration;
      return state;
    }

    function handleSelection(event) {
      if (!started || !isEnabled() || !event.isTrusted) return;
      if (event.type === "pointerdown" && event.button !== 0) return;
      if (event.type === "keydown" &&
          (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
            !["Enter", " "].includes(event.key))) return;
      const option = event.composedPath().map(qualityOptionFor).find(Boolean);
      if (!option) return;
      const state = stateFor(option);
      if (!state || state.manual) return;
      // Capture precedes the SDK's own handlers (including synthetic clicks
      // forwarded from pointer/keyboard input). Do not block the user's event.
      state.manual = true;
      onManualSelection();
    }

    const events = ["pointerdown", "click", "keydown"];
    function start() {
      if (started) return;
      started = true;
      events.forEach((type) => document.addEventListener(type, handleSelection, true));
    }
    function stop() {
      started = false;
      events.forEach((type) => document.removeEventListener(type, handleSelection, true));
      // Preserve ownership when settings refresh or the controller restarts.
      // WeakMap entries disappear naturally when their players are removed.
    }

    return Object.freeze({
      start, stop, scopeFor,
      snapshot: stateFor,
      allows(element, snapshot) {
        const state = stateFor(element);
        return !state?.manual && (snapshot === undefined || snapshot === state);
      },
    });
  }

  modules.qualityPreference = Object.freeze({ qualityLabel, qualityRank, qualityOptionFor, createQualityPreferenceTracker });
})();
