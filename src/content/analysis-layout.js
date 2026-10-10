(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.analysisLayout) return;

  // Question-answering and rote-review modes share practice_sheet. Their
  // answer explanations use the same rich-text embeds as submitted analyses.
  const ANALYSIS_PATH = /\/pc_evaluation\/(?:practice_sheet|practice_analysis|exam_analysis)\//;
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
    let pendingFrame = null;
    let previousPath = "";
    const containers = new Set();
    const frames = new Set();
    const framePorts = new Map();
    let parentPort = null;

    function notifyFrame(frame, active) {
      try {
        framePorts.get(frame)?.postMessage({ type: FRAME_MESSAGE, active });
      } catch {
        releaseFrame(frame);
      }
    }

    function releaseFrame(frame) {
      framePorts.get(frame)?.close();
      framePorts.delete(frame);
    }

    function requestFrame(frame) {
      try {
        const url = new URL(frame.src, location.href);
        if (!["https:", "http:"].includes(url.protocol)) return;
        // Bootstrap only: no settings or active state. src may describe a
        // pending navigation, not the document currently in this WindowProxy.
        frame.contentWindow?.postMessage({ type: `${FRAME_MESSAGE}-probe` }, "*");
      } catch {
        // Detached or non-HTTP embeds do not participate in preview styling.
      }
    }

    function announceReady() {
      if (window.parent === window) return;
      parentPort?.close();
      const channel = new MessageChannel();
      parentPort = channel.port1;
      parentPort.onmessage = (event) => {
        if (event.data?.type === FRAME_MESSAGE && typeof event.data.active === "boolean") {
          document.documentElement.toggleAttribute(EMBED_MARKER, event.data.active);
        }
      };
      // Transfer the reply channel to our actual parent. Subsequent style
      // messages target this document's port, not a navigable WindowProxy.
      window.parent.postMessage({ type: `${FRAME_MESSAGE}-ready` }, "*", [channel.port2]);
    }

    function handleMessage(event) {
      if (event.source === window.parent && window.parent !== window &&
          event.data?.type === `${FRAME_MESSAGE}-probe`) {
        announceReady();
      } else if (event.data?.type === `${FRAME_MESSAGE}-ready`) {
        const port = event.ports?.[0];
        if (!port) return;
        let validOrigin = false;
        try {
          validOrigin = ["https:", "http:"].includes(new URL(event.origin).protocol);
        } catch { /* Reject opaque or malformed origins. */ }
        for (const frame of frames) {
          if (validOrigin && ANALYSIS_PATH.test(location.pathname) &&
              frame.contentWindow === event.source) {
            releaseFrame(frame);
            framePorts.set(frame, port);
            notifyFrame(frame, true);
            return;
          }
        }
        port.close();
      }
    }

    function update() {
      const active = ANALYSIS_PATH.test(location.pathname);
      if (document.documentElement.hasAttribute(MARKER) !== active) {
        document.documentElement.toggleAttribute(MARKER, active);
      }
      const nextContainers = new Set();
      const nextFrames = new Set();
      if (active) {
        for (const embed of document.querySelectorAll(EMBEDS)) {
          // Rich text uses shrink-to-fit flex items and occasionally fixed-width
          // paragraphs. Expanding only the iframe cannot escape those limits.
          const boundary = embed.closest("#_flag4unlimit, #detail_div, .detail_div, .image-text-box, .question-block__answer, .question-wrap");
          for (let node = embed.parentElement; boundary && node; node = node.parentElement) {
            if (node.matches("div, p, section, span") && !node.matches(EMBEDS)) nextContainers.add(node);
            if (node === boundary) break;
          }
        }
        for (const frame of document.querySelectorAll(FRAME_SELECTOR)) {
          nextFrames.add(frame);
        }
      }
      for (const node of containers) {
        if (!nextContainers.has(node)) node.removeAttribute(CONTAINER_MARKER);
      }
      for (const node of nextContainers) {
        if (!containers.has(node)) node.setAttribute(CONTAINER_MARKER, "");
      }
      containers.clear();
      nextContainers.forEach((node) => containers.add(node));
      for (const frame of frames) {
        if (!nextFrames.has(frame)) {
          notifyFrame(frame, false);
          releaseFrame(frame);
        }
      }
      const addedFrames = [...nextFrames].filter((frame) => !frames.has(frame));
      frames.clear();
      nextFrames.forEach((frame) => frames.add(frame));
      addedFrames.forEach(requestFrame);
    }

    function scheduleUpdate() {
      if (timer === null || pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        update();
      });
    }

    function checkRoute() {
      if (previousPath === location.pathname) return;
      previousPath = location.pathname;
      scheduleUpdate();
    }

    function handleLoad(event) {
      if (frames.has(event.target)) {
        releaseFrame(event.target);
        requestFrame(event.target);
      }
    }

    function start() {
      if (timer !== null) return;
      originalMarker = document.documentElement.getAttribute(MARKER);
      previousPath = location.pathname;
      // Poll only the route string; DOM work is event-driven and coalesced.
      timer = setInterval(checkRoute, 1_000);
      window.addEventListener("message", handleMessage);
      window.addEventListener("load", handleLoad, true);
      window.addEventListener("popstate", checkRoute);
      window.addEventListener("hashchange", checkRoute);
      announceReady();
      update();
      observer = new MutationObserver((records) => {
        checkRoute();
        if (!ANALYSIS_PATH.test(location.pathname)) return;
        if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some(
          (node) => node instanceof Element && (node.matches(EMBEDS) || node.querySelector(EMBEDS)),
        ))) scheduleUpdate();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
      observer.disconnect();
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("load", handleLoad, true);
      window.removeEventListener("popstate", checkRoute);
      window.removeEventListener("hashchange", checkRoute);
      for (const node of containers) node.removeAttribute(CONTAINER_MARKER);
      for (const frame of frames) {
        notifyFrame(frame, false);
        releaseFrame(frame);
      }
      parentPort?.close();
      parentPort = null;
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
