(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.liveLine) return;
  const normalize = value => [0, 1, 2, 3].includes(value) ? value : 0;
  const optionSelector = ".line-switch-btn .line-switch-menu .menu-item.selecter-item";
  const lineNumber = element => Number(element?.textContent?.trim().match(/^线路\s*([123])$/)?.[1]) || 0;
  function createLiveLineController({ getPreference }) {
    let started = false, timer = null, poll = null, observer = null, state = null;
    const room = () => location.pathname.match(/^\/p\/t_pc\/live_pc\/pc\/(l_[\w-]+)\/?$/)?.[1] || "";
    function scope() {
      const id = room(), preference = normalize(getPreference());
      if (!state || state.room !== id || state.preference !== preference) {
        state = { room: id, preference, attempted: false, manual: false };
      }
      return state;
    }
    function disconnect() { observer?.disconnect(); observer = null; }
    function schedule() {
      if (!started || timer !== null) return;
      timer = setTimeout(() => { timer = null; attempt(); }, 0);
    }
    function attempt() {
      if (!started) return;
      const current = scope();
      if (!current.room || !current.preference || current.manual || current.attempted) { disconnect(); return; }
      if (!observer) {
        observer = new MutationObserver(records => {
          // Chat messages are frequent. Only a newly mounted player/control,
          // its line menu or changes to that menu can make a line available.
          if (records.some(r => r.target instanceof Element && r.target.closest(".line-switch-btn") ||
            [...(r.addedNodes || [])].some(n => n instanceof Element && (n.matches(".pc-live-player, .line-switch-btn") ||
              n.querySelector(".pc-live-player, .line-switch-btn"))))) schedule();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
          attributeFilter: ["class", "disabled", "aria-disabled"] });
      }
      const player = document.querySelector(".pc-live-player");
      const options = [...(player?.querySelectorAll(optionSelector) || [])];
      const target = options.find(option => lineNumber(option) === current.preference &&
        !option.closest('[disabled], [aria-disabled="true"], .disabled'));
      if (!target || !target.isConnected) return; // Absent lines never fall back to a different numbered line.
      // Close initialization BEFORE native handlers can rebuild the player.
      // Never retry/fight a native failover or a later manual selection.
      current.attempted = true; disconnect();
      if (target.classList.contains("active") || target.getAttribute("aria-selected") === "true") return;
      try { target.click(); } catch (error) { console.warn("[Xet] Default live line could not be selected", error.name); }
    }
    function manual(event) {
      if (!started || !event.isTrusted || !room()) return;
      if (event.type === "pointerdown" && event.button !== 0) return;
      if (event.type === "keydown" && (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
          !["Enter", " "].includes(event.key))) return;
      const option = event.composedPath().find(node => node instanceof Element && node.matches(optionSelector) &&
        node.closest(".pc-live-player") && lineNumber(node));
      if (!option) return;
      scope().manual = true; disconnect();
      // Trusted capture runs before both native handlers and a queued default.
    }
    const intentEvents = ["pointerdown", "click", "keydown"];
    function start() {
      if (started) return;
      started = true;
      intentEvents.forEach(type => document.addEventListener(type, manual, true));
      window.addEventListener("popstate", schedule);
      document.addEventListener("loadedmetadata", schedule, true);
      poll = setInterval(() => {
        if (state?.room !== room() || state?.preference !== normalize(getPreference())) schedule();
      }, 1000);
      schedule();
    }
    function stop() {
      started = false; disconnect(); clearTimeout(timer); clearInterval(poll); timer = poll = null;
      intentEvents.forEach(type => document.removeEventListener(type, manual, true));
      window.removeEventListener("popstate", schedule);
      document.removeEventListener("loadedmetadata", schedule, true);
      // Keep ownership through stop/start and native SDK/source replacement.
    }
    return Object.freeze({ start, stop, wake: schedule });
  }
  modules.liveLine = Object.freeze({ normalize, createLiveLineController });
})();
