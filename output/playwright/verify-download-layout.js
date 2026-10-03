async (page) => {
  const fixture = await page.context().newPage();
  try {
    const [script, style] = await Promise.all([
      page.request.get("https://unpkg.com/xgplayer@3.0.23/dist/index.min.js"),
      page.request.get("https://unpkg.com/xgplayer@3.0.23/dist/index.min.css"),
    ]);
    if (!script.ok() || !style.ok()) throw new Error("Unable to load pinned SDK fixture");
    await fixture.route("https://download-layout.test/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:16px;background:#ddd}</style><div id=player></div>" }));
    await fixture.goto("https://download-layout.test/fixture");
    await fixture.addStyleTag({ content: await style.text() });
    await fixture.addScriptTag({ content: await script.text() });
    await fixture.evaluate(async () => {
      window.player = new Player({ id: "player", url: "", width: 800, height: 450, videoInit: false, autoplay: false });
      await player.start();
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      canvas.getContext("2d").fillRect(0, 0, 320, 180);
      player.video.srcObject = canvas.captureStream(15);
      await player.video.play();
      player.root.dataset.xetInteractions = "true";
    });
    for (const file of ["src/content/fullscreen.css", "src/content/download.css"]) await fixture.addStyleTag({ path: file });
    for (const file of ["src/content/player-dom.js", "src/content/download-stream.js", "src/content/download.js"]) await fixture.addScriptTag({ path: file });
    await fixture.evaluate(() => {
      window.downloadController = __xetPlayerHelperModules.download.createDownloadController({ playerDom: __xetPlayerHelperModules.playerDom });
      downloadController.start();
    });
    const button = fixture.locator(".xet-download-button");
    await button.waitFor({ timeout: 5000 });
    const sizes = [];
    for (const width of [800, 360]) {
      await fixture.evaluate(width => { player.root.style.width = `${width}px`; player.root.style.height = `${width * 9 / 16}px`; }, width);
      const root = await fixture.locator("#player").boundingBox();
      const bounds = await button.boundingBox();
      if (!bounds || bounds.x < root.x || bounds.x + bounds.width > root.x + root.width ||
          bounds.y < root.y || bounds.y + bounds.height > root.y + root.height + 1) {
        throw new Error(`Download control spills outside SDK player: ${JSON.stringify({ root, bounds })}`);
      }
      const geometry = await fixture.evaluate(() => {
        const box = element => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const button = document.querySelector(".xet-download-button");
        const volume = document.querySelector(".xgplayer-volume");
        const fullscreen = document.querySelector(".xgplayer-cssfullscreen");
        return { button: box(button), icon: box(button.querySelector("svg")),
          volume: box(volume), nativeIcon: box(volume.querySelector(".xgplayer-icon")),
          fullscreen: box(fullscreen), margin: getComputedStyle(volume).margin };
      });
      const { button: b, icon, volume, nativeIcon, fullscreen } = geometry;
      if (b.width !== nativeIcon.width || b.height !== nativeIcon.height || icon.width !== nativeIcon.width || icon.height !== nativeIcon.height || b.y !== nativeIcon.y) {
        throw new Error(`Download icon does not match native toolbar geometry: ${JSON.stringify(geometry)}`);
      }
      const leftGap = b.x - volume.x - volume.width;
      const rightGap = fullscreen.x - b.x - b.width;
      if (leftGap < 0 || Math.abs(leftGap - rightGap) > 1) {
        throw new Error(`Download spacing is uneven: ${JSON.stringify({ leftGap, rightGap, geometry })}`);
      }
      await button.hover();
      const hover = await button.evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, shadow: style.boxShadow, padding: style.padding };
      });
      if (hover.background !== "rgba(0, 0, 0, 0)" || hover.shadow !== "none" || hover.padding !== "0px") {
        throw new Error(`Download button has unwanted hover chrome: ${JSON.stringify(hover)}`);
      }
      await button.evaluate(element => { element.dataset.active = "true"; element.querySelector(".xet-download-label").textContent = "99%"; });
      const active = await button.boundingBox();
      if (active.x !== b.x || active.width !== b.width) throw new Error("Download progress shifts neighboring controls");
      await button.evaluate(element => { delete element.dataset.active; element.querySelector(".xet-download-label").textContent = ""; element.blur(); });
      sizes.push({ width, bounds, leftGap, rightGap, matchesNativeIcon: true, transparentHover: true, stableProgress: true });
    }
    // Reproduce the inspected merchant skin, not just the stock SDK. Its
    // late .xgplayer * reset erased our captured 32px left margin. Icons use
    // square frames inside a taller, vertically-centered toolbar wrapper.
    await fixture.evaluate(() => downloadController.stop());
    await fixture.addStyleTag({ content: `
      .xgplayer * { margin: 0; padding: 0; }
      .xgplayer .xg-right-grid > xg-icon { width:24px; height:40px; margin:0 0 0 32px; }
      .xgplayer .xg-right-grid > :is(.xgplayer-volume, .xgplayer-cssfullscreen) > .xgplayer-icon {
        width:24px; height:24px; position:absolute; top:50%; transform:translateY(-50%);
      }
      .xgplayer .xg-right-grid > :is(.xgplayer-volume, .xgplayer-cssfullscreen) > .xgplayer-icon svg { width:24px; height:24px; }
      .xgplayer .xgplayer-volume { order:3; }
      .xgplayer .xgplayer-playbackrate { order:4; }
      .xgplayer .xgplayer-fullscreen { order:-1; }
    ` });
    await fixture.evaluate(() => downloadController.start());
    await button.waitFor({ timeout: 5000 });
    const merchant = [];
    for (const width of [800, 360]) {
      await fixture.evaluate(width => { player.root.style.width = `${width}px`; player.root.style.height = `${width * 9 / 16}px`; }, width);
      const measured = await fixture.evaluate(() => {
        const d = document.querySelector(".xet-download-button").getBoundingClientRect();
        const v = document.querySelector(".xgplayer-volume .xgplayer-icon").getBoundingClientRect();
        const f = document.querySelector(".xgplayer-cssfullscreen .xgplayer-icon").getBoundingClientRect();
        const svg = document.querySelector(".xet-download-button svg");
        const art = svg.querySelector("path").getBBox(), transform = svg.getScreenCTM();
        return { leftGap:d.x-v.right, rightGap:f.x-d.right, width:d.width, height:d.height,
          verticalOffset:d.y-v.y, artworkWidth:art.width * transform.a, viewBox:svg.getAttribute("viewBox") };
      });
      if (measured.leftGap !== 32 || measured.rightGap !== 32 || measured.width !== 24 || measured.height !== 24 ||
          measured.verticalOffset !== 0 || measured.artworkWidth < 19 || measured.viewBox !== "0 0 28 28") {
        throw new Error(`Merchant CSS reset or square icon frame regressed: ${JSON.stringify(measured)}`);
      }
      merchant.push({ viewportWidth:width, ...measured });
    }
    await fixture.evaluate(() => { player.root.style.width = "800px"; player.root.style.height = "450px"; });
    await fixture.mouse.move(0, 0);
    await fixture.screenshot({ path: "output/playwright/download-sdk-controls.png" });
    await button.hover();
    await fixture.screenshot({ path: "output/playwright/download-sdk-hover.png" });
    await fixture.evaluate(() => downloadController.stop());
    if (await button.count()) throw new Error("Stop did not remove download UI");
    return { realSdk: "3.0.23", sizes, merchant, noOverflow: true, stopped: true };
  } catch (error) {
    const details = await fixture.evaluate(() => ({
      videos: document.querySelectorAll('video').length, controls: document.querySelectorAll('.xgplayer-controls, xg-controls').length,
      button: document.querySelector('.xet-download-button')?.outerHTML,
      root: document.querySelector('#player')?.className,
    }));
    throw new Error(`${error.message}: ${JSON.stringify(details)}`);
  } finally { await fixture.close(); }
}
