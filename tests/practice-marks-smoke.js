const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const script = fs.readFileSync("src/practice-marks-source.js", "utf8");
const path = "/p/t_pc/pc_evaluation/practice_sheet/wb_course_fixture";
const key = `${path}|task_fixture`;
const json = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(mode = 1) {
  const marks = { qs_one: true, qs_two: false, qs_three: true };
  const calls = [], notices = [], routes = [], listeners = new Map();
  const flags = { failRestore: false, rejectReport: false, loseReport: false, badSnapshot: false, holdRead: false };
  let releaseRead;
  const v = { resourceId: "wb_course_fixture", join_id: "join_fixture", taskId: "task_fixture", course_id: "course_fixture",
    practiceMode: mode, hasPracticeSubmit: false, cleaned: 0, nativeReports: 0,
    handUpReport() { v.nativeReports++; },
    async updateQuestionMarkStatus(id, value) { marks[id] = value; return { code: 0 }; },
    handleDeleteLocalStorage() { v.cleaned++; },
    $message: { error: text => notices.push(text) },
    $router: { async replace(route) {
      assert.ok(marks.qs_one && marks.qs_three, "must restore flags before navigation");
      routes.push(json(route));
    } },
  };
  const nativeReport = v.handUpReport, nativeMark = v.updateQuestionMarkStatus;
  const context = { URL, Promise, Set, AbortSignal, Date, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, location: {
    href: `https://merchant.pc.xiaoe-tech.com${path}?task_id=task_fixture`, pathname: path,
  }, document: { querySelector: () => ({ __vue__: v }) },
    window: { dispatchEvent(event) {
      if (event.type === 'xet:practice-submitted') {
        const saved = context.window.__xetPracticeMarks.recovery;
        assert.equal(saved.reported, true); assert.ok(saved.submittedAt > 0);
        calls.push({ endpoint:'local:history', submittedAt:saved.submittedAt, body:{} });
        listeners.get('xet:practice-history-saved')?.({detail:JSON.stringify({joinId:event.detail,ok:true,synced:true})});
      }
    }, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name, fn) {
      if (listeners.get(name) === fn) listeners.delete(name);
    } },
    async fetch(endpoint, options) {
      const body = JSON.parse(options.body);
      calls.push({ endpoint, body });
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.redirect, "error");
      if (body.practice_id) assert.equal(body.join_id, "join_fixture");
      let code = 0, data = {};
      if (endpoint.endsWith("/commit_record")) {
        if (flags.holdRead) await new Promise(resolve => { releaseRead = resolve; });
        data = { list: Object.entries(marks).map(([id, flag]) => ({ id,
          ...(!flags.badSnapshot ? { is_marked: Number(flag) } : {}), answer: "private answer never copied" })) };
      } else if (endpoint.endsWith("/report")) {
        if (flags.rejectReport) code = 4001;
        else {
          Object.keys(marks).forEach(id => { marks[id] = false; });
          if (flags.loseReport) throw new TypeError("lost response");
          data = { err_url: "fixture" };
        }
      } else if (endpoint.endsWith("/question.mark/1.0.0")) {
        assert.equal(body.source_id, "wb_course_fixture");
        assert.equal(body.join_id, "join_fixture");
        assert.equal(body.source_type, 1);
        assert.equal(body.is_mark, 1);
        if (flags.failRestore && body.question_id === "qs_three") code = 5001;
        else marks[body.question_id] = true;
      } else throw Error(`Unexpected endpoint ${endpoint}`);
      return { ok: true, async json() { return { code, data }; } };
    },
  };
  vm.runInNewContext(script, context);
  const api = context.XetPracticeMarksSource;
  return { api, v, calls, notices, routes, flags, marks, context, listeners, nativeReport, nativeMark,
    releaseRead: () => releaseRead() };
}

