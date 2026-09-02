const siteAccess = globalThis.XetSiteAccess;
const globalToggle = document.querySelector("#global-toggle");
const summary = document.querySelector("#summary");
const siteSection = document.querySelector("#site-section");
const hostnameLabel = document.querySelector("#hostname");
const siteButton = document.querySelector("#site-button");
const siteStatus = document.querySelector("#site-status");
const hint = document.querySelector("#hint");
const manageSites = document.querySelector("#manage-sites");
const keepAliveToggle = document.querySelector("#keep-alive-toggle");
const keepAliveTarget = document.querySelector("#keep-alive-target");
const keepAliveTest = document.querySelector("#keep-alive-test");
const keepAliveStatus = document.querySelector("#keep-alive-status");

let activeTab = null;
let activeUrl = null;
let settings = {
  enabled: true,
  disabledSites: [],
  keepAliveEnabled: false,
  keepAliveUrl: "",
  keepAliveLastAttemptAt: 0,
  keepAliveLastActivityAt: 0,
  keepAliveLastResult: null,
};
let siteHasAccess = false;
let siteNotice = "";

function isWebPage(url) {
  return url?.protocol === "http:" || url?.protocol === "https:";
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
  const targetSite = siteAccess.siteInfo(targetUrl);
  const targetDisabled = settings.disabledSites.includes(targetSite?.origin);
  keepAliveToggle.checked = settings.keepAliveEnabled;
  keepAliveToggle.disabled = !targetUrl;
  keepAliveTest.disabled = !targetUrl || targetDisabled;

  if (!targetUrl) {
    keepAliveTarget.textContent = "请先打开支持的小鹅通课程网站";
    keepAliveStatus.textContent = "设置后不会打开或显示标签页";
    return;
  }

  keepAliveTarget.textContent = new URL(targetUrl).hostname;
  if (targetDisabled) {
    keepAliveStatus.textContent = "网站已停用，自动保持登录已暂停";
    return;
  }
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
  return siteAccess.isAuthorized(activeUrl);
}

function render() {
  globalToggle.checked = settings.enabled;
  renderKeepAlive();
  hint.hidden = true;
  hint.textContent = "";

  if (!activeUrl || !isWebPage(activeUrl)) {
    summary.textContent = "当前页面不支持运行";
    siteSection.hidden = true;
    return;
  }

  const site = siteAccess.siteInfo(activeUrl);
  const siteDisabled = settings.disabledSites.includes(site.origin);
  const siteEnabled = siteHasAccess && !siteDisabled;
  hostnameLabel.textContent = site.hostname;
  siteSection.hidden = false;

  if (!siteEnabled) {
    summary.textContent = siteDisabled
      ? "当前网站已停用"
      : "当前网站尚未启用";
    siteButton.textContent = "在此网站启用";
    siteButton.classList.remove("danger");
    siteStatus.textContent = siteDisabled
      ? "插件全部功能已停用"
      : "启用后只访问当前域名";
  } else {
    summary.textContent = settings.enabled
      ? "自动切换已开启"
      : "自动切换已关闭";
    siteButton.textContent = "在此网站停用";
    siteButton.classList.add("danger");
    siteStatus.textContent = "停用插件在此网站的全部功能";
  }

  if (siteNotice) {
    hint.textContent = siteNotice;
    hint.hidden = false;
  }
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
  siteNotice = "";

  try {
    const site = siteAccess.siteInfo(activeUrl);
    const siteDisabled = settings.disabledSites.includes(site.origin);
    const siteEnabled = siteHasAccess && !siteDisabled;
    const result = siteEnabled
      ? await siteAccess.disableSite(activeUrl)
      : await siteAccess.enableSite(activeUrl, { tabId: activeTab.id });

    if (!result.ok) {
      siteNotice = "未获得授权，插件不会访问当前网站。";
    }
    settings.disabledSites = await siteAccess.readDisabledSites();
    siteHasAccess = await checkAccess();
  } catch (error) {
    siteNotice = `操作失败：${error.message}`;
  } finally {
    siteButton.disabled = false;
    render();
  }
});

manageSites.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

(async () => {
  settings = await chrome.storage.local.get({
    enabled: true,
    disabledSites: null,
    disabledHosts: [],
    keepAliveEnabled: false,
    keepAliveUrl: "",
    keepAliveLastAttemptAt: 0,
    keepAliveLastActivityAt: 0,
    keepAliveLastResult: null,
  });
  settings.disabledSites = siteAccess.normalizeDisabledSites(
    settings.disabledSites,
    settings.disabledHosts,
  );
  activeTab = await getActiveTab();

  try {
    activeUrl = new URL(activeTab?.url);
  } catch {
    activeUrl = null;
  }

  siteHasAccess = await checkAccess();
  render();
})();
