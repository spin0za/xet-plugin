const DEFAULT_HOST_SUFFIXES = [
  ".xiaoe-tech.com",
  ".xiaoeknow.com",
  ".eapps.cn",
  ".xet-pc.citv.cn",
  ".xet.pomoho.com",
];

const globalToggle = document.querySelector("#global-toggle");
const summary = document.querySelector("#summary");
const siteSection = document.querySelector("#site-section");
const hostnameLabel = document.querySelector("#hostname");
const siteButton = document.querySelector("#site-button");
const hint = document.querySelector("#hint");
const keepAliveToggle = document.querySelector("#keep-alive-toggle");
const keepAliveTarget = document.querySelector("#keep-alive-target");
const keepAliveTest = document.querySelector("#keep-alive-test");
const keepAliveStatus = document.querySelector("#keep-alive-status");

let activeTab = null;
let activeUrl = null;
let settings = {
  enabled: true,
  disabledHosts: [],
  keepAliveEnabled: false,
  keepAliveUrl: "",
  keepAliveLastAttemptAt: 0,
  keepAliveLastActivityAt: 0,
  keepAliveLastResult: null,
};
let siteHasAccess = false;

function isWebPage(url) {
  return url?.protocol === "http:" || url?.protocol === "https:";
}

function isDefaultHost(hostname) {
  return activeUrl?.protocol === "https:" && DEFAULT_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

function hostPattern(url) {
  return `${url.protocol}//${url.hostname}/*`;
}

function registrationId(hostname) {
  let hash = 0;
  for (const character of hostname) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `xet_custom_${hash.toString(36)}`;
}

function contentScriptResources() {
  const registration = chrome.runtime.getManifest().content_scripts?.[0];
  return {
    css: registration?.css || [],
    js: registration?.js || [],
  };
}

function inferredKeepAliveUrl(url) {
  if (!url || url.protocol !== "https:") return "";

  const xiaoeMatch = url.hostname.match(
    /^([a-z0-9-]+)\.pc\.xiaoe-tech\.com$/i,
  );
  if (xiaoeMatch) return `${url.origin}/bought`;

  const hostedMatch = url.hostname.match(
    /^([a-z0-9-]+)\.(?:xet-pc\.citv\.cn|h5\.xet\.pomoho\.com)$/i,
  );
  if (hostedMatch) {
    return `https://${hostedMatch[1]}.pc.xiaoe-tech.com/bought`;
  }

  return "";
}

function effectiveKeepAliveUrl() {
  return settings.keepAliveUrl || inferredKeepAliveUrl(activeUrl);
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function renderKeepAlive() {
  const targetUrl = effectiveKeepAliveUrl();
  keepAliveToggle.checked = settings.keepAliveEnabled;
  keepAliveToggle.disabled = !targetUrl;
  keepAliveTest.disabled = !targetUrl;

  if (!targetUrl) {
    keepAliveTarget.textContent = "请先打开支持的小鹅通课程网站";
    keepAliveStatus.textContent = "设置后不会打开或显示标签页";
    return;
  }

  keepAliveTarget.textContent = new URL(targetUrl).hostname;
  const result = settings.keepAliveLastResult;
  if (!result) {
    keepAliveStatus.textContent = "不会打开或显示标签页";
  } else if (result.ok) {
    keepAliveStatus.textContent = `${formatTime(result.at)} 后台请求完成`;
  } else {
    keepAliveStatus.textContent = `${formatTime(result.at)} ${result.error || `请求失败 (${result.status})`}`;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

async function checkAccess() {
  if (!activeUrl || !isWebPage(activeUrl)) return false;
  if (isDefaultHost(activeUrl.hostname)) return true;
  return chrome.permissions.contains({
    origins: [hostPattern(activeUrl)],
  });
}

function render() {
  globalToggle.checked = settings.enabled;
  renderKeepAlive();

  if (!activeUrl || !isWebPage(activeUrl)) {
    summary.textContent = "当前页面不支持运行";
    siteSection.hidden = true;
    return;
  }

  const hostDisabled = settings.disabledHosts.includes(activeUrl.hostname);
  hostnameLabel.textContent = activeUrl.hostname;
  siteSection.hidden = false;

  if (!siteHasAccess) {
    summary.textContent = "需要先允许访问当前课程网站";
    siteButton.textContent = "在此网站启用";
    siteButton.classList.remove("secondary");
    hint.textContent =
      "小鹅通商家可使用自定义域名。授权只针对当前网站，不会读取其他网页。";
    return;
  }

  if (hostDisabled) {
    summary.textContent = "当前网站已暂停";
    siteButton.textContent = "恢复";
    siteButton.classList.remove("secondary");
  } else {
    summary.textContent = settings.enabled ? "自动切换已开启" : "全局已暂停";
    siteButton.textContent = "在此网站暂停";
    siteButton.classList.add("secondary");
  }

  hint.textContent =
    "打开课程并播放视频后，插件会自动选择可用的“超清”画质。";
}

async function saveKeepAliveTarget() {
  const url = effectiveKeepAliveUrl();
  if (!url) return "";
  if (settings.keepAliveUrl !== url) {
    settings.keepAliveUrl = url;
    await chrome.storage.local.set({ keepAliveUrl: url });
  }
  return url;
}

async function registerCurrentSite() {
  const pattern = hostPattern(activeUrl);
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) return false;

  const id = registrationId(activeUrl.hostname);
  const resources = contentScriptResources();
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [id],
  });
  const registration = {
    id,
    matches: [pattern],
    js: resources.js,
    css: resources.css,
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true,
    runAt: "document_idle",
  };

  if (existing.length) {
    await chrome.scripting.updateContentScripts([registration]);
  } else {
    await chrome.scripting.registerContentScripts([
      registration,
    ]);
  }

  if (resources.css.length) {
    await chrome.scripting.insertCSS({
      target: { tabId: activeTab.id, allFrames: true },
      files: resources.css,
    });
  }
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id, allFrames: true },
    files: resources.js,
  });
  return true;
}

