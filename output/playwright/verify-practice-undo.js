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
  let failRemove = false, holdRemove = false, releaseRemove;
  // Test the site's actual Vue selection component, not a parent-only mock.
  // These public, version-pinned assets are used solely in the isolated fixture.
  let vueSource, nativeSource;
  function assertAsset(response) { if (!response.ok()) throw new Error(`Fixture asset unavailable: ${response.status()}`); }
  let stage = "initial buttons";
  fixture.on("pageerror", error => errors.push(error.message));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    const vue = await page.request.get("https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.runtime.min.js");
    const native = await page.request.get("https://assets.cdn.xiaoeknow.com/exam/pc_evaluation_fe/1.17.7/pc_evaluation/js/AnswerPage~ExamAnalysis~ExamSheet~PracticeAnalysis~PracticeSelfEvaluation~PracticeSheet.js");
    assertAsset(vue); assertAsset(native);
    vueSource = await vue.text(); nativeSource = await native.text();
    if (worker) await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.route(`${origin}/**`, async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path === "/fixture/vue.js" || path === "/fixture/native.js") {
        await route.fulfill({ contentType: "application/javascript", body: path.endsWith("vue.js") ? vueSource : nativeSource }); return;
      }
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
          if (holdRemove) await new Promise(resolve => { releaseRemove = resolve; });
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
        .question-option-item{display:flex;align-items:center;margin:16px 0;cursor:pointer}
        .question-option-item__marker{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid #e5e5e5;border-radius:50%;margin-right:12px;color:#999;background:#fff}
        .is-selected .question-option-item__marker{background:#1472ff;border-color:#1472ff;color:white}
        .is-correct .question-option-item__marker{background:#07c160;color:white}
        .is-wrong .question-option-item__marker{background:#ff4747;color:white}
        .feedback{position:fixed;top:40px;left:50%;transform:translateX(-50%);background:white;box-shadow:0 8px 24px #0002;padding:12px}
        .feedback:empty{display:none}
      </style><div class="feedback" role="status"></div><div id="app"></div>
      <script src="/fixture/vue.js"></script><script src="/fixture/native.js"></script><script>
        const modules=Object.assign({},...window.webpackJsonp.map(chunk=>chunk[1]));
        function component(id){
          const module={exports:{}};
          modules[id](module,module.exports,name=>{
            if(name==='829d')return {a:(options,render,staticRenderFns)=>({exports:{...options,render,staticRenderFns}})};
            if(name==='ed08')return {g:index=>String.fromCharCode(65+index),d:type=>type===0?'radio':'checkbox'};
            if(name==='0cd0')return {a:{props:['content'],render(h){return h('span',this.content)}}};
            return {a:{render(h){return h('div')}}};
          });return module.exports.a;
        }
        const QuestionSelect=component('979a');
        const qs=[1,2,3].map(n=>({id:'qs_'+n,type:0,answer:n===1?[]:['B'],correct_answer:['A'],answer_state:n===1?'':n===2?'false':'true',is_answer:n===1?0:1,option:[{id:'A',click:false,content:'选项 A'},{id:'B',click:n!==1,content:'选项 B'}]}));
        const post=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()};
        const v=new Vue({data:{resourceId:'${source}',taskId:'${task}',join_id:'uwb_fixture',practiceMode:0,isInitializingPracticePage:false,
          practiceList:qs,currentQuestionNum:0,updataing:false,isHydratingPracticeQuestions:false,
          local_answers:Object.fromEntries(qs.map(q=>[q.id,{type:q.type,answer:q.answer}])),
          submitStateMap:{qs_1:false,qs_2:true,qs_3:true},userAnswerState:{qs_2:false,qs_3:true},
          questionStatusShowMap:{},materialUserAnswerState:{},
          answerSheetArray:qs.map(q=>({hasAnswer:!!q.answer.length,answerStatus:q.answer_state==='false'?'error':q.answer_state==='true'?'success':'default'}))},
          computed:{currentQuestion(){return this.practiceList[this.currentQuestionNum]}},methods:{
          hasPracticeQuestionDraftAnswer(q){return !!this.local_answers[q.id]?.answer?.length},
          getPracticeAnswerSheetIndex(q){return this.practiceList.findIndex(item=>item.id===q.id)},
          shouldIgnorePracticeAnswerEvent(){return this.isHydratingPracticeQuestions},
          async reportErrorQuestion(){await post('/evaluation_wechat/practices/error_report',{source_id:this.resourceId,question_id:this.currentQuestion.id,source_type:1,question_type:1})},
          async handleCommitQs(){const q=this.currentQuestion;await post('/evaluation_wechat/practices/commit_qs',{practice_id:this.resourceId,join_id:this.join_id,practice_mode:0,user_answer:{id:q.id,answer:q.answer,answer_state:q.answer_state,is_answer:1},report_index:this.practiceList.indexOf(q)});if(q.answer_state==='false')void this.reportErrorQuestion()},
          select(i,optionIndex,item,answers){
            if(this.shouldIgnorePracticeAnswerEvent()||this.submitStateMap[item.id])return;
            const q=this.practiceList[i];this.currentQuestionNum=i;
            this.$set(q,'answer',answers);this.$set(q,'answer_state','false');this.$set(q,'is_answer',1);
            this.$set(this.local_answers,q.id,{type:0,answer:answers});this.$set(this.submitStateMap,q.id,true);
            this.$set(this.answerSheetArray[i],'hasAnswer',true);this.$set(this.answerSheetArray[i],'answerStatus','error');void this.handleCommitQs();
          }},render(h){return h('div',{class:'practice-sheet'},this.practiceList.map((q,i)=>h('div',{class:'question-wrapper',attrs:{id:'practice-question-anchor-'+(i+1)}},[
            h('div',{class:'question-block__head'},[h('div',{class:'question-block__meta'},[(i+1)+'.',h('span',{class:'question-type'},'单选题')])]),
            h('p',{class:'question-content'},'题目 '+(i+1)+'：可以重新选择的答案'),
            h('div',{class:'question-block__answer'},[h(QuestionSelect,{props:{questionItem:q,pageFrom:'sheet',showAnalysis:!!this.submitStateMap[q.id]},on:{selectAnswerChange:(...args)=>this.select(i,...args)}})]),
            h('div',{class:'answer-state'},q.answer.length?(q.answer_state==='false'?'回答错误':'回答正确'):'未作答')
          ])))} });v.$message={success:message,error:message};v.$mount('#app');
        v.originalReport=v.reportErrorQuestion;
        function message(text){document.querySelector('.feedback').textContent=text}
      </script></html>` });
    });
    await fixture.setViewportSize({ width: 1280, height: 900 });
    await fixture.goto(url);
    worker = await workerReady;
    const undo = fixture.locator(".xet-practice-undo");
    const option = number => fixture.locator(`#practice-question-anchor-${number} .question-option-item`).nth(1);
    const clearedControl = async number => {
      const answer = await fixture.locator(`#practice-question-anchor-${number} .question-select`).evaluate(el => el.__vue__.answer);
      assert(answer.length === 0, `Question ${number}: native component's private answer is empty`);
      assert(await fixture.locator(`#practice-question-anchor-${number} .question-option-item.is-selected, #practice-question-anchor-${number} .question-option-item.is-correct, #practice-question-anchor-${number} .question-option-item.is-wrong`).count() === 0,
        `Question ${number}: no selected/evaluated marker remains`);
      const color = await option(number).locator(".question-option-item__marker").evaluate(el => getComputedStyle(el).backgroundColor);
      assert(color === "rgb(255, 255, 255)", `Question ${number}: marker restored to white, got ${color}`);
    };
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
    await option(1).click();
    await fixture.waitForFunction(() => document.querySelector(".feedback") !== null);
    await fixture.waitForFunction(() => !window.__xetPracticeUndo || window.__xetPracticeUndo.snapshot().questions[0].canUndo);
    holdRemove = true;
    await undo.nth(0).click();
    await fixture.waitForFunction(() => document.querySelectorAll(".answer-state")[0].textContent === "未作答");
    // Negative control: the old parent-only busy guard really does leave the
    // site's private selection blue without saving it. Restore that fixture
    // buffer, then verify actual gestures cannot enter this state anymore.
    await option(1).evaluate(el => el.closest(".question-select").__vue__.selectAnswerOptionChange(1));
    assert(await option(1).evaluate(el => el.classList.contains("is-selected")), "Reproduce the old private blue selection");
    assert(await fixture.locator(".answer-state").first().textContent() === "未作答", "Parent still considers the blue answer empty");
    await option(1).evaluate(el => { el.closest(".question-select").__vue__.answer = []; });
    // The site would change the child answer before the parent's busy guard
    // rejects it. Keep removal in flight and try both mouse and keyboard.
    await option(1).click();
    await option(1).focus(); await fixture.keyboard.press("Enter");
    await fixture.keyboard.press("Tab");
    assert(!await option(1).evaluate(el => el === document.activeElement), "Pending undo still allows Tab navigation");
    await clearedControl(1);
    assert(await option(2).evaluate(el => el.classList.contains("is-wrong")), "Other questions retain their selections");
    const removeDeadline = Date.now() + 5000;
    while (!releaseRemove && Date.now() < removeDeadline) await fixture.waitForTimeout(20);
    assert(releaseRemove, "Pending cleanup reached the held delete endpoint");
    releaseRemove(); holdRemove = false;
    await fixture.waitForFunction(() => document.querySelector(".feedback").textContent.includes("本次新增错题"));
    assert(!entries.has("qs_1"), "New wrong-answer entry removed");
    assert(saved.get("qs_1").is_answer === 0, "Clear is saved on server");

    stage = "historical answer/undo";
    await undo.nth(1).focus(); await fixture.keyboard.press("Enter");
    await fixture.waitForFunction(() => document.querySelectorAll(".answer-state")[1].textContent === "未作答");
    await clearedControl(2);
    assert(entries.has("qs_2"), "Historical error-book entry preserved");
    assert(!writes.filter(w => w.path.endsWith("/del")).some(w => w.body.question_ids.includes("qs_2")), "Never delete prior entries");

    // Reselect and retry cleanup after the server rejects deletion.
    stage = "reselect/delete failure";
    await option(1).click();
    failRemove = true;
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-practice-undo")[0].disabled === false);
    await undo.nth(0).click();
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-practice-undo")[0].textContent === "重试撤销");
    await clearedControl(1);
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
    return { buttons: 3, nativeVueComponent: true, oldBlueSelectionReproduced: true,
      whiteMarkersAfterUndo: true, pendingMouseAndKeyboardGuard: true,
      nativeAnswerReset: true, newEntryRemoved: true,
      existingEntryRetained: true, reselect: true, cleanupRetry: true, keyboard: true, disableCleanup: true };
  } catch (error) {
    throw new Error(JSON.stringify({ error: error.message, stage, errors, native: await fixture.evaluate(() => {
      const v = document.querySelector('.practice-sheet')?.__vue__;
      if (!v) return null;
      return { bound: v.handleCommitQs.toString().includes('.apply(v'), ignore: v.shouldIgnorePracticeAnswerEvent(),
        q: v.currentQuestion?.id, state: window.__xetPracticeUndo?.snapshot() };
    }), writes, states: await fixture.locator(".answer-state").allTextContents(),
      buttons: await fixture.locator(".xet-practice-undo").evaluateAll(xs => xs.map(b => ({text:b.textContent,disabled:b.disabled}))) }));
  } finally {
    releaseRemove?.();
    if (worker) await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
