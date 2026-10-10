const assert = require("node:assert/strict");
const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const registration = manifest.content_scripts[0];
assert.equal(manifest.minimum_chrome_version, "119", "matchOriginAsFallback requires Chrome 119+");
const expectedScripts = [
  "src/site-access.js",
  "src/content/player-dom.js",
  "src/content/volume.js",
  "src/content/download-stream.js",
  "src/content/download.js",
  "src/content/analysis-layout.js",
  "src/content/analysis-icons.js",
  "src/content/analysis-feedback.js",
  "src/content/analysis-actions.js",
  "src/content/player-interactions.js",
  "src/content/fullscreen.js",
  "src/content/frame-coordinator.js",
  "src/content/media-shortcuts.js",
  "src/content/quality-preference.js",
  "src/content/quality.js",
  "src/content/toast.js",
  "src/content.js",
];

assert.deepEqual(registration.js, expectedScripts);
assert.deepEqual(registration.css, ["src/content/fullscreen.css", "src/content/download.css", "src/content/analysis-actions.css"]);

for (const path of [...registration.js, ...registration.css]) {
  assert.ok(fs.existsSync(path), `${path} should exist`);
}

const entry = fs.readFileSync("src/content.js", "utf8");
assert.ok(entry.split("\n").length < 200, "content.js should remain a small entry");
assert.match(entry, /createFullscreenController/);
assert.match(entry, /createShortcutController/);
assert.match(entry, /createQualityController/);
assert.match(entry, /createVolumeController/);
assert.match(entry, /createDownloadController/);
assert.match(entry, /stopFeatures/);
assert.match(entry, /disabledSites/);

const popup = fs.readFileSync("popup/popup.js", "utf8");
assert.match(popup, /siteAccess\.enableSite/);
assert.match(popup, /siteAccess\.disableSite/);
assert.match(popup, /runtime\.openOptionsPage/);

assert.equal(manifest.options_ui.page, "options/options.html");
assert.ok(fs.existsSync(manifest.options_ui.page));
assert.ok(fs.existsSync("options/options.js"));
assert.ok(fs.existsSync("options/options.css"));

const fullscreenStyle = fs.readFileSync("src/content/fullscreen.css", "utf8");
// Preview contrast belongs to existing bars, never an extra picture overlay.
assert.doesNotMatch(fullscreenStyle, /::before|::after/);
assert.match(fullscreenStyle, /\.xg-top-bar \{[^}]*display: flex !important;[^}]*background-image: linear-gradient\(0deg, transparent, rgba\(0, 0, 0, \.48\)\) !important;\s*\}/);
assert.match(fullscreenStyle, /\[data-xet-controls-hidden="true"\][^{]*\.xg-top-bar \{\s*opacity: 0 !important;\s*visibility: hidden !important;\s*pointer-events: none !important;/);
assert.match(fullscreenStyle, /\.xgplayer-controls \{\s*background: linear-gradient\(transparent, rgba\(0, 0, 0, \.9\)\) !important;\s*\}/);

console.log("content module structure smoke test passed");
