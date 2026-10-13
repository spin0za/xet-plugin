const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const origin = "https://merchant.pc.xiaoe-tech.com", source = "wb_direct", task = "pt_direct";
const path = "/p/t_pc/pc_evaluation/errbook/detail/228676040";
const key = `${path}|${source}|||1`, cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
const ids = Array.from({ length: 34 }, (_, i) => `qs_${i + 1}`);

function fixture(options = {}) {
  const local = {}, session = {}, alarms = new Map(), calls = [], timers = new Set();
  const state = { taskless: true, ready: true, disabled: false, last: true, count: -1, random: -1,
    total: 34, returnedCount: 34, returnedRandom: 0, paperCount: 34, joins: 0, creations: 0,
    failPaper: false, loseJoin: false, closed: false, hook: null, delay: null, ...options };
  const url = new URL(origin + path + `?source_id=${source}&tab=1`);
  const window = new EventTarget(); window.top = window;
  class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init.detail; } }
  const area = values => ({
    async get(name) { return name === null ? { ...values } : { [name]: values[name] }; },
    async set(update) { Object.assign(values, structuredClone(update)); }, async remove(name) { delete values[name]; },
  });
  const chrome = { storage: { local: area(local), session: area(session) },
    alarms: { async create(name, config) { alarms.set(name, config); }, async clear(name) { alarms.delete(name); } },
    tabs: { async create() { throw new Error("New direct strategy must never open a tab"); },
      async remove() { throw new Error("Must never close the requesting user's tab"); } },
    scripting: { async executeScript({ func, args, target }) {
      if (target.documentIds && target.documentIds[0] !== "doc") return [];
      if (state.closed) throw new Error("Document closed");
      return [{ result: await func(...args), documentId: "doc" }];
    } },
  };
  const env = { chrome, URL, AbortController, AbortSignal, Event, CustomEvent, window,
    crypto: require("node:crypto").webcrypto, location: { get href() { return url.href; } },
    setInterval(fn, ms) { const t = setInterval(fn, ms); timers.add(t); return t; },
    clearInterval(t) { timers.delete(t); clearInterval(t); },
    fetch: async (endpoint, config) => {
      const body = JSON.parse(config.body); calls.push({ endpoint, body });
      assert.equal(config.credentials, "same-origin"); assert.equal(config.redirect, "error");
      state.hook?.(endpoint);
      if (state.delay) await state.delay(endpoint, config.signal);
      config.signal.throwIfAborted();
      let data;
      if (endpoint.includes("get.practice.type")) data = { course_task_id: state.missingTask ? undefined : task };
      else if (endpoint.includes("answer.config.get")) data = { random_setting: state.random, task_total_qs: state.total,
        is_last_commit: state.last, practice_num: state.count };
      else if (endpoint.endsWith("/join")) {
        state.joins++;
        if (body.gen_config) {
          assert.deepEqual(body.gen_config, { random_setting: 0, practice_num: state.total, practice_mode: 0 });
          state.creations++; state.last = false;
        } else assert.deepEqual(body, { practice_id: source, task_id: task });
        if (state.loseJoin) throw new Error("Lost mutation response");
        data = { join_id: "uwb_existing", gen_config: { random_setting: state.returnedRandom, practice_num: state.returnedCount,
          practice_mode: state.resumeMode ?? 0 } };
      } else if (endpoint.endsWith("/commit_record")) {
        assert.equal(body.join_id, "uwb_existing"); assert.equal(body.filter_delete, false);
        if (state.failPaper) throw new Error("offline");
        data = { list: ids.slice(0, state.paperCount).map(id => ({ id, answer: "never-cross-boundary" })) };
      } else throw new Error(`Unexpected account endpoint: ${endpoint}`);
      return { ok: true, json: async () => ({ code: state.code ?? 0, data }) };
    },
  };
  vm.runInNewContext(fs.readFileSync("src/question-order-direct.js", "utf8"), env);
  const sender = { tab: { id: 1 }, frameId: 0, documentId: "doc", url: url.href };
  const context = () => ({ key, kind: "book", sourceId: source, questions: ["qs_3", "qs_10", "qs_34"].map(id => ({ id, taskId: state.taskless ? "" : task })) });
  const deps = { siteAccess: {}, readSettings: async () => ({ questionOrderStrategy: state.strategy ?? "direct", disabledSites: state.disabled ? [origin] : [] }),
    resolveContext: async (_message, from) => ({ ok: state.ready && !state.disabled && !state.closed && from.frameId === 0 &&
      from.documentId === "doc" && url.pathname === path, context: context() }) };
  let manager = env.XetQuestionOrderDirect.create(deps);
  const message = () => ({ key, taskId: state.taskless ? "" : task });
  async function settle() {
    for (let i = 0; i < 150; i++) {
      if (local[cacheKey] || Object.values(session).some(j => j.status !== "pending")) {
        await new Promise(resolve => setImmediate(resolve)); return;
      }
      await new Promise(resolve => setImmediate(resolve));
    }
    throw new Error("Direct request did not settle");
  }
  return { state, local, session, calls, alarms, timers, window, url, sender, key, env, deps, settle, message,
    get manager() { return manager; }, restart() { manager = env.XetQuestionOrderDirect.create(deps); },
    async start() { return manager.start(message(), sender); },
  };
}

