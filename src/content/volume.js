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
    const liveControls = new Map();
    const liveRangeSelector = ".mute-btn .volume-range input[type='range']";
    const intentEvents = ["pointerdown", "keydown", "input", "change"];

    function stateFor(video) {
      let state = states.get(video);
      const route = location.href;
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      if (!state || state.route !== route ||
          (duration !== null && state.duration !== null && Math.abs(duration - state.duration) > 1)) {
        state = { route, duration, initialized: false, userControlled: false, syncedControls: new WeakSet() };
        states.set(video, state);
      } else if (duration !== null) state.duration = duration;
      return state;
    }

    function handleLiveIntent(event) {
      if (!event.isTrusted) return;
      const video = liveControls.get(event.currentTarget);
      if (video) stateFor(video).userControlled = true;
    }

    function syncLiveControls(video, state) {
      const root = video.closest?.(".pc-live-player");
      if (!root || root.querySelectorAll("video").length !== 1) return;
      for (const range of root.querySelectorAll(liveRangeSelector)) {
        // Only the known live-player volume slider, never seek/other ranges.
        if (range.min !== "0" || range.max !== "100") continue;
        const control = range.closest(".mute-btn");
        if (!liveControls.has(control)) {
          liveControls.set(control, video);
          for (const type of intentEvents) control.addEventListener(type, handleLiveIntent, true);
        }
        if (state.userControlled || video.muted || video.volume !== 1 || state.syncedControls.has(range)) continue;
        // This SDK keeps a separate Vue value (50 by default) and does not
        // observe native volumechange. Use its DOM handlers to update the knob,
        // fill and saved pre-mute volume together, without a MAIN-world bridge.
        state.syncedControls.add(range);
        range.value = range.max;
        range.dispatchEvent(new Event("input", { bubbles: true }));
        range.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    function schedule(video, controlsOnly = false) {
      if (!observer || video.tagName !== "VIDEO" || (!controlsOnly && stateFor(video).initialized)) return;
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
          try {
            if (!state.initialized && !state.userControlled && media.volume !== 1) media.volume = 1;
            syncLiveControls(media, state);
            // Do not unmute or start playback: preserve user intent and the
            // browser's autoplay policy. Metadata closes the startup window.
            state.initialized ||= state.userControlled || media.readyState >= 1;
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
        if (node.matches?.(liveRangeSelector)) {
          const video = node.closest(".pc-live-player")?.querySelector("video");
          if (video && videos.has(video)) schedule(video, true);
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
      for (const [control, video] of liveControls) {
        if (control.isConnected && video.isConnected) continue;
        for (const type of intentEvents) control.removeEventListener(type, handleLiveIntent, true);
        liveControls.delete(control);
      }
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
      for (const control of liveControls.keys()) {
        for (const type of intentEvents) control.removeEventListener(type, handleLiveIntent, true);
      }
      liveControls.clear();
      for (const shadowObserver of shadowObservers.values()) shadowObserver.disconnect();
      shadowObservers.clear();
    }

    return Object.freeze({ start, stop });
  }

  modules.volume = Object.freeze({ createVolumeController });
})();
