async (page) => {
  // Start download-fixture-server.js before this browser regression.
  const fixtureServer = "http://127.0.0.1:4181";
  if (!(await page.request.get(`${fixtureServer}/health`)).ok()) throw new Error("Start the local media fixture server");
  const worker = page.context().serviceWorkers().find(item => item.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("This test requires the real extension in an isolated test profile");
  const fixture = await page.context().newPage();
  let stage = "fixture generation";
  try {
    let slow = false;
    await fixture.route("https://merchant.pc.xiaoe-tech.com/**", async route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      if (name === "lesson") return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><title>下载测试课程</title>
        <style>body{margin:20px}.xgplayer{position:relative;background:#222;width:800px;height:450px}
        video{width:100%;height:100%}.xgplayer-controls{position:absolute;bottom:0;left:0;right:0;height:48px;background:#333;display:flex;align-items:center}
        .xg-right-grid{display:flex;margin-left:auto;height:100%;align-items:center}button{margin:4px}</style>
        <div id=component><div id=player class=xgplayer tabindex=0><video></video><div class=xgplayer-controls>
        <button class=xgplayer-play>播放</button><div class=xg-right-grid><button class=xgplayer-fullscreen>全屏</button></div></div></div></div>
        <script>
        const video=document.querySelector('video');
        video.src=URL.createObjectURL(new Blob(['placeholder']));
        component.__vue__={player:{curDefinition:{url:location.origin+'/list.m3u8'}}};
        window.sdkSpaceEvents=0;
        document.addEventListener('keydown',event=>{if(event.code==='Space')sdkSpaceEvents++});
        </script>` });
      if (slow && name.endsWith(".ts")) await new Promise(resolve => setTimeout(resolve, 400));
      const response = await page.request.get(`${fixtureServer}/${name}`);
      return route.fulfill({ status: response.status(), body: await response.body(),
        contentType: name.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : name.endsWith("mp4") ? "video/mp4" : "application/octet-stream" });
    });
    await worker.evaluate(() => chrome.storage.local.set({ enabled: false, volumeEnabled: false, disabledSites: [], keepAliveEnabled: false }));
    await fixture.goto("https://merchant.pc.xiaoe-tech.com/lesson");
    stage = "real extension button";
    const button = fixture.locator(".xet-download-button");
    await button.waitFor();
    const [tabId] = await worker.evaluate(async () => (await chrome.tabs.query({})).filter(tab => tab.url === "https://merchant.pc.xiaoe-tech.com/lesson").map(tab => tab.id));
    if (!tabId) throw new Error("Could not find fixture tab");
    const installSink = async (cancelPicker = false) => worker.evaluate(async ({ tabId, cancelPicker }) => {
      const [probe] = await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: cancel => {
        window.__downloadTest = { chunks: [], closed: false, aborted: false, nativePicker: typeof window.showSaveFilePicker };
        window.showSaveFilePicker = async options => {
          __downloadTest.activated = navigator.userActivation.isActive;
          __downloadTest.filename = options.suggestedName;
          if (cancel) throw new DOMException("Cancelled", "AbortError");
          return { createWritable: async () => ({
            write: async bytes => __downloadTest.chunks.push([...bytes]),
            close: async () => { __downloadTest.closed = true; },
            abort: async () => { __downloadTest.aborted = true; },
          }) };
        };
        return __downloadTest.nativePicker;
      }, args: [cancelPicker] });
      return probe.result;
    }, { tabId, cancelPicker });
    const inspectSink = async () => worker.evaluate(async tabId => {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => window.__downloadTest });
      return result.result;
    }, tabId);
    const nativePicker = await installSink();
    const bounds = await button.boundingBox();
    await button.click();
    stage = "encrypted HLS save";
    await fixture.waitForFunction(() => document.querySelector(".xet-download-status").textContent.startsWith("视频已保存"));
    const saved = await inspectSink();
    if (!saved.closed || saved.aborted || !saved.activated || !saved.chunks.length) throw new Error("Save picker gesture or output failed");
    const probe = await page.request.post(`${fixtureServer}/output.mp4`, { data: { chunks: saved.chunks } });
    if (!probe.ok()) throw new Error(await probe.text());
    const media = await probe.json();
    if (!media.streams.some(stream => stream.codec_name === "h264") || !media.streams.some(stream => stream.codec_name === "aac") ||
        Math.abs(Number(media.format.duration) - 6.2) > 0.2) throw new Error("MP4 output is invalid");
    stage = "browser playback of saved MP4";
    await fixture.evaluate(chunks => {
      document.querySelector('video').src = URL.createObjectURL(new Blob(chunks.map(chunk => new Uint8Array(chunk)), { type: 'video/mp4' }));
    }, saved.chunks);
    await fixture.waitForFunction(() => document.querySelector('video').readyState >= 2 || document.querySelector('video').error);
    stage = "browser MP4 playback";
    await fixture.evaluate(async () => { await document.querySelector('video').play(); });
    await fixture.waitForFunction(() => document.querySelector('video').currentTime > 0.1);
    stage = "browser MP4 seeking";
    await fixture.evaluate(() => { document.querySelector('video').pause(); document.querySelector('video').currentTime = 5; });
    await fixture.waitForFunction(() => document.querySelector('video').currentTime > 4.9 && document.querySelector('video').readyState >= 2);
    stage = "save picker cancellation via Space";
    await installSink(true);
    await button.focus();
    await button.press("Space");
    await fixture.waitForFunction(() => document.querySelector('.xet-download-status').textContent === '已取消下载');
    if (await fixture.evaluate(() => sdkSpaceEvents) !== 0) throw new Error("SDK also handled Space on the download button");
    stage = "in-flight cancellation";
    await fixture.evaluate(() => {
      const video = document.querySelector('video'); video.src=URL.createObjectURL(new Blob(['placeholder']));
    });
    await installSink(); slow = true;
    await button.click();
    await fixture.waitForFunction(() => document.querySelector('.xet-download-status').textContent.startsWith('开始下载'));
    await button.click();
    await fixture.waitForFunction(() => document.querySelector('.xet-download-status').textContent === '已取消下载');
    const cancelled = await inspectSink();
    if (cancelled.closed || !cancelled.aborted) throw new Error("Cancellation committed a partial file");
    stage = "small-file fallback";
    slow = false;
    await worker.evaluate(async tabId => {
      await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func: () => { window.showSaveFilePicker = undefined; } });
    }, tabId);
    const fallbackEvent = fixture.waitForEvent("download");
    await button.click();
    const fallback = await fallbackEvent;
    if (!fallback.suggestedFilename().endsWith(".mp4")) throw new Error("Fallback used an incorrect container extension");
    await fixture.waitForFunction(() => document.querySelector('.xet-download-status').textContent.startsWith('视频已保存'));
    if (await fallback.failure()) throw new Error("Browser rejected the small-file fallback");
    stage = "fullscreen and site disable";
    await fixture.locator("#player").press("f");
    await fixture.waitForFunction(() => document.fullscreenElement?.id === "player");
    if (!(await button.isVisible())) throw new Error("Download button is unavailable in fullscreen");
    await fixture.locator("#player").press("f");
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: ["https://merchant.pc.xiaoe-tech.com"] }));
    await button.waitFor({ state: "detached" });
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await button.waitFor();
    await fixture.screenshot({ path: "output/playwright/download-controls.png" });
    return { realMV3: true, nativePicker, trustedGesture: saved.activated, encryptedHlsMp4: true, browserPlaybackAndSeek: true,
      duration: media.format.duration, bytes: saved.chunks.reduce((sum, chunk) => sum + chunk.length, 0), buttonBounds: bounds, spaceActivation: true, cancelPicker: true,
      cancellation: true, smallFileFallback: true, fullscreen: true, siteDisable: true, siteReenable: true };
  } catch (error) {
    const media = await fixture.evaluate(() => {
      const video = document.querySelector('video');
      return video && { readyState: video.readyState, networkState: video.networkState, duration: video.duration,
        currentTime: video.currentTime, error: video.error && { code: video.error.code, message: video.error.message } };
    }).catch(() => null);
    throw new Error(`Download browser test (${stage}): ${error.message}; ${JSON.stringify(media)}`);
  }
  finally {
    await fixture.close();
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true, volumeEnabled: true, disabledSites: [], keepAliveEnabled: false }));
  }
}
