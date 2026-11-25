async page => {
  const context = page.context(), worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Fresh isolated profile with real extension required');
  const origin = 'https://wrong-record-tools.pc.xiaoe-tech.com', base = '/p/t_pc/pc_evaluation';
  const resource = 'wb_course_wrong_fixture', task = 'pt_wrong_fixture', account = 'user_fixture';
  const record = base + '/practice_record?tab=1&subTab=0';
  const book = base + '/errbook/detail/123?tab=1&source_id=' + resource;
  const orderKey = `xetQuestionOrder:${origin}|${resource}|${task}`;
  const seed = { [orderKey]: { version:1, ids:['qs_same','qs_unknown','qs_old','qs_new','qs_legacy'] } };
  seed[`xetWrongPrior:${origin}|${account}|${resource}|${task}|uwb_three|qs_legacy`] = true; // Obsolete manual override.
  for (const joinId of ['uwb_one','uwb_two','uwb_three']) {
    seed[`xetPracticeHistory:${origin}|${account}|${joinId}`] = {version:1,resourceId:resource,taskId:task,
      joinId,hasAnswers:true,submittedAt:Date.now()};
  }
  const fixture = await context.newPage(), mutations = [], reads = [], dialogs = [], errors = [];
  const assert = (pass, msg) => { if (!pass) throw Error(msg); };
  let accept = false, favorite = true;
  fixture.on('pageerror', error => errors.push(error.message));
  fixture.on('dialog', async dialog => { dialogs.push(dialog.message()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
  fixture.setDefaultTimeout(12000);
  const vue = await (await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  const wrong = [{id:'qs_same',task_id:task},{id:'qs_unknown',task_id:task},{id:'qs_old',task_id:task}];
  try {
    await worker.evaluate(seed => chrome.storage.local.set({...seed,disabledSites:[],keepAliveEnabled:false}),seed);
    await fixture.route(origin+'/**',async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON();
        const reply = data => route.fulfill({json:{code:0,data}});
        reads.push(path);
        if (path.endsWith('/error_question/list_classfy')) return reply({claasfy:[{source_id:resource,id:123}]});
        if (path.endsWith('/xe.qs.coll.list/1.0.0')) {
          return reply({total:1,list:[{resource_type:34,resource_id:resource,qs_count:favorite?3:2}]});
        }
        if (path.endsWith('/error_question/get_all_question')) {
          assert(payload.source_id===resource&&payload.classfy_id===123&&payload.type===1,'Wrong book queried');
          return reply({list:wrong});
        }
        if (path.endsWith('/xe.qs.coll.question.list.practice/1.0.0')) {
          return reply({source_id:resource,practice_list:[
            {id:'qs_same',task_id:task,is_collected:favorite},
            {id:'qs_unknown',task_id:'pt_other',is_collected:true},
            {id:'qs_other',task_id:task,is_collected:true}]});
        }
        if (path.endsWith('/xe.qs.coll.question.collect/1.0.0')) {
          mutations.push(payload); favorite = false; return reply({});
        }
        if (path.endsWith('/practices/get_paper_question')) {
          assert(payload.join_id==='uwb_retake'&&payload.start===-1&&payload.end===-1,'Expected latest analysis paper');
          return reply({practice_list:[{id:'qs_old',stats:{user_total_count:2,user_correct_count:0}},
            {id:'qs_new',stats:{user_total_count:1,user_correct_count:0}},
            {id:'qs_unknown',stats:{user_total_count:2,user_correct_count:1}},
            {id:'qs_same',stats:{user_total_count:4,user_correct_count:1}}]});
        }
        if (path.endsWith('/practices/commit_record')) {
          assert(payload.practice_id===resource&&payload.task_id===task,'Statistics escaped their practice scope');
          if (payload.join_id==='uwb_retake') return reply({list:['qs_old','qs_new'].map(id=>({id,is_answer:1,answer_state:false}))});
          return reply({list:[{id:'qs_same',is_answer:payload.join_id==='uwb_three'?0:1,answer_state:'false'},
            {id:'qs_legacy',is_answer:payload.join_id==='uwb_three'?1:0,answer_state:false},
            {id:'qs_unknown',is_answer:1,answer_state:'true'}]});
        }
        throw Error('Unexpected endpoint '+path);
      }
      const isBook = path.includes('/errbook/detail/');
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<!DOCTYPE html><meta charset="utf-8">
        <div id="app"></div><script>${vue}</script><script>
        window.USERID='${account}';
        new Vue(${path.includes('/practice_result/')?`{el:'#app',data:{resourceId:'${resource}',taskId:'${task}',join_id:'uwb_retake',resultPageData:{totalNum:2}},template:'<main class="practice-result"></main>'}`:
        path.includes('/practice_sheet/')?`{el:'#app',data:{resourceId:'${resource}',taskId:'${task}',join_id:'uwb_retake',totalPracticeNum:2,answerSheetArray:[{hasAnswer:false},{hasAnswer:false}]},template:'<main class="practice-sheet"></main>'}`:isBook?`{el:'#app',data:{classifyId:123,sourceId:'${resource}',currentTab:1,loading:false,questionList:${JSON.stringify(wrong)}},
          template:'<main class="errbook-detail-page"><div class="question-list"><article v-for="q in questionList" :key="q.id" class="question-card"><div class="card-body"><p class="card-content">{{q.id}}</p></div></article></div></main>'}`:
        `{el:'#app',name:'ErrbookTab',data:{activeSubTab:0,list:[{id:123,source_id:'${resource}'}],loading:false,noMore:true,pagination:{page:1,pageSize:10}},methods:{fetchList(){}},
          template:'<main class="practice-record-page"><section class="errbook-tab"><p>错题记录</p></section></main>'}`});
        </script>`});
    });
    await fixture.goto(origin+record); await fixture.bringToFront();
    const button = fixture.getByRole('button',{name:'检查重复收藏'});
    await button.waitFor();
    assert(!mutations.length&&!reads.length,'Opening the record list caused a cleanup scan/write');
    await button.click();
    await fixture.getByText('已取消，本次未更改收藏。').waitFor();
    assert(dialogs[0].includes('1 道')&&!mutations.length,'Preview did not isolate one match or cancellation wrote data');
    accept = true; await button.click();
    await fixture.getByText('已取消 1 道重复收藏。错题记录未改动。').waitFor();
    assert(mutations.length===1&&mutations[0].question_id==='qs_same'&&mutations[0].is_collect===false&&
      mutations[0].task_id===task&&mutations[0].resource_id===resource,'Confirmed cleanup did not target the exact favorite');
    await fixture.goto(origin+base+'/practice_sheet/'+resource+'?task_id='+task+'&join_id=uwb_retake');
    const beforeKey = `xetWrongPrior:${origin}|${account}|${resource}|${task}|uwb_retake`;
    const storedOld = key => worker.evaluate(async key=>{
      for(let i=0;i<100;i++) {
        if((await chrome.storage.local.get(key))[key]?.includes('qs_old')) return;
        await new Promise(r=>setTimeout(r,100));
      }
      throw Error('Expected wrong-question IDs not captured: '+key);
    },key);
    await storedOld(beforeKey);
    wrong.push({id:'qs_new',task_id:task},{id:'qs_legacy',task_id:task});
    // The site's successful submit precedes result navigation and supplies its timestamp.
    await worker.evaluate(({origin,account,resource,task})=>chrome.storage.local.set({
      [`xetPracticeHistory:${origin}|${account}|uwb_retake`]:{version:1,resourceId:resource,taskId:task,
        joinId:'uwb_retake',hasAnswers:true,submittedAt:Date.now()}
    }),{origin,account,resource,task});
    await fixture.goto(origin+base+'/practice_result/'+resource+'?task_id='+task+'&join_id=uwb_retake');
    await storedOld(beforeKey+':result');
    await fixture.goto(origin+book);
    const badge = id => fixture.locator(`[data-xet-question-order-id="${id}"] .xet-wrong-count`);
    const check = async (id,n) => badge(id).filter({hasText:`错${n}次`}).waitFor();
    await check('qs_old',2); await check('qs_new',1); await check('qs_same',3); await check('qs_unknown',1);
    const dialogCount = dialogs.length;
    await badge('qs_legacy').click(); await check('qs_legacy',1);
    assert(dialogs.length===dialogCount && await fixture.locator('button.xet-wrong-count').count()===0,'Counts must be read-only');
    await fixture.reload(); await check('qs_same',3); await check('qs_legacy',1);
    assert(await fixture.getByText(/次数未核实|已核对错/).count()===0,'Old wording remains visible');
    assert(await fixture.locator('.question-card').first().evaluate(card =>
      card.querySelector('[data-xet-original-question-number]').nextElementSibling?.className==='xet-wrong-count'),
    'Count is not immediately to the right of original number');
    await worker.evaluate(origin => chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!document.querySelector('.xet-wrong-count'));
    assert(!errors.length,errors.join('; '));
    return {passed:true,checks:['read-only until explicit confirmation','removed only the exact matching simulated favorite',
      'personal totals override local history','reload is idempotent','clicks and old overrides cannot change a count','badge removed on disable']};
  } finally {
    await worker.evaluate(async origin=>{
      for (const store of [chrome.storage.local,chrome.storage.sync]) {
        const keys = Object.keys(await store.get(null)).filter(k=>k.startsWith('xetWrongPrior:'+origin+'|') ||
          k.startsWith('xetPracticeHistory:'+origin+'|') || k.startsWith('xetQuestionOrder:'+origin+'|'));
        await store.remove(keys);
      }
      await chrome.storage.local.set({disabledSites:[]});
    },origin);
    await fixture.close();
  }
}