async function main() {
  for (const last of [true, false]) {
    const f = fixture({ last, count: last ? -1 : 0, random: last ? -1 : 0, resumeMode: last ? 0 : 1 });
    assert.equal((await f.start()).status, "pending"); await f.settle();
    assert.equal(f.local[cacheKey].ids.length, 34); assert.equal(f.state.joins, 1); assert.equal(f.state.creations, last ? 1 : 0);
    assert.ok(!JSON.stringify(f.local).includes("answer"));
    assert.equal(Object.keys(f.session).length, 0); assert.equal(f.alarms.size, 0); assert.equal(f.timers.size, 0);
    const before = f.calls.length;
    assert.equal((await f.start()).status, "cached"); assert.equal(f.calls.length, before, "Taskless cache hits also skip metadata requests");
    // An explicit-task cache hit must require no request, including config.
    f.state.taskless = false;
    assert.equal((await f.start()).status, "cached"); assert.equal(f.calls.length, before);
  }
  const concurrent = fixture();
  const results = await Promise.all([concurrent.start(), concurrent.start(), concurrent.start()]);
  assert.ok(results.every(r => ["pending", "cached"].includes(r.status))); await concurrent.settle();
  assert.equal(concurrent.state.creations, 1, "Concurrent book documents coalesce a single generation request");
  for (const options of [{ random: 1 }, { random: null }, { last: undefined }, { total: 0 }, { total: true }, { total: 2001 }, { count: 5 }, { missingTask: true }]) {
    const f = fixture(options); const result = await f.start();
    if (result.status === "pending") await f.settle();
    assert.equal(f.state.joins, 0, "Unverified source, order, count or last-commit flags must not create/resume an attempt");
    assert.equal(f.local[cacheKey], undefined);
  }
  for (const options of [{ returnedRandom: 1 }, { returnedCount: 5 }, { paperCount: 10 }]) {
    const f = fixture(options); await f.start(); await f.settle();
    assert.equal(f.local[cacheKey], undefined, "Never persist a partial or randomized paper");
    assert.equal(f.state.joins, 1, "No auto-fallback, tab creation or second generation after a failed read");
  }
  const failed = fixture({ failPaper: true });
  await failed.start(); await failed.settle();
  assert.equal((await failed.manager.status(failed.message(), failed.sender)).status, "failed");
  failed.state.failPaper = false; failed.state.last = true; failed.state.count = 0;
  failed.restart(); await failed.start(); await failed.settle();
  assert.equal(failed.local[cacheKey].ids.length, 34);
  assert.equal(failed.state.creations, 1); assert.equal(failed.state.joins, 1, "Recovery reuses the saved record ID without repeating join");

  const lost = fixture({ loseJoin: true });
  await lost.start(); await lost.settle();
  lost.state.loseJoin = false; lost.restart(); await lost.start(); await lost.settle();
  assert.equal(lost.local[cacheKey].ids.length, 34);
  assert.equal(lost.state.creations, 1, "Lost mutation response can resume an existing attempt, never generate again");
  const uncertain = fixture({ loseJoin: true });
  await uncertain.start(); await uncertain.settle();
  uncertain.state.loseJoin = false; uncertain.state.last = true; uncertain.restart(); await uncertain.start(); await uncertain.settle();
  assert.equal(uncertain.state.joins, 1, "No blind mutation replay when the server cannot confirm an existing attempt");

  for (const phase of ["config", "join"]) {
    const f = fixture(); let release, reached, blocked = false;
    const waiting = new Promise(resolve => { reached = resolve; });
    f.state.delay = async endpoint => {
      if (blocked || (phase === "config" ? !endpoint.includes("answer.config.get") : !endpoint.endsWith("/join"))) return;
      blocked = true; reached(); await new Promise(resolve => { release = resolve; });
    };
    await f.start(); await waiting;
    // Model worker death while its injected page request remains alive. The
    // new worker has no transient promise handles, only persisted job intent.
    f.restart(); await f.start(); await f.settle();
    if (phase === "join") assert.equal(f.state.creations, 0, "A replacement worker must not dispatch a second generation while the first is unresolved");
    release(); await new Promise(resolve => setImmediate(resolve));
    if (phase === "join") { await f.start(); await f.settle(); }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.local[cacheKey].ids.length, 34);
    assert.equal(f.state.creations, 1, "The old worker's late result cannot overwrite a new lease or create a duplicate attempt");
    assert.equal(f.timers.size, 0);
  }

  for (const action of ["disabled", "navigated", "closed", "timeout"]) {
    const f = fixture(); let release, reached;
    const waiting = new Promise(resolve => { reached = resolve; });
    f.state.delay = async (endpoint, signal) => {
      if (!endpoint.includes("answer.config.get")) return;
      reached(); await new Promise(resolve => { release = resolve; signal.addEventListener("abort", resolve, { once: true }); });
    };
    await f.start(); await waiting;
    if (action === "disabled") { f.state.disabled = true; await f.manager.settingsChanged(); }
    else if (action === "navigated") { f.url.pathname = "/unrelated"; await f.manager.updated(1, { url: f.url.href }); }
    else if (action === "closed") { f.state.closed = true; await f.manager.removed(1); }
    else await f.manager.alarm({ name: Object.keys(f.session)[0] });
    release(); await f.settle();
    assert.equal(f.state.joins, 0); assert.equal(f.local[cacheKey], undefined);
    assert.equal(f.timers.size, 0); assert.equal(f.alarms.size, 0);
  }
  const stale = fixture();
  stale.state.hook = endpoint => { if (endpoint.includes("answer.config.get")) stale.state.ready = false; };
  await stale.start(); await stale.settle(); assert.equal(stale.state.joins, 0, "Revalidate source identity after preflight and before mutation");
  const invalid = fixture();
  assert.equal((await invalid.manager.start({ key, taskId: "pt_wrong" }, invalid.sender)).ok, false);
  assert.equal((await invalid.manager.start(invalid.message(), { ...invalid.sender, frameId: 2 })).ok, false);
  assert.equal(invalid.calls.length, 0);
  const legacy = fixture();
  legacy.session["xetQuestionOrderJob:fixture"] = { origin, sourceId: source, taskId: task, requestedTaskId: "", deadline: Date.now() + 10000 };
  assert.equal((await legacy.start()).status, "pending"); assert.equal(legacy.calls.length, 0, "Do not race a retained legacy helper");
  assert.equal((await legacy.manager.status(legacy.message(), legacy.sender)).status, "pending");
  console.log("direct numbering: real request payloads, zero tabs, full-only metadata, cache, coalescing, cancellation and mutation-safe restart recovery passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
