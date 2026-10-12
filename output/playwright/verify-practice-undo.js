async (page) => {
  const origin = "https://merchant.pc.xiaoe-tech.com";
  const source = "wb_course_undo_fixture", task = "pt_undo_fixture";
  const url = `${origin}/p/t_pc/pc_evaluation/practice_sheet/${source}?task_id=${task}`;
  let worker = page.context().serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  const workerReady = worker ? Promise.resolve(worker) : page.context().waitForEvent("serviceworker",
    { predicate: w => w.url().endsWith("/src/background.js"), timeout: 15000 });
  const fixture = await page.context().newPage();
  const writes = [], errors = [];
  const entries = new Map([["qs_2", { id: "qs_2", updated_at: "before", task_id: task }]]);
  const saved = new Map();
  let failRemove = false;
  let stage = "initial buttons";
  fixture.on("pageerror", error => errors.push(error.message));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    if (worker) await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.route(`${origin}/**`, async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        let data = {}, code = 0;
        if (path.endsWith("/list_classfy")) data = { claasfy: [{ id: 123, source_id: source }] };
        else if (path.endsWith("/get_all_question")) data = { list: [...entries.values()] };
        else if (path.endsWith("/error_report")) {
          writes.push({ path, body });
          entries.set(body.question_id, { id: body.question_id, updated_at: `new_${writes.length}`, task_id: task });
        } else if (path.endsWith("/commit_qs")) {
          writes.push({ path, body }); saved.set(body.user_answer.id, body.user_answer);
          if (body.user_answer.answer_state === "false") entries.set(body.user_answer.id,
            { id: body.user_answer.id, updated_at: `commit_${writes.length}`, task_id: task });
        }
        else if (path.endsWith("/commit_record")) data = { list: [...saved.values()] };
        else if (path.endsWith("/del")) {
          writes.push({ path, body });
          if (failRemove) code = 4001;
          else for (const id of body.question_ids) entries.delete(id);
        } else if (path.endsWith("/answer.config.get/1.0.0")) data = { random_setting: 1 };
        else throw new Error(`Unexpected fixture API ${path}`);
        await route.fulfill({ json: { code, data } }); return;
      }
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="zh-CN"><style>
        body{font:16px Arial,sans-serif;background:#f5f7fb;color:#333;padding:20px;margin:0}
        .practice-sheet{max-width:960px;margin:auto;background:#fff;border-radius:12px;padding:24px}
        .question-wrapper{padding:12px 0 24px;border-bottom:1px solid #ebebeb}
        .question-block__head,.question-block__meta{display:flex;align-items:center;min-height:32px}
        .question-type{font-size:12px;color:#1472ff;background:#ebf3ff;padding:3px 6px;margin-left:10px}
        .option{display:block;margin:16px 0;padding:8px 12px;background:#fff;border:1px solid #ddd;border-radius:8px}
        .feedback{position:fixed;top:40px;left:50%;transform:translateX(-50%);background:white;box-shadow:0 8px 24px #0002;padding:12px}
        .feedback:empty{display:none}
      </style><div class="feedback" role="status"></div><div class="practice-sheet">
        ${[1,2,3].map(n => `<div class="question-wrapper" id="practice-question-anchor-${n}">
          <div class="question-block__head"><div class="question-block__meta">${n}.<span class="question-type">单选题</span></div></div>
          <p class="question-content">题目 ${n}：可以重新选择的答案</p>
          <button class="option" data-index="${n - 1}">选择 B</button><div class="answer-state"></div></div>`).join("")}
      </div><script>
        const qs=[1,2,3].map(n=>({id:'qs_'+n,type:0,answer:n===1?[]:['B'],answer_state:n===1?'':n===2?'false':'true',is_answer:n===1?0:1,option:[{id:'B',click:n!==1}]}));
        const callbacks=[];
        const post=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()};
        const v={resourceId:'${source}',taskId:'${task}',join_id:'uwb_fixture',practiceMode:0,isInitializingPracticePage:false,
          practiceList:qs,currentQuestion:qs[0],updataing:false,isHydratingPracticeQuestions:false,
          local_answers:Object.fromEntries(qs.map(q=>[q.id,{type:q.type,answer:q.answer}])),
          submitStateMap:{qs_1:false,qs_2:true,qs_3:true},userAnswerState:{qs_2:false,qs_3:true},
          questionStatusShowMap:{},materialUserAnswerState:{},
          answerSheetArray:qs.map(q=>({hasAnswer:!!q.answer.length,answerStatus:q.answer_state==='false'?'error':q.answer_state==='true'?'success':'default'})),
          hasPracticeQuestionDraftAnswer(q){return !!this.local_answers[q.id]?.answer?.length},
          getPracticeAnswerSheetIndex(q){return this.practiceList.indexOf(q)},
          $watch(get,cb){callbacks.push(cb);return()=>{const i=callbacks.indexOf(cb);if(i>=0)callbacks.splice(i,1)}},
          $set(target,key,value){target[key]=value;queueMicrotask(()=>{render();callbacks.forEach(cb=>cb())})},
          $nextTick:async()=>{},$message:{success:message,error:message},
          shouldIgnorePracticeAnswerEvent(){return this.isHydratingPracticeQuestions},
          async reportErrorQuestion(){await post('/evaluation_wechat/practices/error_report',{source_id:this.resourceId,question_id:this.currentQuestion.id,source_type:1,question_type:1})},
          async handleCommitQs(){const q=this.currentQuestion;await post('/evaluation_wechat/practices/commit_qs',{practice_id:this.resourceId,join_id:this.join_id,practice_mode:0,user_answer:{id:q.id,answer:q.answer,answer_state:q.answer_state,is_answer:1},report_index:this.practiceList.indexOf(q)});if(q.answer_state==='false')void this.reportErrorQuestion()},
        };
        v.originalReport=v.reportErrorQuestion;
        document.querySelector('.practice-sheet').__vue__=v;
        function message(text){document.querySelector('.feedback').textContent=text}
        function render(){qs.forEach((q,i)=>{document.querySelectorAll('.answer-state')[i].textContent=q.answer.length?(q.answer_state==='false'?'回答错误':'回答正确'):'未作答';document.querySelectorAll('.option')[i].setAttribute('aria-pressed',String(!!q.answer.length))})}
        document.querySelectorAll('.option').forEach(button=>button.addEventListener('click',()=>{
          if(v.shouldIgnorePracticeAnswerEvent())return;const i=Number(button.dataset.index),q=qs[i];if(q.answer.length)return;
          v.currentQuestion=q;v.$set(q,'answer',['B']);v.$set(q,'answer_state','false');v.$set(q,'is_answer',1);
          v.$set(v.local_answers,q.id,{type:0,answer:q.answer});v.$set(v.submitStateMap,q.id,true);
          v.$set(v.answerSheetArray[i],'hasAnswer',true);v.$set(v.answerSheetArray[i],'answerStatus','error');void v.handleCommitQs();
        }));render();
      </script></html>` });
    });
    await fixture.setViewportSize({ width: 1280, height: 900 });
    await fixture.goto(url);
    worker = await workerReady;
    const undo = fixture.locator(".xet-practice-undo");
    try { await undo.first().waitFor({ timeout: 5000 }); }
    catch (error) {
      console.log(await worker.evaluate(async ({ url, key }) => {
        const [tab] = await chrome.tabs.query({ url });
        const [isolated] = await chrome.scripting.executeScript({ target: { tabId: tab.id },
          func: () => ({ keys: Object.keys(globalThis.__xetPlayerHelperModules || {}), entry: !!window.__xetUltraQualityInstance }) });
        const result = await globalThis.XetPracticeUndoSource.resolve({ action: "sync", key },
          { tab: { id: tab.id }, frameId: 0, url }, { siteAccess: globalThis.XetSiteAccess,
            readSettings: async () => ({ disabledSites: [] }) });
        return { isolated: isolated.result, result };
      }, { url, key: `/p/t_pc/pc_evaluation/practice_sheet/${source}|${task}` }));
      throw error;
    }
    assert(await undo.count() === 3, "One button per loaded question");
    assert(await undo.nth(0).isDisabled(), "Unanswered questions cannot undo");
    assert(await undo.nth(1).isEnabled(), "Previously answered questions can undo");
    const placement = await undo.nth(1).evaluate(button => {
      const a = button.getBoundingClientRect(), b = button.previousElementSibling.getBoundingClientRect();
      return { gap: a.left - b.right, aligned: Math.abs((a.top+a.bottom-b.top-b.bottom)/2) < 2 };
    });
    assert(placement.gap >= 10 && placement.aligned, "Undo aligns beside question type");

    stage = "first answer/undo";
    await fixture.locator(".option").nth(0).click();
    await fixture.waitForFunction(() => document.querySelector(".feedback") !== null);
    await fixture.waitForFunction(() => !window.__xetPracticeUndo || window.__xetPracticeUndo.snapshot().questions[0].canUndo);
    await undo.nth(0).click();
    await fixture.waitForFunction(() => document.querySelectorAll(".answer-state")[0].textContent === "未作答");
    await fixture.waitForFunction(() => document.querySelector(".feedback").textContent.includes("本次新增错题"));
    assert(!entries.has("qs_1"), "New wrong-answer entry removed");
    assert(saved.get("qs_1").is_answer === 0, "Clear is saved on server");

    stage = "historical answer/undo";
    await undo.nth(1).focus(); await fixture.keyboard.press("Enter");
    await fixture.waitForFunction(() => document.querySelectorAll(".answer-state")[1].textContent === "未作答");
    assert(entries.has("qs_2"), "Historical error-book entry preserved");
    assert(!writes.filter(w => w.path.endsWith("/del")).some(w => w.body.question_ids.includes("qs_2")), "Never delete prior entries");

    // Reselect and retry cleanup after the server rejects deletion.
    stage = "reselect/delete failure";
    await fixture.locator(".option").nth(0).click();
    failRemove = true;
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-practice-undo")[0].disabled === false);
    await undo.nth(0).click();
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-practice-undo")[0].textContent === "重试撤销");
    assert(entries.has("qs_1"), "Rejected removal stays retriable");
    stage = "cleanup retry";
    failRemove = false; await undo.nth(0).click();
    await fixture.waitForFunction(() => { const b = document.querySelectorAll(".xet-practice-undo")[0];
      return b.disabled && b.getAttribute("aria-busy") === "false"; });
    assert(!entries.has("qs_1"), "Retry removes only the new entry");
    await fixture.screenshot({ path: "output/playwright/practice-undo.png" });

    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => !document.querySelector(".xet-practice-undo"));
    assert(await fixture.evaluate(() => document.querySelector(".practice-sheet").__vue__.reportErrorQuestion === document.querySelector(".practice-sheet").__vue__.originalReport), "Disable restores native methods");
    assert(errors.length === 0, `Browser errors: ${errors.join(", ")}`);
    return { buttons: 3, nativeAnswerReset: true, newEntryRemoved: true,
      existingEntryRetained: true, reselect: true, cleanupRetry: true, keyboard: true, disableCleanup: true };
  } catch (error) {
    throw new Error(JSON.stringify({ error: error.message, stage, errors, native: await fixture.evaluate(() => {
      const v = document.querySelector('.practice-sheet').__vue__;
      return { bound: v.handleCommitQs.toString().includes('.apply(v'), ignore: v.shouldIgnorePracticeAnswerEvent(),
        q: v.currentQuestion?.id, state: window.__xetPracticeUndo?.snapshot() };
    }), writes, states: await fixture.locator(".answer-state").allTextContents(),
      buttons: await fixture.locator(".xet-practice-undo").evaluateAll(xs => xs.map(b => ({text:b.textContent,disabled:b.disabled}))) }));
  } finally {
    if (worker) await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
