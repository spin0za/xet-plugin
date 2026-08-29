(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.quality) return;

  const TARGET_LABELS = ["超清", "1080P", "1080p", "蓝光"];
  const CURRENT_LABELS = ["高清", "标清", "流畅", "自动"];
  const RETRY_INTERVAL_MS = 1_000;
  const MENU_SETTLE_MS = 160;
  const RECLICK_GUARD_MS = 800;
  const MAX_CONTROL_WIDTH = 180;
  const MAX_CONTROL_HEIGHT = 90;

  function createQualityController({ isEnabled, notify, playerDom }) {
    const {
      deepElements,
      deepQueryAll,
      isVisible,
      normalizeText,
    } = playerDom;
    let timer = null;
    let observer = null;
    let retryInterval = null;
    let lastTargetClicks = new WeakMap();
    let attemptRunning = false;
    let rerunRequested = false;
    let previousLocation = location.href;
    let started = false;

    function isSmallControl(element) {
      const rect = element.getBoundingClientRect();
      return (
        rect.width <= MAX_CONTROL_WIDTH &&
        rect.height <= MAX_CONTROL_HEIGHT
      );
    }

    function exactLabelElements(labels) {
      const accepted = new Set(labels);

      return deepElements().filter((element) => {
        if (!isVisible(element) || !isSmallControl(element)) return false;
        if (!accepted.has(normalizeText(element.textContent))) return false;

        // Prefer the deepest clickable-looking node rather than a wrapper
        // whose child carries the same text.
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

      for (const type of [
        "pointerover",
        "mouseover",
        "pointerenter",
        "mouseenter",
      ]) {
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

      // Current xgplayer renders `.option-item`; the legacy player renders
      // plain <li> nodes with a `cname` attribute. Both delegate clicks from
      // `.xgplayer-definition`, even while the menu is visually collapsed.
      lastTargetClicks.set(target, Date.now());
      dispatchHover(root);
      target.click();
      rememberUltraPreference();
      notify("已自动切换为超清");
      return true;
    }

    function targetAlreadySelected() {
      const targetElements = exactLabelElements(TARGET_LABELS);
      const currentElements = exactLabelElements(CURRENT_LABELS);

      // With the menu closed, the control itself shows the selected label. If
      // "超清" is the only visible label, opening it would leave the menu open.
      if (targetElements.length && !currentElements.length) return true;

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
      if (!isEnabled()) return;

      attemptRunning = true;

      try {
        if (selectFromKnownPlayer()) return;

        if (targetAlreadySelected()) {
          rememberUltraPreference();
          return;
        }

        let target = bestCandidate(
          exactLabelElements(TARGET_LABELS),
          TARGET_LABELS,
        );
        if (target) {
          dispatchClick(target);
          notify("已自动切换为超清");
          return;
        }

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
        notify("已自动切换为超清");
      } finally {
        attemptRunning = false;
        if (rerunRequested) {
          rerunRequested = false;
          scheduleAttempt(0);
        }
      }
    }

    function scheduleAttempt(delay = 0, force = false) {
      if (force && timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (timer !== null) return;

      timer = setTimeout(() => {
        timer = null;
        void trySelectUltra();
      }, delay);
    }

    function handleMediaEvent(event) {
      if (!(event.target instanceof HTMLMediaElement)) return;

      if (event.type === "loadstart" || event.type === "emptied") {
        lastTargetClicks = new WeakMap();
      }
      scheduleAttempt(0, true);
    }

    const mediaEvents = [
      "loadstart",
      "loadedmetadata",
      "canplay",
      "play",
      "emptied",
    ];

    function start() {
      if (started) return;
      started = true;

      observer = new MutationObserver(() => scheduleAttempt(0));
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });

      for (const eventName of mediaEvents) {
        document.addEventListener(eventName, handleMediaEvent, true);
      }

      retryInterval = setInterval(() => {
        if (location.href !== previousLocation) {
          previousLocation = location.href;
          lastTargetClicks = new WeakMap();
          scheduleAttempt(0, true);
          return;
        }
        void trySelectUltra();
      }, RETRY_INTERVAL_MS);

      scheduleAttempt(0, true);
    }

    function stop() {
      if (!started) return;
      started = false;
      observer?.disconnect();
      observer = null;

      for (const eventName of mediaEvents) {
        document.removeEventListener(eventName, handleMediaEvent, true);
      }
      if (retryInterval !== null) clearInterval(retryInterval);
      if (timer !== null) clearTimeout(timer);
      retryInterval = null;
      timer = null;
      attemptRunning = false;
      rerunRequested = false;
    }

    function wake() {
      lastTargetClicks = new WeakMap();
      scheduleAttempt(0, true);
    }

    return Object.freeze({ start, stop, wake });
  }

  modules.quality = Object.freeze({ createQualityController });
})();
