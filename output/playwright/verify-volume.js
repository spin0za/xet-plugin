async (page) => {
  const fixture = await page.context().newPage();
  try {
    await fixture.route("https://volume-fixture.test/**", (route) => route.fulfill({
      contentType: "text/html", body: "<!doctype html><video id=native controls></video><div class=xgplayer><video id=sdk></video></div><div id=shadow></div>",
    }));
    await fixture.goto("https://volume-fixture.test/course/a");
    await fixture.evaluate(() => {
      const count = 8000;
      const buffer = new ArrayBuffer(44 + count * 2);
      const view = new DataView(buffer);
      const text = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVEfmt ");
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, count * 2, true);
      window.source = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
      native.volume = 0.3; sdk.volume = 0.4;
      shadow.attachShadow({ mode: "open" });
    });
    for (const path of ["src/content/player-dom.js", "src/content/volume.js"]) await fixture.addScriptTag({ path });
    await fixture.evaluate(() => {
      window.volumeController = __xetPlayerHelperModules.volume.createVolumeController({ playerDom: __xetPlayerHelperModules.playerDom });
      volumeController.start();
      // Some SDKs attach their load handlers after the content script starts.
      sdk.addEventListener("loadedmetadata", () => { sdk.volume = 0.35; });
      native.src = source; sdk.src = source;
      const video = document.createElement("video");
      video.volume = 0.2; video.muted = true;
      video.addEventListener("loadedmetadata", () => { video.volume = 0.15; });
      shadow.shadowRoot.append(video);
      video.src = source;
    });
    await fixture.waitForFunction(() => native.readyState >= 1 && sdk.readyState >= 1 && shadow.shadowRoot.querySelector("video").readyState >= 1);
    await fixture.waitForFunction(() => [native, sdk, shadow.shadowRoot.querySelector("video")].every(v => v.volume === 1), null, { timeout: 3000 });
    const initialized = await fixture.evaluate(() => ({ native: native.volume, sdk: sdk.volume, shadow: shadow.shadowRoot.querySelector("video").volume, muted: shadow.shadowRoot.querySelector("video").muted }));
    await fixture.evaluate(() => { native.volume = 0.2; native.muted = true; native.load(); });
    await fixture.waitForFunction(() => native.readyState >= 1);
    await fixture.waitForTimeout(100);
    const manual = await fixture.evaluate(() => ({ volume: native.volume, muted: native.muted }));
    if (manual.volume !== 0.2 || !manual.muted) throw new Error("Quality reload overrode manual volume/mute");
    await fixture.evaluate(() => { history.pushState({}, "", "/course/b"); native.load(); });
    await fixture.waitForFunction(() => native.readyState >= 1 && native.volume === 1);
    await fixture.evaluate(() => {
      volumeController.stop();
      const v = document.createElement("video"); v.id = "disabled"; v.volume = 0.25;
      document.body.append(v); v.src = source;
    });
    await fixture.waitForFunction(() => disabled.readyState >= 1);
    if (await fixture.evaluate(() => disabled.volume) !== 0.25) throw new Error("Disabled controller changed a new video");
    await fixture.evaluate(() => volumeController.start());
    await fixture.waitForFunction(() => disabled.volume === 1);
    await fixture.evaluate(() => {
      volumeController.stop();
      URL.revokeObjectURL(source);
    });
    return { initialized, manual, spaNavigation: true, disabled: true, reenabled: true };
  } finally { await fixture.close(); }
}
