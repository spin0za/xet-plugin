(() => {
  // Keep the original singleton key so injecting an update into an existing
  // tab cannot create duplicate observers or keyboard listeners.
  const INSTANCE_KEY = "__xetUltraQualityInstance";
  const modules = globalThis.__xetPlayerHelperModules;

  if (
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
    disabledHosts: [],
  };

  function isEnabledForCurrentHost() {
    return (
      settings.enabled &&
      !settings.disabledHosts.includes(location.hostname)
    );
  }

  async function loadSettings() {
    try {
      const stored = await chrome.runtime.sendMessage({
        type: "xet:get-settings",
      });
      settings.enabled = stored?.enabled !== false;
      settings.disabledHosts = Array.isArray(stored?.disabledHosts)
        ? stored.disabledHosts
        : [];
    } catch {
      const stored = await chrome.storage.local.get({
        enabled: true,
        disabledHosts: [],
      });
      settings.enabled = stored.enabled !== false;
      settings.disabledHosts = stored.disabledHosts;
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
    isEnabled: isEnabledForCurrentHost,
    notify: modules.toast.show,
    playerDom: modules.playerDom,
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.disabledHosts) {
      settings.disabledHosts = changes.disabledHosts.newValue || [];
    }
    quality.wake();
  });

  const api = Object.freeze({
    wake() {
      quality.wake();
    },
  });
  window[INSTANCE_KEY] = api;

  if (window.top === window && location.hostname.endsWith(".xiaoe-tech.com")) {
    chrome.runtime.sendMessage({ type: "xet:natural-visit" }).catch(() => {});
  }

  loadSettings().finally(() => {
    shortcuts.start();
    quality.start();
  });
})();
