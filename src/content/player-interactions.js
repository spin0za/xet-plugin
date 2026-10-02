(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.playerInteractions) return;

  const CONTROL_SELECTOR = [
    ".xgplayer-controls", "xg-controls", "xg-icon",
    "button", "a", "input", "select", "textarea", "[role=button]",
    ".xgplayer-start", ".xgplayer-replay",
    ".xgplayer-backward", ".xgplayer-forward",
    ".xgplayer-fullscreen", ".xgplayer-cssfullscreen",
    ".xgplayer-definition",
  ].join(",");
  const HIDE_DELAY = 3_000;

  function createPlayerInteractionController({ playerDom }) {
    const { deepElements, findPlayerRoot, findPlayerVideo, findActivePlayer, isEditableTarget } = playerDom;
    const players = new Map();
    let observer = null;
    let pointerFrame = null;
    const pointerUpdates = new Map();
    const focusFrames = new Set();

    function keyboardFocus(root) {
      return Boolean(root.querySelector(".xgplayer-controls :focus-visible, xg-controls :focus-visible"));
    }

    function release(root, state) {
      clearTimeout(state.timer);
      root.removeAttribute("data-xet-interactions");
      root.removeAttribute("data-xet-controls-hidden");
      players.delete(root);
    }

    function show(root, overControls = false) {
      if (!root || root.tagName === "VIDEO") return;
      let state = players.get(root);
      if (!state) {
        state = { timer: null, overControls: false };
        players.set(root, state);
        root.setAttribute("data-xet-interactions", "true");
      }
      state.overControls = overControls;
      clearTimeout(state.timer);
      root.setAttribute("data-xet-controls-hidden", "false");
      const video = findPlayerVideo(root);
      if (!video || video.paused || video.ended || overControls || keyboardFocus(root)) return;
      state.timer = setTimeout(() => {
        if (!root.isConnected) return release(root, state);
        if (!video.paused && !video.ended && !state.overControls && !keyboardFocus(root)) {
          root.setAttribute("data-xet-controls-hidden", "true");
        }
      }, HIDE_DELAY);
    }

    function handlePointer(event) {
      const root = findPlayerRoot(event.target);
      if (!root) return;
      const target = event.type === "pointerout" ? event.relatedTarget : event.target;
      pointerUpdates.set(root, target instanceof Element && root.contains(target) &&
        Boolean(target.closest(".xgplayer-controls, xg-controls")));
      if (pointerFrame === null) pointerFrame = requestAnimationFrame(() => {
        pointerFrame = null;
        for (const [player, overControls] of pointerUpdates) show(player, overControls);
        pointerUpdates.clear();
      });
    }

    function handleMedia(event) {
      const root = findPlayerRoot(event.target);
      show(root, players.get(root)?.overControls);
    }

    function handleFocusOut(event) {
      const root = findPlayerRoot(event.target);
      if (!root) return;
      // focusout fires before document.activeElement has reached its new target.
      const id = requestAnimationFrame(() => {
        focusFrames.delete(id);
        // Hiding a mouse-focused control can itself blur that control. That
        // automatic blur must not immediately reveal it again in a loop.
        if (observer && root.dataset.xetControlsHidden !== "true") {
          show(root, players.get(root)?.overControls);
        }
      });
      focusFrames.add(id);
    }

    function pictureRoot(event) {
      if (event.defaultPrevented || event.button !== 0 || event.sourceCapabilities?.firesTouchEvents) return null;
      const root = findPlayerRoot(event.target);
      if (!root) return null;
      // Live/generic quality menus may use <li> or ARIA options outside the
      // usual xgplayer definition control. Leave those gestures to the SDK.
      if (event.composedPath().some((node) => modules.qualityPreference?.qualityOptionFor(node))) return null;
      if (event.composedPath().some((node) => node instanceof Element &&
          node !== root && node.matches(CONTROL_SELECTOR))) return null;
      return root;
    }

    function handleMouseDown(event) {
      // The mobile skin recognizes desktop taps from mousedown/mouseup and
      // schedules its own delayed toggle BEFORE the ordinary click arrives.
      // Claim picture-only mouse gestures at their start; sliders/buttons and
      // touch swipes remain owned by the SDK.
      if (pictureRoot(event)) event.stopImmediatePropagation();
    }

    function handleClick(event) {
      const root = pictureRoot(event);
      if (!root) return;
      const video = findPlayerVideo(root);
      // Some mobile embeds do not create <video> until the initial start action.
      // Forward a picture click to that action without touching private SDK state.
      const startControl = !video && root.querySelector(".xgplayer-start");
      if (!video && !startControl) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.detail > 1) return;
      if (startControl) startControl.click();
      else if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        video.play()?.catch?.(() => {});
      } else video.pause();
      show(root);
    }

    function handleKey(event) {
      if (event.type === "keydown" && (isEditableTarget(event.target) ||
          ![" ", "Spacebar", "k", "K", "j", "J", "l", "L", "f", "F", "t", "T",
            "Escape", "ArrowLeft", "ArrowRight", "<", ">", "Tab"].includes(event.key))) return;
      show(findPlayerRoot(event.target) || findActivePlayer([...players.keys()]));
    }

    function discover(scope = document) {
      for (const [root, state] of players) {
        if (!root.isConnected) release(root, state);
      }
      const elements = deepElements(scope);
      if (scope instanceof Element) elements.push(scope);
      for (const node of elements) {
        if (node.matches("xg-player, .xgplayer, .xgplayer-skin-default") &&
            !players.has(node)) show(node);
      }
    }

    function handleModeChange(records) {
      for (const record of records) {
        if (record.type === "attributes") show(findPlayerRoot(record.target));
        else for (const node of record.addedNodes) {
          if (node instanceof Element) discover(node);
        }
      }
    }

    function start() {
      if (observer) return;
      window.addEventListener("click", handleClick, true);
      window.addEventListener("mousedown", handleMouseDown, true);
      window.addEventListener("pointermove", handlePointer, true);
      window.addEventListener("pointerout", handlePointer, true);
      window.addEventListener("focusin", handleMedia, true);
      window.addEventListener("focusout", handleFocusOut, true);
      window.addEventListener("keydown", handleKey, true);
      window.addEventListener("play", handleMedia, true);
      window.addEventListener("pause", handleMedia, true);
      window.addEventListener("ended", handleMedia, true);
      document.addEventListener("fullscreenchange", handleKey);
      observer = new MutationObserver(handleModeChange);
      observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ["data-xet-web-fullscreen", "data-xet-native-managed"],
      });
      discover();
    }

    function stop() {
      if (!observer) return;
      observer.disconnect();
      observer = null;
      if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
      pointerFrame = null;
      pointerUpdates.clear();
      for (const id of focusFrames) cancelAnimationFrame(id);
      focusFrames.clear();
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("pointermove", handlePointer, true);
      window.removeEventListener("pointerout", handlePointer, true);
      window.removeEventListener("focusin", handleMedia, true);
      window.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("play", handleMedia, true);
      window.removeEventListener("pause", handleMedia, true);
      window.removeEventListener("ended", handleMedia, true);
      document.removeEventListener("fullscreenchange", handleKey);
      for (const [root, state] of players) release(root, state);
    }

    return Object.freeze({ start, stop });
  }

  modules.playerInteractions = Object.freeze({ createPlayerInteractionController });
})();
