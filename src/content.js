(() => {
  // Keep the original singleton key so injecting an update into an existing
  // tab cannot create duplicate observers or keyboard listeners.
  const INSTANCE_KEY = "__xetUltraQualityInstance";
  const modules = globalThis.__xetPlayerHelperModules;
  const siteAccess = globalThis.XetSiteAccess;

  if (
    !siteAccess ||
    !modules?.playerDom ||
    !modules.fullscreen ||
    !modules.mediaShortcuts ||
    !modules.quality ||
    !modules.toast
  ) {
    window[INSTANCE_KEY]?.wake?.();
    chrome.runtime
      .sendMessage({ type: "xet:repair-content-scripts" })
      .catch(() => {});
    return;
  }

  if (window[INSTANCE_KEY]) {
    window[INSTANCE_KEY].wake();
    return;
  }

  const settings = {
    enabled: true,
    disabledSites: [],
  };
  let featuresStarted = false;
  let naturalVisitRecorded = false;

  function isSiteEnabled() {
    return !settings.disabledSites.includes(location.origin);
  }

  function isQualityEnabled() {
    return settings.enabled && isSiteEnabled();
  }

  async function loadSettings() {
    try {
      const stored = await chrome.runtime.sendMessage({
        type: "xet:get-settings",
      });
      settings.enabled = stored?.enabled !== false;
      settings.disabledSites = siteAccess.normalizeDisabledSites(
        stored?.disabledSites,
        stored?.disabledHosts,
      );
    } catch {
      const stored = await chrome.storage.local.get({
        enabled: true,
        disabledSites: null,
        disabledHosts: [],
      });
      settings.enabled = stored.enabled !== false;
      settings.disabledSites = siteAccess.normalizeDisabledSites(
        stored.disabledSites,
        stored.disabledHosts,
      );
    }
  }

  const fullscreen = modules.fullscreen.createFullscreenController({
    playerDom: modules.playerDom,
  });
  const shortcuts = modules.mediaShortcuts.createShortcutController({
    fullscreen,
    playerDom: modules.playerDom,
  });
  const quality = modules.quality.createQualityController({
    isEnabled: isQualityEnabled,
    notify: modules.toast.show,
    playerDom: modules.playerDom,
  });

  function startFeatures() {
    if (featuresStarted) {
      quality.wake();
      return;
    }
    featuresStarted = true;
    shortcuts.start();
    quality.start();

    if (
      !naturalVisitRecorded &&
      window.top === window &&
      location.hostname.endsWith(".xiaoe-tech.com")
    ) {
      naturalVisitRecorded = true;
      chrome.runtime.sendMessage({ type: "xet:natural-visit" }).catch(() => {});
    }
  }

  function stopFeatures() {
    if (!featuresStarted) return;
    featuresStarted = false;

    const player = modules.playerDom.findActivePlayer();
    if (player && fullscreen.isWebFullscreen(player)) {
      fullscreen.exitWebFullscreen(player);
    }
    shortcuts.stop();
    quality.stop();
    modules.toast.hide?.();
  }

  function applySiteState() {
    if (isSiteEnabled()) startFeatures();
    else stopFeatures();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.disabledSites || changes.disabledHosts) {
      settings.disabledSites = siteAccess.normalizeDisabledSites(
        changes.disabledSites?.newValue ?? settings.disabledSites,
        changes.disabledHosts?.newValue,
      );
    }
    applySiteState();
  });

  const api = Object.freeze({
    wake() {
      void loadSettings().finally(applySiteState);
    },
    stop: stopFeatures,
  });
  window[INSTANCE_KEY] = api;

  loadSettings().finally(applySiteState);
})();
