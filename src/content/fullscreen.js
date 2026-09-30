(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.fullscreen) return;

  const NATIVE_FULLSCREEN_SELECTOR = [
    ".xgplayer-fullscreen",
    ".xgplayer-fullscreen-img",
    "xg-fullscreen",
  ].join(",");
  const WEB_FULLSCREEN_SELECTOR = [
    ".xgplayer-cssfullscreen",
    ".xgplayer-cssfullscreen-img",
    "xg-cssfullscreen",
  ].join(",");
  const WEB_FULLSCREEN_DOCUMENT_CLASS = "xet-web-fullscreen-active";
  const WEB_FULLSCREEN_PATH_ATTRIBUTE = "data-xet-web-fullscreen-path";

  function createFullscreenController({ playerDom }) {
    const { composedParent, findPlayerControl, findPlayerRoot } = playerDom;
    const webFullscreenLayerStates = new WeakMap();
    const managedPlayers = new Set();
    const interactions = modules.playerInteractions.createPlayerInteractionController({ playerDom });
    let started = false;
    let clickingFallbackControl = false;

    function elevateWebFullscreen(root) {
      const pathElements = [];
      let current = composedParent(root);

      while (current && current !== document.documentElement) {
        current.setAttribute(WEB_FULLSCREEN_PATH_ATTRIBUTE, "true");
        pathElements.push(current);
        current = composedParent(current);
      }

      const originalPopover = root.getAttribute("popover");
      let usesTopLayer = false;

      if (
        typeof root.showPopover === "function" &&
        typeof root.hidePopover === "function"
      ) {
        try {
          root.setAttribute("popover", "manual");
          root.showPopover();
          usesTopLayer = root.matches(":popover-open");
        } catch {
          // The marked ancestor path still hides the surrounding page when
          // the Popover API is unavailable or top-layer display is rejected.
        }
      }

      if (!usesTopLayer) {
        if (originalPopover === null) root.removeAttribute("popover");
        else root.setAttribute("popover", originalPopover);
      }

      webFullscreenLayerStates.set(root, {
        originalPopover,
        pathElements,
        usesTopLayer,
      });
    }

    function lowerWebFullscreen(root) {
      const state = webFullscreenLayerStates.get(root);
      if (!state) return;

      if (state.usesTopLayer) {
        try {
          if (root.matches(":popover-open")) root.hidePopover();
        } catch {
          // Continue restoring the original attributes and page visibility.
        }
      }

      if (state.originalPopover === null) root.removeAttribute("popover");
      else root.setAttribute("popover", state.originalPopover);

      for (const element of state.pathElements) {
        element.removeAttribute(WEB_FULLSCREEN_PATH_ATTRIBUTE);
      }
      webFullscreenLayerStates.delete(root);
    }

    function requestNativeFullscreen(element) {
      const method =
        element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.mozRequestFullScreen ||
        element.msRequestFullscreen;
      return method ? method.call(element) : null;
    }

    function exitNativeFullscreen() {
      const method =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen;
      return method ? method.call(document) : null;
    }

    function nativeFullscreenElement() {
      return (
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null
      );
    }

    function isNativeFullscreen(root) {
      const fullscreenElement = nativeFullscreenElement();
      if (managedPlayers.has(root)) {
        // Player classes can lag one fullscreenchange behind the browser.
        // Managed requests use the browser's state as the source of truth.
        return Boolean(
          root === fullscreenElement ||
            (fullscreenElement && root.contains(fullscreenElement)),
        );
      }
      return Boolean(
        root.classList.contains("xgplayer-is-fullscreen") ||
          root.classList.contains("xgplayer-rotate-fullscreen") ||
          root === fullscreenElement ||
          (fullscreenElement && root.contains(fullscreenElement)),
      );
    }

    function isWebFullscreen(root) {
      return (
        root.classList.contains("xgplayer-is-cssfullscreen") ||
        root.dataset.xetWebFullscreen === "true"
      );
    }

    function clickNativeFullscreenControl(root) {
      const control = findPlayerControl(root, NATIVE_FULLSCREEN_SELECTOR);
      if (!control) return false;

      clickingFallbackControl = true;
      try {
        control.click();
      } finally {
        clickingFallbackControl = false;
      }
      return true;
    }

    function manageNativePlayer(root) {
      if (root.tagName === "VIDEO") return;
      managedPlayers.add(root);
      root.setAttribute("data-xet-native-managed", "true");
    }

    function enterNativeFullscreen(root) {
      const canRequest = Boolean(
        root.requestFullscreen ||
          root.webkitRequestFullscreen ||
          root.mozRequestFullScreen ||
          root.msRequestFullscreen,
      );
      if (!canRequest) {
        clickNativeFullscreenControl(root);
        return;
      }

      // Always fullscreen the whole player, not just its <video>. This keeps
      // custom controls in the fullscreen subtree and bypasses mobile skins'
      // rotate/overlay implementations. xgplayer still receives fullscreenchange.
      manageNativePlayer(root);
      try {
        const result = requestNativeFullscreen(root);
        result?.catch?.(() => {});
      } catch {
        // A rejected request must not leave an unhandled error in the page.
      }
    }

    function toggleNativeFullscreen(root) {
      if (isWebFullscreen(root)) {
        // xgplayer treats a fullscreen-button click during CSS fullscreen as
        // "exit CSS fullscreen" only. Exit explicitly, then enter native
        // fullscreen while the keyboard user gesture is still active.
        exitWebFullscreen(root);
        enterNativeFullscreen(root);
        return;
      }

      if (nativeFullscreenElement()) {
        const result = exitNativeFullscreen();
        result?.catch?.(() => {});
      } else if (isNativeFullscreen(root)) {
        // Compatibility fallback for players emulating native fullscreen.
        clickNativeFullscreenControl(root);
      } else {
        enterNativeFullscreen(root);
      }
    }

    function handleFullscreenClick(event) {
      if (clickingFallbackControl || event.defaultPrevented) return;
      const control = event.composedPath().find(
        (element) =>
          element instanceof Element &&
          element.matches(NATIVE_FULLSCREEN_SELECTOR),
      );
      if (!control) return;
      const root = findPlayerRoot(control);
      if (!root?.querySelector("video")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleNativeFullscreen(root);
    }

    function handleFullscreenChange() {
      for (const root of managedPlayers) {
        if (!root.isConnected) {
          managedPlayers.delete(root);
          continue;
        }
        // Clear stale SDK state; the interaction controller subsequently owns
        // pause/hover visibility and the normal idle timeout.
        if (!nativeFullscreenElement()) {
          root.classList.remove("xgplayer-inactive");
        }
      }
    }

    function start() {
      if (started) return;
      started = true;
      interactions.start();
      window.addEventListener("click", handleFullscreenClick, true);
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    }

    function stop() {
      if (!started) return;
      started = false;
      interactions.stop();
      window.removeEventListener("click", handleFullscreenClick, true);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      for (const root of managedPlayers) {
        root.removeAttribute("data-xet-native-managed");
      }
      managedPlayers.clear();
    }

    function toggleManagedWebFullscreen(root) {
      const marker = "xetWebFullscreen";
      const isActive = root.dataset[marker] === "true";

      if (isActive) {
        lowerWebFullscreen(root);
        document.body.style.overflow = root.dataset.xetBodyOverflow || "";
        document.documentElement.style.overflow =
          root.dataset.xetHtmlOverflow || "";
        if (root.tagName === "VIDEO") {
          root.controls = root.dataset.xetOriginalControls === "true";
        }
        delete root.dataset[marker];
        delete root.dataset.xetBodyOverflow;
        delete root.dataset.xetHtmlOverflow;
        delete root.dataset.xetOriginalControls;
        root.classList.remove("xgplayer-is-cssfullscreen");
        document.body.classList.remove("xeplayer-webscreen-fix");
        document.documentElement.classList.remove(
          WEB_FULLSCREEN_DOCUMENT_CLASS,
        );
        return;
      }

      root.dataset[marker] = "true";
      root.dataset.xetBodyOverflow = document.body.style.overflow || "";
      root.dataset.xetHtmlOverflow =
        document.documentElement.style.overflow || "";
      if (root.tagName === "VIDEO") {
        root.dataset.xetOriginalControls = String(root.controls);
        root.controls = true;
      }
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      root.classList.add("xgplayer-is-cssfullscreen");
      document.body.classList.add("xeplayer-webscreen-fix");
      document.documentElement.classList.add(WEB_FULLSCREEN_DOCUMENT_CLASS);
      elevateWebFullscreen(root);
    }

    function clickWebFullscreenControl(root) {
      const control = findPlayerControl(root, WEB_FULLSCREEN_SELECTOR);
      if (!control) return false;

      control.click();
      return true;
    }

    function exitWebFullscreen(root) {
      if (root.dataset.xetWebFullscreen === "true") {
        toggleManagedWebFullscreen(root);
        return;
      }

      if (!clickWebFullscreenControl(root)) {
        root.classList.remove("xgplayer-is-cssfullscreen");
        document.body.classList.remove("xeplayer-webscreen-fix");
      }
    }

    function enterWebFullscreen(root) {
      if (!isWebFullscreen(root)) toggleManagedWebFullscreen(root);
    }

    function switchNativeToWebFullscreen(root) {
      let completed = false;
      let safetyTimer = null;

      const enterWeb = () => {
        if (completed) return;
        completed = true;
        if (safetyTimer !== null) clearTimeout(safetyTimer);
        document.removeEventListener("fullscreenchange", enterWeb, true);
        document.removeEventListener("webkitfullscreenchange", enterWeb, true);

        // Allow xgplayer's own fullscreen state listener to finish first.
        requestAnimationFrame(() => enterWebFullscreen(root));
      };

      const fullscreenElement = nativeFullscreenElement();
      if (fullscreenElement) {
        document.addEventListener("fullscreenchange", enterWeb, true);
        document.addEventListener("webkitfullscreenchange", enterWeb, true);
        const exitResult = exitNativeFullscreen();
        if (exitResult?.then) exitResult.then(enterWeb).catch(enterWeb);
        safetyTimer = setTimeout(enterWeb, 250);
        return;
      }

      // Some xgplayer versions emulate native fullscreen without exposing a
      // document.fullscreenElement. Let its button exit, then enter web mode
      // on the next rendered frame.
      if (!clickNativeFullscreenControl(root)) {
        root.classList.remove(
          "xgplayer-is-fullscreen",
          "xgplayer-rotate-fullscreen",
        );
      }
      requestAnimationFrame(enterWeb);
    }

    function toggleWebFullscreen(root) {
      if (isNativeFullscreen(root)) {
        switchNativeToWebFullscreen(root);
        return;
      }

      if (isWebFullscreen(root)) exitWebFullscreen(root);
      else toggleManagedWebFullscreen(root);
    }

    return Object.freeze({
      start,
      stop,
      exitWebFullscreen,
      isWebFullscreen,
      toggleNativeFullscreen,
      toggleWebFullscreen,
    });
  }

  modules.fullscreen = Object.freeze({ createFullscreenController });
})();
