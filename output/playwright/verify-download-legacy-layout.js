async (page) => {
  const fixture = await page.context().newPage();
  try {
    // Also cover a custom merchant skin with legacy, directly right-floated
    // controls, larger SVG frames, and no v3 right-hand flex grid.
    await fixture.setContent(`<!doctype html><style>
      body{margin:16px;background:#ddd}
      .xgplayer{position:relative;width:800px;height:450px;background:#222}
      video{width:100%;height:100%}
      .xgplayer-controls{position:absolute;bottom:0;width:100%;height:48px;color:#fff}
      .xgplayer-controls > xg-icon{float:right;height:40px;margin:0 20px 0 0}
      .xgplayer-icon, .xgplayer-icon svg{display:block;width:32px;height:40px}
    </style><div id=player class=xgplayer><video></video><div class=xgplayer-controls>
      <xg-icon class=xgplayer-fullscreen><div class=xgplayer-icon><svg viewBox="0 0 32 40"></svg></div></xg-icon>
      <xg-icon class=xgplayer-cssfullscreen><div class=xgplayer-icon><svg viewBox="0 0 32 40"></svg></div></xg-icon>
      <xg-icon class=xgplayer-volume><div class=xgplayer-icon><svg viewBox="0 0 32 40"></svg></div></xg-icon>
    </div></div>`);
    await fixture.addStyleTag({ path: "src/content/download.css" });
    for (const path of ["src/content/player-dom.js", "src/content/download-stream.js", "src/content/download.js"]) await fixture.addScriptTag({ path });
    await fixture.evaluate(() => {
      window.downloadController = __xetPlayerHelperModules.download.createDownloadController({ playerDom: __xetPlayerHelperModules.playerDom });
      downloadController.start();
    });
    const button = fixture.locator(".xet-download-button");
    await button.waitFor({ timeout: 5000 });
    const sizes = [];
    for (const width of [800, 360]) {
      await fixture.evaluate(width => { player.style.width = `${width}px`; player.style.height = `${width * 9 / 16}px`; }, width);
      await button.hover();
      const geometry = await fixture.evaluate(() => {
        const box = element => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const button = document.querySelector(".xet-download-button");
        const volume = document.querySelector(".xgplayer-volume");
        return { button: box(button), icon: box(button.querySelector("svg")),
          volume: box(volume), nativeIcon: box(volume.querySelector(".xgplayer-icon")),
          fullscreen: box(document.querySelector(".xgplayer-cssfullscreen")), root: box(player),
          background: getComputedStyle(button).backgroundColor, padding: getComputedStyle(button).padding };
      });
      const { button: b, icon, volume, nativeIcon, fullscreen, root } = geometry;
      const leftGap = b.x - volume.x - volume.width, rightGap = fullscreen.x - b.x - b.width;
      if (leftGap < 0 || Math.abs(leftGap - rightGap) > 1 || b.width !== nativeIcon.width || b.height !== nativeIcon.height ||
          b.y !== nativeIcon.y || icon.width !== b.width || geometry.background !== "rgba(0, 0, 0, 0)" || geometry.padding !== "0px" ||
          b.x < root.x || b.x + b.width > root.x + root.width || b.y + b.height > root.y + root.height) {
        throw new Error(`Legacy download layout mismatch: ${JSON.stringify({ leftGap, rightGap, geometry })}`);
      }
      sizes.push({ width, bounds: b, leftGap, rightGap, matchesNativeIcon: true, transparentHover: true });
    }
    await fixture.evaluate(() => downloadController.stop());
    if (await button.count()) throw new Error("Stop did not remove legacy download UI");
    return { legacyRightFloats: true, customSkin: true, sizes, stopped: true };
  } finally { await fixture.close(); }
}
