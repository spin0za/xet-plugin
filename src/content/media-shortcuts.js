(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.mediaShortcuts) return;

  const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

  function playbackRateOptions(video, playerDom) {
    const liveRoot = video.closest(".pc-live-player");
    const root = liveRoot || playerDom.findPlayerRoot(video);
    if (!root) return null; // Truly native video: no SDK state to synchronize.
    const menu = root.querySelector(liveRoot
      ? ".speed-btn .speed-control"
      : ".xgplayer-playbackrate, .xgplayer-playback-rate");
    // A known live player may mount its menu later. Do not create a hidden,
    // unsupported speed before its controls are ready.
    if (!menu) return liveRoot ? [] : null;
    const options = [];
    for (const element of menu.querySelectorAll(liveRoot ? ".selector_item" : "li")) {
      if (element.matches(':disabled, [disabled], [aria-disabled="true"], .disabled, .is-disabled') ||
          element.closest("[inert]")) continue;
      const text = (element.textContent || "").trim();
      const match = text.match(/^(\d+(?:\.\d+)?)\s*[x×倍]?$/i);
      const rate = match ? Number(match[1]) : NaN;
      if (Number.isFinite(rate) && rate > 0) options.push({ rate, element });
    }
    return options.sort((a, b) => a.rate - b.rate);
  }

  function createShortcutController({ fullscreen, playerDom }) {
    const {
      findActivePlayer,
      findPlayerVideo,
      isEditableTarget,
    } = playerDom;
    let suppressWebFullscreenEscapeKeyup = false;
    let suppressWebFullscreenTKeyup = false;
    let started = false;

    function playerShortcutAction(event) {
      const key = event.key.toLowerCase();

      if (event.code === "ArrowLeft") return "seek-back-5";
      if (event.code === "ArrowRight") return "seek-forward-5";
      if (event.code === "KeyJ" || key === "j") return "seek-back-10";
      if (event.code === "KeyL" || key === "l") return "seek-forward-10";
      if (event.code === "KeyK" || key === "k") return "toggle-play";
      if (event.code === "Space" || event.key === " ") return "toggle-play";
      if (event.code === "KeyF" || key === "f") return "native-fullscreen";
      if (event.code === "KeyT" || key === "t") return "web-fullscreen";
      if (event.key === "<") return "speed-down";
      if (event.key === ">") return "speed-up";
      return null;
    }

    function isModifiedOrEditableShortcut(event) {
      return (
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      );
    }

    function seekVideo(video, seconds) {
      const currentTime = Number.isFinite(video.currentTime)
        ? video.currentTime
        : 0;
      const duration = Number.isFinite(video.duration)
        ? video.duration
        : Infinity;
      video.currentTime = Math.min(duration, Math.max(0, currentTime + seconds));
    }

    function toggleVideoPlayback(video) {
      if (video.paused || video.ended) {
        if (
          video.ended &&
          Number.isFinite(video.duration) &&
          video.currentTime >= video.duration
        ) {
          video.currentTime = 0;
        }
        const playResult = video.play();
        if (playResult?.catch) playResult.catch(() => {});
      } else {
        video.pause();
      }
    }

    function changePlaybackRate(video, direction) {
      const options = playbackRateOptions(video, playerDom);
      const rates = options === null ? PLAYBACK_RATES : options.map(option => option.rate);
      const currentRate = Number.isFinite(video.playbackRate)
        ? video.playbackRate
        : 1;
      const nextRate =
        direction < 0
          ? rates.findLast((rate) => rate < currentRate - 0.001)
          : rates.find((rate) => rate > currentRate + 0.001);

      if (nextRate === undefined) return;
      // Let the SDK update its label, selected option and internal speed too.
      // Clicking an already-selected stale label can be a no-op in Vue; in
      // that case repair the media value as well. Never just rewrite UI text.
      options?.find(option => option.rate === nextRate)?.element.click();
      if (video.playbackRate !== nextRate) video.playbackRate = nextRate;
    }

    function handleKeydown(event) {
      if (event.key === "Escape") {
        if (event.isComposing) return;

        const player = findActivePlayer();
        if (!player || !fullscreen.isWebFullscreen(player)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        suppressWebFullscreenEscapeKeyup = true;
        fullscreen.exitWebFullscreen(player);
        return;
      }

      const action = playerShortcutAction(event);
      if (event.defaultPrevented || !action) return;
      // Space on a focused quality option activates that option, not playback.
      if (event.code === "Space" || event.key === " ") {
        if (modules.qualityPreference?.qualityOptionFor(event.target)) return;
        if (event.composedPath().some(node => node instanceof Element && node.matches(".xet-download-button"))) {
          event.stopImmediatePropagation(); // Preserve native button activation, suppress SDK hotkeys.
          return;
        }
      }

      const player = findActivePlayer();
      if (!player) return;

      const isUnmodifiedWebFullscreenExit =
        action === "web-fullscreen" &&
        fullscreen.isWebFullscreen(player) &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey;
      if (
        (!isUnmodifiedWebFullscreenExit &&
          isModifiedOrEditableShortcut(event)) ||
        (event.repeat &&
          ["toggle-play", "native-fullscreen", "web-fullscreen"].includes(
            action,
          ))
      ) {
        return;
      }

      const video = findPlayerVideo(player);
      if (!video && !action.endsWith("fullscreen")) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      switch (action) {
        case "seek-back-5":
          seekVideo(video, -5);
          break;
        case "seek-forward-5":
          seekVideo(video, 5);
          break;
        case "seek-back-10":
          seekVideo(video, -10);
          break;
        case "seek-forward-10":
          seekVideo(video, 10);
          break;
        case "toggle-play":
          toggleVideoPlayback(video);
          break;
        case "speed-down":
          changePlaybackRate(video, -1);
          break;
        case "speed-up":
          changePlaybackRate(video, 1);
          break;
        case "native-fullscreen":
          fullscreen.toggleNativeFullscreen(player);
          break;
        case "web-fullscreen":
          if (isUnmodifiedWebFullscreenExit) {
            suppressWebFullscreenTKeyup = true;
          }
          fullscreen.toggleWebFullscreen(player);
          break;
        default:
          break;
      }
    }

    function handleKeyup(event) {
      if (event.code === "Space" || event.key === " ") {
        if (modules.qualityPreference?.qualityOptionFor(event.target)) return;
        if (event.composedPath().some(node => node instanceof Element && node.matches(".xet-download-button"))) {
          event.stopImmediatePropagation();
          return;
        }
      }
      if (event.key === "Escape" && suppressWebFullscreenEscapeKeyup) {
        suppressWebFullscreenEscapeKeyup = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (event.code === "KeyT" && suppressWebFullscreenTKeyup) {
        suppressWebFullscreenTKeyup = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (
        !playerShortcutAction(event) ||
        isModifiedOrEditableShortcut(event) ||
        !findActivePlayer()
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function start() {
      if (started) return;
      started = true;

      // Window capture runs before xgplayer's document/root handlers,
      // preventing its built-in 15-second arrow seek from running as well.
      window.addEventListener("keydown", handleKeydown, true);
      window.addEventListener("keyup", handleKeyup, true);
    }

    function stop() {
      if (!started) return;
      started = false;
      window.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("keyup", handleKeyup, true);
      suppressWebFullscreenEscapeKeyup = false;
      suppressWebFullscreenTKeyup = false;
    }

    return Object.freeze({ start, stop });
  }

  modules.mediaShortcuts = Object.freeze({ createShortcutController });
})();
