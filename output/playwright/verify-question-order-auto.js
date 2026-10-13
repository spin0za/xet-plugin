async (page) => {
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw new Error('Load the real unpacked extension in an isolated profile');
  const origin = 'https://auto-fixture.pc.xiaoe-tech.com';
  const source = 'wb_course_auto_fixture', task = 'pt_auto_fixture';
  const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
  const bookURL = origin + `/p/t_pc/pc_evaluation/errbook/detail/123?tab=1&source_id=${source}`;
  const vue = await (await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  const requests = [], helpers = [], errors = [];
  let fixed = true, failRecord = false;
  const html = `<!doctype html><meta charset=utf-8><div id=app></div><script>${vue}</script><script>
    const query=new URLSearchParams(location.search),book=location.pathname.includes('/errbook/detail/');
    const make=n=>({id:'qs_'+n,task_id:n===2?'':'${task}',content:'Question '+n});
    window.vm=new Vue({el:'#app',data:{sourceId:'${source}',resourceId:'${source}',taskId:'${task}',
      classifyId:Number(location.pathname.split('/').pop())||123,currentTab:1,loading:false,join_id:'',questionList:[4,2,1].map(make),practiceList:[]},
      async created(){if(!book){const r=await fetch('/evaluation_wechat/practices/join',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({practice_id:this.resourceId,task_id:this.taskId})});
        this.join_id=(await r.json()).data.join_id;}},
      template:book?'<div class="errbook-detail-page"><div class="question-list"><div v-for="q in questionList" :key="q.id" class="question-card" :data-fixture-id="q.id"><div class="card-body"><div class="card-content">{{q.content}}</div></div></div></div></div>':
        '<div class="practice-sheet">Background original practice</div>'});
    </script>`;
  await context.route(`${origin}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== 'POST') return route.fulfill({contentType:'text/html',body:html});
    requests.push({path,payload:request.postDataJSON()});
    if (path === '/xe.practice.bff/task/answer.config.get/1.0.0') return route.fulfill({json:{code:0,data:{random_setting:fixed?0:1,task_total_qs:5}}});
    if (path === '/evaluation_wechat/practices/join') {
      await new Promise(resolve => setTimeout(resolve,300));
      return route.fulfill({json:{code:0,data:{join_id:'uwb_auto_fixture'}}});
    }
    if (path === '/evaluation_wechat/practices/commit_record') return failRecord
      ? route.fulfill({status:503,body:'offline'})
      : route.fulfill({json:{code:0,data:{list:Array.from({length:5},(_,i)=>({id:'qs_'+(i+1),answer:'not-to-be-stored'}))}}});
    throw new Error('Unexpected account mutation: '+path);
  });
  const watch = helper => {
    helper.on('pageerror', error => errors.push(error.message));
    const attachFixture = async () => {
      if (!helper.url().includes('xet_order_job=') || helpers.includes(helper)) return;
      helpers.push(helper);
      // Chrome-created tabs can navigate before Playwright attaches its routes.
      // Once attached, reload only the dummy merchant fixture if it was missed;
      // no real practice, credentials or original tab is involved.
      await helper.waitForLoadState('domcontentloaded');
      if (!await helper.evaluate(()=>Boolean(window.vm))) await helper.reload();
    };
    helper.on('framenavigated', frame => { if(frame===helper.mainFrame())void attachFixture(); });
    void attachFixture();
  };
  context.on('page', watch);
  const book = await context.newPage(), second = await context.newPage();
  const labels = () => book.locator('[data-xet-original-question-number]').allTextContents();
  const clearCache = () => worker.evaluate(key => chrome.storage.local.remove(key), cacheKey);
  const waitClosed = async target => {
    for(let i=0;i<100&&!target.isClosed();i++) await new Promise(resolve=>setTimeout(resolve,50));
    if(!target.isClosed()) throw new Error('Owned background tab was not closed');
  };
  try {
    await clearCache();
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await Promise.all([book.goto(bookURL),second.goto(bookURL)]);
    await book.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===3);
    await second.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===3);
    if(JSON.stringify(await labels())!==JSON.stringify(['1.','2.','4.']))throw new Error('Automatic full paper capture/sorting failed');
    if(requests.filter(r=>r.path.endsWith('/join')).length!==1 || helpers.length!==1)throw new Error('Concurrent books opened duplicate attempts');
    await waitClosed(helpers[0]);
    const record=await worker.evaluate(async key=>(await chrome.storage.local.get(key))[key],cacheKey);
    if(record.ids.length!==5 || JSON.stringify(record).includes('answer'))throw new Error('Persisted answers or incomplete lazy preview');
    const joins=requests.filter(r=>r.path.endsWith('/join')).length;
    // Real Vue Router navigation between two books retains numeric IDs.
    await book.evaluate(() => {
      vm.classifyId=228976328;
      history.pushState({},'',location.pathname.replace('/123','/228976328')+location.search);
    });
    await book.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===3 && vm.classifyId===228976328);
    await book.waitForFunction(()=>document.querySelector('[data-xet-question-order-id]'));
    await book.waitForTimeout(150);
    if(requests.filter(r=>r.path.endsWith('/join')).length!==joins)throw new Error('Switching numeric book IDs repeated extraction despite cache');
    await book.evaluate(()=>{vm.classifyId=999;});
    await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('无法识别原题号'));
    if(await book.locator('.xet-question-order-hint').count()!==1 ||
       await book.locator('.xet-question-order-hint').getAttribute('role')!=='status')throw new Error('Missing or duplicate accessible identity-failure feedback');
    if(requests.filter(r=>r.path.endsWith('/join')).length!==joins)throw new Error('A mismatched book opened a new attempt');
    await book.evaluate(()=>{vm.classifyId=228976328;});
    await book.waitForFunction(()=>!document.querySelector('.xet-question-order-hint'));
    await book.reload();
    await book.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===3);
    if(requests.filter(r=>r.path.endsWith('/join')).length!==joins)throw new Error('Cached revisit opened another attempt');
    const active=await worker.evaluate(async origin=> (await chrome.tabs.query({active:true,url:origin+'/*'})).map(tab=>tab.url),origin);
    if(active.some(url=>url.includes('xet_order_job=')))throw new Error('Background helper stole focus');
    const remaining=await worker.evaluate(()=>chrome.storage.session.get(null));
    if(Object.keys(remaining).some(key=>key.startsWith('xetQuestionOrderJob:')))throw new Error('Completed job leaked session state');

    await clearCache(); fixed=false;
    await book.reload(); await book.locator('.xet-question-order-hint').waitFor();
    await book.waitForFunction(()=>window.__xetQuestionOrderReadiness?.instance===vm);
    await new Promise(resolve=>setTimeout(resolve,800));
    if(requests.filter(r=>r.path.endsWith('/join')).length!==joins)throw new Error('Random config entered a new attempt');
    fixed=true; failRecord=true;
    await book.reload();
    for(let i=0;i<100&&helpers.length<2;i++) await new Promise(resolve=>setTimeout(resolve,50));
    if(helpers.length!==2)throw new Error('Network failure helper not created');
    await waitClosed(helpers[1]);
    await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('后台读取未能完成'));
    if(await book.locator('[data-xet-original-question-number]').count())throw new Error('Failure fabricated numbers');
    if(requests.some(r=>!['/xe.practice.bff/task/answer.config.get/1.0.0','/evaluation_wechat/practices/join','/evaluation_wechat/practices/commit_record'].includes(r.path)))throw new Error('Unexpected write endpoint');
    if(errors.length)throw new Error(errors.join('; '));
    return {autoNumbering:['1.','2.','4.'],fullPaperCount:record.ids.length,
      numericBookIds:true,numericBookNavigation:true,mismatchRejectedWithFeedback:true,feedbackRecovery:true,
      coalescedJoinCount:joins,cachedReloadNewJoins:0,helpersClosed:helpers.every(p=>p.isClosed()),
      randomSkipped:true,networkFailureCleaned:true,networkFailureReported:true,errors};
  } finally {
    context.off('page',watch); await context.unroute(`${origin}/**`);
    for(const helper of context.pages())if(helper.url().startsWith(origin)&&helper.url().includes('xet_order_job=')&&!helper.isClosed())await helper.close();
    await book.close(); await second.close();
  }
}
