const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");

const context = {};
vm.runInNewContext(fs.readFileSync("src/content/analysis-icons.js", "utf8"), context);
const icons = context.__xetPlayerHelperModules.analysisIcons;
// SHA-256 of the unmodified artwork served by the deployed PracticeSheet 1.17.7.
const originals = {
  mark: ["c27fef30170b1519c7b7ae77e2294919fe8ec9eea82099b564cfdf4fcda65291",
    "c9cd8f47417502537abdf9a22d608834835ea8af116d8a37b908b042cc1f08b5"],
  collect: ["798a0244645ec929c5e8ebc7852ffa7e8b161c7665db96ac4cf4f2fd6eaf09dc",
    "7a74fa125d7dbab5ef33b3bed336af2a99d8ef3609d771424e29dceb9f03173d"],
  cardMark: ["ae432c9f40228e86aa7d2be0c0cf6502250f713d0c6f76df14bf9b00596a4fd7"],
};
for (const [name, hashes] of Object.entries(originals)) {
  const images = Array.isArray(icons[name]) ? icons[name] : [icons[name]];
  assert.equal(images.length, hashes.length);
  for (const [index, image] of images.entries()) {
    assert.match(image, /^data:image\/(svg\+xml|png);base64,/);
    const bytes = Buffer.from(image.split(",")[1], "base64");
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hashes[index], `${name} ${index} must match the original artwork`);
    if (name !== "cardMark") {
      const svg = bytes.toString("utf8");
      assert.match(svg, /viewBox="0 0 20 20"/);
      assert.doesNotMatch(svg, /<script|onload=|javascript:|<image|<foreignObject/i);
    } else {
      assert.equal(bytes.readUInt32BE(16), 40);
      assert.equal(bytes.readUInt32BE(20), 39);
    }
  }
}
console.log("original analysis icon artwork smoke test passed");
