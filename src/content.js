(() => {
  // Keep the singleton key to avoid duplicate observers or keyboard listeners.
  const INSTANCE_KEY = "__xetUltraQualityInstance";
  const modules = globalThis.__xetPlayerHelperModules;
  const siteAccess = globalThis.XetSiteAccess;
  if (
    !siteAccess ||
    !modules?.playerDom ||
    !modules.analysisLayout ||
    !modules.analysisScroll || !modules.errbookScroll ||
    !modules.analysisActions ||
    !modules.practiceMarks ||
    !modules.practiceHistory ||
    !modules.practiceUndo || !modules.courseProgress || !modules.videoNavigation || !modules.liveCountdown || !modules.liveEntry || !modules.liveChat || !modules.liveLine ||
    !modules.pageTitle ||
    !modules.textSelection ||
    !modules.questionTypography ||
    !modules.questionOrder ||
    !modules.playerInteractions ||
    !modules.fullscreen ||
    !modules.frameCoordinator ||
    !modules.mediaShortcuts ||
    !modules.qualityPreference ||
    !modules.quality ||
    !modules.volume ||
    !modules.downloadStream || !modules.download || !modules.screenshot ||
    !modules.toast || !modules.siteAppearance
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
  const settings = { enabled: true, volumeEnabled: true, defaultLiveLine: 0, disabledSites: [], topOrigin: "" };
  let settingsLoaded = false;
  let frameCoordinator = null;
  let featuresStarted = false;
  let naturalVisitRecorded = false;
  function isSiteEnabled() {
    return settingsLoaded && !settings.disabledSites.includes(location.origin) &&
      !settings.disabledSites.includes(settings.topOrigin);
  }
  function isQualityEnabled() { return settings.enabled && isSiteEnabled(); }
  async function loadSettings() {
    try {
      const stored = await chrome.runtime.sendMessage({
        type: "xet:get-settings",
      });
      if (!stored || stored.error) throw new Error(stored?.error || "Settings unavailable");
      settings.topOrigin = stored.topOrigin || (window.top === window ? location.origin : "");
      settings.enabled = stored?.enabled !== false;
      settings.volumeEnabled = stored.volumeEnabled !== false;
      settings.defaultLiveLine = modules.liveLine.normalize(stored.defaultLiveLine);
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
        volumeEnabled: true, defaultLiveLine: 0,
        disabledSites: null,
        disabledHosts: [],
      });
      settings.enabled = stored.enabled !== false;
      settings.volumeEnabled = stored.volumeEnabled !== false;
      settings.defaultLiveLine = modules.liveLine.normalize(stored.defaultLiveLine);
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
  const analysisScroll = modules.analysisScroll.createAnalysisScrollController();
  const analysisActions = modules.analysisActions.createAnalysisActionsController();
  const practiceUndo = modules.practiceUndo.createPracticeUndoController();
  const practiceMarks = modules.practiceMarks.createPracticeMarksController();
  const practiceHistory = modules.practiceHistory.createPracticeHistoryController();
  const pageTitle = modules.pageTitle.createPageTitleController();
  const textSelection = modules.textSelection.createTextSelectionController();
  const questionTypography = modules.questionTypography.createQuestionTypographyController();
  const questionOrder = modules.questionOrder.createQuestionOrderController();
  const siteAppearance = modules.siteAppearance.createSiteAppearanceController();
  const pageFeatures = [analysisLayout, analysisScroll, modules.errbookScroll.createErrbookScrollController(), analysisActions, practiceMarks, practiceHistory, practiceUndo, pageTitle,
    textSelection, questionTypography, questionOrder, modules.courseProgress.createCourseProgressController(), modules.videoNavigation.createVideoNavigationController(), modules.liveCountdown.createLiveCountdownController(), modules.liveEntry.createLiveEntryController(), modules.liveChat.createLiveChatController(), modules.liveLine.createLiveLineController({ getPreference: () => settings.defaultLiveLine }), siteAppearance];
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
  const download = modules.download.createDownloadController({ playerDom: modules.playerDom });
  const screenshot = modules.screenshot.createScreenshotController({ playerDom: modules.playerDom });
  function startFeatures() {
    if (featuresStarted) {
      if (settings.enabled) { quality.start(); quality.wake(); }
      else quality.stop();
      if (settings.volumeEnabled) volume.start();
      else volume.stop();
      for (const feature of pageFeatures) feature.wake?.();
      return;
    }
    featuresStarted = true;
    for (const feature of pageFeatures) feature.start();
    frameCoordinator.start();
    fullscreen.start();
    shortcuts.start();
    download.start();
    screenshot.start();
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
    if (!featuresStarted) return siteAppearance.stop(); // The theme can start before the other features.
    featuresStarted = false;

    const player = modules.playerDom.findActivePlayer();
    if (player && fullscreen.isWebFullscreen(player)) {
      fullscreen.exitWebFullscreen(player);
    }
    shortcuts.stop();
    frameCoordinator.stop();
    fullscreen.stop();
    for (const feature of pageFeatures) feature.stop();
    quality.stop();
    volume.stop();
    screenshot.stop();
    download.stop();
    modules.toast.hide?.();
  }
  function applySiteState() {
    if (isSiteEnabled()) startFeatures();
    else stopFeatures();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || Object.keys(changes).every((key) => key in modules.siteAppearance.defaults)) return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.volumeEnabled) settings.volumeEnabled = changes.volumeEnabled.newValue !== false;
    if (changes.defaultLiveLine) settings.defaultLiveLine = modules.liveLine.normalize(changes.defaultLiveLine.newValue);
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