async function main() {
  for (const mode of [0, 1]) {
    const t = setup(mode);
    assert.equal(t.api.protectPracticeMarks("start", key).ok, true);
    const report = t.v.handUpReport;
    assert.equal(t.api.protectPracticeMarks("start", key).ok, true);
    assert.equal(t.v.handUpReport, report, "installation is idempotent");
    let callback;
    const pending = report(data => { callback = data; });
    assert.equal(report(), pending, "double click shares the same submission");
    await pending;
    assert.equal(t.v.nativeReports, 0, "native unprotected report is not submitted too");
    assert.equal(t.calls.filter(c => c.endpoint.endsWith("/report")).length, 1);
    assert.equal(t.calls.find(c => c.endpoint.endsWith("/report")).body.practice_mode, mode);
    assert.deepEqual(t.marks, { qs_one: true, qs_two: false, qs_three: true });
    assert.equal(t.v.cleaned, 1);
    assert.deepEqual(json(callback), { err_url: "fixture" });
    assert.equal(t.routes.length, 1);
    assert.equal(t.routes[0].query.join_id, "join_fixture");
    assert.equal(t.routes[0].query.task_id, "task_fixture");
    assert.equal(t.calls.filter(c => c.endpoint === 'local:history').length, 1);
    assert.ok(t.calls.findIndex(c => c.endpoint === 'local:history') < t.calls.findIndex(c => c.body.is_mark), 'Persist before restoring/navigating');
    assert.ok(!JSON.stringify(t.calls).includes("private answer"));
    t.api.protectPracticeMarks("stop", key);
    assert.equal(t.v.handUpReport, t.nativeReport);
    assert.equal(t.v.updateQuestionMarkStatus, t.nativeMark);
    assert.equal(t.listeners.size, 0);
  }
  {
    const t = setup();
    let finish;
    t.v.updateQuestionMarkStatus = async () => { await new Promise(resolve => { finish = resolve; }); t.marks.qs_two = true; return { code: 0 }; };
    t.api.protectPracticeMarks("start", key);
    const mark = t.v.updateQuestionMarkStatus("qs_two", true);
    const report = t.v.handUpReport();
    await tick(); assert.equal(t.calls.length, 0, "pending native marks finish before snapshot");
    await assert.rejects(t.v.updateQuestionMarkStatus("qs_one", false), /正在交卷/);
    finish(); await mark; await report;
    assert.equal(t.marks.qs_two, true);
  }
  {
    const t = setup(); t.flags.failRestore = true;
    t.api.protectPracticeMarks("start", key);
    await t.v.handUpReport();
    assert.equal(t.routes.length, 0, "failed restore does not navigate with erased flags");
    assert.ok(t.notices[0].includes("重试恢复"));
    t.flags.failRestore = false;
    await t.v.handUpReport();
    assert.equal(t.calls.filter(c => c.endpoint.endsWith("/report")).length, 1, "retry restores only, never resubmits");
    assert.equal(t.calls.filter(c => c.body.question_id === "qs_one").length, 1, "skip already restored marks");
    assert.equal(t.routes.length, 1);
    assert.equal(t.calls.filter(c => c.endpoint === 'local:history').length, 1, 'Retry must not create another time');
  }
  {
    const t = setup(); t.flags.rejectReport = true;
    t.api.protectPracticeMarks("start", key);
    await t.v.handUpReport();
    assert.equal(t.calls.filter(c => c.body.is_mark).length, 0);
    assert.equal(t.calls.filter(c => c.endpoint === 'local:history').length, 0, 'Rejected submissions have no time');
    t.flags.rejectReport = false;
    await t.v.handUpReport();
    assert.equal(t.routes.length, 1, "known rejection may safely be retried");
  }
  {
    const t = setup(); t.flags.loseReport = true;
    t.api.protectPracticeMarks("start", key);
    await t.v.handUpReport(); await t.v.handUpReport();
    assert.equal(t.calls.filter(c => c.endpoint.endsWith("/report")).length, 1);
    assert.equal(t.routes.length, 0);
    assert.equal(t.calls.filter(c => c.endpoint === 'local:history').length, 0, 'Lost responses must not invent confirmation');
    assert.equal(t.marks.qs_one, true);
    assert.ok(t.notices.every(n => n.includes("暂无法确认")));
  }
  {
    const t = setup();
    t.context.window.dispatchEvent = event => {
      if (event.type === 'xet:practice-submitted') t.listeners.get('xet:practice-history-saved')?.({
        detail:JSON.stringify({joinId:event.detail,ok:false})});
    };
    t.api.protectPracticeMarks('start',key);
    await t.v.handUpReport();
    const firstTime=t.context.window.__xetPracticeMarks.recovery.submittedAt;
    assert.equal(t.routes.length,0,'A failed durable save must not discard the in-memory confirmation by navigating');
    assert.ok(t.marks.qs_one && t.marks.qs_three,'History storage failure must not skip mark restoration');
    t.context.window.dispatchEvent = event => {
      if (event.type === 'xet:practice-submitted') t.listeners.get('xet:practice-history-saved')?.({
        detail:JSON.stringify({joinId:event.detail,ok:true,synced:false})});
    };
    await t.v.handUpReport();
    assert.equal(t.routes.length,1,'A durable local fallback may navigate even when sync is full');
    assert.equal(t.context.window.__xetPracticeMarks.recovery.submittedAt,firstTime);
    assert.equal(t.calls.filter(c=>c.endpoint.endsWith('/report')).length,1);
  }
  {
    const t = setup(); t.flags.badSnapshot = true;
    t.api.protectPracticeMarks("start", key);
    await t.v.handUpReport();
    assert.equal(t.calls.length, 1, "unknown flags never submit or guess");
  }
  {
    const t = setup(); t.flags.holdRead = true;
    t.api.protectPracticeMarks("start", key);
    const report = t.v.handUpReport(); await tick();
    t.api.protectPracticeMarks("stop", key); t.releaseRead(); await report;
    assert.equal(t.calls.length, 1, "leaving during snapshot never submits");
  }
  {
    const t = setup();
    assert.equal(t.api.protectPracticeMarks("start", key + "stale").ok, false);
    t.v.join_id = "invalid/join";
    assert.equal(t.api.protectPracticeMarks("start", key).ok, false);
    const injections = [];
    t.context.chrome = { scripting: { async executeScript(args) { injections.push(args); return [{ result: { ok: true }, documentId: "doc" }]; } } };
    const sender = { tab: { id: 1 }, url: "https://merchant.pc.xiaoe-tech.com/", frameId: 0, documentId: "doc" };
    let disabled = false;
    const deps = { siteAccess: { siteInfo: () => ({ origin: "https://merchant.pc.xiaoe-tech.com" }), isAuthorized: async () => true },
      readSettings: async () => ({ disabledSites: disabled ? ["https://merchant.pc.xiaoe-tech.com"] : [] }) };
    assert.equal((await t.api.resolve({ action: "start", key }, sender, deps)).ok, true);
    assert.equal(injections[0].world, "MAIN");
    assert.deepEqual(json(injections[0].target), { tabId: 1, documentIds: ["doc"] });
    disabled = true;
    assert.equal((await t.api.resolve({ action: "start", key }, sender, deps)).ok, false);
    assert.equal((await t.api.resolve({ action: "start", key }, { ...sender, frameId: 2 }, deps)).ok, false);
    assert.equal(injections.length, 1);
  }
  console.log("practice marks submission preservation smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
