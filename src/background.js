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
let keepAliveController = null;
let keepAliveGeneration = 0;
const contentRepairRequests = new Map();

async function recordBackgroundError(operation, error) {
  const message = String(error?.message || "Background operation failed")
    .replace(/https?:\/\/\S+/g, "[URL]").slice(0, 200);
  console.warn(`[Xet] ${operation}: ${message}`);
  try {
    await chrome.storage.local.set({ backgroundLastError: {
      at: Date.now(), operation, name: error?.name || "Error", message,
    } });
  } catch {
    // Storage can be the failing API; never recurse while reporting that error.
  }
}

async function runBackgroundTask(operation, task) {
  try { return await task(); }
  catch (error) {
    await recordBackgroundError(operation, error);
    return { ok: false, error: error?.message || "后台操作失败" };
  }
}

function respond(sendResponse, operation, task) {
  void (async () => {
    const response = await runBackgroundTask(operation, task);
    try { sendResponse(response); } catch { /* The requesting tab may have closed. */ }
  })();
  return true;
}

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

async function frameSettings(sender) {
  const settings = await readSettings();
  // MessageSender.tab describes the outer page, even for a cross-origin
  // content script. Do not trust a URL supplied by the page or the message.
  return { ...settings, topOrigin: siteAccess.siteInfo(sender.tab?.url)?.origin || "" };
}

async function authorizeFrameWebFullscreen(message, sender) {
  if (!Number.isInteger(sender.tab?.id) || !(sender.frameId > 0) ||
      typeof message.active !== "boolean" ||
      typeof message.token !== "string" || !/^[a-f0-9-]{36}$/.test(message.token)) {
    return { ok: false, reason: "invalid-frame" };
  }
  const settings = await frameSettings(sender);
  const ownOrigin = siteAccess.siteInfo(sender.url)?.origin;
  if (message.active && (!settings.topOrigin ||
      settings.disabledSites.includes(settings.topOrigin) ||
      settings.disabledSites.includes(ownOrigin))) {
    return { ok: false, reason: "site-disabled" };
  }
  // Authenticate a short-lived, one-use DOM handshake in every authorized
  // ancestor. postMessage then identifies the hosting iframe without adding
  // webNavigation permission or exposing extension APIs to the web page.
  await chrome.tabs.sendMessage(sender.tab.id, {
    type: "xet:arm-frame-web",
    active: message.active,
    token: message.token,
    frameId: sender.frameId,
  });
  return { ok: true };
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

function responseSessionState(response) {
  if (response.status === 401 || response.status === 403) return "unauthenticated";
  try {
    if (/\/(?:login|sign-?in|wechat_login)(?:\/|$)/i.test(new URL(response.url).pathname)) {
      return "unauthenticated";
    }
  } catch { /* A missing response URL supplies no session evidence. */ }
  // A public app shell and a logged-in page can both return HTTP 200. Without
  // an authenticated endpoint or cookie access, renewal cannot be verified.
  return "unknown";
}

async function saveKeepAliveResult(result) {
  await chrome.storage.local.set({
    keepAliveLastRequestAt: result.at,
    keepAliveLastResult: result,
    ...(result.ok && result.sessionState !== "unauthenticated"
      ? { keepAliveLastActivityAt: result.at } : {}),
  });
}

async function requestKeepAlive(reason) {
  if (keepAliveRequest) return keepAliveRequest;
  const generation = keepAliveGeneration;

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
    if (generation !== keepAliveGeneration) {
      return { ok: false, skipped: true, reason: "settings-changed" };
    }

    const at = Date.now();
    const controller = new AbortController();
    keepAliveController = controller;
    const timeout = setTimeout(() => controller.abort(), KEEP_ALIVE_TIMEOUT_MS);
    let result;

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

      result = {
        ok: response.ok,
        requestCompleted: true,
        sessionState: responseSessionState(response),
        sessionRenewed: null,
        at,
        reason,
        status: response.status,
      };
    } catch (error) {
      const canceled = controller.signal.reason === "settings-changed";
      result = {
        ok: false,
        requestCompleted: false,
        sessionState: "unknown",
        sessionRenewed: null,
        at,
        reason: canceled ? "settings-changed" : reason,
        skipped: canceled,
        error:
          canceled ? "设置已变更，请求已取消" : error?.name === "AbortError"
            ? "请求超时"
            : error?.message || "后台请求失败",
      };
    } finally {
      clearTimeout(timeout);
      if (keepAliveController === controller) keepAliveController = null;
    }
    if (generation !== keepAliveGeneration) {
      result = { ...result, ok: false, skipped: true, reason: "settings-changed" };
    }
    // Persistence failures are reported as storage failures, not mislabeled as
    // network failures after an otherwise completed HTTP request.
    await saveKeepAliveResult(result);
    return result;
  })();

  try {
    return await keepAliveRequest;
  } finally {
    keepAliveRequest = null;
  }
}

async function recordNaturalVisit(sender) {
  if (sender.frameId > 0) return;
  const tabUrl = sender.tab?.url;
  const settings = await readSettings();
  const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);
  if (!tabUrl || !keepAliveUrl) return;

  const visited = siteAccess.siteInfo(tabUrl);
  const target = siteAccess.siteInfo(keepAliveUrl);
  if (!visited || visited.origin !== target?.origin) return;
  if (settings.disabledSites.includes(visited.origin)) return;
  const at = Date.now();
  await chrome.storage.local.set({
    keepAliveLastActivityAt: at,
    keepAliveLastVisit: { at, sessionState: "unknown", sessionRenewed: null },
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await runBackgroundTask("migrate-settings", migrateLegacySettings);
  await runBackgroundTask("sync-keep-alive-alarm", syncKeepAliveAlarm);
  await runBackgroundTask("sync-content-scripts", syncCustomContentScripts);
});

chrome.runtime.onStartup.addListener(async () => {
  await runBackgroundTask("sync-keep-alive-alarm", syncKeepAliveAlarm);
  await runBackgroundTask("startup-keep-alive", () => requestKeepAlive("startup"));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    return runBackgroundTask("alarm-keep-alive", () => requestKeepAlive("alarm"));
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "local" &&
    (changes.keepAliveEnabled || changes.keepAliveUrl || changes.disabledSites)
  ) {
    // Settings changes cancel a request already in flight, including revoking
    // the entire site's access while the fetch is waiting for a response.
    keepAliveGeneration++;
    keepAliveController?.abort("settings-changed");
    return runBackgroundTask("sync-keep-alive-alarm", syncKeepAliveAlarm);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "xet:get-settings") {
    return respond(sendResponse, "read-frame-settings", () => frameSettings(sender));
  }

  if (message?.type === "xet:authorize-frame-web") {
    return respond(sendResponse, "authorize-frame-web", () => authorizeFrameWebFullscreen(message, sender));
  }

  if (message?.type === "xet:natural-visit") {
    void runBackgroundTask("record-natural-visit", () => recordNaturalVisit(sender));
  }

  if (message?.type === "xet:repair-content-scripts") {
    return respond(sendResponse, "repair-content-scripts", () => repairContentScripts(sender));
  }

  return false;
});

void runBackgroundTask("initialize-settings", async () => {
  await migrateLegacySettings();
  await syncKeepAliveAlarm();
});
void runBackgroundTask("sync-content-scripts", syncCustomContentScripts);
