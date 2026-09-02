importScripts("site-access.js");

const siteAccess = globalThis.XetSiteAccess;
const DEFAULT_SETTINGS = {
  enabled: true,
  disabledSites: [],
  keepAliveEnabled: false,
  keepAliveUrl: "",
  keepAliveLastActivityAt: 0,
};

const KEEP_ALIVE_ALARM = "xet-keep-alive";
const KEEP_ALIVE_INTERVAL_MINUTES = 4 * 60;
const KEEP_ALIVE_MIN_GAP_MS = 3 * 60 * 60 * 1_000;
const KEEP_ALIVE_TIMEOUT_MS = 20_000;
const CUSTOM_CONTENT_SCRIPT_PREFIX = siteAccess.CUSTOM_CONTENT_SCRIPT_PREFIX;

let keepAliveRequest = null;
const contentRepairRequests = new Map();

function contentScriptResources() {
  return siteAccess.contentScriptResources();
}

function customContentScriptRegistration(id, matches) {
  const resources = contentScriptResources();
  return {
    id,
    matches,
    js: resources.js,
    css: resources.css,
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true,
    runAt: "document_idle",
  };
}

async function syncCustomContentScripts() {
  if (!chrome.scripting) return;

  const registered = await chrome.scripting.getRegisteredContentScripts();
  const updates = registered
    .filter((script) => script.id.startsWith(CUSTOM_CONTENT_SCRIPT_PREFIX))
    .map((script) => customContentScriptRegistration(script.id, script.matches));
  if (updates.length) await chrome.scripting.updateContentScripts(updates);
}

async function readSettings() {
  const stored = await chrome.storage.local.get({
    ...DEFAULT_SETTINGS,
    disabledSites: null,
    disabledHosts: [],
  });
  const { disabledHosts, ...settings } = stored;
  return {
    ...settings,
    disabledSites: siteAccess.normalizeDisabledSites(
      stored.disabledSites,
      disabledHosts,
    ),
  };
}

async function migrateLegacySettings() {
  const stored = await chrome.storage.local.get({
    disabledSites: null,
    disabledHosts: [],
  });
  const disabledSites = siteAccess.normalizeDisabledSites(
    stored.disabledSites,
    stored.disabledHosts,
  );
  if (!Array.isArray(stored.disabledSites) || stored.disabledHosts.length) {
    await chrome.storage.local.set({ disabledSites });
  }
  await chrome.storage.local.remove?.([
    "disabledHosts",
    "keepAliveLastAttemptAt",
    "keepAliveLastResult",
  ]);
  return { ...(await readSettings()), disabledSites };
}

async function repairContentScripts(sender) {
  if (!chrome.scripting || sender.tab?.id === undefined) {
    return { ok: false, reason: "unavailable" };
  }

  const tabId = sender.tab.id;
  if (contentRepairRequests.has(tabId)) {
    return contentRepairRequests.get(tabId);
  }

  const repair = (async () => {
    const url = new URL(sender.tab.url);
    const settings = await readSettings();
    if (settings.disabledSites.includes(url.origin)) {
      return { ok: false, reason: "site-disabled" };
    }

    const id = siteAccess.registrationId(url);
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [id],
    });
    if (existing.length) {
      await chrome.scripting.updateContentScripts([
        customContentScriptRegistration(id, [
          `${url.protocol}//${url.hostname}/*`,
        ]),
      ]);
    }

    const resources = contentScriptResources();
    const target = { tabId, allFrames: true };
    if (resources.css.length) {
      await chrome.scripting.insertCSS({ target, files: resources.css });
    }
    await chrome.scripting.executeScript({
      target,
      files: resources.js,
    });
    return { ok: true };
  })();

  contentRepairRequests.set(tabId, repair);
  try {
    return await repair;
  } finally {
    contentRepairRequests.delete(tabId);
  }
}

function normalizeKeepAliveUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".xiaoe-tech.com")
    ) {
      return "";
    }

    return `${url.origin}/bought`;
  } catch {
    return "";
  }
}

