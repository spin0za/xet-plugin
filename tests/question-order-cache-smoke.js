const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("src/content/question-order.js", "utf8");
const origin = "https://merchant.pc.xiaoe-tech.com", source = "wb_fixture", task = "pt_fixture";
const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
const record = { version: 1, ids: ["qs_1", "qs_2", "qs_3"], savedAt: 123 };

function fixture({ stored = {}, kind = "practice_sheet", helper = false, pageTask = task,
  pageSource = source, pageOrigin = origin, fail = false, incomplete = false, failSave = false, setting = 0 } = {}) {
  const frames = new Map(), timers = new Set(), listeners = new Set(), calls = [], statuses = [];
  const window = new EventTarget(); window.top = window;
  const location = { origin: pageOrigin, pathname: `/p/t_pc/pc_evaluation/${kind}/${pageSource}`,
    search: `?task_id=${pageTask}&join_id=uwb_new${helper ? "&xet_order_job=fixture" : ""}` };
  const state = { reads: 0, writes: 0, fail, incomplete, failSave, joinId: "uwb_new", hidden: false };
  const env = { window, location, Event, URLSearchParams, AbortController, AbortSignal, queueMicrotask,
    document: { body: {}, documentElement: { append() {} }, querySelectorAll: () => [],
      createElement: () => ({ remove() {} }) },
    requestAnimationFrame(fn) { assert.ok(!helper, "hidden helpers must not wait for a paint"); frames.set(fn, fn); return fn; },
    cancelAnimationFrame(fn) { frames.delete(fn); },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: { storage: { onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } },
    fetch: async path => {
      calls.push(path);
      if (state.fail) throw new Error("offline");
      return { ok: true, json: async () => ({ code: 0, data: path.includes("config") || path.endsWith("/detail")
        ? { random_setting: setting, is_random: setting, task_total_qs: 3 }
        : { list: record.ids.slice(0, state.incomplete ? 2 : 3).map(id => ({ id, answer: "do-not-store" })) } }) };
    },
  };
  vm.runInNewContext(script, env);
  const module = env.__xetPlayerHelperModules.questionOrder;
  const storage = {
    async get() { state.reads++; return { ...stored }; },
    async set(value) { if (state.failSave) throw new Error("quota"); state.writes++; Object.assign(stored, value); },
    async remove(key) { delete stored[key]; },
  };
  const controller = module.createQuestionOrderController({ storage, request: async message => {
    if (message.type === "xet:question-order-job-finish") { statuses.push(message.status); return { ok: true }; }
    return { ok: true, context: { key: module.routeKey(), kind: "practice", sourceId: pageSource,
      taskId: pageTask, joinId: state.joinId } };
  } });
  async function flush() {
    for (let i = 0; i < 80; i++) {
      if (!state.hidden) for (const fn of [...frames.values()]) { frames.delete(fn); fn(); }
      await Promise.resolve();
    }
  }
  return { state, stored, calls, statuses, window, location, controller, flush, frames,
    tick() { for (const fn of timers) fn(); },
    change(changes, area = "local") {
      for (const [key, change] of Object.entries(changes)) {
        if (change.newValue === undefined) delete stored[key]; else stored[key] = change.newValue;
      }
      for (const listener of listeners) listener(changes, area);
    },
  };
}

