const siteAccess = globalThis.XetSiteAccess;
const authorizedList = document.querySelector("#authorized-sites");
const disabledList = document.querySelector("#disabled-sites");
const status = document.querySelector("#status");

function emptyState(message) {
  const element = document.createElement("p");
  element.className = "empty";
  element.textContent = message;
  return element;
}

function siteRow(site, { action, danger = false, label }) {
  const row = document.createElement("div");
  row.className = "site-row";

  const name = document.createElement("span");
  name.className = "site-name";
  name.textContent = site.hostname;
  name.title = site.origin;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.classList.toggle("danger", danger);
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "";
    try {
      await action(site);
      await render();
    } catch (error) {
      status.textContent = `操作失败：${error.message}`;
      button.disabled = false;
    }
  });

  row.append(name, button);
  return row;
}

async function render() {
  const [authorizedSites, disabledOrigins] = await Promise.all([
    siteAccess.listAuthorizedCustomSites(),
    siteAccess.readDisabledSites(),
  ]);
  const disabledSet = new Set(disabledOrigins);

  authorizedList.replaceChildren();
  const activeAuthorizedSites = authorizedSites.filter(
    (site) => !disabledSet.has(site.origin),
  );
  if (!activeAuthorizedSites.length) {
    authorizedList.append(emptyState("尚未启用任何自定义网站。"));
  } else {
    for (const site of activeAuthorizedSites) {
      authorizedList.append(
        siteRow(site, {
          action: (target) => siteAccess.disableSite(target.origin),
          danger: true,
          label: "停用",
        }),
      );
    }
  }

  disabledList.replaceChildren();
  const disabledSites = disabledOrigins
    .map((origin) => siteAccess.siteInfo(origin))
    .filter(Boolean);
  if (!disabledSites.length) {
    disabledList.append(emptyState("没有已停用的网站。"));
  } else {
    for (const site of disabledSites) {
      disabledList.append(
        siteRow(site, {
          action: (target) => siteAccess.enableSite(target.origin),
          label: "重新启用",
        }),
      );
    }
  }
}

render().catch((error) => {
  status.textContent = `载入失败：${error.message}`;
});
