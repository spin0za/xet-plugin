const assert = require("node:assert/strict");
const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const registration = manifest.content_scripts[0];
const expectedScripts = [
  "src/site-access.js",
  "src/content/player-dom.js",
  "src/content/fullscreen.js",
  "src/content/media-shortcuts.js",
  "src/content/quality.js",
  "src/content/toast.js",
  "src/content.js",
];

assert.deepEqual(registration.js, expectedScripts);
assert.deepEqual(registration.css, ["src/content/fullscreen.css"]);

for (const path of [...registration.js, ...registration.css]) {
  assert.ok(fs.existsSync(path), `${path} should exist`);
}

const entry = fs.readFileSync("src/content.js", "utf8");
assert.ok(entry.split("\n").length < 150, "content.js should remain a small entry");
assert.match(entry, /createFullscreenController/);
assert.match(entry, /createShortcutController/);
assert.match(entry, /createQualityController/);
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

console.log("content module structure smoke test passed");
