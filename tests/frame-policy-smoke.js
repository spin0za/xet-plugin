const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const topOrigin = "https://merchant.pc.xiaoe-tech.com";
  const ownOrigin = "https://player.xiaoeknow.com";
  let settings = { enabled: true, disabledSites: [], topOrigin };
  let storageListener;
  const calls = { start: 0, stop: 0 };
  const volumeCalls = { start: 0, stop: 0 };
  const controller = () => ({ start: () => calls.start++, stop: () => calls.stop++, wake() {} });
  const modules = {
    playerDom: { findActivePlayer: () => null },
    analysisLayout: { createAnalysisLayoutController: controller },
    playerInteractions: {},
    fullscreen: { createFullscreenController: controller },
    frameCoordinator: { createFrameCoordinator: () => ({ ...controller(), publish() {} }) },
    mediaShortcuts: { createShortcutController: controller },
    qualityPreference: {},
    quality: { createQualityController: controller },
    downloadStream: {},
    download: { createDownloadController: controller },
    volume: { createVolumeController: () => ({
      start() { calls.start++; volumeCalls.start++; },
      stop() { calls.stop++; volumeCalls.stop++; },
    }) },
    toast: { show() {}, hide() {} },
  };
  const window = { top: {} };
  const context = {
    window, location: { origin: ownOrigin }, console,
    __xetPlayerHelperModules: modules,
    XetSiteAccess: { normalizeDisabledSites: (sites) => sites || [] },
    chrome: {
      runtime: { sendMessage: async () => settings, onMessage: { addListener() {} } },
      storage: {
        local: { get: async () => settings },
        onChanged: { addListener: (listener) => { storageListener = listener; } },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync("src/content.js", "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(calls.start, 7);
  storageListener({ disabledSites: { newValue: [topOrigin] } }, "local");
  assert.equal(calls.stop, 7, "outer-page disable must stop every child feature");
  storageListener({ disabledSites: { newValue: [] } }, "local");
  assert.equal(calls.start, 14);
  storageListener({ disabledSites: { newValue: [ownOrigin] } }, "local");
  assert.equal(calls.stop, 14, "child-site disable must also remain effective");
  storageListener({ disabledSites: { newValue: [] } }, "local");
  const otherFeatureStops = () => calls.stop - volumeCalls.stop;
  const previousOtherStops = otherFeatureStops();
  storageListener({ volumeEnabled: { newValue: false } }, "local");
  assert.equal(otherFeatureStops(), previousOtherStops, "volume toggle must not stop shortcuts or quality");
  const previousVolumeStarts = volumeCalls.start;
  storageListener({ enabled: { newValue: false } }, "local");
  assert.equal(volumeCalls.start, previousVolumeStarts, "quality refresh must not reenable disabled volume");
  storageListener({ volumeEnabled: { newValue: true } }, "local");
  assert.equal(volumeCalls.start, previousVolumeStarts + 1, "volume can start while quality is off");

  settings = { error: "storage unavailable" };
  const before = calls.start;
  const unavailable = { ...context, window: { top: {} } };
  vm.runInNewContext(fs.readFileSync("src/content.js", "utf8"), unavailable);
  await new Promise(setImmediate);
  assert.equal(calls.start, before, "unknown child policy must fail closed");
  console.log("frame policy smoke test passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
