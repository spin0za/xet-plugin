(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.siteAppearance) return;

  const defaults = Object.freeze({ siteAppearance: "system", nightVideoBrightness: "extra" });
  const PAGE = "data-xet-night-page";
  const DIM = "data-xet-night-video";
  const EVALUATION = /^\/p\/t_pc\/pc_evaluation\/(?:practice_record|question_collect|errbook\/(?:detail|practice|drillbook)|(?:practice|exam)_(?:sheet|analysis|result)|practice_self_evaluation)(?=\/|$)/;
  const COURSE = /^\/p\/t_pc\/course_pc_detail(?:\/|$)/;
  const VIDEO = /^\/p\/t_pc\/(?:course_pc_detail\/video\/|live_pc\/pc\/)/;
  const routeType = (path) => EVALUATION.test(path) ? "evaluation" : COURSE.test(path) ? "course" : "site";
  const normalizeAppearance = (value) => value === "light" || value === "dark" ? value : "system";
  const normalizeBrightness = (value) => value === "off" || value === "soft" ? value : defaults.nightVideoBrightness;

  let earlyController;

  function makeController(useLocalSitePolicy = false) {
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
      const allowed = !useLocalSitePolicy || !globalThis.XetSiteAccess.normalizeDisabledSites(
        settings.disabledSites, settings.disabledHosts,
      ).includes(location.origin);
      const appearance = normalizeAppearance(settings.siteAppearance);
      const brightness = normalizeBrightness(settings.nightVideoBrightness);
      const dark = active && loaded && allowed && (appearance === "dark" ||
        (appearance === "system" && system.matches));
      const route = top && dark ? routeType(location.pathname) : "";
      setAttribute(PAGE, route);
      // Embedded pages paint only when the existing analysis handshake marks
      // them as explanation players. The CSS also requires a real video.
      const dim = dark && (!top || route === "evaluation" || VIDEO.test(location.pathname)) && brightness !== "off";
      setAttribute("data-xet-night-frame", dim && !top ? "true" : "");
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
    if (window.top !== window || !document.documentElement || !globalThis.XetSiteAccess) return;
    earlyController ??= makeController(true);
    earlyController.start();
  }

  function createSiteAppearanceController() {
    return earlyController || makeController();
  }

  modules.siteAppearance = Object.freeze({ defaults, normalizeAppearance, normalizeBrightness, routeType, createSiteAppearanceController, startEarly });
})();
