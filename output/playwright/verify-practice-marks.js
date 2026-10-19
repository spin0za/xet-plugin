async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('A fresh real MV3 test profile is required');
  await worker.evaluate(() => chrome.storage.local.set({ enabled: true, disabledSites: [], keepAliveEnabled: false }));
  const fixture = await page.context().newPage();
  const origin = 'https://merchant.pc.xiaoe-tech.com';
  const resource = 'wb_course_marks_fixture', task = 'task_marks_fixture';
  const marks = new Map([['qs_one', true], ['qs_two', false], ['qs_three', true]]);
  const writes = [], errors = [];
  let failRestore = false, reportCount = 0, stage = 'installation';
  fixture.on('pageerror', error => errors.push(error.message));
  function assert(value, message) { if (!value) throw Error(message); }
  function analysisHtml(join) {
    const list = [...marks].map(([id]) => ({ id, is_collected: false }));
    return `<main class="practice-analysis"><aside class="answer-card__content__card">${list.map((q,i)=>
      `<div class="answer-card__content__card__item"><span>${i+1}</span></div>`).join('')}</aside>
      ${list.map((q,i)=>`<section class="analysis-item" id="analysis-${i+1}"><header class="question-header"><div class="question-type">单选题</div></header></section>`).join('')}</main>
      <script>window.USERID='user_marks_fixture';document.querySelector('.practice-analysis').__vue__={resourceId:'${resource}',join_id:'${join}',practiceList:${JSON.stringify(list)}};</script>`;
  }
  function sheetHtml(mode) {
    return `<main class="practice-sheet"><h1>练习标记回归夹具</h1><button id="mark">标记第二题</button>
      <button id="cancel">取消第二题标记</button><button id="submit">交卷</button><div class="question-block__answer"><button id="answer">答案按钮</button></div></main>
      <script>
      const post=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()};
      window.USERID='user_marks_fixture';window.nativeReports=0;window.answerClicks=0;window.flagWrites=0;
      const v={resourceId:'${resource}',join_id:'join_marks_fixture',taskId:'${task}',course_id:'course_fixture',practiceTitle:'模拟练习',practiceMode:${mode},hasPracticeSubmit:false,
        $message:{error:text=>{window.lastNotice=text}},handleDeleteLocalStorage(){window.cleaned=true},
        async updateQuestionMarkStatus(id,value){return post('/xe.practice.bff/common/question.mark/1.0.0',{
          source_type:1,source_id:this.resourceId,join_id:this.join_id,question_id:id,is_mark:value?1:0})},
        async handUpReport(){window.nativeReports++;await post('/evaluation_wechat/practices/report',{
          practice_id:this.resourceId,join_id:this.join_id,task_id:this.taskId,practice_mode:this.practiceMode});return this.$router.replace()},
        $router:{async replace(route){window.routeAtRestore=route;history.replaceState({},'',
          '/p/t_pc/pc_evaluation/practice_analysis/${resource}?join_id=join_marks_fixture&task_id=${task}');
          document.querySelector('main').outerHTML=window.analysisMarkup;const main=document.querySelector('.practice-analysis');
          main.__vue__={resourceId:'${resource}',join_id:'join_marks_fixture',practiceList:${JSON.stringify([...marks].map(([id])=>({id,is_collected:false})))}};window.dispatchEvent(new PopStateEvent('popstate'));}}};
      window.nativeReport=v.handUpReport;document.querySelector('.practice-sheet').__vue__=v;
      document.querySelector('#submit').onclick=()=>v.handUpReport();
      document.querySelector('#mark').onclick=async()=>{await v.updateQuestionMarkStatus('qs_two',true);window.flagWrites++};
      document.querySelector('#cancel').onclick=async()=>{await v.updateQuestionMarkStatus('qs_two',false);window.flagWrites++};
      document.querySelector('#answer').onclick=()=>window.answerClicks++;
      </script>`;
  }
  try {
    await fixture.route(`${origin}/**`, async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
      if (request.method() !== 'POST') {
        const body = endpoint.includes('/practice_sheet/') ? sheetHtml(Number(url.searchParams.get('mode') || 1)) : analysisHtml(url.searchParams.get('join_id'));
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>${body}` }); return;
      }
      const b = request.postDataJSON(); let data;
      if (endpoint.endsWith('/answer.config.get/1.0.0')) data = { random_setting: 1, task_total_qs: 3, practice_num: 3, is_last_commit: false };
      else if (endpoint.endsWith('/commit_record')) data = { list: [...marks].map(([id, marked]) => ({ id,
        is_marked: b.join_id === 'join_other_fixture' ? 0 : Number(marked) })) };
      else if (endpoint.endsWith('/get_paper_question')) data = { practice_list: [...marks].map(([id]) => ({ id, is_collected: false })) };
      else if (endpoint.endsWith('/report')) {
        assert(b.join_id === 'join_marks_fixture' && b.practice_id === resource && b.task_id === task, 'Wrong report scope');
        reportCount++; writes.push({ endpoint, body: b });
        // Reproduce the actual site's confirmed behavior at submission.
        for (const id of marks.keys()) marks.set(id, false);
        data = { err_url: 'fixture' };
      } else if (endpoint.endsWith('/question.mark/1.0.0')) {
        assert(b.join_id === 'join_marks_fixture' && b.source_id === resource, 'Wrong mark scope');
        writes.push({ endpoint, body: b });
        if (failRestore && b.question_id === 'qs_three') { await route.fulfill({ json: { code: 5001 } }); return; }
        marks.set(b.question_id, b.is_mark === 1); data = {};
      } else throw Error(`Unexpected API ${endpoint}`);
      await route.fulfill({ json: { code: 0, data } });
    });
    const sheetUrl = `${origin}/p/t_pc/pc_evaluation/practice_sheet/${resource}?task_id=${task}`;
    const markup = analysisHtml('join_marks_fixture').split('<script>')[0];
    for (const mode of [0, 1]) {
      stage = `mode ${mode} submit-to-analysis`;
      marks.set('qs_one', true); marks.set('qs_two', false); marks.set('qs_three', true);
      await fixture.goto(`${sheetUrl}&mode=${mode}`);
      await fixture.evaluate(value => { window.analysisMarkup = value; }, markup);
      await fixture.waitForFunction(() => document.querySelector('.practice-sheet').__vue__.handUpReport !== window.nativeReport);
      await fixture.locator('#mark').click();
      await fixture.waitForFunction(() => window.flagWrites === 1);
      await fixture.locator('#cancel').click();
      await fixture.waitForFunction(() => window.flagWrites === 2);
      const before = reportCount;
      await fixture.locator('#submit').dblclick({ delay: 50 });
      await fixture.waitForFunction(() => document.querySelectorAll('.xet-analysis-actions').length === 3);
      assert(reportCount === before + 1, 'Double click submitted more than once');
      assert(marks.get('qs_one') && !marks.get('qs_two') && marks.get('qs_three'), 'Saved marks were erased or canceled marks resurrected');
      assert(await fixture.locator('.xet-analysis-card-mark').count() === 2, 'Analysis card lost pre-submit marks');
      assert(await fixture.locator('#analysis-1 [data-xet-action=mark]').getAttribute('aria-pressed') === 'true', 'Analysis button lost pre-submit mark');
      assert(await fixture.locator('#analysis-2 [data-xet-action=mark]').getAttribute('aria-pressed') === 'false', 'Canceled mark returned');
      assert(await fixture.evaluate(() => window.nativeReports) === 0, 'Unprotected native report also ran');
      assert(await fixture.evaluate(() => window.answerClicks) === 0, 'Changed an answer');
      const saved=await worker.evaluate(async origin=>{
        const k=`xetPracticeHistory:${origin}|user_marks_fixture|join_marks_fixture`;
        return {local:(await chrome.storage.local.get(k))[k],sync:(await chrome.storage.sync.get(k))[k]};
      },origin);
      assert(saved.local?.submittedAt > 0 && saved.local.submittedAt === saved.sync?.submittedAt,'Submission not persisted locally and in sync');
      assert(saved.sync.joinId==='join_marks_fixture' && saved.sync.taskId===task,'Wrong saved result identity');
      await fixture.reload();
      await fixture.waitForFunction(() => document.querySelectorAll('.xet-analysis-actions').length === 3);
      assert(await fixture.locator('.xet-analysis-card-mark').count() === 2, 'Reload lost server-restored marks');
    }
    stage = 'retry without resubmitting';
    marks.set('qs_one', true); marks.set('qs_three', true);
    await fixture.goto(sheetUrl);
    await fixture.evaluate(value => { window.analysisMarkup = value; }, markup);
    await fixture.waitForFunction(() => document.querySelector('.practice-sheet').__vue__.handUpReport !== window.nativeReport);
    failRestore = true; const before = reportCount;
    await fixture.locator('#submit').click();
    await fixture.waitForFunction(() => window.lastNotice?.includes('重试恢复'));
    await fixture.locator('#answer').click();
    assert(await fixture.evaluate(() => window.answerClicks) === 0, 'Allowed answer changes after submission');
    failRestore = false;
    await fixture.locator('#submit').click();
    await fixture.waitForFunction(() => document.querySelectorAll('.xet-analysis-actions').length === 3);
    assert(reportCount === before + 1 && marks.get('qs_three'), 'Retry resubmitted or lost marks');
    stage = 'attempt isolation';
    await fixture.goto(`${origin}/p/t_pc/pc_evaluation/practice_analysis/${resource}?join_id=join_other_fixture&task_id=${task}`);
    await fixture.waitForFunction(() => document.querySelectorAll('.xet-analysis-actions').length === 3);
    assert(await fixture.locator('.xet-analysis-card-mark').count() === 0, 'Marks leaked into another attempt');
    stage = 'site disable cleanup';
    await fixture.goto(sheetUrl);
    await fixture.waitForFunction(() => document.querySelector('.practice-sheet').__vue__.handUpReport !== window.nativeReport);
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => document.querySelector('.practice-sheet').__vue__.handUpReport === window.nativeReport && !window.__xetPracticeMarks);
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    assert(errors.length === 0, errors.join('\n'));
    return { ok: true, reportCount, checked: ['real MV3', 'native report clears flags', 'both practice modes',
      'pre-submit mark/cancel', 'duplicate submit', 'restore before navigation', 'analysis badges/buttons',
      'reload persistence', 'restore retry without resubmission', 'answer lock after submission', 'attempt isolation', 'site disable cleanup'] };
  } catch (error) { throw Error(`${stage}: ${error.message}`); }
  finally { await fixture.close(); }
}
