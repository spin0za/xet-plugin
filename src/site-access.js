(() => {
  if (globalThis.XetSiteAccess) return;

  const DEFAULT_HOST_SUFFIXES = [
    ".xiaoe-tech.com",
    ".xiaoeknow.com",
    ".eapps.cn",
    ".xet-pc.citv.cn",
    ".xet.pomoho.com",
  ];
  const CUSTOM_CONTENT_SCRIPT_PREFIX = "xet_custom_";

  function siteInfo(value) {
    try {
      const url = value instanceof URL ? value : new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;

      const hostname = url.hostname.toLowerCase();
      const origin = `${url.protocol}//${hostname}${url.port ? `:${url.port}` : ""}`;
      return Object.freeze({
        hostname,
        origin,
        pattern: `${origin}/*`,
        protocol: url.protocol,
        isDefault:
          url.protocol === "https:" &&
          DEFAULT_HOST_SUFFIXES.some(
            (suffix) =>
              hostname === suffix.slice(1) || hostname.endsWith(suffix),
          ),
      });
    } catch {
      return null;
    }
  }

  function normalizeDisabledSites(disabledSites, legacyDisabledHosts = []) {
    const normalized = new Set();
    const values = [
      ...(Array.isArray(disabledSites) ? disabledSites : []),
      ...(Array.isArray(legacyDisabledHosts) ? legacyDisabledHosts : []),
    ];

    for (const value of values) {
      if (typeof value !== "string" || !value.trim()) continue;
      const site = siteInfo(
        value.includes("://") ? value : `https://${value}`,
      );
      if (site) normalized.add(site.origin);
    }

    return [...normalized].sort();
  }

  function registrationHash(hostname) {
    let hash = 0;
    for (const character of hostname) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    return hash.toString(36);
  }

  function registrationId(value) {
    const site = siteInfo(value);
    return site
      ? `${CUSTOM_CONTENT_SCRIPT_PREFIX}${registrationHash(site.hostname)}`
      : "";
  }

  function contentScriptResources() {
    const registration = chrome.runtime.getManifest().content_scripts?.[0];
    return {
      css: registration?.css || [],
      js: registration?.js || [],
    };
  }

  function customContentScriptRegistration(value) {
    const site = siteInfo(value);
    if (!site) return null;
    const resources = contentScriptResources();
    return {
      id: registrationId(site.origin),
      matches: [site.pattern],
      js: resources.js,
      css: resources.css,
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true,
      runAt: "document_idle",
    };
  }

  async function readDisabledSites() {
    const stored = await chrome.storage.local.get({
      disabledSites: null,
      disabledHosts: [],
    });
    return normalizeDisabledSites(stored.disabledSites, stored.disabledHosts);
  }

  async function writeSiteDisabled(value, disabled) {
    const site = siteInfo(value);
    if (!site) throw new Error("当前页面不是可管理的网站");

    const sites = new Set(await readDisabledSites());
    if (disabled) sites.add(site.origin);
    else sites.delete(site.origin);
    const disabledSites = [...sites].sort();
    await chrome.storage.local.set({ disabledSites });
    await chrome.storage.local.remove?.("disabledHosts");
    return disabledSites;
  }

  async function getCustomRegistration(value) {
    const id = registrationId(value);
    if (!id || !chrome.scripting) return null;
    const registrations = await chrome.scripting.getRegisteredContentScripts({
      ids: [id],
    });
    return registrations[0] || null;
  }

  async function isAuthorized(value) {
    const site = siteInfo(value);
    if (!site) return false;
    if (site.isDefault) return true;

    const [hasPermission, registration] = await Promise.all([
      chrome.permissions.contains({ origins: [site.pattern] }),
      getCustomRegistration(site.origin),
    ]);
    return hasPermission && Boolean(registration);
  }

  async function injectIntoTab(tabId) {
    if (tabId === undefined || tabId === null) return;
    const resources = contentScriptResources();
    const target = { tabId, allFrames: true };
    if (resources.css.length) {
      await chrome.scripting.insertCSS({ target, files: resources.css });
    }
    await chrome.scripting.executeScript({ target, files: resources.js });
  }

  async function enableSite(value, { tabId } = {}) {
    const site = siteInfo(value);
    if (!site) throw new Error("当前页面不是可管理的网站");

    if (!site.isDefault) {
      const granted = await chrome.permissions.request({
        origins: [site.pattern],
      });
      if (!granted) return { ok: false, reason: "permission-denied" };

      const registration = customContentScriptRegistration(site.origin);
      const existing = await getCustomRegistration(site.origin);
      if (existing) {
        await chrome.scripting.updateContentScripts([registration]);
      } else {
        await chrome.scripting.registerContentScripts([registration]);
      }
    }

    await writeSiteDisabled(site.origin, false);
    if (!site.isDefault) await injectIntoTab(tabId);
    return { ok: true, site };
  }

  async function disableSite(value) {
    const site = siteInfo(value);
    if (!site) throw new Error("当前页面不是可管理的网站");

    // Stop existing content-script instances before revoking the permission
    // that allowed them to be injected.
    await writeSiteDisabled(site.origin, true);

    if (!site.isDefault) {
      const registration = await getCustomRegistration(site.origin);
      if (registration) {
        await chrome.scripting.unregisterContentScripts({
          ids: [registration.id],
        });
      }
      await chrome.permissions.remove({ origins: [site.pattern] });
    }

    return { ok: true, site };
  }

  async function listAuthorizedCustomSites() {
    const [registrations, permissions] = await Promise.all([
      chrome.scripting.getRegisteredContentScripts(),
      chrome.permissions.getAll(),
    ]);
    const origins = new Set();

    for (const registration of registrations) {
      if (!registration.id.startsWith(CUSTOM_CONTENT_SCRIPT_PREFIX)) continue;
      for (const match of registration.matches || []) {
        const site = siteInfo(match);
        if (site && !site.isDefault) origins.add(site.origin);
      }
    }

    for (const pattern of permissions.origins || []) {
      if (!/^https?:\/\/[^*/]+(?::\d+)?\/\*$/.test(pattern)) continue;
      const site = siteInfo(pattern);
      if (site && !site.isDefault) origins.add(site.origin);
    }

    return [...origins]
      .map((origin) => siteInfo(origin))
      .filter(Boolean)
      .sort((a, b) => a.hostname.localeCompare(b.hostname));
  }

  globalThis.XetSiteAccess = Object.freeze({
    CUSTOM_CONTENT_SCRIPT_PREFIX,
    contentScriptResources,
    customContentScriptRegistration,
    disableSite,
    enableSite,
    isAuthorized,
    listAuthorizedCustomSites,
    normalizeDisabledSites,
    readDisabledSites,
    registrationId,
    siteInfo,
    writeSiteDisabled,
  });
})();
