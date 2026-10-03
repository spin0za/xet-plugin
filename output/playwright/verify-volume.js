async (page) => {
  const fixture = await page.context().newPage();
  try {
    await fixture.route("https://volume-fixture.test/**", (route) => route.fulfill({
      contentType: "text/html", body: `<!doctype html><video id=native controls></video><div class=xgplayer><video id=sdk></video></div><div id=shadow></div>
        <div class=pc-live-player id=liveRoot><video id=live></video><div class=mute-btn><div class=volume-range>
          <input id=liveVolume type=range min=0 max=100 value=50></div><button id=liveMute>Mute</button></div>
          <input id=seek type=range min=0 max=100 value=33></div>
        <div class=pc-live-player id=lateRoot><video id=late></video></div>
        <div class=pc-live-player id=mutedRoot><video id=mutedLive muted></video><div class=mute-btn><div class=volume-range>
          <input id=mutedVolume type=range min=0 max=100 value=0></div></div></div>`,
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
      live.volume = 0.5;
      window.liveState = { currentVolume: 50, beforeMuteVolume: 0, isMute: false };
      // Same DOM event contract as the merchant's live player; the SDK keeps
      // these values separately and never listens to native volumechange.
      const updateLiveVolume = (event) => {
        liveState.currentVolume = Number(event.target.value);
        liveState.beforeMuteVolume = liveState.currentVolume;
        liveState.isMute = liveState.currentVolume === 0;
        live.volume = liveState.currentVolume / 100;
        live.muted = liveState.isMute;
        liveVolume.style.background = `linear-gradient(to right, blue ${liveState.currentVolume}%, grey 0%)`;
      };
      liveVolume.addEventListener("input", updateLiveVolume);
      liveVolume.addEventListener("change", updateLiveVolume);
      liveMute.addEventListener("click", () => {
        liveState.isMute = !liveState.isMute;
        liveState.currentVolume = liveState.isMute ? 0 : liveState.beforeMuteVolume;
        liveVolume.value = liveState.currentVolume;
        live.muted = liveState.isMute;
      });
      mutedVolume.addEventListener("input", () => { mutedLive.muted = false; });
    });
    for (const path of ["src/content/player-dom.js", "src/content/volume.js"]) await fixture.addScriptTag({ path });
    await fixture.evaluate(() => {
      window.volumeController = __xetPlayerHelperModules.volume.createVolumeController({ playerDom: __xetPlayerHelperModules.playerDom });
      volumeController.start();
      // Some SDKs attach their load handlers after the content script starts.
      sdk.addEventListener("loadedmetadata", () => { sdk.volume = 0.35; });
      native.src = source; sdk.src = source;
      live.src = source; late.src = source; mutedLive.src = source;
      const video = document.createElement("video");
      video.volume = 0.2; video.muted = true;
      video.addEventListener("loadedmetadata", () => { video.volume = 0.15; });
      shadow.shadowRoot.append(video);
      video.src = source;
    });
    await fixture.waitForFunction(() => native.readyState >= 1 && sdk.readyState >= 1 && shadow.shadowRoot.querySelector("video").readyState >= 1);
    await fixture.waitForFunction(() => [native, sdk, shadow.shadowRoot.querySelector("video")].every(v => v.volume === 1), null, { timeout: 3000 });
    const initialized = await fixture.evaluate(() => ({ native: native.volume, sdk: sdk.volume, shadow: shadow.shadowRoot.querySelector("video").volume, muted: shadow.shadowRoot.querySelector("video").muted }));
    await fixture.waitForFunction(() => liveVolume.value === "100" && liveState.beforeMuteVolume === 100);
    if (await fixture.evaluate(() => live.volume !== 1 || liveState.currentVolume !== 100 || seek.value !== "33")) {
      throw new Error("Live control state was not synchronized, or a seek slider was modified");
    }
    if (await fixture.evaluate(() => !mutedLive.muted || mutedVolume.value !== "0")) {
      throw new Error("Live volume initialization forced unmuting");
    }
    // Controls can be mounted after metadata, including inside an added wrapper.
    await fixture.evaluate(() => {
      const wrapper = document.createElement("div"); wrapper.className = "mute-btn";
      wrapper.innerHTML = '<div class=volume-range><input id=lateVolume type=range min=0 max=100 value=50></div>';
      wrapper.addEventListener("input", event => { late.volume = Number(event.target.value) / 100; });
      lateRoot.append(wrapper);
    });
    await fixture.waitForFunction(() => lateVolume.value === "100" && late.volume === 1);
    await fixture.locator("#liveMute").click();
    if (!await fixture.evaluate(() => live.muted)) throw new Error("Live mute failed");
    await fixture.locator("#liveMute").click();
    if (await fixture.evaluate(() => live.muted || liveState.currentVolume !== 100)) {
      throw new Error("Unmuting restored the stale 50% live volume");
    }
    await fixture.locator("#liveVolume").press("Home");
    await fixture.locator("#liveVolume").press("ArrowRight");
    await fixture.evaluate(() => live.load());
    await fixture.waitForTimeout(100);
    if (await fixture.evaluate(() => live.volume !== 0.01 || liveVolume.value !== "1")) {
      throw new Error("Live quality reload overrode trusted manual volume");
    }
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
    return { initialized, manual, liveSlider: true, lateLiveControls: true, liveManualVolumeAndMute: true,
      spaNavigation: true, disabled: true, reenabled: true };
  } finally { await fixture.close(); }
}
