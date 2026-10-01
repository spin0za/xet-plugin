(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.volume) return;

  function createVolumeController({ playerDom }) {
    let observer = null;
    let states = new WeakMap();
    let generation = 0;
    let timer = null;
    const pending = new Set();
    const videos = new Set();
    const shadowObservers = new Map();

    function stateFor(video) {
      let state = states.get(video);
      const route = location.href;
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      if (!state || state.route !== route ||
          (duration !== null && state.duration !== null && Math.abs(duration - state.duration) > 1)) {
        state = { route, duration, initialized: false };
        states.set(video, state);
      } else if (duration !== null) state.duration = duration;
      return state;
    }

    function schedule(video) {
      if (!observer || video.tagName !== "VIDEO" || stateFor(video).initialized) return;
      pending.add(video);
      if (timer !== null) return;
      const token = generation;
      // A browser can run microtasks between media event listeners. Use one
      // next-task initialization so all synchronous SDK handlers finish first.
      // No polling or volumechange enforcement: manual changes remain.
      timer = setTimeout(() => {
        if (token !== generation) return;
        timer = null;
        for (const media of pending) {
          if (!media.isConnected) continue;
          const state = stateFor(media);
          if (state.initialized) continue;
          try {
            if (media.volume !== 1) media.volume = 1;
            // Do not unmute or start playback: preserve user intent and the
            // browser's autoplay policy. Metadata closes the startup window.
            state.initialized = media.readyState >= 1;
          } catch {
            // A removed or unsupported media element must not break the rest.
          }
        }
        pending.clear();
      }, 0);
    }

    function discover(scope = document) {
      const nodes = playerDom.deepElements(scope);
      if (scope instanceof Element) nodes.push(scope);
      for (const node of nodes) {
        if (node.shadowRoot && !shadowObservers.has(node.shadowRoot)) {
          const shadowObserver = new MutationObserver(handleMutations);
          shadowObserver.observe(node.shadowRoot, { subtree: true, childList: true });
          shadowObservers.set(node.shadowRoot, shadowObserver);
        }
        if (node.tagName !== "VIDEO") continue;
        if (!videos.has(node)) {
          videos.add(node);
          // Media events do not bubble or escape shadow roots. Bind directly.
          node.addEventListener("loadstart", handleMedia);
          node.addEventListener("loadedmetadata", handleMedia);
        }
        schedule(node);
      }
    }

    function handleMedia(event) {
      schedule(event.target);
    }

    function handleMutations(records) {
      for (const video of videos) {
        if (video.isConnected) continue;
        video.removeEventListener("loadstart", handleMedia);
        video.removeEventListener("loadedmetadata", handleMedia);
        videos.delete(video);
        pending.delete(video);
      }
      for (const [root, shadowObserver] of shadowObservers) {
        if (root.host.isConnected) continue;
        shadowObserver.disconnect();
        shadowObservers.delete(root);
      }
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) discover(node);
        }
      }
    }

    function start() {
      if (observer) return;
      observer = new MutationObserver(handleMutations);
      observer.observe(document.documentElement, { subtree: true, childList: true });
      discover();
    }

    function stop() {
      observer?.disconnect();
      observer = null;
      generation++;
      clearTimeout(timer);
      timer = null;
      pending.clear();
      states = new WeakMap();
      for (const video of videos) {
        video.removeEventListener("loadstart", handleMedia);
        video.removeEventListener("loadedmetadata", handleMedia);
      }
      videos.clear();
      for (const shadowObserver of shadowObservers.values()) shadowObserver.disconnect();
      shadowObservers.clear();
    }

    return Object.freeze({ start, stop });
  }

  modules.volume = Object.freeze({ createVolumeController });
})();
