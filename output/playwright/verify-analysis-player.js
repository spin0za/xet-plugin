async (page) => {
  // Use the real xgplayer mobile skin, including its full-picture gradient,
  // rather than mocking the fullscreen button's event handlers.
  const base = "https://unpkg.com/xgplayer@3.0.23/dist/";
  const [jsResponse, cssResponse] = await Promise.all([
    page.request.get(`${base}index.min.js`),
    page.request.get(`${base}index.min.css`),
  ]);
  if (!jsResponse.ok() || !cssResponse.ok()) {
    throw new Error("Could not load the pinned xgplayer regression fixture");
  }
  const playerScript = await jsResponse.text();
  const playerStyle = await cssResponse.text();
  const scripts = [
    "src/site-access.js",
    "src/content/player-dom.js",
    "src/content/volume.js",
    "src/content/download-stream.js",
    "src/content/download.js",
    "src/content/analysis-layout.js",
    "src/content/player-interactions.js",
    "src/content/fullscreen.js",
    "src/content/frame-coordinator.js",
    "src/content/media-shortcuts.js",
    "src/content/quality-preference.js",
    "src/content/quality.js",
    "src/content/toast.js",
    "src/content.js",
  ];
  const testPage = await page.context().newPage();
  try {
    await testPage.route("https://analysis.example/**", (route) => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>
        body { margin: 0; padding: 20px; background: #eee; }
        #_flag4unlimit { display: flex; }
        .image-text-box { width: 450px; max-width: 100%; }
        .xe-preview__content .preview-paragraph { width: 450px; max-width: 100%; }
        #detail_div .xiaoe-iframe-outside,
        #detail_div .xiaoe-iframe-video { height: 470px !important; }
      </style><header>我的已购 / 练习记录</header><div id="detail_div">
        <div id="_flag4unlimit"><div class="image-text-box"><div id="xePreview">
        <div class="xe-preview__container"><div class="xe-preview__content"><div class="preview-paragraph">
        <div class="xiaoe-iframe-outside" style="width:360px;height:470px">
          <iframe class="xiaoe-iframe-video" src="https://embedded.example/portrait"
            width="360" height="470" allow="fullscreen" allowfullscreen></iframe>
        </div>
        <div class="xiaoe-iframe-outside" style="width:800px;height:450px">
          <iframe class="xiaoe-iframe-video" src="https://embedded.example/landscape"
            width="800" height="450" allow="fullscreen" allowfullscreen></iframe>
        </div></div></div></div></div></div></div></div>`,
    }));
    await testPage.route("https://embedded.example/**", (route) => route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>html,body {margin:0;width:100%;height:100%;}</style><div id=player></div>",
    }));
    await testPage.goto("https://analysis.example/p/t_pc/pc_evaluation/practice_analysis/fixture");
    const originalPreviewSize = await testPage.locator("iframe").first().boundingBox();

    const settings = { enabled: true, disabledSites: [], topOrigin: "https://analysis.example" };
    await testPage.exposeBinding("__xetSendMessage", async ({ frame }, message) => {
      if (message.type === "xet:get-settings") return settings;
      if (message.type === "xet:authorize-frame-web") {
        if (message.active && settings.disabledSites.includes(settings.topOrigin)) return { ok: false };
        for (const target of testPage.frames()) {
          await target.evaluate((authorization) => {
            for (const listener of window.runtimeListeners || []) listener(authorization, {}, () => {});
          }, { ...message, type: "xet:arm-frame-web" });
        }
        return { ok: true };
      }
      if (message.type === "xet:test-write") {
        Object.assign(settings, message.changes);
        for (const target of testPage.frames()) {
          await target.evaluate((changes) => {
            for (const listener of window.storageListeners || []) listener(
              Object.fromEntries(Object.entries(changes).map(([key, newValue]) => [key, { newValue }])), "local",
            );
          }, message.changes);
        }
      }
      return { ok: true };
    });

    async function installExtension(frame) {
      await frame.evaluate(() => {
        window.runtimeListeners = [];
        window.storageListeners = [];
        window.chrome = {
          runtime: {
            sendMessage: (message) => window.__xetSendMessage(message),
            onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
          },
          storage: {
            local: {
              get: () => window.__xetSendMessage({ type: "xet:get-settings" }),
              set: (changes) => window.__xetSendMessage({ type: "xet:test-write", changes }),
            },
            onChanged: { addListener: (listener) => storageListeners.push(listener) },
          },
        };
      });
      await frame.addStyleTag({ path: "src/content/fullscreen.css" });
      await frame.addStyleTag({ path: "src/content/download.css" });
      for (const path of scripts) await frame.addScriptTag({ path });
    }

    await installExtension(testPage);
    const frames = testPage.frames().filter((frame) => frame !== testPage.mainFrame());
    for (const frame of frames) {
      await frame.addStyleTag({ content: playerStyle });
      await frame.addScriptTag({ content: playerScript });
      await frame.evaluate(async () => {
        window.player = new Player({
          id: "player", url: "", width: "100%", height: "100%",
          isMobileSimulateMode: "mobile",
          videoInit: false,
        });
        await player.start();
        // A local stream exercises real play/pause and metadata events without
        // borrowing a course URL or accessing authenticated media.
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext("2d");
        function draw() {
          context.fillStyle = "#fff";
          context.fillRect(0, 0, 1280, 720);
          context.fillStyle = "#111";
          context.font = "48px sans-serif";
          context.fillText("Landscape analysis video — 16:9", 100, 300);
          context.fillRect(0, 718, 1280, 2);
          context.fillRect(0, 0, 3, 3);
          context.fillRect(1277, 0, 3, 3);
          requestAnimationFrame(draw);
        }
        draw();
        player.video.srcObject = canvas.captureStream(15);
        await player.video.play();
      });
      await installExtension(frame);
    }

    const layouts = [];
    for (const viewport of [{ width: 1280, height: 900 }, { width: 620, height: 900 }]) {
      await testPage.setViewportSize(viewport);
      const sizes = await testPage.locator("iframe").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      if (sizes.some(({ width, height }) => Math.abs(width / height - 16 / 9) > .01)) {
        throw new Error(`Previews are not landscape: ${JSON.stringify(sizes)}`);
      }
      const expectedWidth = Math.min(960, viewport.width - 40);
      if (sizes.some(({ width }) => Math.abs(width - expectedWidth) > 1)) {
        throw new Error(`Rich-text width still limits previews: ${JSON.stringify(sizes)}`);
      }
      layouts.push({ viewport, sizes });
    }
    await testPage.setViewportSize({ width: 1280, height: 900 });
    const frame = frames[0];
    const player = frame.locator("#player");
    const button = frame.locator(".xgplayer-fullscreen");
    await frame.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-embed"));
    const previewCrop = await frame.evaluate(() => ({
      transform: getComputedStyle(player.video).transform,
      overflow: getComputedStyle(document.querySelector("#player")).overflow,
      fit: getComputedStyle(player.video).objectFit,
    }));
    if (previewCrop.transform !== "matrix(1.02, 0, 0, 1.02, 0, 0)" ||
        previewCrop.overflow !== "hidden" || previewCrop.fit !== "cover") {
      throw new Error(`Preview rim not cropped: ${JSON.stringify(previewCrop)}`);
    }
    const pictureClicks = [];
    async function verifyPictureClicks(mode) {
      await frame.evaluate(() => {
        window.mediaEvents = [];
        if (!window.mediaEventsInstalled) {
          for (const name of ["play", "pause"]) {
            player.video.addEventListener(name, () => mediaEvents.push(name));
          }
          window.mediaEventsInstalled = true;
        }
      });
      for (const x of [.3, .7]) {
        const before = await frame.evaluate(() => player.video.paused);
        const size = await player.boundingBox();
        await player.click({ position: { x: size.width * x, y: size.height * .35 } });
        await frame.waitForFunction((paused) => player.video.paused !== paused, before);
        await frame.waitForTimeout(250);
        if (await frame.evaluate(() => player.video.paused) === before) {
          throw new Error(`${mode} picture click toggled playback twice`);
        }
      }
      const events = await frame.evaluate(() => mediaEvents);
      if (events.join(",") !== "pause,play") throw new Error(`${mode} unexpected events: ${events}`);
      pictureClicks.push({ mode, events });
    }
    async function verifyAutoHide(mode) {
      const size = await player.boundingBox();
      await player.hover({ position: { x: size.width * .6, y: size.height * .4 } });
      await frame.waitForFunction(() => player.root.dataset.xetControlsHidden === "true", null, { timeout: 5000 });
      const hidden = await fullscreenState();
      if (hidden.controlsVisible || hidden.controlOpacity !== "0") {
        throw new Error(`${mode} controls did not hide: ${JSON.stringify(hidden)}`);
      }
      if (mode === "preview" || mode === "native fullscreen") {
        await player.screenshot({ path: `output/playwright/analysis-${mode === "preview" ? "preview" : "fullscreen"}.png` });
      }
      await player.hover({ position: { x: size.width * .65, y: size.height * .4 } });
      if (!(await fullscreenState()).controlsVisible) throw new Error(`${mode} movement did not restore controls`);
      return { mode, hidden: !hidden.controlsVisible };
    }
    await verifyPictureClicks("preview");
    await verifyAutoHide("preview");
    await frame.locator(".xgplayer-play").click();
    await frame.waitForFunction(() => player.video.paused);
    await testPage.keyboard.press("Space");
    await frame.waitForFunction(() => !player.video.paused);
    await frame.locator(".xgplayer-controls").hover();
    await button.click();
    await frame.waitForFunction(() => document.fullscreenElement?.id === "player");

    async function fullscreenState() {
      await frame.waitForTimeout(180); // Allow the short control-strip fade to finish.
      return frame.evaluate(() => {
        const root = document.querySelector("#player");
        const controls = root.querySelector(".xgplayer-controls");
        if (!controls || !root.querySelector("video")) {
          throw new Error(`Missing player subtree: ${root.outerHTML.slice(0,1500)}`);
        }
        const rect = root.getBoundingClientRect();
        const controlRect = controls.getBoundingClientRect();
        const style = getComputedStyle(controls);
        return {
          target: document.fullscreenElement?.id,
          videoFit: getComputedStyle(root.querySelector("video")).objectFit,
          gradient: root.querySelector(".gradient")
            ? getComputedStyle(root.querySelector(".gradient")).display : "none",
          controlsVisible: style.display !== "none" && style.opacity === "1" &&
            style.visibility === "visible" && controlRect.bottom <= rect.bottom + 1,
          controlHeight: controlRect.height,
          controlBottom: controlRect.bottom,
          rootBottom: rect.bottom,
          controlOpacity: style.opacity,
          controlVisibility: style.visibility,
          width: rect.width, height: rect.height,
        };
      });
    }
    const buttonFullscreen = await fullscreenState();
    await testPage.keyboard.press("f");
    await frame.waitForFunction(() => !document.fullscreenElement);
    await player.locator(".xgplayer-controls").waitFor({ state: "visible" });
    await testPage.keyboard.press("f");
    await frame.waitForFunction(() => document.fullscreenElement?.id === "player");
    const keyboardFullscreen = await fullscreenState();
    if (JSON.stringify(buttonFullscreen) !== JSON.stringify(keyboardFullscreen) ||
        buttonFullscreen.gradient !== "none" || !buttonFullscreen.controlsVisible ||
        buttonFullscreen.controlHeight !== 48 || buttonFullscreen.videoFit !== "contain") {
      throw new Error(`Different or obscured fullscreen: ${JSON.stringify({buttonFullscreen, keyboardFullscreen})}`);
    }
    await verifyPictureClicks("native fullscreen");
    const autoHide = [await verifyAutoHide("native fullscreen")];
    await frame.locator(".xgplayer-controls").hover();
    await frame.waitForTimeout(3300);
    if (!(await fullscreenState()).controlsVisible) throw new Error("Hovered controls disappeared");
    await button.click();
    await frame.waitForFunction(() => !document.fullscreenElement);

    // Repeat exit through the browser API (the same fullscreenchange fired by
    // Escape), and test cross-mode transitions from the embedded player.
    await testPage.keyboard.press("f");
    await frame.waitForFunction(() => document.fullscreenElement);
    await frame.evaluate(() => document.exitFullscreen());
    await frame.waitForFunction(() => !document.fullscreenElement);
    await testPage.keyboard.press("t");
    await frame.waitForFunction(() => document.querySelector("#player").dataset.xetWebFullscreen === "true");
    await testPage.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    const embeddedWeb = [];
    for (const viewport of [{ width: 1280, height: 900 }, { width: 720, height: 600 }]) {
      await testPage.setViewportSize(viewport);
      await frame.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, viewport);
      const dimensions = await player.boundingBox();
      const headerVisible = await testPage.locator("header").isVisible();
      if (Math.abs(dimensions.width - viewport.width) > 1 ||
          Math.abs(dimensions.height - viewport.height) > 1 || headerVisible) {
        throw new Error(`Iframe did not fill outer page: ${JSON.stringify({viewport, dimensions, headerVisible})}`);
      }
      embeddedWeb.push({ viewport, dimensions, headerVisible });
    }
    await testPage.setViewportSize({ width: 1280, height: 900 });
    await verifyPictureClicks("page fullscreen");
    autoHide.push(await verifyAutoHide("page fullscreen"));
    await button.click();
    await frame.waitForFunction(() => document.fullscreenElement?.id === "player");
    await testPage.keyboard.press("t");
    await frame.waitForFunction(() => !document.fullscreenElement &&
      document.querySelector("#player").dataset.xetWebFullscreen === "true");
    await testPage.keyboard.press("Escape");
    await frame.waitForFunction(() => !document.querySelector("#player").dataset.xetWebFullscreen);
    await testPage.waitForFunction(() => !document.querySelector("iframe").dataset.xetWebFullscreen);

    await frame.evaluate(() => window.parent.postMessage({
      type: "xet:frame-web", active: true, token: "00000000-0000-4000-8000-000000000000",
    }, "*"));
    await testPage.waitForTimeout(80);
    if (await testPage.locator("iframe").first().getAttribute("data-xet-web-fullscreen")) {
      throw new Error("Unauthenticated page message elevated an iframe");
    }
    await player.press("t");
    await testPage.waitForFunction(() => document.querySelector("iframe").dataset.xetWebFullscreen === "true");
    await testPage.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await testPage.keyboard.press("Escape");
    await frame.waitForFunction(() => !document.querySelector("#player").dataset.xetWebFullscreen);
    await testPage.waitForFunction(() => !document.querySelector("iframe").dataset.xetWebFullscreen);

    await frame.evaluate(() => player.video.pause());
    await frame.waitForFunction(() => player.root.dataset.xetControlsHidden === "false");
    await frame.waitForTimeout(3300);
    const restored = await frame.evaluate(() => {
      const root = document.querySelector("#player");
      const controls = root.querySelector(".xgplayer-controls");
      root.classList.add("xgplayer-inactive");
      const style = getComputedStyle(controls);
      const rect = controls.getBoundingClientRect();
      const buttonsVisible = [".xgplayer-play", ".xgplayer-volume", ".xgplayer-fullscreen"]
        .every((selector) => {
          const button = root.querySelector(selector);
          const bounds = button.getBoundingClientRect();
          return button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
            bounds.width > 0 && bounds.height > 0;
        });
      return { controlsVisible: style.display !== "none" && style.opacity === "1" &&
        style.visibility === "visible" && rect.height > 0 && buttonsVisible,
        playerWidth: root.getBoundingClientRect().width,
        playerHeight: root.getBoundingClientRect().height };
    });
    if (!restored.controlsVisible || Math.abs(restored.playerWidth / restored.playerHeight - 16 / 9) > .01) {
      throw new Error(`Preview did not recover: ${JSON.stringify(restored)}`);
    }

    // Initial mobile posters may not contain a <video> at all. A picture click
    // should still initiate the SDK's normal start action, outside its icon.
    const deferredFrame = frames[1];
    await deferredFrame.evaluate(() => {
      player.destroy();
      document.body.innerHTML = "<div id=deferred></div>";
      window.deferred = new Player({
        id: "deferred", url: "", width: "100%", height: "100%",
        isMobileSimulateMode: "mobile", videoInit: false,
      });
    });
    await deferredFrame.locator("#deferred").click({ position: { x: 70, y: 70 } });
    await deferredFrame.waitForFunction(() => Boolean(document.querySelector("#deferred video")), null, { timeout: 4000 });

    // Route changes should restore other pages and cover subsequently inserted
    // embeds without requiring a fresh extension injection.
    await testPage.evaluate(() => history.pushState({}, "", "/course/portrait"));
    await testPage.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-layout"));
    await frame.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-embed"));
    if (await frame.evaluate(() => getComputedStyle(player.video).transform) !== "none") {
      throw new Error("Preview crop leaked onto a non-analysis page");
    }
    const otherPageSize = await testPage.locator("iframe").first().boundingBox();
    if (otherPageSize.width !== originalPreviewSize.width ||
        otherPageSize.height !== originalPreviewSize.height) {
      throw new Error("Analysis layout leaked onto another page");
    }
    await testPage.evaluate(() => {
      history.pushState({}, "", "/p/t_pc/pc_evaluation/exam_analysis/fixture");
      document.querySelector("#detail_div").append(
        document.querySelector(".xiaoe-iframe-outside").cloneNode(true),
      );
    });
    await testPage.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-layout"));
    const newSize = await testPage.locator("iframe").last().boundingBox();
    if (Math.abs(newSize.width / newSize.height - 16 / 9) > .01) {
      throw new Error("New analysis embed did not inherit landscape layout");
    }

    // Disabling the site must release both layout and fullscreen enhancement.
    await testPage.evaluate(() => chrome.storage.local.set({ disabledSites: [location.origin] }));
    const disabled = await testPage.evaluate(() => document.documentElement.hasAttribute("data-xet-analysis-layout"));
    const remainingMarkers = await player.evaluate((root) => Array.from(root.attributes)
      .filter((attribute) => attribute.name.startsWith("data-xet-"))
      .map((attribute) => attribute.name));
    if (disabled || remainingMarkers.length) throw new Error(`Site disable did not restore original styling: ${remainingMarkers}`);
    return { layouts, previewCrop, pictureClicks, autoHide, embeddedWeb, buttonFullscreen, keyboardFullscreen, restored, disabled };
  } finally {
    await testPage.close();
  }
}
