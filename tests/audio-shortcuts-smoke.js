const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const handlers = new Map();
const audio = { currentTime: 30, duration: 58, readyState: 1, paused: true };
let visible = true, inert = false, present = true, videoPresent = false;
const video = { currentTime: 30, duration: 58 };
const root = { contains: () => false, closest: () => inert, querySelector: () => present ? audio : null };
class Element {
  constructor({ editable = false, widget = false } = {}) { Object.assign(this, { editable, widget }); }
  closest() { return this.widget; }
}
const context = {
  Element,
  location: { pathname: "/p/t_pc/course_pc_detail/audio/a_fixture" },
  document: { querySelectorAll: () => [root] },
  window: {
    addEventListener: (type, fn, capture) => { assert.equal(capture, true); handlers.set(type, fn); },
    removeEventListener: type => handlers.delete(type),
  },
};
vm.runInNewContext(fs.readFileSync("src/content/media-shortcuts.js", "utf8"), context);
const controller = context.__xetPlayerHelperModules.mediaShortcuts.createShortcutController({
  fullscreen: { isWebFullscreen: () => false },
  playerDom: {
    findActivePlayer: () => videoPresent ? video : null,
    findPlayerVideo: () => video,
    isEditableTarget: node => Boolean(node?.editable),
    isVisible: () => visible,
  },
});
function dispatch(type, code = "ArrowRight", overrides = {}) {
  const target = new Element();
  const event = { key: code, code, target, composedPath: () => [target],
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }, ...overrides };
  handlers.get(type)?.(event);
  return event;
}
function press(code = "ArrowRight", overrides = {}) {
  const down = dispatch("keydown", code, overrides);
  const beforeUp = audio.currentTime;
  const up = dispatch("keyup", code, overrides);
  assert.equal(audio.currentTime, beforeUp, "keyup never seeks a second time");
  return { down, up };
}
controller.start(); controller.start();
let result = press();
assert.equal(audio.currentTime, 35);
assert(result.down.prevented && result.down.stopped && result.up.prevented && result.up.stopped);
press("ArrowLeft"); assert.equal(audio.currentTime, 30);
assert.equal(audio.paused, true, "seeking does not start playback");
audio.paused = false;
press(); assert.equal(audio.paused, false, "seeking does not pause playback");
press("ArrowRight", { repeat: true }); assert.equal(audio.currentTime, 40);
audio.currentTime = 2; press("ArrowLeft"); assert.equal(audio.currentTime, 0);
audio.currentTime = 57; press(); assert.equal(audio.currentTime, 58);
for (const overrides of [
  { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
  { isComposing: true }, { defaultPrevented: true }, { target: new Element({ editable: true }) },
  { composedPath: () => [new Element({ editable: true })] },
  { composedPath: () => [new Element({ widget: true })] },
]) {
  audio.currentTime = 30;
  result = press("ArrowRight", overrides);
  assert.equal(audio.currentTime, 30);
  assert(!result.down.stopped && !result.up.stopped, "editing/modified keys remain native");
}
for (const code of ["KeyJ", "KeyL", "KeyK", "KeyF", "KeyT", "Comma", "Period"]) {
  result = press(code);
  assert(!result.down.stopped && !result.up.stopped, "do not add unrelated audio shortcuts");
}
for (const mutate of [
  () => { visible = false; }, () => { inert = true; }, () => { present = false; },
  () => { audio.readyState = 0; }, () => { audio.duration = NaN; }, () => { audio.duration = Infinity; },
  () => { audio.duration = 0; }, () => { context.location.pathname = "/bought"; },
]) {
  audio.currentTime = 30; mutate(); result = press();
  assert.equal(audio.currentTime, 30);
  assert(!result.down.stopped && !result.up.stopped);
  visible = true; inert = false; present = true; audio.readyState = 1; audio.duration = 58;
  context.location.pathname = "/p/t_pc/course_pc_detail/audio/a_fixture";
}
// Replacement media is resolved afresh; a key owned before replacement still
// suppresses native keyup even when focus/route changes before release.
audio.currentTime = 30;
dispatch("keydown"); present = false;
assert(dispatch("keyup").stopped);
present = true; press("ArrowLeft"); assert.equal(audio.currentTime, 30);
context.location.pathname = "/p/t_pc/course_pc_detail/video/v_fixture";
videoPresent = true; press(); assert.equal(video.currentTime, 35);
press("ArrowLeft"); assert.equal(video.currentTime, 30);
assert.equal(audio.currentTime, 30, "video shortcuts do not seek unrelated audio");
context.location.pathname = "/p/t_pc/course_pc_detail/audio/a_fixture";
videoPresent = false;
dispatch("keydown"); controller.stop();
assert.equal(handlers.size, 0);
controller.start(); assert(!dispatch("keyup").stopped, "stop clears owned key state");
controller.stop();
console.log("audio 5-second shortcuts smoke test passed");
