const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const origin = "https://merchant.pc.xiaoe-tech.com";
  const bookPath = "/p/t_pc/pc_evaluation/errbook/detail/123";
  const bookKey = `${bookPath}|wb_course_fixture|||1`;
  const cards = [1, 2].map(() => ({ matches: s => s === ".question-card", setAttribute() {} }));
  const instance = { sourceId: "wb_course_fixture", classifyId: "123", currentTab: 1, loading: false,
    questionList: [{ id: "qs_1", task_id: "pt_fixture", answer: "secret" }, { id: "qs_2", task_id: "pt_fixture" }],
    _vnode: { children: cards.map((elm, i) => ({ key: `qs_${i + 1}`, elm })) } };
  const page = { __vue__: instance, querySelectorAll: () => cards };
  const context = { URL, Set, Map, location: { href: `${origin}${bookPath}?tab=1&source_id=wb_course_fixture` },
    document: { querySelector: () => page } };
  vm.runInNewContext(fs.readFileSync("src/question-order-source.js", "utf8"), context);
  const { readQuestionOrderContext, resolve } = context.XetQuestionOrderSource;
  const snapshot = JSON.parse(JSON.stringify(readQuestionOrderContext(bookKey)));
  assert.deepEqual(snapshot.questions, [{ id: "qs_1", taskId: "pt_fixture" }, { id: "qs_2", taskId: "pt_fixture" }]);
  assert.ok(!JSON.stringify(snapshot).includes("secret"));
  cards.reverse();
  assert.deepEqual(Array.from(readQuestionOrderContext(bookKey).cardIds), ["qs_2", "qs_1"], "card identity follows Vue keys, not DOM indexes");
  assert.equal(readQuestionOrderContext(bookKey + "stale"), null);
  instance.loading = true; assert.equal(readQuestionOrderContext(bookKey), null); instance.loading = false;
  instance.currentTab = 2; assert.equal(readQuestionOrderContext(bookKey), null); instance.currentTab = 1;
  instance.questionList[1].id = "qs_1"; assert.equal(readQuestionOrderContext(bookKey), null); instance.questionList[1].id = "qs_2";
  instance._vnode = null; assert.equal(readQuestionOrderContext(bookKey), null, "unknown rendering structure fails closed");
  context.location.href = `${origin}/p/t_pc/pc_evaluation/practice_analysis/wb_course_fixture?task_id=pt_fixture&join_id=uwb_fixture`;
  const practiceKey = "/p/t_pc/pc_evaluation/practice_analysis/wb_course_fixture|wb_course_fixture|pt_fixture|uwb_fixture|1";
  Object.assign(instance, { resourceId: "wb_course_fixture", taskId: "pt_fixture", join_id: "uwb_fixture" });
  assert.equal(readQuestionOrderContext(practiceKey).joinId, "uwb_fixture");
  instance.join_id = ""; assert.equal(readQuestionOrderContext(practiceKey), null); instance.join_id = "uwb_fixture";
  instance.taskId = "other"; assert.equal(readQuestionOrderContext(practiceKey), null); instance.taskId = "pt_fixture";
  const injections = [];
  let disabledSites = [], allowed = true, resultDocument = "document_fixture";
  context.chrome = { scripting: { async executeScript(options) {
    injections.push(options); return [{ result: snapshot, documentId: resultDocument }];
  } } };
  const sender = { tab: { id: 42 }, frameId: 0, documentId: "document_fixture", url: context.location.href };
  const deps = { siteAccess: { siteInfo: url => ({ origin: new URL(url).origin }), isAuthorized: async () => allowed },
    readSettings: async () => ({ disabledSites }) };
  assert.equal((await resolve({ key: practiceKey }, sender, deps)).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(injections[0].target)), { tabId: 42, documentIds: ["document_fixture"] });
  assert.equal(injections[0].world, "MAIN");
  assert.equal((await resolve({ key: practiceKey }, { ...sender, frameId: 1 }, deps)).ok, false);
  disabledSites = [origin]; assert.equal((await resolve({ key: practiceKey }, sender, deps)).ok, false);
  disabledSites = []; allowed = false; assert.equal((await resolve({ key: practiceKey }, sender, deps)).ok, false);
  assert.equal(injections.length, 1, "disabled and unauthorized origins do not get MAIN access");
  allowed = true; resultDocument = "new_document"; assert.equal((await resolve({ key: practiceKey }, sender, deps)).ok, false);
  console.log("original question-order identity and authorization smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