async function syncKeepAliveAlarm() {
  const settings = await readSettings();
  const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);
  const keepAliveSite = siteAccess.siteInfo(keepAliveUrl);

  if (
    !settings.keepAliveEnabled ||
    !keepAliveUrl ||
    settings.disabledSites.includes(keepAliveSite?.origin)
  ) {
    await chrome.alarms.clear(KEEP_ALIVE_ALARM);
    return;
  }

  const existing = await chrome.alarms.get(KEEP_ALIVE_ALARM);
  if (!existing || existing.periodInMinutes !== KEEP_ALIVE_INTERVAL_MINUTES) {
    await chrome.alarms.create(KEEP_ALIVE_ALARM, {
      delayInMinutes: KEEP_ALIVE_INTERVAL_MINUTES,
      periodInMinutes: KEEP_ALIVE_INTERVAL_MINUTES,
    });
  }
}

async function saveKeepAliveActivity(result) {
  if (result.ok) {
    await chrome.storage.local.set({ keepAliveLastActivityAt: result.at });
  }
}

async function requestKeepAlive(reason) {
  if (keepAliveRequest) return keepAliveRequest;

  keepAliveRequest = (async () => {
    const settings = await readSettings();
    const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);

    if (!keepAliveUrl) {
      return { ok: false, skipped: true, reason: "missing-url" };
    }
    if (settings.disabledSites.includes(new URL(keepAliveUrl).origin)) {
      return { ok: false, skipped: true, reason: "site-disabled" };
    }
    if (!settings.keepAliveEnabled) {
      return { ok: false, skipped: true, reason: "disabled" };
    }

    const lastActivityAt = Number(settings.keepAliveLastActivityAt) || 0;
    if (Date.now() - lastActivityAt < KEEP_ALIVE_MIN_GAP_MS) {
      return { ok: true, skipped: true, reason: "recent-activity" };
    }

    const at = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KEEP_ALIVE_TIMEOUT_MS);

    try {
      const response = await fetch(keepAliveUrl, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
      });

      // Complete the response so Chrome can finish processing any Set-Cookie
      // headers before the service worker becomes idle.
      await response.text();

      const result = {
        ok: response.ok,
        at,
        reason,
        status: response.status,
      };
      await saveKeepAliveActivity(result);
      return result;
    } catch (error) {
      const result = {
        ok: false,
        at,
        reason,
        error:
          error?.name === "AbortError"
            ? "请求超时"
            : error?.message || "后台请求失败",
      };
      return result;
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    return await keepAliveRequest;
  } finally {
    keepAliveRequest = null;
  }
}

async function recordNaturalVisit(sender) {
  const tabUrl = sender.tab?.url;
  const settings = await readSettings();
  const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);
  if (!tabUrl || !keepAliveUrl) return;

  try {
    const visited = new URL(tabUrl);
    const target = new URL(keepAliveUrl);
    if (visited.hostname !== target.hostname) return;
    if (settings.disabledSites.includes(visited.origin)) return;

    await chrome.storage.local.set({
      keepAliveLastActivityAt: Date.now(),
    });
  } catch {
    // Ignore malformed or unavailable tab URLs.
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await migrateLegacySettings();
  await syncKeepAliveAlarm();
  await syncCustomContentScripts();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncKeepAliveAlarm();
  await requestKeepAlive("startup");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    void requestKeepAlive("alarm");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "local" &&
    (changes.keepAliveEnabled || changes.keepAliveUrl || changes.disabledSites)
  ) {
    void syncKeepAliveAlarm();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "xet:get-settings") {
    readSettings()
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));

    return true;
  }

  if (message?.type === "xet:natural-visit") {
    void recordNaturalVisit(sender);
  }

  if (message?.type === "xet:repair-content-scripts") {
    repairContentScripts(sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

void migrateLegacySettings()
  .then(syncKeepAliveAlarm)
  .catch(() => {});
void syncCustomContentScripts().catch(() => {});
