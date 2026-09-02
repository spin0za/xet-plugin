async (page) => {
  const fixtureBaseUrl = "http://127.0.0.1:4173";
  const manifest = {
    content_scripts: [
      {
        js: ["src/site-access.js", "src/content.js"],
        css: ["src/content/fullscreen.css"],
      },
    ],
    host_permissions: ["https://*.xiaoe-tech.com/*"],
  };

  async function installChromeStub(targetPage, { activeUrl, disabledSites }) {
    await targetPage.addInitScript(
      ({ activeUrl, disabledSites, manifest }) => {
        const registrations = [
          {
            id: "xet_custom_demo",
            matches: ["https://courses.example.com/*"],
          },
        ];
        const settings = {
          enabled: true,
          disabledSites,
          keepAliveEnabled: true,
          keepAliveUrl: "https://merchant.pc.xiaoe-tech.com/bought",
        };
        window.chrome = {
          runtime: {
            getManifest: () => manifest,
            openOptionsPage: async () => {},
            sendMessage: async () => ({}),
          },
          tabs: {
            query: async () => [{ id: 7, url: activeUrl }],
          },
          storage: {
            local: {
              get: async (defaults) => ({ ...defaults, ...settings }),
              set: async (changes) => Object.assign(settings, changes),
            },
          },
          permissions: {
            contains: async () => true,
            getAll: async () => ({
              origins: [
                ...manifest.host_permissions,
                "https://courses.example.com/*",
              ],
            }),
            request: async () => true,
            remove: async () => true,
          },
          scripting: {
            executeScript: async () => {},
            getRegisteredContentScripts: async (filter = {}) =>
              filter.ids
                ? registrations.filter((item) => filter.ids.includes(item.id))
                : registrations,
            insertCSS: async () => {},
            registerContentScripts: async () => {},
            unregisterContentScripts: async () => {},
            updateContentScripts: async () => {},
          },
        };
      },
      { activeUrl, disabledSites, manifest },
    );
  }

  const popupPage = await page.context().newPage();
  await installChromeStub(popupPage, {
    activeUrl: "https://merchant.pc.xiaoe-tech.com/course",
    disabledSites: [],
  });
  await popupPage.goto(`${fixtureBaseUrl}/popup/popup.html`);
  await popupPage.locator(".developer-options > summary").click();
  const popup = await popupPage.evaluate(() => {
    const details = document.querySelector(".developer-options");
    const siteButton = document.querySelector("#site-button");
    return {
      siteInsideDeveloperMode: details.contains(
        document.querySelector("#site-section"),
      ),
      buttonText: siteButton.textContent,
      buttonBackground: getComputedStyle(siteButton).backgroundColor,
      buttonColor: getComputedStyle(siteButton).color,
      manageText: document.querySelector("#manage-sites").textContent.trim(),
      hintHidden: document.querySelector("#hint").hidden,
      hasKeepAliveDiagnostics: Boolean(
        document.querySelector("#keep-alive-test, #keep-alive-target"),
      ),
    };
  });

  const optionsPage = await page.context().newPage();
  await installChromeStub(optionsPage, {
    activeUrl: "https://merchant.pc.xiaoe-tech.com/course",
    disabledSites: ["https://disabled.pc.xiaoe-tech.com"],
  });
  await optionsPage.goto(`${fixtureBaseUrl}/options/options.html`);
  const options = await optionsPage.evaluate(() => ({
    title: document.querySelector("h1").textContent,
    authorized: [...document.querySelectorAll("#authorized-sites .site-name")].map(
      (item) => item.textContent,
    ),
    disabled: [...document.querySelectorAll("#disabled-sites .site-name")].map(
      (item) => item.textContent,
    ),
    dangerText: document.querySelector("#authorized-sites button")?.textContent,
    restoreText: document.querySelector("#disabled-sites button")?.textContent,
  }));

  if (
    !popup.siteInsideDeveloperMode ||
    popup.buttonText !== "在此网站停用" ||
    popup.buttonBackground !== "rgb(220, 38, 38)" ||
    popup.buttonColor !== "rgb(255, 255, 255)" ||
    !popup.manageText.includes("管理已启用的网站") ||
    !popup.hintHidden ||
    popup.hasKeepAliveDiagnostics ||
    options.title !== "网站管理" ||
    options.authorized.join() !== "courses.example.com" ||
    options.disabled.join() !== "disabled.pc.xiaoe-tech.com" ||
    options.dangerText !== "停用" ||
    options.restoreText !== "重新启用"
  ) {
    throw new Error(`Unexpected extension UI: ${JSON.stringify({ popup, options })}`);
  }

  await popupPage.close();
  await optionsPage.close();
  return { popup, options };
}
