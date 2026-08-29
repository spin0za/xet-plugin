const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("popup/popup.html", "utf8");

assert.match(html, /<small>延长登录状态，减少反复微信扫码<\/small>/);

const developerStart = html.indexOf('<details class="developer-options">');
const developerEnd = html.indexOf("</details>", developerStart);
const developerMarkup = html.slice(developerStart, developerEnd);

assert.ok(developerStart >= 0, "developer mode should exist");
assert.match(developerMarkup, /<summary>开发者模式<\/summary>/);
assert.match(developerMarkup, /id="keep-alive-target"/);
assert.match(developerMarkup, /id="keep-alive-test"/);
assert.match(developerMarkup, /id="keep-alive-status"/);

const keepAliveCardStart = html.indexOf('<section class="keep-alive-card">');
const keepAliveCardEnd = html.indexOf("</section>", keepAliveCardStart);
const keepAliveCardMarkup = html.slice(keepAliveCardStart, keepAliveCardEnd);

assert.doesNotMatch(keepAliveCardMarkup, /xiaoe-tech|keep-alive-target/);
assert.doesNotMatch(keepAliveCardMarkup, /keep-alive-test|立即测试/);

console.log("popup layout smoke test passed");
