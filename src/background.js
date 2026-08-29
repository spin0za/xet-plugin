const DEFAULT_SETTINGS = {
  enabled: true,
  disabledHosts: [],
  keepAliveEnabled: false,
  keepAliveUrl: "",
  keepAliveLastAttemptAt: 0,
  keepAliveLastActivityAt: 0,
  keepAliveLastResult: null,
};

const KEEP_ALIVE_ALARM = "xet-keep-alive";
const KEEP_ALIVE_INTERVAL_MINUTES = 4 * 60;
const KEEP_ALIVE_MIN_GAP_MS = 3 * 60 * 60 * 1_000;
const KEEP_ALIVE_TIMEOUT_MS = 20_000;
const CUSTOM_CONTENT_SCRIPT_PREFIX = "xet_custom_";

let keepAliveRequest = null;
const contentRepairRequests = new Map();

function contentScriptResources() {
  const registration = chrome.runtime.getManifest().content_scripts?.[0];
  return {
    css: registration?.css || [],
    js: registration?.js || [],
  };
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
    const id = `${CUSTOM_CONTENT_SCRIPT_PREFIX}${registrationHash(url.hostname)}`;
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

function registrationHash(hostname) {
  let hash = 0;
  for (const character of hostname) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
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
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);

  if (!settings.keepAliveEnabled || !keepAliveUrl) {
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

async function saveKeepAliveResult(result) {
  const changes = {
    keepAliveLastAttemptAt: result.at,
    keepAliveLastResult: result,
  };
  if (result.ok) changes.keepAliveLastActivityAt = result.at;
  await chrome.storage.local.set(changes);
}

async function requestKeepAlive(reason, { force = false } = {}) {
  if (keepAliveRequest) return keepAliveRequest;

  keepAliveRequest = (async () => {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);

    if (!keepAliveUrl) {
      return { ok: false, skipped: true, reason: "missing-url" };
    }
    if (!force && !settings.keepAliveEnabled) {
      return { ok: false, skipped: true, reason: "disabled" };
    }

    const lastActivityAt = Number(settings.keepAliveLastActivityAt) || 0;
    if (!force && Date.now() - lastActivityAt < KEEP_ALIVE_MIN_GAP_MS) {
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
      await saveKeepAliveResult(result);
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
      await saveKeepAliveResult(result);
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
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const keepAliveUrl = normalizeKeepAliveUrl(settings.keepAliveUrl);
  if (!tabUrl || !keepAliveUrl) return;

  try {
    const visited = new URL(tabUrl);
    const target = new URL(keepAliveUrl);
    if (visited.hostname !== target.hostname) return;

    await chrome.storage.local.set({
      keepAliveLastActivityAt: Date.now(),
    });
  } catch {
    // Ignore malformed or unavailable tab URLs.
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set(current);
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
    (changes.keepAliveEnabled || changes.keepAliveUrl)
  ) {
    void syncKeepAliveAlarm();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "xet:get-settings") {
    chrome.storage.local
      .get(DEFAULT_SETTINGS)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));

    return true;
  }

  if (message?.type === "xet:keep-alive-test") {
    requestKeepAlive("manual", { force: true })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
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

void syncKeepAliveAlarm();
void syncCustomContentScripts().catch(() => {});
