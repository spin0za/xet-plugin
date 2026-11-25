(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.siteAppearance) return;

  const defaults = Object.freeze({ siteAppearance: "system", nightVideoBrightness: "extra" });
  const PAGE = "data-xet-night-page";
  const DIM = "data-xet-night-video";
  const EVALUATION = /^\/p\/t_pc\/pc_evaluation\/(?:practice|practice_record|question_collect|errbook\/(?:detail|practice|drillbook)|(?:practice|exam)_(?:sheet|analysis|result)|practice_self_evaluation)(?=\/|$)/;
  const PRACTICE_CONFIG = /^\/p\/t_pc\/pc_evaluation\/practiceConfig\/[\w-]+\/?$/;
  const COURSE = /^\/p\/t_pc\/course_pc_detail(?:\/|$)/;
  const LIVE_DETAIL = /^\/detail\/l_[\w-]+\/4\/?$/;
  const VIDEO = /^\/p\/t_pc\/(?:course_pc_detail\/video\/|live_pc\/pc\/)/;
  const routeType = (path) => EVALUATION.test(path) ? "evaluation" :
    PRACTICE_CONFIG.test(path) ? "practice-config" : COURSE.test(path) ? "course" :
      LIVE_DETAIL.test(path) ? "live-detail" : "site";
  const normalizeAppearance = (value) => value === "light" || value === "dark" ? value : "system";
  const normalizeBrightness = (value) => value === "off" || value === "soft" ? value : defaults.nightVideoBrightness;

  let earlyController;

  function makeController(useLocalSitePolicy = false, videoParent = "") {
    const root = document.documentElement;
    const system = matchMedia("(prefers-color-scheme: dark)");
    const top = window.top === window;
    const keys = useLocalSitePolicy ? { ...defaults, disabledSites: null, disabledHosts: [] } : defaults;
    let settings = keys;
    let active = false;
    let loaded = false;
    let revision = 0;
    const pendingChanges = new Set();

    function setAttribute(name, value) {
      if (!value) root.removeAttribute(name);
      else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
    }

    function apply() {
      const disabled = useLocalSitePolicy ? globalThis.XetSiteAccess.normalizeDisabledSites(
        settings.disabledSites, settings.disabledHosts,
      ) : [];
      const allowed = !disabled.includes(location.origin) && !disabled.includes(videoParent);
      const appearance = normalizeAppearance(settings.siteAppearance);
      const brightness = normalizeBrightness(settings.nightVideoBrightness);
      const dark = active && loaded && allowed && (appearance === "dark" ||
        (appearance === "system" && system.matches));
      const route = top && dark ? routeType(location.pathname) : "";
      setAttribute(PAGE, route);
      // Surface color is independent of media brightness. Player filters
      // still require the analysis handshake and actual picture elements.
      setAttribute("data-xet-night-frame", dark && !top ? "true" : "");
      setAttribute("data-xet-night-embed-surface", dark && videoParent ? "true" : "");
      const dim = dark && (!top || route === "evaluation" || VIDEO.test(location.pathname)) && brightness !== "off";
      setAttribute(DIM, dim ? brightness : "");
    }

    function storageChanged(changes, area) {
      if (!active || area !== "local") return;
      const changed = Object.keys(keys).filter(key => Object.hasOwn(changes, key));
      if (!changed.length) return;
      const next = { ...settings };
      for (const key of changed) {
        if (!loaded) pendingChanges.add(key);
        next[key] = changes[key].newValue;
      }
      settings = next;
      apply();
    }

    async function readSettings(currentRevision) {
      try {
        const stored = await chrome.storage.local.get(keys);
        if (!active || revision !== currentRevision) return;
        for (const key of pendingChanges) stored[key] = settings[key];
        settings = stored;
        loaded = true;
        apply();
      } catch {
        // Leave the site's own theme intact when preferences cannot be read.
      }
    }

    function start() {
      if (active) return;
      active = true;
      loaded = false;
      settings = keys;
      pendingChanges.clear();
      system.addEventListener("change", apply);
      window.navigation?.addEventListener("currententrychange", apply);
      window.addEventListener("popstate", apply);
      window.addEventListener("pageshow", apply);
      chrome.storage.onChanged.addListener(storageChanged);
      void readSettings(++revision);
    }

    function stop() {
      if (!active) return;
      active = false;
      system.removeEventListener("change", apply);
      window.navigation?.removeEventListener("currententrychange", apply);
      window.removeEventListener("popstate", apply);
      window.removeEventListener("pageshow", apply);
      chrome.storage.onChanged.removeListener(storageChanged);
      apply();
    }

    return Object.freeze({ start, stop });
  }

  function startEarly() {
    const access = globalThis.XetSiteAccess;
    if (!document.documentElement || !access) return;
    let videoParent = "";
    if (window.top !== window) {
      // The shared embed route also serves audio. Only bootstrap its confirmed
      // video variant when framed directly by an already supported top site.
      if (window.parent !== window.top || location.origin !== "https://iframe.xiaoeknow.com" ||
          !/^\/page\/?$/.test(location.pathname) || new URLSearchParams(location.search).get("type") !== "3") return;
      const parent = access.siteInfo(location.ancestorOrigins?.[0]);
      if (!parent?.isDefault) return;
      videoParent = parent.origin;
    }
    earlyController ??= makeController(true, videoParent);
    earlyController.start();
  }

  function createSiteAppearanceController() {
    return earlyController || makeController();
  }

  modules.siteAppearance = Object.freeze({ defaults, normalizeAppearance, normalizeBrightness, routeType, createSiteAppearanceController, startEarly });
})();
