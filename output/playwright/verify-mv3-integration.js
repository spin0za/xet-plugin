async (page) => {
  // Run in an isolated persistent Chromium profile with this extension loaded.
  // All merchant documents below are fixtures, not real account pages.
  const worker = page.context().serviceWorkers().find((item) =>
    item.url().endsWith("/src/background.js"),
  );
  if (!worker) throw new Error("Load the unpacked extension in a persistent Chromium test profile first");
  const fixture = await page.context().newPage();
  let stage = "frame initialization";
  try {
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true, volumeEnabled: true, disabledSites: [], keepAliveEnabled: false }));
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
      contentType: "text/html; charset=utf-8", body: `<!doctype html><style>
        html,body{margin:0;height:100%}.xgplayer{position:relative;width:100%;height:100%;background:black}
        video{width:100%;height:100%}.xgplayer-controls{position:absolute;bottom:0}button{padding:8px}
      </style><div id=player class=xgplayer tabindex=0><video></video><div class=xgplayer-controls>
        <button class=xgplayer-play>播放</button><button class=xgplayer-fullscreen>全屏</button></div>
        <div class=xgplayer-definition style="position:absolute;right:0;top:0;background:white">
          <span id=currentQuality>高清</span><ul><li id=ultra definition=1080p>超清</li>
          <li id=hd definition=720p class=selected>高清</li></ul></div></div>
        <div id=live-player class=pc-live-player><video id=live-video></video><div class=mute-btn><div class=volume-range>
          <input id=live-volume type=range min=0 max=100 value=50></div></div></div>
        <script>
          document.querySelector('video').volume = 0.3;
          document.querySelector('#live-video').volume = 0.5;
          window.liveVolumeState = 50;
          document.querySelector('#live-volume').addEventListener('input', (event) => {
            window.liveVolumeState = Number(event.target.value);
            document.querySelector('#live-video').volume = window.liveVolumeState / 100;
            document.querySelector('#live-video').muted = window.liveVolumeState === 0;
          });
          document.querySelector('.xgplayer-definition').addEventListener('click', (event) => {
            const option = event.target.closest('li'); if (!option) return;
            document.querySelectorAll('li').forEach(item => item.classList.toggle('selected', item === option));
            currentQuality.textContent = option.textContent;
            for (const type of ['emptied', 'loadstart', 'loadedmetadata', 'canplay'])
              document.querySelector('video').dispatchEvent(new Event(type));
          });
        </script>`,
    }));
    await fixture.goto("https://merchant.pc.xiaoe-tech.com/fixture");
    const middle = fixture.frames().find((frame) => frame.url().includes("bridge.xiaoeknow.com"));
    const inner = fixture.frames().find((frame) => frame.url().includes("player.eapps.cn"));
    await inner.waitForFunction(() => document.querySelector("#player").dataset.xetInteractions === "true");
    await inner.waitForFunction(() => document.querySelector("video").volume === 1);
    stage = "live volume across isolated worlds";
    await inner.waitForFunction(() => document.querySelector("#live-volume").value === "100" && window.liveVolumeState === 100);
    await inner.locator("#live-volume").press("Home");
    await inner.locator("#live-volume").press("ArrowRight");
    await inner.evaluate(() => document.querySelector("#live-video").dispatchEvent(new Event("loadedmetadata")));
    await inner.waitForTimeout(100);
    if (await inner.evaluate(() => document.querySelector("#live-video").volume !== 0.01 || window.liveVolumeState !== 1)) {
      throw new Error("Live controls failed to preserve manual volume in the real MV3 extension");
    }
    await inner.locator("#live-player").evaluate(node => node.remove());
    stage = "initial automatic quality";
    await inner.waitForFunction(() => document.querySelector("#ultra").classList.contains("selected"));
    await inner.locator("#hd").click();
    await inner.waitForTimeout(200);
    if (!(await inner.locator("#hd").getAttribute("class"))?.includes("selected")) {
      throw new Error("Real isolated-world content script overrode manual HD");
    }
    await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
    stage = "volume with quality disabled";
    await inner.evaluate(() => {
      const video = document.createElement("video");
      video.id = "quality-off-video"; video.volume = 0.2;
      document.body.append(video);
    });
    await inner.waitForFunction(() => document.querySelector("#quality-off-video").volume === 1);
    await inner.evaluate(() => document.querySelector("#quality-off-video").remove());
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true }));
    await inner.waitForTimeout(100);
    if (!(await inner.locator("#hd").getAttribute("class"))?.includes("selected")) {
      throw new Error("Settings refresh discarded manual quality ownership");
    }
    await inner.evaluate(() => {
      history.pushState({}, "", "/next-lesson");
      document.querySelector("video").dispatchEvent(new Event("loadedmetadata"));
    });
    stage = "next lesson quality";
    await inner.waitForFunction(() => document.querySelector("#ultra").classList.contains("selected"));
    stage = "volume toggle disabled";
    await worker.evaluate(() => chrome.storage.local.set({ volumeEnabled: false }));
    await inner.waitForTimeout(100);
    await inner.evaluate(() => {
      const video = document.createElement("video");
      video.id = "volume-off-video"; video.volume = 0.35;
      document.body.append(video);
      const original = document.createElement("li"); original.id = "original"; original.textContent = "原画";
      document.querySelector(".xgplayer-definition ul").append(original);
    });
    await inner.waitForFunction(() => document.querySelector("#original").classList.contains("selected"));
    if (await inner.evaluate(() => document.querySelector("#volume-off-video").volume) !== 0.35) {
      throw new Error("Disabled volume default still changed a new video");
    }
    if (await inner.evaluate(() => document.querySelector("#player").dataset.xetInteractions) !== "true") {
      throw new Error("Volume toggle disabled player interactions");
    }
    stage = "volume toggle reenabled";
    await worker.evaluate(() => chrome.storage.local.set({ volumeEnabled: true }));
    await inner.waitForFunction(() => document.querySelector("#volume-off-video").volume === 1);
    await inner.evaluate(() => document.querySelector("#volume-off-video").remove());
    stage = "page fullscreen";
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
    stage = "native fullscreen";
    await inner.waitForFunction(() => document.fullscreenElement?.id === "player");
    await fixture.waitForFunction(() => !document.querySelector("iframe").dataset.xetWebFullscreen);
    await root.press("t");
    stage = "native to page fullscreen";
    await inner.waitForFunction(() => !document.fullscreenElement && document.querySelector("#player").dataset.xetWebFullscreen === "true");
    await fixture.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await fixture.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await fixture.keyboard.press("Escape");
    stage = "outer escape";
    await inner.waitForFunction(() => !document.querySelector("#player").dataset.xetWebFullscreen);
    await fixture.waitForFunction(() => !document.querySelector("iframe").dataset.xetWebFullscreen);
    await root.press("t");
    await fixture.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: ["https://merchant.pc.xiaoe-tech.com"] }));
    stage = "outer site disable";
    await inner.waitForFunction(() => !document.querySelector("#player").dataset.xetInteractions);
    await fixture.waitForFunction(() => !document.documentElement.classList.contains("xet-web-fullscreen-active"));
    if (!(await fixture.locator("header").isVisible()) || !(await middle.locator("header").isVisible())) {
      throw new Error("Nested page UI was not restored when the outer site was disabled");
    }
    await inner.evaluate(() => {
      const video = document.createElement("video");
      video.id = "disabled-video"; video.volume = 0.25;
      document.body.append(video);
    });
    await inner.waitForTimeout(100);
    if (await inner.evaluate(() => document.querySelector("#disabled-video").volume) !== 0.25) {
      throw new Error("Outer-site disable did not stop default volume in the child frame");
    }
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    stage = "outer site reenable";
    await inner.waitForFunction(() => document.querySelector("#player").dataset.xetInteractions === "true");
    await inner.waitForFunction(() => document.querySelector("#disabled-video").volume === 1);
    return { realMV3: true, nestedFrames: 2, defaultVolume: true, manualQuality: true, nextLessonDefault: true, originalQuality: true, volumeToggleIndependent: true, qualityToggleIndependent: true, headersHidden, bounds, outerSiteDisable: true, reenabled: true };
  } catch (error) {
    throw new Error(`MV3 integration (${stage}): ${error.message}`);
  } finally {
    await fixture.close();
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true, volumeEnabled: true, disabledSites: [], keepAliveEnabled: false }));
  }
}
