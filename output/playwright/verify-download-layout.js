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
      sizes.push({ width, bounds });
    }
    await fixture.screenshot({ path: "output/playwright/download-sdk-controls.png" });
    await fixture.evaluate(() => downloadController.stop());
    if (await button.count()) throw new Error("Stop did not remove download UI");
    return { realSdk: "3.0.23", sizes, noOverflow: true, stopped: true };
  } catch (error) {
    const details = await fixture.evaluate(() => ({
      videos: document.querySelectorAll('video').length, controls: document.querySelectorAll('.xgplayer-controls, xg-controls').length,
      button: document.querySelector('.xet-download-button')?.outerHTML,
      root: document.querySelector('#player')?.className,
    }));
    throw new Error(`${error.message}: ${JSON.stringify(details)}`);
  } finally { await fixture.close(); }
}
