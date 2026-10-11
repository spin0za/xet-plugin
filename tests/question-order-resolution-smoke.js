const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = {};
vm.runInNewContext(fs.readFileSync("src/content/question-order.js", "utf8"), context);
const { resolveOrdering } = context.__xetPlayerHelperModules.questionOrder;
const prefix = "xetQuestionOrder:https://merchant.pc.xiaoe-tech.com|wb_source|";
const record = ids => ({ version: 1, ids, savedAt: 1 });
const known = { id: "qs_3", taskId: "pt_fixed" };
const missing = { id: "qs_2", taskId: "" };
const stored = { [prefix + "pt_fixed"]: record(["qs_1", "qs_2", "qs_3"]) };
const result = data => resolveOrdering([known, missing], data, prefix);
assert.equal(JSON.stringify(result(stored).numbers), "[3,2]");
assert.equal(result(stored).sortable, true, "lost task metadata must not prevent sorting one verified order");
assert.equal(result({ ...stored, [prefix + "pt_same"]: record(["qs_1", "qs_2", "qs_3"]) }).sortable, true);
const conflicting = { ...stored, [prefix + "pt_conflict"]: record(["qs_2", "qs_1", "qs_3"]) };
assert.equal(JSON.stringify(result(conflicting).numbers), "[3,null]", "do not guess ambiguous taskless ordinals");
assert.equal(result(conflicting).sortable, false);
assert.equal(result({ ...stored, [prefix + "pt_other_order"]: record(["qs_3", "qs_2", "qs_1"]) }).sortable,
  false, "agreeing on one ordinal does not establish a common full order");
assert.equal(result({ ...stored, [prefix + "pt_invalid"]: record(["qs_2", "qs_2"]) }).sortable, true);
assert.equal(JSON.stringify(result({ ...stored, [prefix.replace("wb_source", "wb_other") + "pt_other"]:
  record(["qs_2", "qs_1"]) }).numbers), "[3,2]", "never use another source's mapping");
assert.equal(JSON.stringify(resolveOrdering([{ id: "qs_2", taskId: "pt_unknown" }], stored, prefix).numbers),
  "[null]", "a known but uncached task must not fall back to another task");
assert.equal(resolveOrdering([known, { id: "qs_999", taskId: "" }], stored, prefix).sortable, false);
assert.equal(resolveOrdering([known, { id: "qs_1", taskId: "pt_other" }], {
  ...stored, [prefix + "pt_other"]: record(["qs_1", "qs_3", "qs_2"]),
}, prefix).sortable, false, "keep native order across actual tasks");
assert.equal(resolveOrdering([{ id: "qs_2", taskId: "" }], stored, prefix).sortable, true);
console.log("question order missing-task resolution and ambiguity safeguards smoke test passed");
