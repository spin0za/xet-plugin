const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ existing = false, book = true, type = 0, autoReportOnCommit = false } = {}) {
  const source = "wb_course_fixture", id = "qs_fixture", task = "pt_fixture";
  const path = `/p/t_pc/pc_evaluation/practice_sheet/${source}`, key = `${path}|${task}`;
  const entries = new Map(existing ? [[id, { id, updated_at: "old", task_id: task }]] : []);
  const q = { id, type, answer: ["option_b"], answer_state: "false", is_answer: 1,
    option: [{ id: "option_b", click: true, content: "selected" }] };
  if (type === 6) q.child_info = [{ ...q, id: "qs_child", type: 0 }];
  const writes = [], messages = [], listeners = new Map();
  let instance, failures = {}, blockReport = null, releaseReport, sequence = 0;
  let saved = { id, answer: [...q.answer], answer_state: "false", is_answer: 1 };
  const v = {
    resourceId: source, taskId: task, join_id: "uwb_fixture", practiceMode: 0,
    practiceList: [q], currentQuestion: q, updataing: false,
    local_answers: { [id]: { type, answer: q.answer } }, submitStateMap: { [id]: true },
    userAnswerState: { [id]: false }, questionStatusShowMap: { [id]: false }, materialUserAnswerState: {},
    answerSheetArray: [{ hasAnswer: true, answerStatus: "error" }], curAnswer: q.answer,
    $set: (target, name, value) => { target[name] = value; }, $nextTick: async () => {},
    $watch: () => () => {}, $message: { success: x => messages.push(x), error: x => messages.push(x) },
    shouldIgnorePracticeAnswerEvent() { return false; },
    hasPracticeQuestionDraftAnswer(question) { return (this.local_answers[question.id]?.answer?.length || 0) > 0; },
    getPracticeAnswerSheetIndex(question) { return this.practiceList.indexOf(question); },
    reportErrorQuestion() {},
    async handleCommitQs() {
      assert.equal(this, v); saved = { id, answer: [...q.answer], answer_state: "false", is_answer: 1 };
      if (autoReportOnCommit) entries.set(id, { id, updated_at: "inserted_by_commit", task_id: task });
      void this.reportErrorQuestion();
    },
  };
  const original = { commit: v.handleCommitQs, report: v.reportErrorQuestion, ignore: v.shouldIgnorePracticeAnswerEvent };
  instance = v;
  const location = { href: `https://merchant.pc.xiaoe-tech.com${path}?task_id=${task}`, pathname: path };
  const window = {
    dispatchEvent(event) { listeners.get(event.type)?.(); },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const document = { querySelector: () => instance ? { __vue__: instance } : null,
    addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
  async function fetch(endpoint, options) {
    const body = JSON.parse(options.body);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.redirect, "error");
    if (failures.before && endpoint.endsWith("/list_classfy")) throw Error("offline");
    let data = {}, code = 0;
    if (endpoint.endsWith("/list_classfy")) {
      data = { claasfy: book ? [{ id: 123, source_id: source }] : [] };
    } else if (endpoint.endsWith("/get_all_question")) {
      assert.equal(body.classfy_id, 123); assert.equal(body.source_id, source);
      data = { list: [...entries.values()] };
    } else if (endpoint.endsWith("/error_report")) {
      writes.push({ endpoint, body });
      if (blockReport) await blockReport;
      entries.set(body.question_id, { id: body.question_id, updated_at: `new_${++sequence}`, task_id: task });
      book = true;
    } else if (endpoint.endsWith("/commit_qs")) {
      writes.push({ endpoint, body });
      assert.equal(body.practice_id, source); assert.equal(body.join_id, "uwb_fixture");
      assert.equal(body.practice_mode, 0); assert.equal(body.user_answer.id, id);
      if (failures.clear) code = 4001;
      else {
        saved = body.user_answer;
        if (failures.lostClear) { failures.lostClear = false; throw Error("lost response after successful write"); }
      }
    } else if (endpoint.endsWith("/commit_record")) data = { list: [saved] };
    else if (endpoint.endsWith("/del")) {
      writes.push({ endpoint, body });
      assert.equal(body.classfy_id, 123); assert.deepEqual(body.question_ids, [id]);
      if (failures.remove) code = 4001;
      else entries.delete(id);
    } else throw Error(`Unexpected endpoint ${endpoint}`);
    return { ok: true, json: async () => ({ code, data }) };
  }
  const context = { window, document,
    location, URL, Event, AbortSignal, fetch, console };
  vm.runInNewContext(fs.readFileSync("src/practice-undo-source.js", "utf8"), context);
  const action = (name = "sync", questionId) => context.XetPracticeUndoSource.practiceUndo(name, key, questionId);
  return { action, v, q, id, key, entries, writes, failures, original, messages, context,
    saved: () => saved, detach: () => { instance = null; },
    holdReport() { blockReport = new Promise(resolve => { releaseReport = resolve; }); },
    releaseReport() { releaseReport(); },
  };
}

async function main() {
  for (const existing of [false, true]) {
    const f = fixture({ existing });
    assert.equal((await f.action()).ok, true);
    await f.v.reportErrorQuestion();
    const result = await f.action("undo", f.id);
    assert.equal(result.ok, true); assert.equal(result.removed, !existing);
    assert.equal(f.entries.has(f.id), existing);
    assert.equal(f.saved().is_answer, 0); assert.equal(f.q.answer.length, 0);
    assert.equal(f.q.option[0].click, false); assert.equal(f.v.answerSheetArray[0].hasAnswer, false);
    assert.equal(f.v.submitStateMap[f.id], false);
    await f.action("stop");
    assert.equal(f.v.handleCommitQs, f.original.commit);
    assert.equal(f.v.reportErrorQuestion, f.original.report);
    assert.equal(f.v.shouldIgnorePracticeAnswerEvent, f.original.ignore);
  }
  // Previously answered/history-loaded questions have no provenance journal.
  { const f = fixture({ existing: true }); await f.action(); await f.action("undo", f.id);
    assert.equal(f.entries.has(f.id), true); assert.equal(f.writes.some(w => w.endpoint.endsWith("/del")), false); }
  // First wrong answer creates a catalog and is still removable.
  { const f = fixture({ book: false }); await f.action(); await f.v.reportErrorQuestion();
    assert.equal((await f.action("undo", f.id)).removed, true); }
  // Servers that auto-add during commit_qs must use the BEFORE-commit baseline.
  for (const existing of [false, true]) {
    const f = fixture({ existing, autoReportOnCommit: true }); await f.action();
    await f.v.handleCommitQs();
    assert.equal((await f.action("undo", f.id)).removed, !existing);
    assert.equal(f.entries.has(f.id), existing);
  }
  // Undoing a historical answer must not turn its retained entry into a new
  // one in our baseline when the same question is answered wrong again.
  { const f = fixture({ existing: true, autoReportOnCommit: true }); await f.action();
    await f.action("undo", f.id);
    f.q.answer = ["option_b"];
    f.v.local_answers[f.id].answer = f.q.answer;
    await f.v.handleCommitQs();
    assert.equal((await f.action("undo", f.id)).removed, false);
    assert.equal(f.entries.has(f.id), true); }
  // Failed membership lookups must not suppress the site's error report or delete unknown entries.
  { const f = fixture(); await f.action(); f.failures.before = true; await f.v.reportErrorQuestion();
    assert.equal(f.entries.has(f.id), true); f.failures.before = false;
    assert.equal((await f.action("undo", f.id)).ok, true); assert.equal(f.entries.has(f.id), true); }
  // A server rejection leaves the selected answer and error book untouched.
  { const f = fixture(); await f.action(); await f.v.reportErrorQuestion(); f.failures.clear = true;
    assert.equal((await f.action("undo", f.id)).cleared, false);
    assert.equal(f.q.answer.length, 1); assert.equal(f.entries.has(f.id), true); }
  // Recover a lost clear response by reading the saved record, not by guessing.
  { const f = fixture(); await f.action(); await f.v.reportErrorQuestion(); f.failures.lostClear = true;
    assert.equal((await f.action("undo", f.id)).ok, true); assert.equal(f.saved().is_answer, 0); }
  // A failed delete is retriable even after the selection has been cleared.
  { const f = fixture(); await f.action(); await f.v.reportErrorQuestion(); f.failures.remove = true;
    assert.equal((await f.action("undo", f.id)).cleared, true);
    assert.equal((await f.action()).context.questions[0].retry, true);
    f.failures.remove = false; assert.equal((await f.action("undo", f.id)).removed, true); }
  // A different tab/new wrong attempt updated the entry: preserve it.
  { const f = fixture(); await f.action(); await f.v.reportErrorQuestion();
    f.entries.get(f.id).updated_at = "changed_elsewhere";
    assert.equal((await f.action("undo", f.id)).removed, false); assert.equal(f.entries.has(f.id), true); }
  // Duplicate reporting of the same tracked entry must not lose provenance.
  { const f = fixture(); await f.action(); await f.v.reportErrorQuestion(); await f.v.reportErrorQuestion();
    assert.equal((await f.action("undo", f.id)).removed, true); }
  // Undo waits for a late native error report and rejects double clicks.
  { const f = fixture(); await f.action(); f.holdReport(); await f.v.handleCommitQs();
    const first = f.action("undo", f.id); assert.equal((await f.action("undo", f.id)).reason, "busy");
    assert.equal(f.v.shouldIgnorePracticeAnswerEvent(), true);
    f.releaseReport(); assert.equal((await first).removed, true); assert.equal(f.entries.has(f.id), false); }
  // Rote-only; unknown identities and route/document changes cannot write.
  { const f = fixture(); f.v.practiceMode = 1; assert.equal((await f.action()).ok, false); assert.equal(f.writes.length, 0); }
  { const f = fixture(); await f.action(); assert.equal((await f.action("undo", "other_question")).ok, false);
    f.detach(); assert.equal((await f.action("undo", f.id)).ok, false); assert.equal(f.writes.length, 0); }
  for (const type of [1, 2, 3, 4, 5, 6]) {
    const f = fixture({ type }); await f.action(); assert.equal((await f.action("undo", f.id)).ok, true);
    assert.equal(f.q.answer.length, 0);
    if (type === 4) assert.equal(f.q.option[0].content, "");
    if (type === 6) { assert.equal(f.saved().child[0].is_answer, 0); assert.equal(f.q.child_info[0].answer.length, 0); }
  }
  // The MAIN bridge is restricted to authorized top-level documents.
  {
    const f = fixture(), source = f.context.XetPracticeUndoSource;
    const sender = { tab: { id: 1 }, frameId: 0, documentId: "doc", url: f.context.location.href };
    const deps = { siteAccess: { siteInfo: () => ({ origin: "https://merchant.pc.xiaoe-tech.com" }),
      isAuthorized: async () => true }, readSettings: async () => ({ disabledSites: [] }) };
    f.context.chrome = { scripting: { executeScript: async opts => {
      assert.ok(opts.args.every(arg => arg !== undefined), "Chrome scripting arguments must be serializable");
      assert.equal(opts.world, "MAIN"); assert.deepEqual(JSON.parse(JSON.stringify(opts.target)), { tabId: 1, documentIds: ["doc"] });
      return [{ documentId: "doc", result: await opts.func(...opts.args) }];
    } } };
    const message = { action: "sync", key: f.key };
    assert.equal((await source.resolve(message, sender, deps)).ok, true);
    assert.equal((await source.resolve(message, { ...sender, frameId: 1 }, deps)).ok, false);
    assert.equal((await source.resolve({ ...message, action: "undo", questionId: "../evil" }, sender, deps)).ok, false);
    deps.readSettings = async () => ({ disabledSites: ["https://merchant.pc.xiaoe-tech.com"] });
    assert.equal((await source.resolve(message, sender, deps)).ok, false);
  }
  console.log("practice undo: native state, provenance, failure recovery, race and authorization checks passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
