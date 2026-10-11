const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const marker = "data-xet-question-typography";
const attributes = new Map(), styles = [], timers = new Set();
const window = new EventTarget(); window.top = window;
const html = {
  getAttribute: name => attributes.get(name) ?? null,
  setAttribute: (name, value) => attributes.set(name, value),
  removeAttribute: name => attributes.delete(name),
  toggleAttribute(name, active) { if (active) attributes.set(name, ""); else attributes.delete(name); },
  append(style) { styles.push(style); },
};
const context = {
  window, location: { pathname: "/p/t_pc/pc_evaluation/practice_sheet/fixture" },
  document: { documentElement: html, createElement() { return { remove() { styles.splice(styles.indexOf(this), 1); } }; } },
  setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
};
vm.runInNewContext(fs.readFileSync("src/content/question-typography.js", "utf8"), context);
const controller = context.__xetPlayerHelperModules.questionTypography.createQuestionTypographyController();
controller.start(); controller.start();
assert.equal(styles.length, 1); assert.equal(timers.size, 1);
assert.ok(attributes.has(marker));
assert.match(styles[0].textContent, /font-family: inherit !important/);
assert.match(styles[0].textContent, /\.errbook-detail-page \.card-content/);
assert.doesNotMatch(styles[0].textContent, /font-weight:|font-size:|line-height:/, "preserve intentional formatting");
for (const route of ["practice_analysis/fixture", "exam_sheet/fixture", "exam_analysis/fixture",
  "errbook/practice/42", "errbook/detail/42", "practice_sheet/fixture"]) {
  context.location.pathname = `/p/t_pc/pc_evaluation/${route}`;
  for (const check of timers) check();
  assert.ok(attributes.has(marker), `missing typography on ${route}`);
}
context.location.pathname = "/p/t_pc/course_pc_detail/video/fixture";
window.dispatchEvent(new Event("popstate"));
assert.ok(!attributes.has(marker), "do not modify unrelated pages");
controller.stop(); controller.stop();
assert.equal(styles.length, 0); assert.equal(timers.size, 0);
html.setAttribute(marker, "original");
controller.start(); controller.stop();
assert.equal(html.getAttribute(marker), "original", "restore preexisting marker");
window.top = {};
controller.start();
assert.equal(styles.length, 0, "do not style embedded players");
console.log("question typography scope and lifecycle smoke test passed");
