const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const handlers = new Map();
const context = { window: {
  addEventListener: (type, handler) => handlers.set(type, handler),
  removeEventListener: type => handlers.delete(type),
} };
vm.runInNewContext(fs.readFileSync("src/content/media-shortcuts.js", "utf8"), context);
const video = { playbackRate: 1, closest: () => live ? root : null };
let live = true;
let menuPresent = true;
let selected = 1;
let label = "1.0X";
let clicks = 0;
let editable = false;
let options = [];
const menu = { querySelectorAll: () => options };
const root = { querySelector: () => menuPresent ? menu : null };
const playerDom = {
  findActivePlayer: () => video, findPlayerVideo: () => video,
  findPlayerRoot: () => live ? root : null, isEditableTarget: () => editable,
};
const fullscreen = { isWebFullscreen: () => false };
const controller = context.__xetPlayerHelperModules.mediaShortcuts.createShortcutController({ fullscreen, playerDom });
function option(rate, { disabled = false, inert = false } = {}) {
  return { textContent: `${rate}X`, matches: () => disabled, closest: () => inert,
    click() {
      clicks++;
      // The actual Vue live control ignores clicks on its already-selected
      // option, even if the media was changed independently by an old shortcut.
      if (selected === rate) return;
      selected = video.playbackRate = rate;
      label = `${rate}X`;
    },
  };
}
options = [2, 1.5, 1.25, 1, 0.75].map(rate => option(rate));
controller.start();
controller.start();
function key(direction, overrides = {}) {
  const event = {
    key: direction > 0 ? ">" : "<", code: direction > 0 ? "Period" : "Comma",
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() {},
    ...overrides,
  };
  handlers.get("keydown")(event);
  return event;
}
key(1);
assert.equal(video.playbackRate, 1.25);
assert.equal(selected, 1.25);
assert.equal(label, "1.25X");
key(1); key(1);
assert.equal(video.playbackRate, 2, "live rates skip unavailable 1.75x");
const atMaximum = clicks;
key(1);
assert.equal(clicks, atMaximum);
assert.equal(video.playbackRate, 2, "never exceed the menu's upper limit");
key(-1);
assert.equal(video.playbackRate, 1.5);
options.find(option => option.textContent === "1.25X").click();
key(1);
assert.equal(video.playbackRate, 1.5, "keyboard steps from the real rate after a mouse selection");
selected = 1; label = "1X"; video.playbackRate = 1.25;
key(-1);
assert.equal(video.playbackRate, 1, "repair a stale active option whose SDK click is a no-op");
assert.equal(selected, 1);
key(-1); key(-1);
assert.equal(video.playbackRate, 0.75, "never go below the live menu's lower limit");
options = [option(2, { disabled: true }), option(1.5, { inert: true }), option(1), option(0.75)];
selected = video.playbackRate = 1;
key(1);
assert.equal(video.playbackRate, 1, "skip disabled and inert options");
options = [option(1)];
key(1); key(-1);
assert.equal(video.playbackRate, 1, "real-time live streams may only permit 1x");
menuPresent = false;
key(1);
assert.equal(video.playbackRate, 1, "wait for known live menus instead of bypassing SDK restrictions");
live = false;
key(1);
assert.equal(video.playbackRate, 1.25, "native video keeps the fallback rates");
video.playbackRate = 2;
key(1);
assert.equal(video.playbackRate, 2.5);
key(1); key(1);
assert.equal(video.playbackRate, 3);
video.playbackRate = 0.5; key(-1);
assert.equal(video.playbackRate, 0.5);
video.playbackRate = 1;
editable = true; key(1); editable = false;
key(1, { isComposing: true }); key(1, { ctrlKey: true });
assert.equal(video.playbackRate, 1, "do not intercept editing, IME or modified shortcuts");
controller.stop();
assert.equal(handlers.size, 0, "disable removes both keyboard listeners");
console.log("playback rate menu synchronization smoke test passed");
