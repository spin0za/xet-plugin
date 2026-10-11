const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const origin = "https://merchant.pc.xiaoe-tech.com", source = "wb_fixture", task = "pt_fixture";
  const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
  const local = {}, session = {}, tabs = new Map(), alarms = new Map(), opened = [], closed = [], injected = [];
  let seq = 10, fixed = true, disabled = false, contextReady = true;
  const area = values => ({
    async get(key) { return key === null ? { ...values } : { [key]: values[key] }; },
    async set(update) { Object.assign(values, structuredClone(update)); },
    async remove(key) { delete values[key]; },
  });
  const chrome = { storage: { local: area(local), session: area(session) },
    scripting: { async executeScript(options) { injected.push(options); return [{ result: fixed, documentId: "doc" }]; } },
    alarms: { async create(key, config) { alarms.set(key, config); }, async clear(key) { alarms.delete(key); } },
    tabs: {
      async create(options) { const tab = { ...options, id: ++seq }; tabs.set(tab.id, tab); opened.push(options); return tab; },
      async get(id) { if (!tabs.has(id)) throw new Error("Closed"); return tabs.get(id); },
      async query() { return [...tabs.values()]; },
      async remove(id) { assert.ok(tabs.has(id)); closed.push(id); tabs.delete(id); },
    },
  };
  const env = { chrome, crypto: require("node:crypto").webcrypto, URL, AbortSignal, fetch: null };
  vm.runInNewContext(fs.readFileSync("src/question-order-jobs.js", "utf8"), env);
  const context = { kind: "book", sourceId: source, questions: [{ id: "qs_1", taskId: task }, { id: "qs_2", taskId: "" }] };
  const deps = { siteAccess: {}, readSettings: async () => ({ disabledSites: disabled ? [origin] : [] }),
    resolveContext: async (_message, sender) => ({ ok: contextReady && !disabled && sender.frameId === 0, context }) };
  let manager = env.XetQuestionOrderJobs.create(deps);
  const sender = { tab: { id: 1, windowId: 7 }, frameId: 0, documentId: "doc",
    url: `${origin}/p/t_pc/pc_evaluation/errbook/detail/123?source_id=${source}&tab=1` };
  const message = { key: "validated-by-native-bridge", taskId: task };
  const record = { version: 1, ids: ["qs_1", "qs_2"], savedAt: 1 };
  const helper = () => ({ frameId: 0, tab: { id: [...tabs.keys()][0] }, url: [...tabs.values()][0].url });

  local[cacheKey] = record;
  assert.equal((await manager.start(message, sender)).status, "cached");
  assert.equal(opened.length, 0, "cache hits open no tabs and make no network request");
  assert.equal(injected.length, 0);
  delete local[cacheKey];
  const results = await Promise.all([manager.start(message, sender), manager.start(message, sender)]);
  assert.ok(results.every(r => r.status === "pending"));
  assert.equal(opened.length, 1, "multiple requesting documents share one helper");
  assert.equal(opened[0].active, false);
  assert.equal(opened[0].windowId, 7);
  const url = new URL(opened[0].url);
  assert.equal(url.pathname, `/p/t_pc/pc_evaluation/practice_sheet/${source}`);
  assert.equal(url.searchParams.get("task_id"), task);
  assert.ok(url.searchParams.get("xet_order_job"));
  assert.equal(injected[0].world, "MAIN");
  assert.deepEqual(Array.from(injected[0].target.documentIds), ["doc"]);
  assert.equal(Object.keys(session).length, 1);
  assert.equal(alarms.size, 1);

  manager = env.XetQuestionOrderJobs.create(deps); // Simulated MV3 worker restart.
  await manager.start(message, sender);
  assert.equal(opened.length, 1, "persisted jobs coalesce after a worker restart");
  assert.equal((await manager.finish({ status: "ready" }, helper())).ok, false, "never close before verified cache persistence");
  assert.equal((await manager.finish({ status: "failed" }, { ...helper(), tab: { id: 999 } })).ok, false);
  assert.equal(tabs.size, 1, "spoofed helper cannot close another tab");
  local[cacheKey] = record;
  assert.equal((await manager.finish({ status: "ready" }, helper())).ok, true);
  assert.equal(tabs.size, 0); assert.equal(alarms.size, 0); assert.equal(Object.keys(session).length, 0);
  delete local[cacheKey];

  fixed = false;
  assert.equal((await manager.start(message, sender)).status, "unavailable");
  assert.equal(opened.length, 1, "random or unknown config never enters a new attempt");
  fixed = true;
  assert.equal((await manager.start({ ...message, taskId: "pt_not_from_book" }, sender)).ok, false);
  assert.equal((await manager.start(message, { ...sender, frameId: 2 })).ok, false);
  disabled = true;
  assert.equal((await manager.start(message, sender)).ok, false);
  disabled = false;
  await manager.start(message, sender);
  disabled = true; await manager.settingsChanged(); disabled = false;
  assert.equal(tabs.size, 0, "site disable cleans up its helper");

  await manager.start(message, sender);
  const timeoutKey = [...alarms.keys()][0];
  manager = env.XetQuestionOrderJobs.create(deps);
  await manager.alarm({ name: timeoutKey });
  assert.equal(tabs.size, 0, "deadline cleanup survives worker restart");
  await manager.start(message, sender);
  const activated = helper(); tabs.get(activated.tab.id).active = true;
  await manager.finish({ status: "failed" }, activated);
  assert.equal(tabs.size, 1, "do not close a helper the user has activated");
  tabs.clear();
  await manager.start(message, sender);
  const navigated = helper(); tabs.get(navigated.tab.id).url = `${origin}/user-selected-page`;
  await manager.finish({ status: "failed" }, navigated);
  assert.equal(tabs.size, 1, "never close a helper after user navigation");
  tabs.clear();
  await manager.start(message, sender);
  const removed = helper(); tabs.delete(removed.tab.id); await manager.removed(removed.tab.id);
  assert.equal(Object.keys(session).length, 0, "manual closure releases the stored lock");
  assert.equal(alarms.size, 0);

  await manager.start(message, sender);
  const crashKey = [...alarms.keys()][0]; session[crashKey].tabId = null;
  await manager.alarm({ name: crashKey });
  assert.equal(tabs.size, 0, "recover a create/persist crash only by the exact owned URL marker");

  let payload;
  env.fetch = async (path, options) => { payload = { path, options }; return { ok: true,
    json: async () => ({ code: 0, data: { random_setting: 0, task_total_qs: 41 } }) }; };
  assert.equal(await env.XetQuestionOrderJobs.readFixedConfig(source, task), true);
  assert.equal(payload.path, "/xe.practice.bff/task/answer.config.get/1.0.0");
  assert.deepEqual(JSON.parse(payload.options.body), { practice_id: source, task_id: task });
  assert.equal(payload.options.credentials, "same-origin");
  assert.equal(payload.options.redirect, "error");
  console.log("background question-order tabs, coalescing, restart recovery, authorization and cleanup smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