async function main() {
  // A background capture, a manual attempt and an analysis view all share one
  // persisted mapping; old version-1 records do not need a migration or reread.
  const shared = { [cacheKey]: record };
  for (const options of [{}, { kind: "practice_analysis" }, { helper: true }]) {
    const f = fixture({ stored: shared, ...options });
    f.controller.start(); await f.flush();
    assert.equal(f.calls.length, 0, "cache hit must skip both config and full-record queries");
    assert.equal(f.state.writes, 0, "cache hit must preserve the record and timestamp");
    assert.equal(f.state.reads, 1);
    assert.equal(shared[cacheKey], record);
    if (options.helper) assert.deepEqual(f.statuses, ["ready"]);
    f.state.joinId = "uwb_other";
    f.location.search = `?task_id=${task}&join_id=uwb_other${options.helper ? "&xet_order_job=fixture" : ""}`;
    f.window.dispatchEvent(new Event("popstate")); await f.flush();
    assert.equal(f.calls.length, 0, "different attempts reuse the same exact source/task mapping");
    assert.equal(f.state.reads, 1, "SPA attempts reuse the in-memory index");
    f.controller.stop();
  }

  for (const options of [{ pageOrigin: "https://other.pc.xiaoe-tech.com" },
    { pageSource: "wb_other" }, { pageTask: "pt_other" }, { pageTask: "" },
    { stored: { [cacheKey]: { ...record, ids: ["qs_1", "qs_1"] } } }]) {
    const f = fixture({ stored: { [cacheKey]: record }, ...options });
    f.controller.start(); await f.flush();
    assert.equal(f.calls.length, 2, "other merchant/source/task and invalid cache require a full verified read");
    assert.equal(f.state.writes, 1);
    assert.ok(!JSON.stringify(f.stored).includes("answer"));
    f.controller.stop();
  }

  for (const field of ["fail", "incomplete", "failSave"]) {
    const f = fixture({ [field]: true });
    f.controller.start(); await f.flush();
    assert.equal(f.state.writes, 0, "failed/incomplete reads must not create a completed mapping");
    assert.equal(f.stored[cacheKey], undefined);
    f.state[field] = false; f.tick(); await f.flush();
    assert.equal(f.state.writes, 1, "the next retry must be allowed after a failed read/save");
    assert.equal(f.stored[cacheKey].ids.length, 3);
    // No storage onChanged event in this mock: a successful own write must
    // still update the memory cache for the next attempt in this document.
    const before = f.calls.length;
    f.state.joinId = "uwb_next";
    f.location.search = `?task_id=${task}&join_id=uwb_next`;
    f.window.dispatchEvent(new Event("popstate")); await f.flush();
    assert.equal(f.calls.length, before);
    f.controller.stop();
  }
  for (const pageTask of ["", task]) for (const setting of [-1, "-1"]) {
    const f = fixture({ pageTask, helper: true, setting });
    f.controller.start(); await f.flush();
    assert.equal(f.state.writes, 1, "Taskless legacy -1 papers must be captured, not mistaken for random papers");
    assert.deepEqual(f.statuses, ["ready"]);
    assert.equal(f.stored[`xetQuestionOrder:${origin}|${source}|${pageTask}`].ids.length, 3);
    f.controller.stop();
  }

  const resumed = fixture({ setting: -1 });
  resumed.state.hidden = true;
  resumed.controller.start(); await resumed.flush();
  assert.equal(resumed.frames.size, 1, "A redirected unmarked sheet can have a parked background frame");
  resumed.location.search += "&xet_order_job=restored";
  resumed.window.dispatchEvent(new Event("xet:question-order-ready")); await resumed.flush();
  assert.equal(resumed.frames.size, 0, "Restoring the marker must cancel the parked frame immediately");
  assert.equal(resumed.state.writes, 1, "Finish full capture without a visible paint");
  assert.deepEqual(resumed.statuses, ["ready"]);
  resumed.controller.stop();

  const lateMarker = fixture({ setting: -1 });
  lateMarker.controller.start(); await lateMarker.flush();
  assert.equal(lateMarker.state.writes, 1);
  assert.deepEqual(lateMarker.statuses, []);
  lateMarker.location.search += "&xet_order_job=restored-after-capture";
  lateMarker.window.dispatchEvent(new Event("xet:question-order-ready")); await lateMarker.flush();
  assert.deepEqual(lateMarker.statuses, ["ready"], "A capture that precedes marker restoration must still finish/close the owned helper");
  assert.equal(lateMarker.state.writes, 1, "Late completion must reuse the saved mapping");
  lateMarker.controller.stop();

  const f = fixture({ stored: { [cacheKey]: record } });
  f.controller.start(); await f.flush();
  f.change({ [`xetQuestionOrder:${origin}|${source}|pt_other`]: {} }); await f.flush();
  assert.equal(f.calls.length, 0, "deleting another task must not invalidate this completed attempt");
  f.change({ [cacheKey]: {} }); await f.flush();
  assert.equal(f.calls.length, 2, "deleting the exact mapping triggers a fresh capture on the already-open page");
  assert.equal(f.state.writes, 1);
  f.change({ [cacheKey]: { newValue: { ...record, version: 99 } } }); await f.flush();
  assert.equal(f.calls.length, 4, "invalid replacements must also permit recapture");
  f.controller.stop();

  console.log("question order exact cache-hit bypass, attempt reuse, isolation, invalidation and failure retry smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
