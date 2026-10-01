async (page) => {
  // Run in an isolated persistent Chromium profile with this extension loaded.
  // All merchant documents below are fixtures, not real account pages.
  const worker = page.context().serviceWorkers().find((item) =>
    item.url().endsWith("/src/background.js"),
  );
  if (!worker) throw new Error("Load the unpacked extension in a persistent Chromium test profile first");
  const fixture = await page.context().newPage();
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.setViewportSize({ width: 1280, height: 900 });
    await fixture.route("https://merchant.pc.xiaoe-tech.com/**", (route) => route.fulfill({
      contentType: "text/html", body: `<!doctype html><style>body{margin:0}iframe{width:400px;height:300px}</style>
        <header>网站导航</header><iframe src="https://bridge.xiaoeknow.com/fixture" allow="fullscreen" allowfullscreen></iframe>`,
    }));
    await fixture.route("https://bridge.xiaoeknow.com/**", (route) => route.fulfill({
      contentType: "text/html", body: `<!doctype html><style>html,body{margin:0}iframe{width:100%;height:260px}</style>
        <header>嵌入页导航</header><iframe src="https://player.eapps.cn/fixture" allow="fullscreen" allowfullscreen></iframe>`,
    }));
    await fixture.route("https://player.eapps.cn/**", (route) => route.fulfill({
      contentType: "text/html", body: `<!doctype html><style>
        html,body{margin:0;height:100%}.xgplayer{position:relative;width:100%;height:100%;background:black}
        video{width:100%;height:100%}.xgplayer-controls{position:absolute;bottom:0}button{padding:8px}
      </style><div id=player class=xgplayer tabindex=0><video></video><div class=xgplayer-controls>
        <button class=xgplayer-play>播放</button><button class=xgplayer-fullscreen>全屏</button></div></div>`,
    }));
    await fixture.goto("https://merchant.pc.xiaoe-tech.com/fixture");
    const middle = fixture.frames().find((frame) => frame.url().includes("bridge.xiaoeknow.com"));
    const inner = fixture.frames().find((frame) => frame.url().includes("player.eapps.cn"));
    await inner.waitForFunction(() => document.querySelector("#player").dataset.xetInteractions === "true");
    const root = inner.locator("#player");
    await root.press("t");
    await fixture.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await middle.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await inner.waitForFunction(() => innerWidth === 1280 && innerHeight === 900);
    const bounds = await root.boundingBox();
    const headersHidden = !(await fixture.locator("header").isVisible()) && !(await middle.locator("header").isVisible());
    if (!headersHidden || bounds.width !== 1280 || bounds.height !== 900) {
      throw new Error(`Nested iframe layout failed: ${JSON.stringify({ bounds, headersHidden })}`);
    }
    await root.press("f");
    await inner.waitForFunction(() => document.fullscreenElement?.id === "player");
    await fixture.waitForFunction(() => !document.querySelector("iframe").dataset.xetWebFullscreen);
    await root.press("t");
    await inner.waitForFunction(() => !document.fullscreenElement && document.querySelector("#player").dataset.xetWebFullscreen === "true");
    await fixture.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await fixture.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await fixture.keyboard.press("Escape");
    await inner.waitForFunction(() => !document.querySelector("#player").dataset.xetWebFullscreen);
    await fixture.waitForFunction(() => !document.querySelector("iframe").dataset.xetWebFullscreen);
    await root.press("t");
    await fixture.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: ["https://merchant.pc.xiaoe-tech.com"] }));
    await inner.waitForFunction(() => !document.querySelector("#player").dataset.xetInteractions);
    await fixture.waitForFunction(() => !document.documentElement.classList.contains("xet-web-fullscreen-active"));
    if (!(await fixture.locator("header").isVisible()) || !(await middle.locator("header").isVisible())) {
      throw new Error("Nested page UI was not restored when the outer site was disabled");
    }
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await inner.waitForFunction(() => document.querySelector("#player").dataset.xetInteractions === "true");
    return { realMV3: true, nestedFrames: 2, headersHidden, bounds, outerSiteDisable: true, reenabled: true };
  } finally {
    await fixture.close();
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
  }
}
