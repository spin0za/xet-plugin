const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("popup/popup.html", "utf8");
const script = fs.readFileSync("popup/popup.js", "utf8");

assert.match(html, /<strong>自动超清<\/strong>/);
assert.match(html, /<small>视频加载后自动切换至超清画质<\/small>/);
assert.match(html, /<small>延长登录状态，免去反复扫码<\/small>/);
assert.doesNotMatch(html, /<strong>自动切换<\/strong>|减少反复微信扫码/);
assert.match(script, /自动超清已开启/);
assert.match(script, /自动超清已关闭/);
assert.doesNotMatch(script, /自动切换已开启|自动切换已关闭/);
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