globalToggle.addEventListener("change", async () => {
  settings.enabled = globalToggle.checked;
  await chrome.storage.local.set({ enabled: settings.enabled });
  render();
});

keepAliveToggle.addEventListener("change", async () => {
  const targetUrl = await saveKeepAliveTarget();
  if (!targetUrl) {
    keepAliveToggle.checked = false;
    return;
  }

  settings.keepAliveEnabled = keepAliveToggle.checked;
  await chrome.storage.local.set({
    keepAliveEnabled: settings.keepAliveEnabled,
  });
  renderKeepAlive();
});

keepAliveTest.addEventListener("click", async () => {
  keepAliveTest.disabled = true;
  keepAliveStatus.textContent = "正在进行无界面请求…";

  try {
    if (!(await saveKeepAliveTarget())) return;
    const result = await chrome.runtime.sendMessage({
      type: "xet:keep-alive-test",
    });
    settings.keepAliveLastResult = result?.at ? result : null;
    if (result?.ok) {
      keepAliveStatus.textContent = `${formatTime(result.at)} 请求完成，请检查 Cookie`;
    } else {
      keepAliveStatus.textContent = result?.error || "后台请求失败";
    }
  } catch (error) {
    keepAliveStatus.textContent = `测试失败：${error.message}`;
  } finally {
    keepAliveTest.disabled = false;
  }
});

siteButton.addEventListener("click", async () => {
  if (!activeUrl) return;
  siteButton.disabled = true;

  try {
    if (!siteHasAccess) {
      siteHasAccess = await registerCurrentSite();
      if (!siteHasAccess) {
        hint.textContent = "未获得授权，插件不会访问当前网站。";
        return;
      }
    }

    const hostname = activeUrl.hostname;
    const disabled = new Set(settings.disabledHosts);
    if (disabled.has(hostname)) {
      disabled.delete(hostname);
    } else if (siteButton.textContent.includes("暂停")) {
      disabled.add(hostname);
    }

    settings.disabledHosts = [...disabled];
    await chrome.storage.local.set({
      disabledHosts: settings.disabledHosts,
    });
  } catch (error) {
    hint.textContent = `操作失败：${error.message}`;
  } finally {
    siteButton.disabled = false;
    render();
  }
});

(async () => {
  settings = await chrome.storage.local.get({
    enabled: true,
    disabledHosts: [],
    keepAliveEnabled: false,
    keepAliveUrl: "",
    keepAliveLastAttemptAt: 0,
    keepAliveLastActivityAt: 0,
    keepAliveLastResult: null,
  });
  activeTab = await getActiveTab();

  try {
    activeUrl = new URL(activeTab?.url);
  } catch {
    activeUrl = null;
  }

  siteHasAccess = await checkAccess();
  render();
})();
