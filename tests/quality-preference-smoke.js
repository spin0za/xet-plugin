const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(text = "", kind = "root") {
    Object.assign(this, { textContent: text, kind, tagName: "DIV", parentElement: null });
  }
  closest(selector) {
    if (selector.startsWith("li,")) return this.kind === "option" ? this : this.parentElement?.closest(selector);
    if (selector === ".xgplayer-definition") return this.menu || null;
    if (selector === "button") return this.kind === "toggle" ? this : null;
    return null;
  }
  querySelector(selector) { return selector === "video" ? this.video || null : null; }
  querySelectorAll() { return []; }
}

const listeners = new Map();
const location = { href: "https://merchant.pc.xiaoe-tech.com/course/a" };
const context = {
  Element, location,
  document: {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  },
};
vm.runInNewContext(fs.readFileSync("src/content/quality-preference.js", "utf8"), context);
const preferenceModule = context.__xetPlayerHelperModules.qualityPreference;
const root = new Element(); root.video = { duration: 120 };
const other = new Element(); other.video = { duration: 30 };
const option = new Element("高清", "option"); option.menu = {}; option.root = root;
const toggle = new Element("高清", "toggle"); toggle.root = root; toggle.parentElement = root;
let enabled = true;
let manualSelections = 0;
const tracker = preferenceModule.createQualityPreferenceTracker({
  playerDom: {
    findPlayerRoot: (element) => element.root || element,
    findPlayerVideo: (scope) => scope.video,
    composedParent: (element) => element.parentElement,
  },
  isEnabled: () => enabled,
  onManualSelection: () => manualSelections++,
});
const event = (type, target = option, extra = {}) => listeners.get(type)?.({
  type, target, isTrusted: true, key: "Enter", button: 0,
  composedPath: () => [target], ...extra,
});
tracker.start(); tracker.start();
assert.equal(listeners.size, 3);
assert.equal(tracker.allows(option), true);
event("click", toggle);
event("click", option, { isTrusted: false });
event("pointerdown", option, { button: 2 });
event("keydown", option, { key: "ArrowDown" });
event("keydown", option, { repeat: true });
assert.equal(manualSelections, 0, "opening, hovering, and synthetic actions are not manual selection");

event("pointerdown"); event("click");
assert.equal(manualSelections, 1, "one gesture should cancel an automatic task only once");
assert.equal(tracker.allows(root), false);
assert.equal(tracker.allows(other), true, "manual ownership is scoped to one player");
root.video.duration = NaN;
assert.equal(tracker.allows(option), false, "source unload must not reset ownership");
root.video = { duration: 120.05 };
assert.equal(tracker.allows(option), false, "quality reload/SDK video replacement must not reset ownership");
tracker.stop(); tracker.start();
assert.equal(tracker.allows(option), false, "controller restart preserves the current video's choice");

location.href += "#notes";
assert.equal(tracker.allows(option), false, "anchor navigation is not a new lesson");
location.href = "https://merchant.pc.xiaoe-tech.com/course/b";
assert.equal(tracker.allows(option), true, "new course resets default quality");
const snapshot = tracker.snapshot(option);
event("keydown", option, { key: " " });
assert.equal(tracker.allows(option), false, "keyboard activation counts as manual selection");
root.video.duration = 240;
assert.equal(tracker.allows(option), true, "different clip on the same route resets ownership");
assert.equal(tracker.allows(option, snapshot), false, "old asynchronous work cannot select a new clip");
enabled = false;
event("click");
assert.equal(tracker.allows(option), true, "disabled feature ignores selections");
tracker.stop();
assert.equal(listeners.size, 0);
console.log("quality preference smoke test passed");
