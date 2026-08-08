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

let activeTab = null;
let activeUrl = null;
let settings = {
  enabled: true,
  disabledHosts: [],
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

async function registerCurrentSite() {
  const pattern = hostPattern(activeUrl);
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) return false;

  const id = registrationId(activeUrl.hostname);
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [id],
  });

  if (!existing.length) {
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [pattern],
        js: ["src/content.js"],
        allFrames: true,
        matchOriginAsFallback: true,
        persistAcrossSessions: true,
        runAt: "document_idle",
      },
    ]);
  }

  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id, allFrames: true },
    files: ["src/content.js"],
  });
  return true;
}

globalToggle.addEventListener("change", async () => {
  settings.enabled = globalToggle.checked;
  await chrome.storage.local.set({ enabled: settings.enabled });
  render();
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
