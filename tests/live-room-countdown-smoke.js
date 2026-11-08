const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
function fixture({ elapsed = 0, skew = 600000, timing = true, warm = false } = {}) {
  const origin = "https://merchant.pc.xiaoe-tech.com", path = "/p/t_pc/live_pc/pc/l_room";
  const server = Date.parse("2026-11-08T09:00:00+08:00"), originWall = server + skew;
  let now = originWall + elapsed, perf = 1000, renders = 0, next = 0;
  const win = new EventTarget(), doc = new EventTarget(), timers = new Map(), watches = [], node = { isConnected: true };
  const room = { alive_id: "l_room", alive_state: 0, enter_time: server / 1000, pushzb_start_at: "2026-11-08 09:02:00" };
  const nativeFormat = function(left) { renders++; this.time.seconds = Math.floor(left % 60); this.time.minutes = Math.floor(left / 60); };
  const v = { roomInfo: room, time: { seconds: 59, minutes: 1 }, timeItv: 91, $el: node,
    $options: { name: warm ? "countDownForWarmUpVedio" : "countDwon" }, timeConvert: nativeFormat, addZero: n => n,
    $watch(get, cb) { const w = { get, cb, previous: get(), active: true }; watches.push(w); return () => w.active = false; } };
  node.__vue__ = v; doc.querySelectorAll = () => [node]; doc.visibilityState = "visible";
  const entries = timing ? [{ name: origin + "/_alive/api/alive/xe.alive.page.get/1.0.0", responseEnd: 1000 }] : [];
  const context = { window: win, document: doc, location: { origin, pathname: path }, URL, Event,
    Date: { now: () => now, parse: Date.parse }, performance: { timeOrigin: originWall - 1000, now: () => perf, getEntriesByType: () => entries },
    setInterval(fn) { const id = ++next; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); } };
  vm.runInNewContext(fs.readFileSync("src/live-countdown-source.js", "utf8"), context);
  return { win, doc, context, v, room, timers, entries, nativeFormat, watches,
    install: () => context.XetLiveCountdownSource.installLiveRoomCountdown(context.location.pathname),
    advance(ms, freeze = false) { now += ms; if (!freeze) perf += ms; },
    flush() { for (const w of watches) { const n = w.get(); if (w.active && n !== w.previous) { w.previous = n; w.cb(); } } },
    run() { for (const fn of [...timers.values()]) fn(); }, renders: () => renders };
}
for (const warm of [false, true]) {
  const f = fixture({ elapsed: 30000, warm });
  assert.equal(f.install().ok, true); const state = f.win.__xetLiveCountdown;
  assert.equal(f.v.time.minutes, 1); assert.equal(f.v.time.seconds, 30, "Late installation and 10-minute client skew must use original server-response anchor");
  assert.equal(f.v.timeItv, 91, "Native mounted/subscribe/timer lifecycle must not be restarted");
  f.advance(45000, true); f.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.v.time.seconds, 45); assert.equal(f.v.time.minutes, 0, "OS-sleep wall time must count even if performance.now freezes");
  f.v.timeConvert(99); assert.equal(f.v.time.seconds, 45, "The original interval cannot overwrite the corrected display");
  f.advance(5000, true); f.win.dispatchEvent(new Event("focus")); assert.equal(f.v.time.seconds, 40);
  f.advance(5000, true); f.win.dispatchEvent(new Event("pageshow")); assert.equal(f.v.time.seconds, 35);
  f.advance(5000, true); f.doc.dispatchEvent(new Event("resume")); assert.equal(f.v.time.seconds, 30);
  f.install(); assert.equal(f.win.__xetLiveCountdown, state); assert.equal(f.v.time.seconds, 30);
  f.advance(40000, true); f.run(); assert.equal(f.v.time.seconds, 0); assert.equal(f.room.alive_state, 0, "Reaching zero must not fake a broadcast-start or autoplay transition");
  f.room.pushzb_start_at = "2026-11-08 09:05:00"; f.flush(); assert.equal(f.v.time.minutes, 2); assert.equal(f.v.time.seconds, 50);
  // Fresh room info after waking must use the prop's current wall-time pair,
  // not a resource timestamp whose monotonic clock omitted the sleep.
  f.room.enter_time += 130; f.entries[0].responseEnd += 20; f.flush();
  assert.equal(f.v.time.minutes, 2); assert.equal(f.v.time.seconds, 50);
  f.room.alive_state = 1; f.flush(); const count = f.renders(); f.advance(10000); f.run(); assert.equal(f.renders(), count);
  f.win.dispatchEvent(new Event("xet:live-countdown-stop"));
  assert.equal(f.v.timeConvert, f.nativeFormat); assert.equal(f.timers.size, 0); assert.equal(f.v.timeItv, 91);
  assert.ok(f.watches.every(w => !w.active));
}
const fallback = fixture({ timing: false, skew: 0, elapsed: 30000 }); fallback.install();
assert.equal(fallback.v.time.seconds, 30); assert.equal(fallback.v.time.minutes, 1, "Without timings use the absolute schedule, not stale enter_time plus now");
fallback.context.location.pathname = "/bought"; fallback.run(); assert.equal(fallback.win.__xetLiveCountdown.active, false);
const bad = fixture(); bad.room.pushzb_start_at = "明天早上九点"; bad.install(); bad.v.timeConvert(17); assert.equal(bad.v.time.seconds, 17);
const detached = fixture(); detached.install(); detached.v.$el.isConnected = false; detached.run(); assert.equal(detached.win.__xetLiveCountdown.active, false);
const wrong = fixture(); wrong.room.alive_id = "l_other"; assert.equal(wrong.install().ok, false);
assert.doesNotMatch(fs.readFileSync("src/live-countdown-source.js", "utf8"), /fetch\(|\.post\(|\.mounted\.call|\.checkAutosubscribe\(|\.subscribeLive\(/);
console.log("live-room-countdown-smoke: room/warm-up, sleep with frozen monotonic clock, late install, skew, reschedule, native lifecycle and cleanup passed");
