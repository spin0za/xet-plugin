const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const origin = "https://merchant.pc.xiaoe-tech.com", source = "wb_fixture", task = "pt_fixture";
  const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
  const local = {}, session = {}, tabs = new Map(), alarms = new Map(), opened = [], closed = [], injected = [];
  let seq = 10, fixed = true, disabled = false, contextReady = true, resolvedTask = task;
  const area = values => ({
    async get(key) { return key === null ? { ...values } : { [key]: values[key] }; },
    async set(update) { Object.assign(values, structuredClone(update)); },
    async remove(key) { delete values[key]; },
  });
  const chrome = { storage: { local: area(local), session: area(session) },
    scripting: { async executeScript(options) { injected.push(options); return [{
      result: options.func.name === "readTaskId" ? resolvedTask : options.func.name === "prepareHelper" ? "marked" : fixed,
      documentId: "doc" }]; } },
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
  const deps = { siteAccess: { isAuthorized: async () => true }, readSettings: async () => ({ disabledSites: disabled ? [origin] : [] }),
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
  assert.equal((await manager.status(message, sender)).status, "pending");

  manager = env.XetQuestionOrderJobs.create(deps); // Simulated MV3 worker restart.
  await manager.start(message, sender);
  assert.equal(opened.length, 1, "persisted jobs coalesce after a worker restart");
  assert.equal((await manager.finish({ status: "ready" }, helper())).ok, false, "never close before verified cache persistence");
  assert.equal((await manager.finish({ status: "failed" }, { ...helper(), tab: { id: 999 } })).ok, false);
  assert.equal(tabs.size, 1, "spoofed helper cannot close another tab");
  local[cacheKey] = record;
  assert.equal((await manager.finish({ status: "ready" }, helper())).ok, true);
  assert.equal(tabs.size, 0); assert.equal(alarms.size, 0); assert.equal(Object.keys(session).length, 0);
  assert.equal((await manager.status(message, sender)).status, "failed", "A finished/missing job must not be reported as permanently pending");
  assert.equal((await manager.status(message, { ...sender, frameId: 2 })).ok, false);
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
  const late = helper(), lateURL = new URL(late.url), lateToken = lateURL.searchParams.get("xet_order_job");
  lateURL.searchParams.delete("xet_order_job");
  assert.equal((await manager.finish({ status: "ready", token: "00000000-0000-0000-0000-000000000000" }, late)).ok, false);
  local[cacheKey] = record;
  assert.equal((await manager.finish({ status: "ready", token: lateToken }, { ...late, url: lateURL.href })).ok, true,
    "A sender's original document URL may lack a history-restored marker; persisted tab/source/task ownership still verifies completion");
  assert.equal(tabs.size, 0); delete local[cacheKey];

  await manager.start(message, sender);
  const crashKey = [...alarms.keys()][0]; session[crashKey].tabId = null;
  const manualId = 900;
  tabs.set(manualId, { id: manualId, active: false,
    url: `${origin}/p/t_pc/pc_evaluation/practiceConfig/${source}?task_id=${task}` });
  const prepareCount = injected.length;
  await manager.updated(manualId, { status: "complete" });
  assert.equal(injected.length, prepareCount, "Do not automate unrelated user-created configuration tabs");
  await manager.alarm({ name: crashKey });
  assert.equal(tabs.size, 1, "recover a create/persist crash only by the exact owned URL marker");
  assert.ok(tabs.has(manualId), "Never claim a markerless manual tab when a persisted job lost its tab ID");
  tabs.delete(manualId);

  const originalQuestions = context.questions;
  context.questions = [{ id: "qs_1", taskId: "" }, { id: "qs_2", taskId: "" }];
  const before = opened.length;
  await manager.start({ ...message, taskId: "" }, sender);
  assert.equal(new URL(opened.at(-1).url).searchParams.get("task_id"), task, "Resolve the course task before entering a taskless book's original practice");
  await manager.start({ ...message, taskId: "" }, sender);
  context.questions = originalQuestions; await manager.start(message, sender);
  assert.equal(opened.length, before + 1, "Resolved and explicit task requests coalesce into one helper");
  const redirected = [...tabs.values()][0];
  redirected.url = `${origin}/p/t_pc/pc_evaluation/practiceConfig/${source}?task_id=${task}`;
  await manager.updated(redirected.id, { status: "complete" });
  await manager.updated(redirected.id, { status: "complete" });
  const prepares = injected.filter(i => i.func.name === "prepareHelper");
  assert.deepEqual(prepares.map(i => i.args[3]), [true, false], "Only start the site's configuration once, even on repeated tab events");
  redirected.active = true; await manager.updated(redirected.id, { status: "complete" });
  assert.equal(injected.filter(i => i.func.name === "prepareHelper").length, 2, "Never automate an activated helper");
  redirected.active = false;
  await manager.alarm({ name: [...alarms.keys()][0] });
  assert.equal(tabs.size, 0, "Clean up an owned native configuration redirect even after its marker was lost");
  context.questions = [{ id: "qs_1", taskId: "" }]; resolvedTask = null;
  assert.equal((await manager.start({ ...message, taskId: "" }, sender)).status, "unavailable");
  assert.equal(opened.length, before + 1, "Missing course metadata must not create another invalid taskless attempt");
  context.questions = originalQuestions;

  // Exercise the actual serialized page function, not just executeScript mocks.
  let timer, starts = 0;
  const pageURL = new URL(`${origin}/p/t_pc/pc_evaluation/practiceConfig/${source}?task_id=${task}`);
  env.location = { get href() { return pageURL.href; }, get pathname() { return pageURL.pathname; } };
  env.history = { replaceState(_state, _title, url) { pageURL.href = url; } };
  env.Event = Event; env.window = new EventTarget();
  let nativeConfig = { practiceId: source, taskId: task, questionMode: 0, answerNumMode: 0,
    taskInfo: { random_setting: -1, task_total_qs: 34, practice_num: -1 }, toPractice() { starts++; } };
  env.document = { visibilityState: "hidden", querySelector: () => ({ __vue__: nativeConfig }) };
  env.setInterval = fn => { timer = fn; return fn; };
  env.clearInterval = fn => { if (timer === fn) timer = null; };
  const prepare = env.XetQuestionOrderJobs.prepareHelper;
  let pending = prepare(source, task, "fixture", true);
  timer(); assert.equal(await pending, "started"); assert.equal(starts, 1); assert.equal(timer, null);
  assert.equal(pageURL.searchParams.get("xet_order_job"), "fixture");
  assert.equal(await prepare(source, task, "fixture", false), "marked");
  assert.equal(await prepare(source, task, "different-token", true), "failed");
  assert.equal(await prepare("wb_other", task, "fixture", true), "failed");
  for (const override of [{ questionMode: 1 }, { answerNumMode: 1 }, { taskId: "pt_other" },
    { taskInfo: { random_setting: 1, task_total_qs: 34, practice_num: -1 } },
    { taskInfo: { random_setting: -1, task_total_qs: 34, practice_num: 10 } }]) {
    const previous = nativeConfig; nativeConfig = { ...nativeConfig, ...override };
    pending = prepare(source, task, "fixture", true); timer();
    assert.equal(await pending, "failed"); nativeConfig = previous;
  }
  env.document.visibilityState = "visible";
  pending = prepare(source, task, "fixture", true); timer(); assert.equal(await pending, "failed");
  env.document.visibilityState = "hidden";
  const info = nativeConfig.taskInfo; nativeConfig.taskInfo = {};
  pending = prepare(source, task, "fixture", true); timer(); assert.ok(timer, "Wait for native async config readiness");
  nativeConfig.taskInfo = info; timer(); assert.equal(await pending, "started"); assert.equal(starts, 2);
  pending = prepare(source, task, "fixture", true);
  pageURL.pathname = `/p/t_pc/pc_evaluation/practice_sheet/${source}`;
  timer(); assert.equal(await pending, "marked", "Native resume redirects must not wait for missing configuration or close a valid sheet");
  assert.equal(starts, 2, "Unsafe/redirected configurations never start another attempt");
  pageURL.pathname = `/p/t_pc/pc_evaluation/practiceConfig/${source}`;
  nativeConfig.taskInfo = {}; let now = 0; env.Date = { now: () => now };
  pending = prepare(source, task, "fixture", true);
  now = 15_000; timer();
  assert.equal(await pending, "failed", "Background timer throttling must not turn a 15-second config deadline into 150 seconds");
  nativeConfig.taskInfo = info;

  let payload;
  env.fetch = async (path, options) => { payload = { path, options }; return { ok: true,
    json: async () => ({ code: 0, data: { random_setting: 0, task_total_qs: 41 } }) }; };
  assert.equal(await env.XetQuestionOrderJobs.readFixedConfig(source, task), true);
  assert.equal(payload.path, "/xe.practice.bff/task/answer.config.get/1.0.0");
  assert.deepEqual(JSON.parse(payload.options.body), { practice_id: source, task_id: task });
  assert.equal(payload.options.credentials, "same-origin");
  assert.equal(payload.options.redirect, "error");
  for (const taskId of [task, ""]) {
    for (const setting of [0, "0", -1, "-1", 1, "1", 2, null, undefined, false]) {
      env.fetch = async () => ({ ok: true, json: async () => ({ code: 0,
        data: taskId ? { random_setting: setting } : { is_random: setting } }) });
      const expected = setting === 0 || setting === "0" || setting === -1 || setting === "-1";
      assert.equal(await env.XetQuestionOrderJobs.readFixedConfig(source, taskId), expected,
        `Validate the actual taskless legacy flag without accepting random/unknown configuration: ${String(setting)}`);
    }
  }
  for (const [data, expected] of [[{ create_from: 3, course_task_id: task }, task],
    [{ create_from: 3 }, null], [{ create_from: 0 }, ""], [{}, null],
    [{ create_from: 3, course_task_id: "../bad" }, null]]) {
    env.fetch = async (path, options) => {
      assert.equal(path, "/xe.practice.bff/info/get.practice.type/1.0.0");
      assert.deepEqual(JSON.parse(options.body), { practice_id: source });
      return { ok: true, json: async () => ({ code: 0, data }) };
    };
    assert.equal(await env.XetQuestionOrderJobs.readTaskId(source), expected);
  }
  console.log("background question-order tabs, coalescing, restart recovery, authorization and cleanup smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
