(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.mediaShortcuts) return;

  const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

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
      const currentRate = Number.isFinite(video.playbackRate)
        ? video.playbackRate
        : 1;
      const nextRate =
        direction < 0
          ? PLAYBACK_RATES.findLast((rate) => rate < currentRate - 0.001)
          : PLAYBACK_RATES.find((rate) => rate > currentRate + 0.001);

      if (nextRate !== undefined) video.playbackRate = nextRate;
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
