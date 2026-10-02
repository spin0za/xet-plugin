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

  async function installChromeStub(targetPage, { activeUrl, disabledSites, failStorageRead = false }) {
    // Local HTTP files may receive heuristic freshness caching. Routing disables
    // that cache so repeated regression runs always load the current sources.
    await targetPage.route(`${fixtureBaseUrl}/**`, (route) => route.continue());
    await targetPage.addInitScript(
      ({ activeUrl, disabledSites, manifest, failStorageRead }) => {
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
          ...JSON.parse(sessionStorage.getItem("fixture-settings") || "{}"),
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
              get: async (defaults) => {
                if (failStorageRead) throw new Error("storage unavailable");
                return { ...defaults, ...settings };
              },
              set: async (changes) => {
                Object.assign(settings, changes);
                sessionStorage.setItem("fixture-settings", JSON.stringify(settings));
              },
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
      { activeUrl, disabledSites, manifest, failStorageRead },
    );
  }

  const popupPage = await page.context().newPage();
  await installChromeStub(popupPage, {
    activeUrl: "https://merchant.pc.xiaoe-tech.com/course",
    disabledSites: [],
  });
  await popupPage.goto(`${fixtureBaseUrl}/popup/popup.html`);
  await popupPage.keyboard.press("Tab");
  const keyboardFocus = await popupPage.evaluate(() => {
    const input = document.querySelector("#global-toggle");
    const style = getComputedStyle(input.nextElementSibling);
    return document.activeElement === input && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
  });
  if (!keyboardFocus) throw new Error("Popup toggle has no visible keyboard focus");
  await popupPage.keyboard.press("Space");
  if (await popupPage.locator("#global-toggle").isChecked()) throw new Error("Keyboard toggle did not turn off");
  await popupPage.keyboard.press("Space");
  await popupPage.waitForFunction(() => document.querySelector("#global-toggle").checked &&
    !document.querySelector("#global-toggle").disabled);
  await popupPage.keyboard.press("Tab");
  const volumeFocus = await popupPage.evaluate(() => document.activeElement.id === "volume-toggle");
  if (!volumeFocus || !(await popupPage.locator("#volume-toggle").isChecked())) {
    throw new Error("Default volume toggle is not enabled by default or in the correct keyboard order");
  }
  await popupPage.keyboard.press("Space");
  await popupPage.waitForFunction(() => !document.querySelector("#volume-toggle").checked &&
    !document.querySelector("#volume-toggle").disabled);
  if (!(await popupPage.locator("#global-toggle").isChecked()) ||
      !(await popupPage.locator("#keep-alive-toggle").isChecked())) throw new Error("Volume toggle changed other settings");
  await popupPage.reload();
  await popupPage.waitForFunction(() => !document.querySelector("#volume-toggle").disabled);
  if (await popupPage.locator("#volume-toggle").isChecked()) throw new Error("Disabled volume setting was not restored");
  await popupPage.locator("#volume-toggle").focus();
  await popupPage.keyboard.press("Space");
  await popupPage.waitForFunction(() => document.querySelector("#volume-toggle").checked &&
    !document.querySelector("#volume-toggle").disabled);
  await popupPage.emulateMedia({ reducedMotion: "reduce" });
  const accessibility = await popupPage.evaluate(() => {
    const summary = document.querySelector(".developer-options > summary");
    function luminance(color) {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => {
        const value = n / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    }
    const foreground = luminance(getComputedStyle(summary).color);
    const background = luminance(getComputedStyle(document.body).backgroundColor);
    return {
      contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05),
      transition: getComputedStyle(document.querySelector(".switch")).transitionDuration,
    };
  });
  if (accessibility.contrast < 4.5 || accessibility.transition !== "0s") {
    throw new Error(`Popup accessibility regression: ${JSON.stringify(accessibility)}`);
  }
  await popupPage.screenshot({ path: "output/playwright/highest-quality-popup.png" });
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

  await popupPage.evaluate(() => {
    chrome.storage.local.set = async () => { throw new Error("storage unavailable"); };
  });
  await popupPage.locator("#global-toggle").focus();
  await popupPage.keyboard.press("Space");
  await popupPage.waitForFunction(() => document.querySelector("#summary").textContent.includes("保存失败"));
  const failedSaveRolledBack = await popupPage.locator("#global-toggle").isChecked();
  if (!failedSaveRolledBack) throw new Error("Failed storage write left a false toggle state");
  await popupPage.locator("#keep-alive-toggle").focus();
  await popupPage.keyboard.press("Space");
  await popupPage.waitForFunction(() => document.querySelector("#keep-alive-toggle").checked &&
    !document.querySelector("#keep-alive-toggle").disabled);
  await popupPage.locator("#volume-toggle").focus();
  await popupPage.keyboard.press("Space");
  await popupPage.waitForFunction(() => document.querySelector("#volume-toggle").checked &&
    !document.querySelector("#volume-toggle").disabled);
  if (await popupPage.evaluate(() => document.activeElement.id) !== "volume-toggle") {
    throw new Error("Volume toggle lost focus after a failed settings write");
  }

  const failedPopup = await page.context().newPage();
  await installChromeStub(failedPopup, {
    activeUrl: "https://merchant.pc.xiaoe-tech.com/course", disabledSites: [], failStorageRead: true,
  });
  await failedPopup.goto(`${fixtureBaseUrl}/popup/popup.html`);
  await failedPopup.waitForFunction(() => document.querySelector("#summary").textContent.includes("无法读取设置"));
  const failedInitDisabled = await failedPopup.locator("#global-toggle").isDisabled() &&
    await failedPopup.locator("#volume-toggle").isDisabled();
  if (!failedInitDisabled) throw new Error("Failed initialization enabled the settings controls");
  await failedPopup.close();

  await popupPage.close();
  await optionsPage.close();
  return { popup, options, keyboardFocus, volumeFocus, independentVolumeToggle: true, accessibility, failedSaveRolledBack, failedInitDisabled };
}
