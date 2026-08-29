(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.playerDom) return;

  const PLAYER_ROOT_SELECTOR = "xg-player, .xgplayer-skin-default";

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, "").trim();
  }

  function composedParent(element) {
    const parent = element.parentElement;
    if (parent) return parent;

    const root = element.getRootNode?.();
    return root instanceof ShadowRoot ? root.host : null;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;

    if (typeof element.checkVisibility === "function") {
      try {
        if (
          !element.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          })
        ) {
          return false;
        }
      } catch {
        // Older Chromium versions may not accept the options object.
      }
    }

    // Opacity and clipping on a parent do not necessarily appear in the
    // child's computed style. Check the composed ancestor chain as well.
    let current = element;
    while (current) {
      const style = getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
      current = composedParent(current);
    }

    return true;
  }

  function deepElements(root = document) {
    const elements = [];
    const queue = [root];

    while (queue.length) {
      const currentRoot = queue.shift();
      let children;

      try {
        children = currentRoot.querySelectorAll("*");
      } catch {
        continue;
      }

      for (const element of children) {
        elements.push(element);
        if (element.shadowRoot) queue.push(element.shadowRoot);
      }
    }

    return elements;
  }

  function deepQueryAll(selector) {
    return deepElements().filter((element) => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
  }

  function playerArea(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function findActivePlayer() {
    const roots = deepQueryAll(PLAYER_ROOT_SELECTOR).filter((root) => {
      return isVisible(root) && root.querySelector("video");
    });

    if (!roots.length) {
      const videos = deepQueryAll("video")
        .filter(isVisible)
        .sort((a, b) => playerArea(b) - playerArea(a));
      // H5 clock-in/course pages use the browser's native <video controls>
      // without an xgplayer wrapper. Treat the video itself as the player so
      // native and web fullscreen affect only the media, not its article/card.
      return videos[0] || null;
    }

    const fullscreenRoot = roots.find(
      (root) =>
        root.classList.contains("xgplayer-is-fullscreen") ||
        root.classList.contains("xgplayer-is-cssfullscreen") ||
        root === document.fullscreenElement ||
        root.contains(document.fullscreenElement),
    );
    if (fullscreenRoot) return fullscreenRoot;

    const focusedRoot = roots.find((root) =>
      root.contains(document.activeElement),
    );
    if (focusedRoot) return focusedRoot;

    const playingRoot = roots.find((root) => {
      const video = root.querySelector("video");
      return video && !video.paused && !video.ended;
    });
    if (playingRoot) return playingRoot;

    return roots.sort((a, b) => playerArea(b) - playerArea(a))[0];
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;

    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ),
    );
  }

  function findPlayerControl(root, selector) {
    try {
      return root.matches(selector) ? root : root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function findPlayerVideo(player) {
    const videos = Array.from(player.querySelectorAll("video"));
    if (!videos.length && player.tagName === "VIDEO") return player;

    return (
      videos.find((video) => !video.paused && !video.ended) ||
      videos.filter(isVisible).sort((a, b) => playerArea(b) - playerArea(a))[0] ||
      videos[0] ||
      null
    );
  }

  modules.playerDom = Object.freeze({
    composedParent,
    deepElements,
    deepQueryAll,
    findActivePlayer,
    findPlayerControl,
    findPlayerVideo,
    isEditableTarget,
    isVisible,
    normalizeText,
  });
})();
