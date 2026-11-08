const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ elapsed = 0, timing = true, duration = 120000 } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), timers = new Map(), watches = [];
  let clock = 1_800_000_000_000 + elapsed, next = 0, renders = 0;
  const node = { isConnected: true }, infos = {};
  const v = { time: duration, status: 0, liveStatus: 0, count: duration - 1000, timer: 11,
    $el: node, $parent: { infos }, formate: n => n < 10 ? `0${n}` : n,
    getTime(t) { renders++; this.day = Math.floor(t / 86400000); this.hour = this.formate(Math.floor(t / 3600000) % 24);
      this.min = this.formate(Math.floor(t / 60000) % 60); this.sec = this.formate(Math.floor(t / 1000) % 60); this.count -= 1000; },
    $watch(get, cb) { const w = { get, cb, active: true, previous: get() }; watches.push(w); return () => { w.active = false; }; },
    $options: { watch: { time: { handler(t) { this.count = t; this.getTime(t); this.timer = ++next; } } } },
  };
  node.__vue__ = v; doc.querySelectorAll = () => [node]; doc.visibilityState = "visible";
  const path = "/detail/l_fixture/4", origin = "https://merchant.pc.xiaoe-tech.com";
  const entries = timing ? [{ name: origin + "/api/xe.goods.detail.get/2.0.0", responseEnd: 1000 }] : [];
  const context = { window: win, document: doc, location: { pathname: path, origin }, URL, Event,
    Date: { now: () => clock }, performance: { now: () => 1000 + clock - 1_800_000_000_000, getEntriesByType: () => entries },
    setInterval(f) { const id = ++next; timers.set(id, f); return id; }, clearInterval(id) { timers.delete(id); } };
  vm.runInNewContext(fs.readFileSync("src/live-countdown-source.js", "utf8"), context);
  const install = () => context.XetLiveCountdownSource.installLiveCountdown(context.location.pathname);
  function flush() { for (const w of watches) { const value = w.get(); if (w.active && value !== w.previous) { w.previous = value; w.cb(); } } }
  return { context, v, node, timers, entries, install, win, doc, flush,
    advance(ms) { clock += ms; }, run() { [...timers.values()].forEach(f => f()); }, renders: () => renders };
}

async function main() {
  const f = fixture({ elapsed: 30000 });
  assert.equal(f.install().ok, true);
  assert.equal(f.v.count, 90000, "Late install must not restart the original 120 seconds");
  assert.equal(f.v.min, "01"); assert.equal(f.v.sec, 30);
  const state = f.win.__xetLiveCountdown;
  f.advance(25000); f.run();
  assert.equal(f.v.count, 65000, "One delayed callback accounts for all 25 elapsed seconds");
  f.advance(45000); f.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.v.count, 20000, "Visible event corrects immediately without waiting a second");
  f.advance(2000); f.win.dispatchEvent(new Event("focus")); assert.equal(f.v.count, 18000);
  f.advance(3000); f.win.dispatchEvent(new Event("pageshow")); assert.equal(f.v.count, 15000);
  f.install(); assert.equal(f.win.__xetLiveCountdown, state); assert.equal(f.v.count, 15000);
  f.advance(16000); f.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.v.count, 0); assert.equal(f.v.sec, "00"); assert.equal(f.v.liveStatus, 1);
  const renders = f.renders(); f.advance(10000); f.run(); assert.equal(f.renders(), renders, "No repeated expiry or negative display");

  // A new server duration/status must replace the previous deadline, including
  // deliveries where both time and the enclosing infos object change together.
  f.entries[0].responseEnd += 131000;
  f.v.liveStatus = 0; f.v.time = 300000; f.v.$parent.infos = {}; f.flush();
  assert.equal(f.v.count, 300000);
  f.advance(9000); f.install(); assert.equal(f.v.count, 291000, "Idempotent install cannot reset the deadline");
  f.win.dispatchEvent(new Event("xet:live-countdown-stop"));
  assert.equal(state.active, false); assert.equal(f.timers.size, 0);
  assert.equal(f.v.count, 290000, "Disable returns the accurate remainder to the native watcher");
  const stopped = f.renders(); f.advance(50000); f.win.dispatchEvent(new Event("focus")); assert.equal(f.renders(), stopped);

  const fallback = fixture({ timing: false }); fallback.install();
  assert.equal(fallback.v.count, 120000); fallback.advance(30000); fallback.run(); assert.equal(fallback.v.count, 90000);
  fallback.context.location.pathname = "/bought"; fallback.run(); assert.equal(fallback.win.__xetLiveCountdown.active, false);
  assert.equal(fallback.install().ok, false);
  const detached = fixture(); detached.install(); detached.node.isConnected = false; detached.run();
  assert.equal(detached.win.__xetLiveCountdown.active, false);
  const asleep = fixture({ elapsed: 45000 });
  asleep.context.performance.timeOrigin = 1_800_000_000_000 - 1000;
  asleep.context.performance.now = () => 1000; // Some platforms stop this clock during sleep.
  asleep.install(); assert.equal(asleep.v.count, 75000, "Late install after sleep must anchor to the original response wall time");

  const requests = [], context = { URL, chrome: { scripting: { async executeScript(options) {
    requests.push(options); return [{ documentId: "current", result: { ok: true } }];
  } } } };
  vm.runInNewContext(fs.readFileSync("src/site-access.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("src/live-countdown-source.js", "utf8"), context);
  let authorized = true, disabledSites = [];
  const deps = { siteAccess: { siteInfo: context.XetSiteAccess.siteInfo, isAuthorized: async () => authorized },
    readSettings: async () => ({ disabledSites }) };
  const sender = { tab: { id: 3 }, frameId: 0, documentId: "current", url: "https://merchant.pc.xiaoe-tech.com/detail/l_fixture/4" };
  const resolve = (s = sender, path = "/detail/l_fixture/4") => context.XetLiveCountdownSource.resolve({ path }, s, deps);
  assert.equal((await resolve({ ...sender, frameId: 1 })).ok, false);
  assert.equal((await resolve(sender, "/detail/l_other/4")).ok, false);
  assert.equal((await resolve({ ...sender, url: "invalid" })).ok, false);
  authorized = false; assert.equal((await resolve()).ok, false);
  authorized = true; disabledSites = ["https://merchant.pc.xiaoe-tech.com"]; assert.equal((await resolve()).ok, false);
  assert.equal(requests.length, 0); disabledSites = [];
  assert.equal((await resolve()).ok, true); assert.equal(requests[0].world, "MAIN");
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].target)), { tabId: 3, documentIds: ["current"] });
  assert.equal((await resolve({ ...sender, documentId: "replaced" })).ok, false);
  const roomPath = "/p/t_pc/live_pc/pc/l_room";
  assert.equal((await resolve({ ...sender, url: "https://merchant.pc.xiaoe-tech.com" + roomPath }, roomPath)).ok, true);
  assert.equal(requests.at(-1).func.name, "installLiveRoomCountdown");
  console.log("live-countdown-smoke: elapsed clock, late install, wake events, expiry, props, cleanup and authorization passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
