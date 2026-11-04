const assert = require("node:assert/strict");
const fs = require("node:fs");
const css = fs.readFileSync("src/content/analysis-actions.css", "utf8");
assert.match(css, /\.analysis-item:has\(> \.draft-btn\):has\(\[data-xet-analysis-action-header\]\) > \.draft-btn/,
  "Only adapt the native top-level draft trigger while owned actions exist");
assert.match(css, /inline-size: 32px !important;\s*block-size: 32px !important;\s*inset-inline-end: 88px !important;/);
assert.match(css, /grid-template-columns: auto minmax\(0, 1fr\) auto;\s*grid-template-rows: minmax\(32px, auto\) auto;\s*padding-inline-end: 0;/);
assert.match(css, /padding-inline-start: 44px;/, "Reserve the draft slot before mark/collect, not over favorite");
assert.match(css, /\.analysis-item\.is-draft-active \.xet-analysis-actions \{\s*visibility: hidden;\s*pointer-events: none;/);
assert.doesNotMatch(fs.readFileSync("src/content/analysis-actions.js", "utf8"), /draft-btn|toggleQuestionDraft/,
  "Do not clone/reparent the Vue-owned trigger or replace its drawing handler");
console.log("analysis toolbar CSS scope, native draft slot, grid stem width and drawing-mode policy passed");
