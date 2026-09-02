const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("popup/popup.html", "utf8");

assert.match(html, /<small>延长登录状态，减少反复微信扫码<\/small>/);
assert.match(html, /<p class="hint" id="hint" hidden><\/p>/);
assert.doesNotMatch(html, /打开课程并播放视频后/);

const developerStart = html.indexOf('<details class="developer-options">');
const developerEnd = html.indexOf("</details>", developerStart);
const developerMarkup = html.slice(developerStart, developerEnd);

assert.ok(developerStart >= 0, "developer mode should exist");
assert.match(developerMarkup, /<summary>开发者模式<\/summary>/);
assert.match(developerMarkup, /id="site-section"/);
assert.match(developerMarkup, /id="site-button"/);
assert.match(developerMarkup, /id="manage-sites"/);
assert.doesNotMatch(developerMarkup, /保活网站|立即测试|keep-alive-test/);
assert.ok(
  html.indexOf('id="site-section"') > developerStart,
  "current-site controls should live inside developer mode",
);

const keepAliveCardStart = html.indexOf('<section class="keep-alive-card">');
const keepAliveCardEnd = html.indexOf("</section>", keepAliveCardStart);
const keepAliveCardMarkup = html.slice(keepAliveCardStart, keepAliveCardEnd);

assert.doesNotMatch(keepAliveCardMarkup, /xiaoe-tech|keep-alive-target/);
assert.doesNotMatch(keepAliveCardMarkup, /keep-alive-test|立即测试/);

console.log("popup layout smoke test passed");
