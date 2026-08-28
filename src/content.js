(() => {
  const INSTANCE_KEY = "__xetUltraQualityInstance";

  if (window[INSTANCE_KEY]) {
    window[INSTANCE_KEY].wake();
    return;
  }

  const TARGET_LABELS = ["超清", "1080P", "1080p", "蓝光"];
  const CURRENT_LABELS = ["高清", "标清", "流畅", "自动"];
  const EXACT_LABELS = new Set([...TARGET_LABELS, ...CURRENT_LABELS]);
  const RETRY_INTERVAL_MS = 1_000;
  const MENU_SETTLE_MS = 160;
  const RECLICK_GUARD_MS = 800;
  const MAX_CONTROL_WIDTH = 180;
  const MAX_CONTROL_HEIGHT = 90;
  const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const PLAYER_ROOT_SELECTOR = "xg-player, .xgplayer-skin-default";
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

  let enabled = true;
  let disabledHosts = [];
  let timer = null;
  let observer = null;
  let lastTargetClicks = new WeakMap();
  let attemptRunning = false;
  let rerunRequested = false;
  let previousLocation = location.href;
  let suppressWebFullscreenEscapeKeyup = false;
  let suppressWebFullscreenTKeyup = false;

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

  function isSmallControl(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.width <= MAX_CONTROL_WIDTH &&
      rect.height <= MAX_CONTROL_HEIGHT
    );
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

    const focusedRoot = roots.find((root) => root.contains(document.activeElement));
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
    if (control) {
      control.click();
      return true;
    }
    return false;
  }

  function enterNativeFullscreen(root) {
    if (!clickNativeFullscreenControl(root)) requestNativeFullscreen(root);
  }

  function toggleNativeFullscreen(root) {
    if (isWebFullscreen(root)) {
      // xgplayer treats a fullscreen-button click during CSS fullscreen as
      // "exit CSS fullscreen" only. Exit it explicitly, then enter native
      // fullscreen synchronously so the keyboard user gesture is preserved.
      exitWebFullscreen(root);
      enterNativeFullscreen(root);
      return;
    }

    if (!clickNativeFullscreenControl(root)) {
      if (nativeFullscreenElement()) exitNativeFullscreen();
      else requestNativeFullscreen(root);
    }
  }

  function toggleFallbackWebFullscreen(root) {
    const marker = "xetWebFullscreen";
    const isActive = root.dataset[marker] === "true";

    if (isActive) {
      const originalStyle = root.dataset.xetOriginalStyle;
      if (originalStyle) {
        root.setAttribute("style", originalStyle);
      } else {
        root.removeAttribute("style");
      }
      document.body.style.overflow = root.dataset.xetBodyOverflow || "";
      delete root.dataset[marker];
      delete root.dataset.xetOriginalStyle;
      delete root.dataset.xetBodyOverflow;
      root.classList.remove("xgplayer-is-cssfullscreen");
      document.body.classList.remove("xeplayer-webscreen-fix");
      return;
    }

    root.dataset[marker] = "true";
    root.dataset.xetOriginalStyle = root.getAttribute("style") || "";
    root.dataset.xetBodyOverflow = document.body.style.overflow || "";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      maxWidth: "none",
      zIndex: "2147483646",
    });
    document.body.style.overflow = "hidden";
    root.classList.add("xgplayer-is-cssfullscreen");
    document.body.classList.add("xeplayer-webscreen-fix");
  }

  function clickWebFullscreenControl(root) {
    const control = findPlayerControl(root, WEB_FULLSCREEN_SELECTOR);
    if (control) {
      control.click();
      return true;
    }
    return false;
  }

  function exitWebFullscreen(root) {
    if (root.dataset.xetWebFullscreen === "true") {
      toggleFallbackWebFullscreen(root);
      return;
    }

    if (!clickWebFullscreenControl(root)) {
      root.classList.remove("xgplayer-is-cssfullscreen");
      document.body.classList.remove("xeplayer-webscreen-fix");
    }
  }

  function enterWebFullscreen(root) {
    if (!isWebFullscreen(root) && !clickWebFullscreenControl(root)) {
      toggleFallbackWebFullscreen(root);
    }
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
    // document.fullscreenElement. Let its button exit, then enter CSS mode on
    // the next rendered frame.
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

    if (!clickWebFullscreenControl(root)) toggleFallbackWebFullscreen(root);
  }

  function playerShortcutAction(event) {
    const key = event.key.toLowerCase();

    if (event.code === "ArrowLeft") return "seek-back-5";
    if (event.code === "ArrowRight") return "seek-forward-5";
    if (event.code === "KeyJ" || key === "j") return "seek-back-10";
    if (event.code === "KeyL" || key === "l") return "seek-forward-10";
    if (event.code === "KeyK" || key === "k") return "toggle-play";
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

  function seekVideo(video, seconds) {
    const currentTime = Number.isFinite(video.currentTime)
      ? video.currentTime
      : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
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

  function handlePlayerShortcut(event) {
    if (event.key === "Escape") {
      if (event.isComposing) return;

      const player = findActivePlayer();
      if (!player || !isWebFullscreen(player)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      suppressWebFullscreenEscapeKeyup = true;
      exitWebFullscreen(player);
      return;
    }

    const action = playerShortcutAction(event);
    if (event.defaultPrevented || !action) return;

    const player = findActivePlayer();
    if (!player) return;

    const isUnmodifiedWebFullscreenExit =
      action === "web-fullscreen" &&
      isWebFullscreen(player) &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey;
    if (
      (!isUnmodifiedWebFullscreenExit && isModifiedOrEditableShortcut(event)) ||
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
        toggleNativeFullscreen(player);
        break;
      case "web-fullscreen":
        if (isUnmodifiedWebFullscreenExit) {
          suppressWebFullscreenTKeyup = true;
        }
        toggleWebFullscreen(player);
        break;
      default:
        break;
    }
  }

  function suppressPlayerShortcutKeyup(event) {
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

  function exactLabelElements(labels) {
    const accepted = new Set(labels);

    return deepElements().filter((element) => {
      if (!isVisible(element) || !isSmallControl(element)) return false;
      if (!accepted.has(normalizeText(element.textContent))) return false;

      // Prefer the deepest clickable-looking node rather than a wrapper whose
      // child carries the same text.
      return !Array.from(element.children).some(
        (child) =>
          isVisible(child) &&
          accepted.has(normalizeText(child.textContent)),
      );
    });
  }

  function nearestVideoDistance(element) {
    const videos = deepElements().filter((item) => item.tagName === "VIDEO");
    if (!videos.length) return 0;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return Math.min(
      ...videos.map((video) => {
        const videoRect = video.getBoundingClientRect();
        const dx =
          centerX < videoRect.left
            ? videoRect.left - centerX
            : centerX > videoRect.right
              ? centerX - videoRect.right
              : 0;
        const dy =
          centerY < videoRect.top
            ? videoRect.top - centerY
            : centerY > videoRect.bottom
              ? centerY - videoRect.bottom
              : 0;
        return Math.hypot(dx, dy);
      }),
    );
  }

  function controlScore(element, desiredLabel) {
    const rect = element.getBoundingClientRect();
    const role = element.getAttribute("role");
    const tag = element.tagName;
    let score = 0;

    if (normalizeText(element.textContent) === desiredLabel) score += 100;
    if (tag === "BUTTON" || tag === "LI" || tag === "A") score += 25;
    if (role === "button" || role === "menuitem" || role === "option") {
      score += 25;
    }
    if (getComputedStyle(element).cursor === "pointer") score += 15;
    if (rect.bottom > innerHeight * 0.55) score += 10;
    score -= Math.min(nearestVideoDistance(element) / 20, 50);

    return score;
  }

  function bestCandidate(elements, labelOrder) {
    const ranked = [];

    for (const element of elements) {
      const label = normalizeText(element.textContent);
      const preference = labelOrder.indexOf(label);
      if (preference < 0) continue;

      ranked.push({
        element,
        score: controlScore(element, label) - preference * 10,
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked[0]?.element || null;
  }

  function dispatchClick(element) {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });

    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
        }),
      );
    }
    element.click();
  }

  function dispatchHover(element) {
    if (!element) return;

    for (const type of ["pointerover", "mouseover", "pointerenter", "mouseenter"]) {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: type !== "pointerenter" && type !== "mouseenter",
          cancelable: true,
          composed: true,
          view: window,
        }),
      );
    }
  }

  function isUltraOption(element) {
    const text = normalizeText(element.textContent);
    const definition = normalizeText(element.getAttribute("definition"));
    const canonicalName = normalizeText(element.getAttribute("cname"));

    return (
      text.includes("超清") ||
      canonicalName.includes("超清") ||
      /(^|[^0-9])1080(p)?([^0-9]|$)/i.test(definition)
    );
  }

  function rememberUltraPreference() {
    // Both the legacy and current course players read
    // `${USERID}_definitionType` when choosing their initial source.
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.endsWith("_definitionType")) keys.push(key);
      }
      keys.forEach((key) => localStorage.setItem(key, "超清"));
    } catch {
      // Course playback still works when localStorage is unavailable.
    }
  }

  function findKnownPlayerTarget() {
    const roots = deepQueryAll(".xgplayer-definition");

    for (const root of roots) {
      const options = Array.from(root.querySelectorAll("li")).filter(
        isUltraOption,
      );
      if (!options.length) continue;

      const target =
        options.find((option) => option.classList.contains("selected")) ||
        options[0];
      return { root, target };
    }

    return null;
  }

  function selectFromKnownPlayer() {
    const match = findKnownPlayerTarget();
    if (!match) return false;

    const { root, target } = match;
    if (target.classList.contains("selected")) {
      rememberUltraPreference();
      return true;
    }

    const lastClickAt = lastTargetClicks.get(target) || 0;
    if (Date.now() - lastClickAt < RECLICK_GUARD_MS) return true;

    // Current xgplayer renders the choices as `.option-item`; the legacy
    // player renders plain <li> nodes with a `cname` attribute. Both delegate
    // click handling from `.xgplayer-definition`, even while the menu is
    // visually collapsed, so clicking the actual option is deterministic.
    lastTargetClicks.set(target, Date.now());
    dispatchHover(root);
    target.click();
    rememberUltraPreference();
    notifyPage("已自动切换为超清");
    return true;
  }

  function targetAlreadySelected() {
    const targetElements = exactLabelElements(TARGET_LABELS);
    const currentElements = exactLabelElements(CURRENT_LABELS);

    // With the menu closed, the quality control itself shows the selected
    // label. If "超清" is the only visible quality label, there is nothing to
    // change and opening that control would merely leave the menu expanded.
    if (targetElements.length && !currentElements.length) {
      return true;
    }

    return targetElements.some((element) => {
      const className =
        typeof element.className === "string" ? element.className : "";
      const state = [
        className,
        element.getAttribute("aria-selected"),
        element.getAttribute("aria-checked"),
        element.getAttribute("data-selected"),
      ]
        .join(" ")
        .toLowerCase();

      return (
        /\b(active|current|selected|checked)\b/.test(state) ||
        element.closest(
          '[aria-selected="true"], [aria-checked="true"], .active, .selected',
        )
      );
    });
  }

  async function trySelectUltra() {
    if (attemptRunning) {
      rerunRequested = true;
      return;
    }

    if (!enabled || disabledHosts.includes(location.hostname)) {
      return;
    }

    attemptRunning = true;

    try {
      if (selectFromKnownPlayer()) return;

      if (targetAlreadySelected()) {
        rememberUltraPreference();
        return;
      }

      // If the quality menu is already open, "超清" is visible immediately.
      let target = bestCandidate(
        exactLabelElements(TARGET_LABELS),
        TARGET_LABELS,
      );

      if (target) {
        dispatchClick(target);
        notifyPage("已自动切换为超清");
        return;
      }

      // Otherwise open the compact control displaying the current quality.
      const current = bestCandidate(
        exactLabelElements(CURRENT_LABELS),
        CURRENT_LABELS,
      );
      if (!current) return;

      dispatchHover(current.closest(".xgplayer-definition") || current);
      dispatchClick(current);
      await new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS));

      target = bestCandidate(
        exactLabelElements(TARGET_LABELS),
        TARGET_LABELS,
      );
      if (!target) return;

      dispatchClick(target);
      rememberUltraPreference();
      notifyPage("已自动切换为超清");
    } finally {
      attemptRunning = false;
      if (rerunRequested) {
        rerunRequested = false;
        scheduleAttempt(0);
      }
    }
  }

  function notifyPage(message) {
    if (window.top !== window) return;

    let toast = document.getElementById("xet-ultra-quality-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "xet-ultra-quality-toast";
      Object.assign(toast.style, {
        position: "fixed",
        right: "20px",
        bottom: "72px",
        zIndex: "2147483647",
        padding: "9px 13px",
        borderRadius: "8px",
        background: "rgba(20, 20, 20, .88)",
        color: "#fff",
        font: "13px/1.4 system-ui, sans-serif",
        boxShadow: "0 4px 16px rgba(0, 0, 0, .25)",
        opacity: "0",
        transition: "opacity .18s ease",
        pointerEvents: "none",
      });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(toast.__hideTimer);
    toast.__hideTimer = setTimeout(() => {
      toast.style.opacity = "0";
    }, 1_800);
  }

  function scheduleAttempt(delay = 0, force = false) {
    if (force && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (timer !== null) return;

    timer = setTimeout(() => {
      timer = null;
      trySelectUltra();
    }, delay);
  }

  function handleMediaEvent(event) {
    if (!(event.target instanceof HTMLMediaElement)) return;

    if (event.type === "loadstart" || event.type === "emptied") {
      lastTargetClicks = new WeakMap();
    }
    scheduleAttempt(0, true);
  }

  function observePage() {
    observer?.disconnect();
    observer = new MutationObserver(() => scheduleAttempt(0));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    for (const eventName of [
      "loadstart",
      "loadedmetadata",
      "canplay",
      "play",
      "emptied",
    ]) {
      document.addEventListener(eventName, handleMediaEvent, true);
    }
    // Window capture runs before xgplayer's document/root keyboard handlers,
    // preventing its built-in 15-second arrow seek from running as well.
    window.addEventListener("keydown", handlePlayerShortcut, true);
    window.addEventListener("keyup", suppressPlayerShortcutKeyup, true);

    setInterval(() => {
      if (location.href !== previousLocation) {
        previousLocation = location.href;
        lastTargetClicks = new WeakMap();
        scheduleAttempt(0, true);
        return;
      }
      trySelectUltra();
    }, RETRY_INTERVAL_MS);
  }

  async function loadSettings() {
    try {
      const settings = await chrome.runtime.sendMessage({
        type: "xet:get-settings",
      });
      enabled = settings?.enabled !== false;
      disabledHosts = Array.isArray(settings?.disabledHosts)
        ? settings.disabledHosts
        : [];
    } catch {
      const settings = await chrome.storage.local.get({
        enabled: true,
        disabledHosts: [],
      });
      enabled = settings.enabled !== false;
      disabledHosts = settings.disabledHosts;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (changes.disabledHosts) {
      disabledHosts = changes.disabledHosts.newValue || [];
    }
    lastTargetClicks = new WeakMap();
    scheduleAttempt(0, true);
  });

  const api = {
    wake() {
      lastTargetClicks = new WeakMap();
      scheduleAttempt(0, true);
    },
  };
  window[INSTANCE_KEY] = api;

  if (window.top === window && location.hostname.endsWith(".xiaoe-tech.com")) {
    chrome.runtime.sendMessage({ type: "xet:natural-visit" }).catch(() => {});
  }

  loadSettings().finally(() => {
    observePage();
    scheduleAttempt(0, true);
  });
})();
