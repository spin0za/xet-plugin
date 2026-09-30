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
    "src/content/analysis-layout.js",
    "src/content/fullscreen.js",
    "src/content/media-shortcuts.js",
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
        #detail_div .xiaoe-iframe-outside,
        #detail_div .xiaoe-iframe-video { height: 470px !important; }
      </style><header>我的已购 / 练习记录</header><div id="detail_div">
        <div class="xiaoe-iframe-outside" style="width:360px;height:470px">
          <iframe class="xiaoe-iframe-video" src="https://embedded.example/portrait"
            width="360" height="470" allow="fullscreen" allowfullscreen></iframe>
        </div>
        <div class="xiaoe-iframe-outside" style="width:800px;height:450px">
          <iframe class="xiaoe-iframe-video" src="https://embedded.example/landscape"
            width="800" height="450" allow="fullscreen" allowfullscreen></iframe>
        </div></div>`,
    }));
    await testPage.route("https://embedded.example/**", (route) => route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>html,body {margin:0;width:100%;height:100%;}</style><div id=player></div>",
    }));
    await testPage.goto("https://analysis.example/p/t_pc/pc_evaluation/practice_analysis/fixture");
    const originalPreviewSize = await testPage.locator("iframe").first().boundingBox();

    async function installExtension(frame) {
      await frame.evaluate(() => {
        const settings = { enabled: true, disabledSites: [] };
        const listeners = [];
        window.chrome = {
          runtime: { sendMessage: async () => settings },
          storage: {
            local: {
              get: async () => settings,
              set: async (changes) => {
                Object.assign(settings, changes);
                listeners.forEach((listener) => listener(
                  Object.fromEntries(Object.entries(changes).map(
                    ([key, newValue]) => [key, { newValue }],
                  )), "local",
                ));
              },
            },
            onChanged: { addListener: (listener) => listeners.push(listener) },
          },
        };
      });
      await frame.addStyleTag({ path: "src/content/fullscreen.css" });
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
      layouts.push({ viewport, sizes });
    }
    await testPage.setViewportSize({ width: 1280, height: 900 });
    const frame = frames[0];
    const player = frame.locator("#player");
    const button = frame.locator(".xgplayer-fullscreen");
    await frame.locator(".xgplayer-controls").hover();
    await button.click();
    await frame.waitForFunction(() => document.fullscreenElement?.id === "player");

    async function fullscreenState() {
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
    await button.click();
    await frame.waitForFunction(() => document.fullscreenElement?.id === "player");
    await testPage.keyboard.press("t");
    await frame.waitForFunction(() => !document.fullscreenElement &&
      document.querySelector("#player").dataset.xetWebFullscreen === "true");
    await testPage.keyboard.press("Escape");
    await frame.waitForFunction(() => !document.querySelector("#player").dataset.xetWebFullscreen);

    const restored = await frame.evaluate(() => {
      const root = document.querySelector("#player");
      const controls = root.querySelector(".xgplayer-controls");
      player.video.pause();
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

    // Route changes should restore other pages and cover subsequently inserted
    // embeds without requiring a fresh extension injection.
    await testPage.evaluate(() => history.pushState({}, "", "/course/portrait"));
    await testPage.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-layout"));
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
    await frame.evaluate(() => chrome.storage.local.set({ disabledSites: [location.origin] }));
    const disabled = await testPage.evaluate(() => document.documentElement.hasAttribute("data-xet-analysis-layout"));
    const nativeManagedAfterDisable = await player.getAttribute("data-xet-native-managed");
    if (disabled || nativeManagedAfterDisable) throw new Error("Site disable did not restore original styling");
    return { layouts, buttonFullscreen, keyboardFullscreen, restored, disabled };
  } finally {
    await testPage.close();
  }
}
