(() => {
  // Keep the original singleton key so injecting an update into an existing
  // tab cannot create duplicate observers or keyboard listeners.
  const INSTANCE_KEY = "__xetUltraQualityInstance";
  const modules = globalThis.__xetPlayerHelperModules;
  const siteAccess = globalThis.XetSiteAccess;

  if (
    !siteAccess ||
    !modules?.playerDom ||
    !modules.analysisLayout ||
    !modules.playerInteractions ||
    !modules.fullscreen ||
    !modules.frameCoordinator ||
    !modules.mediaShortcuts ||
    !modules.qualityPreference ||
    !modules.quality ||
    !modules.volume ||
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
    volumeEnabled: true,
    disabledSites: [],
    topOrigin: "",
  };
  let settingsLoaded = false;
  let frameCoordinator = null;
  let featuresStarted = false;
  let naturalVisitRecorded = false;

  function isSiteEnabled() {
    return settingsLoaded && !settings.disabledSites.includes(location.origin) &&
      !settings.disabledSites.includes(settings.topOrigin);
  }

  function isQualityEnabled() {
    return settings.enabled && isSiteEnabled();
  }

  async function loadSettings() {
    try {
      const stored = await chrome.runtime.sendMessage({
        type: "xet:get-settings",
      });
      if (!stored || stored.error) throw new Error(stored?.error || "Settings unavailable");
      settings.topOrigin = stored.topOrigin || (window.top === window ? location.origin : "");
      settings.enabled = stored?.enabled !== false;
      settings.volumeEnabled = stored.volumeEnabled !== false;
      settings.disabledSites = siteAccess.normalizeDisabledSites(
        stored?.disabledSites,
        stored?.disabledHosts,
      );
      settingsLoaded = window.top === window || Boolean(settings.topOrigin);
    } catch {
      // Embedded players fail closed when the outer-page policy is unknown.
      if (window.top !== window && !settings.topOrigin) return;
      const stored = await chrome.storage.local.get({
        enabled: true,
        volumeEnabled: true,
        disabledSites: null,
        disabledHosts: [],
      });
      settings.enabled = stored.enabled !== false;
      settings.volumeEnabled = stored.volumeEnabled !== false;
      settings.disabledSites = siteAccess.normalizeDisabledSites(
        stored.disabledSites,
        stored.disabledHosts,
      );
      settings.topOrigin ||= location.origin;
      settingsLoaded = true;
    }
  }

  const fullscreen = modules.fullscreen.createFullscreenController({
    playerDom: modules.playerDom,
    onWebModeChange: (active) => frameCoordinator?.publish(active),
  });
  frameCoordinator = modules.frameCoordinator.createFrameCoordinator({
    fullscreen, isEnabled: isSiteEnabled,
  });
  const analysisLayout = modules.analysisLayout.createAnalysisLayoutController();
  const shortcuts = modules.mediaShortcuts.createShortcutController({
    fullscreen,
    playerDom: modules.playerDom,
  });
  const quality = modules.quality.createQualityController({
    isEnabled: isQualityEnabled,
    notify: modules.toast.show,
    playerDom: modules.playerDom,
  });
  const volume = modules.volume.createVolumeController({ playerDom: modules.playerDom });

  function startFeatures() {
    if (featuresStarted) {
      if (settings.enabled) { quality.start(); quality.wake(); }
      else quality.stop();
      if (settings.volumeEnabled) volume.start();
      else volume.stop();
      return;
    }
    featuresStarted = true;
    analysisLayout.start();
    frameCoordinator.start();
    fullscreen.start();
    shortcuts.start();
    if (settings.volumeEnabled) volume.start();
    if (settings.enabled) quality.start();

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
    frameCoordinator.stop();
    fullscreen.stop();
    analysisLayout.stop();
    quality.stop();
    volume.stop();
    modules.toast.hide?.();
  }

  function applySiteState() {
    if (isSiteEnabled()) startFeatures();
    else stopFeatures();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.volumeEnabled) settings.volumeEnabled = changes.volumeEnabled.newValue !== false;
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
      void refreshSettings();
    },
    stop: stopFeatures,
  });
  window[INSTANCE_KEY] = api;

  async function refreshSettings() {
    try { await loadSettings(); applySiteState(); }
    catch (error) {
      settingsLoaded = false;
      stopFeatures();
      console.warn("[Xet] Settings could not be loaded", error.message);
    }
  }
  void refreshSettings();
})();
