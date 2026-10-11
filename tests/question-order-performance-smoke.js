const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const origin = "https://merchant.pc.xiaoe-tech.com", source = "wb_fixture", task = "pt_fixture";
  const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
  const saved = { version: 1, ids: ["qs_1", "qs_2", "qs_3", "qs_4", "qs_5"], savedAt: 1 };
  let now = 10000, ready = false, observer, labelText = "", storageReads = 0, fail = false;
  const frames = new Map(), timers = new Set(), storageListeners = new Set(), requests = [];
  const window = new EventTarget(); window.top = window;
  const location = { origin, pathname: "/p/t_pc/pc_evaluation/errbook/detail/123", search: `?tab=1&source_id=${source}` };
  const bookPath = location.pathname, key = `${bookPath}|${source}|||1`;
  const parent = { children: [], append() {}, insertBefore() {} };
  const card = { isConnected: true, parentElement: parent, getAttribute: () => "qs_5", removeAttribute() {},
    querySelector: () => ({ prepend(el) { el.isConnected = true; } }) };
  parent.children = [card];
  const records = { [cacheKey]: saved };
  const storage = { async get() { storageReads++; return { ...records }; } };
  const env = { window, location, Event, URLSearchParams, AbortController, Date: { now: () => now },
    document: { body: {}, documentElement: { append() {} }, querySelectorAll: () => ready ? [card] : [],
      createElement: () => ({ setAttribute() {}, remove() { this.isConnected = false; },
        set textContent(value) { if (/^\d+\.$/.test(value)) labelText = value; } }) },
    requestAnimationFrame(fn) { frames.set(fn, fn); return fn; }, cancelAnimationFrame(fn) { frames.delete(fn); },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
    chrome: { storage: { onChanged: { addListener(fn) { storageListeners.add(fn); }, removeListener(fn) { storageListeners.delete(fn); } } } },
  };
  vm.runInNewContext(fs.readFileSync("src/content/question-order.js", "utf8"), env);
  const { createQuestionOrderController, createOrderCache } = env.__xetPlayerHelperModules.questionOrder;
  const controller = createQuestionOrderController({ storage, request: async () => {
    requests.push(now);
    if (fail) throw new Error("Transient bridge failure");
    return ready ? { ok: true, context: { key, kind: "book", sourceId: source,
      questions: [{ id: "qs_5", taskId: "" }], cardIds: ["qs_5"] } } : { ok: false };
  } });
  async function flush() {
    for (let pass = 0; pass < 20; pass++) {
      for (const fn of [...frames.values()]) { frames.delete(fn); fn(); }
      await Promise.resolve();
    }
  }
  controller.start(); await flush();
  assert.equal(storageReads, 1, "preload numbering before the site is ready");
  now += 200; ready = true;
  observer([{ target: {}, addedNodes: [{ nodeType: 1 }], removedNodes: [] }]); await flush();
  assert.equal(labelText, "5.", "show on readiness without waiting for any timer tick");
  assert.equal(requests.at(-1), 10200, "no three-second cooldown");
  assert.equal(storageReads, 1, "reuse the preloaded cache for taskless fallback");
  location.pathname = "/p/t_pc/course_pc_detail/video/fixture";
  window.dispatchEvent(new Event("popstate")); await flush();
  location.pathname = bookPath; labelText = ""; now += 20;
  window.dispatchEvent(new Event("popstate")); await flush();
  assert.equal(labelText, "5.", "history back renders immediately");
  assert.equal(storageReads, 1, "history back does not reread disk");
  const changed = { ...saved, ids: ["qs_5", "qs_1", "qs_2", "qs_3", "qs_4"] };
  for (const listener of storageListeners) listener({ [cacheKey]: { newValue: changed } }, "local");
  await flush(); assert.equal(labelText, "1.", "storage updates invalidate the compiled lookup");
  assert.equal(storageReads, 1, "storage changes update in memory without rereading disk");
  fail = true; window.dispatchEvent(new Event("xet:question-order-ready")); await flush();
  fail = false; labelText = "";
  window.dispatchEvent(new Event("xet:question-order-ready")); await flush();
  assert.equal(labelText, "1.", "readiness bypasses any error retry delay");
  controller.stop(); assert.equal(timers.size, 0); assert.equal(frames.size, 0); assert.equal(storageListeners.size, 0);
  records[cacheKey] = changed;
  controller.start(); await flush();
  assert.equal(storageReads, 2, "reenabling reloads updates missed while disabled");
  controller.stop();

  let release, reads = 0;
  const cache = createOrderCache({ get: async () => { reads++; return new Promise(resolve => { release = resolve; }); } }, origin);
  const first = cache.warm(), second = cache.index(source);
  cache.update({ [cacheKey]: { newValue: changed } });
  release({ [cacheKey]: saved }); await first;
  const index = await second;
  assert.equal(reads, 1, "concurrent cache users share one read");
  assert.equal(index[0].numbers.get("qs_5"), 1, "updates during a disk read override its stale snapshot");
  assert.equal(await cache.index(source), index, "reuse the compiled lookup table");
  cache.update({ [cacheKey]: {} });
  assert.equal((await cache.index(source)).length, 0, "deletion invalidates cached numbering");
  cache.clear();
  const obsolete = cache.warm(); cache.clear(); release({ [cacheKey]: saved }); await obsolete;
  const fresh = cache.index(source); release({ [cacheKey]: changed });
  assert.equal((await fresh)[0].numbers.get("qs_5"), 1, "a disposed load cannot repopulate the next session");

  const helperPath = `/p/t_pc/pc_evaluation/practice_sheet/${source}`;
  const helperKey = `${helperPath}|${source}|${task}||1`;
  const helperStatuses = [], helperCalls = [];
  const helperEnv = { ...env, __xetPlayerHelperModules: {}, queueMicrotask, AbortSignal,
    location: { origin, pathname: helperPath, search: `?task_id=${task}&xet_order_job=00000000-0000-0000-0000-000000000000` },
    requestAnimationFrame() { throw new Error("Hidden helper must not wait for an animation frame"); },
    fetch: async path => { helperCalls.push(path); return { ok: true, json: async () => ({ code: 0,
      data: path.includes("config") ? { random_setting: 0, task_total_qs: 5 }
        : { list: saved.ids.map(id => ({ id, answer: "not-to-be-stored" })) } }) }; },
  };
  vm.runInNewContext(fs.readFileSync("src/content/question-order.js", "utf8"), helperEnv);
  let helperRecord;
  const hiddenController = helperEnv.__xetPlayerHelperModules.questionOrder.createQuestionOrderController({
    storage: { async set(value) { helperRecord = Object.values(value)[0]; } },
    request: async message => {
      if (message.type === "xet:question-order-job-finish") { helperStatuses.push(message.status); return { ok: true }; }
      return { ok: true, context: { key: helperKey, kind: "practice", sourceId: source, taskId: task, joinId: "uwb_fixture" } };
    },
  });
  hiddenController.start();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  assert.equal(helperStatuses[0], "ready", "finish only after full metadata persistence without a visible paint");
  assert.equal(helperRecord.ids.length, 5);
  assert.ok(!JSON.stringify(helperRecord).includes("answer"));
  assert.equal(helperCalls.length, 2, "read-only config and record queries; do not answer or submit");
  hiddenController.stop();
  console.log("question order immediate readiness, history return, cache reuse and invalidation smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
