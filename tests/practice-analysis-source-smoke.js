const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const origin = "https://merchant.pc.xiaoe-tech.com";
  const path = "/p/t_pc/pc_evaluation/practice_analysis/wb_course_fixture";
  const key = `${path}|join_fixture|task_fixture`;
  const instance = { resourceId: "wb_course_fixture", join_id: "join_fixture", practiceList: [
    { id: "qs_fixture_1", is_collected: true, answer: "never expose", content: "private" },
    { id: "qs_fixture_2", is_collected: false },
  ] };
  const context = { URL, Set, location: { href: `${origin}${path}?join_id=join_fixture&task_id=task_fixture` },
    document: { querySelector: () => ({ __vue__: instance }) } };
  vm.runInNewContext(fs.readFileSync("src/practice-analysis-source.js", "utf8"), context);
  const { readAnalysisContext, showAnalysisFeedback, resolve } = context.XetPracticeAnalysisSource;
  const snapshot = JSON.parse(JSON.stringify(readAnalysisContext(key)));
  assert.deepEqual(snapshot.questions, [
    { id: "qs_fixture_1", index: 0, collected: true },
    { id: "qs_fixture_2", index: 1, collected: false },
  ]);
  assert.ok(!JSON.stringify(snapshot).includes("never expose"));
  assert.equal(readAnalysisContext(`${key}other`), null, "stale SPA route rejected");
  instance.join_id = "other";
  assert.equal(readAnalysisContext(key), null, "pending Vue route rejected");
  instance.join_id = "join_fixture";
  instance.practiceList[1].id = undefined;
  assert.equal(readAnalysisContext(key), null, "undefined is not a question ID");
  instance.practiceList[1].id = "qs_fixture_1";
  assert.equal(readAnalysisContext(key), null, "duplicate IDs rejected");
  instance.practiceList[1].id = "qs_fixture_2";
  context.location.href = `${origin}/p/t_pc/pc_evaluation/practice_sheet/wb_course_fixture`;
  assert.equal(readAnalysisContext(key), null, "never inspect an in-progress answer sheet");
  context.location.href = `${origin}${path}?join_id=join_fixture&task_id=task_fixture`;
  const notices = [];
  instance.$message = {
    success: text => notices.push(["success", text]),
    error: text => notices.push(["error", text]),
  };
  for (const feedback of ["mark", "unmark", "collect", "uncollect", "mark-error"]) {
    assert.equal(showAnalysisFeedback(key, feedback), true);
  }
  assert.deepEqual(notices, [["success", "标记成功"], ["success", "取消标记成功"],
    ["success", "收藏成功"], ["success", "取消收藏成功"], ["error", "标记操作失败，请稍后重试"]]);
  assert.equal(showAnalysisFeedback(key, "<script>arbitrary feedback</script>"), false);
  assert.equal(showAnalysisFeedback(key, "constructor"), false);
  assert.equal(showAnalysisFeedback(`${key}other`, "mark"), false);
  delete instance.$message;
  assert.equal(showAnalysisFeedback(key, "mark"), false, "missing site component uses the local fallback");
  let disabledSites = [];
  let allowed = true;
  const injections = [];
  let resultDocument = "document_fixture";
  context.chrome = { scripting: { async executeScript(options) {
    injections.push(options);
    return [{ result: options.func === showAnalysisFeedback ? true : snapshot, documentId: resultDocument }];
  } } };
  const deps = { siteAccess: {
    siteInfo: url => url ? { origin: new URL(url).origin } : null,
    isAuthorized: async () => allowed,
  }, readSettings: async () => ({ disabledSites }) };
  const sender = { tab: { id: 42, url: context.location.href }, url: context.location.href,
    frameId: 0, documentId: "document_fixture" };
  assert.equal((await resolve({ key }, sender, deps)).ok, true);
  assert.equal(injections[0].world, "MAIN");
  assert.deepEqual(JSON.parse(JSON.stringify(injections[0].target)), { tabId: 42, documentIds: ["document_fixture"] });
  assert.equal((await resolve({ key }, { ...sender, frameId: 1 }, deps)).ok, false);
  assert.equal((await resolve({ key: {} }, sender, deps)).ok, false);
  disabledSites = [origin];
  assert.equal((await resolve({ key }, sender, deps)).ok, false);
  disabledSites = []; allowed = false;
  assert.equal((await resolve({ key }, sender, deps)).ok, false);
  assert.equal(injections.length, 1, "disabled and unauthorized sites never get MAIN injection");
  allowed = true;
  assert.equal((await resolve({ type: "xet:analysis-feedback", key, feedback: "arbitrary" }, sender, deps)).ok, false);
  assert.equal(injections.length, 1, "unknown feedback never gets MAIN injection");
  assert.equal((await resolve({ type: "xet:analysis-feedback", key, feedback: "unmark" }, sender, deps)).ok, true);
  assert.equal(injections[1].func, showAnalysisFeedback);
  assert.deepEqual(JSON.parse(JSON.stringify(injections[1].args)), [key, "unmark"]);
  disabledSites = [origin];
  assert.equal((await resolve({ type: "xet:analysis-feedback", key, feedback: "mark" }, sender, deps)).ok, false);
  assert.equal(injections.length, 2, "disabled sites never invoke native messages");
  disabledSites = [];
  allowed = true; resultDocument = "new_document";
  assert.equal((await resolve({ key }, sender, deps)).ok, false);
  console.log("practice analysis identity and native feedback bridge smoke test passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
