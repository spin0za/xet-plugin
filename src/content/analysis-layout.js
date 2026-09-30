(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.analysisLayout) return;

  const ANALYSIS_PATH = /\/pc_evaluation\/(?:practice_analysis|exam_analysis)\//;
  const MARKER = "data-xet-analysis-layout";
  const EMBED_MARKER = "data-xet-analysis-embed";
  const CONTAINER_MARKER = "data-xet-analysis-container";
  const FRAME_MESSAGE = "xet:analysis-frame";
  const EMBEDS = ".xiaoe-iframe-outside, iframe.xiaoe-iframe-video";
  const FRAME_SELECTOR = ".xiaoe-iframe-outside iframe, iframe.xiaoe-iframe-video";

  function createAnalysisLayoutController() {
    let timer = null;
    let originalMarker = null;
    let observer = null;
    const containers = new Set();
    const frames = new Set();

    function notifyFrame(frame, active) {
      try {
        const origin = new URL(frame.src, location.href).origin;
        if (origin === "null") return;
        frame.contentWindow?.postMessage({ type: FRAME_MESSAGE, active }, origin);
      } catch {
        // Detached or non-HTTP embeds cannot receive the preview styling hint.
      }
    }

    function handleMessage(event) {
      if (event.source === window.parent && window.parent !== window &&
          event.data?.type === FRAME_MESSAGE && typeof event.data.active === "boolean") {
        document.documentElement.toggleAttribute(EMBED_MARKER, event.data.active);
      } else if (event.data?.type === `${FRAME_MESSAGE}-ready`) {
        for (const frame of frames) {
          if (frame.contentWindow === event.source) notifyFrame(frame, true);
        }
      }
    }

    function update() {
      const active = ANALYSIS_PATH.test(location.pathname);
      document.documentElement.toggleAttribute(MARKER, active);
      const nextContainers = new Set();
      const nextFrames = new Set();
      if (active) {
        for (const embed of document.querySelectorAll(EMBEDS)) {
          // Rich text uses shrink-to-fit flex items and occasionally fixed-width
          // paragraphs. Expanding only the iframe cannot escape those limits.
          const boundary = embed.closest("#_flag4unlimit, #detail_div, .detail_div, .image-text-box");
          for (let node = embed.parentElement; boundary && node; node = node.parentElement) {
            if (node.matches("div, p, section, span") && !node.matches(EMBEDS)) nextContainers.add(node);
            if (node === boundary) break;
          }
        }
        for (const frame of document.querySelectorAll(FRAME_SELECTOR)) {
          nextFrames.add(frame);
          notifyFrame(frame, true);
        }
      }
      for (const node of containers) {
        if (!nextContainers.has(node)) node.removeAttribute(CONTAINER_MARKER);
      }
      for (const node of nextContainers) node.setAttribute(CONTAINER_MARKER, "");
      containers.clear();
      nextContainers.forEach((node) => containers.add(node));
      for (const frame of frames) {
        if (!nextFrames.has(frame)) notifyFrame(frame, false);
      }
      frames.clear();
      nextFrames.forEach((frame) => frames.add(frame));
    }

    function start() {
      if (timer !== null) return;
      originalMarker = document.documentElement.getAttribute(MARKER);
      window.addEventListener("message", handleMessage);
      if (window.parent !== window) {
        // The parent may have loaded before the embed's content script.
        window.parent.postMessage({ type: `${FRAME_MESSAGE}-ready` }, "*");
      }
      update();
      observer = new MutationObserver(update);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // The evaluation app also changes routes without reloading the page.
      timer = setInterval(update, 1_000);
    }

    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      observer.disconnect();
      window.removeEventListener("message", handleMessage);
      for (const node of containers) node.removeAttribute(CONTAINER_MARKER);
      for (const frame of frames) notifyFrame(frame, false);
      containers.clear();
      frames.clear();
      document.documentElement.removeAttribute(EMBED_MARKER);
      if (originalMarker === null) {
        document.documentElement.removeAttribute(MARKER);
      } else {
        document.documentElement.setAttribute(MARKER, originalMarker);
      }
    }

    return Object.freeze({ start, stop });
  }

  modules.analysisLayout = Object.freeze({ createAnalysisLayoutController });
})();
