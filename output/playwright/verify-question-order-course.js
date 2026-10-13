async (page) => {
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw new Error('Load the real extension in a fresh isolated profile');
  const origin = 'https://course-order-fixture.pc.xiaoe-tech.com';
  const source = 'wb_course_missing_task', task = 'pt_resolved_task';
  const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
  const bookURL = origin + `/p/t_pc/pc_evaluation/errbook/detail/228676040?tab=1&source_id=${source}`;
  const vue = await (await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  const requests = [], helpers = [], errors = [], configStates = [];
  let attempt = false, fixed = true, knownTask = true, starts = 0;
  // Headless Chromium exposes all documents as visible. Model normal Chrome's
  // inactive-helper visibility in this fixture only; real tabs.active is still
  // checked by the extension and tested independently below and in unit tests.
  await context.addInitScript(() => {
    if(location.origin!=='https://course-order-fixture.pc.xiaoe-tech.com'||Object.hasOwn(document,'visibilityState'))return;
    const descriptor=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState');
    Object.defineProperty(document,'visibilityState',{get(){return new URLSearchParams(location.search).has('xet_order_job')?'hidden':descriptor.get.call(document);}});
  });
  const html = `<!doctype html><meta charset=utf-8><div id=app></div><script>${vue}</script><script>
    const query=new URLSearchParams(location.search),book=location.pathname.includes('/errbook/detail/'),config=location.pathname.includes('/practiceConfig/');
    window.vm=new Vue({el:'#app',data:{sourceId:'${source}',resourceId:'${source}',practiceId:'${source}',
      taskId:query.get('task_id')||'',classifyId:'228676040',currentTab:1,loading:false,join_id:'',
      questionMode:0,answerNumMode:0,taskInfo:{},questionList:[34,29,25,16,12,10,3].map(n=>({id:'qs_'+n,task_id:'',content:'Question '+n}))},
      async created(){
        if(book)return;
        if(config){const r=await fetch('/xe.practice.bff/task/answer.config.get/1.0.0',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({practice_id:this.practiceId,task_id:this.taskId})});
          this.taskInfo=(await r.json()).data;console.log('fixture-config-ready',JSON.stringify({visibility:document.visibilityState,
            practiceId:this.practiceId,taskId:this.taskId,questionMode:this.questionMode,answerNumMode:this.answerNumMode,taskInfo:this.taskInfo}));return;}
        const r=await fetch('/evaluation_wechat/practices/join',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({practice_id:this.resourceId,task_id:this.taskId})});
        const data=await r.json();
        if(data.code===100)location.replace('/p/t_pc/pc_evaluation/practiceConfig/${source}?task_id='+this.taskId);
        else if(data.code===0)this.join_id=data.data.join_id;
      },
      methods:{async toPractice(){const r=await fetch('/evaluation_wechat/practices/join',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({practice_id:this.practiceId,task_id:this.taskId,
          gen_config:{question_mode:this.questionMode,answer_num_mode:this.answerNumMode,practice_num:this.taskInfo.task_total_qs}})});
        const data=await r.json();if(data.code===0)location.replace('/p/t_pc/pc_evaluation/practice_sheet/${source}?task_id='+this.taskId);}},
      template:book?'<div class="errbook-detail-page"><div class="question-list"><div v-for="q in questionList" :key="q.id" class="question-card"><div class="card-body">{{q.content}}</div></div></div></div>':
        config?'<div class="practice-config">Native configuration waiting to start</div>':'<div class="practice-sheet">Original practice</div>'});
  </script>`;
  await context.route(`${origin}/**`, async route => {
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()!=='POST')return route.fulfill({contentType:'text/html',body:html});
    const payload=req.postDataJSON();requests.push({path,payload});
    if(path==='/xe.practice.bff/info/get.practice.type/1.0.0')return route.fulfill({json:{code:0,data:{create_from:3,...knownTask?{course_task_id:task}:{}}}});
    if(path==='/xe.practice.bff/task/answer.config.get/1.0.0'){
      if(payload.task_id!==task)throw new Error('Course configuration missing the resolved task');
      await new Promise(resolve=>setTimeout(resolve,100));
      return route.fulfill({json:{code:0,data:{random_setting:fixed?-1:1,task_total_qs:34,practice_num:-1}}});
    }
    if(path==='/evaluation_wechat/practices/join'){
      if(payload.task_id!==task)throw new Error('Opening a taskless course must not create an invalid attempt');
      if(payload.gen_config){
        if(JSON.stringify(payload.gen_config)!==JSON.stringify({question_mode:0,answer_num_mode:0,practice_num:34}))throw new Error('Not a fixed full paper');
        starts++;attempt=true;
      }
      return route.fulfill({json:attempt?{code:0,data:{join_id:'uwb_fixture'}}:{code:100,data:{}}});
    }
    if(path==='/evaluation_wechat/practices/commit_record')return route.fulfill({json:{code:0,data:{list:Array.from({length:34},(_,i)=>({id:'qs_'+(i+1),answer:'never-persist'}))}}});
    throw new Error('Unexpected account write: '+path);
  });
  const watch=helper=>{
    helper.on('pageerror',e=>errors.push(e.message));
    helper.on('console',message=>{if(message.text().startsWith('fixture-config-ready'))configStates.push(message.text());});
    const attach=async()=>{
      if(!helper.url().includes('xet_order_job=')||helpers.includes(helper))return;
      helpers.push(helper);
      await helper.waitForLoadState('domcontentloaded');
      // Only recover a missed test fixture route, never reload an actual site.
      if(!helper.isClosed()&&!await helper.evaluate(()=>Boolean(window.vm)))await helper.reload();
    };
    helper.on('framenavigated',f=>{if(f===helper.mainFrame())void attach();});void attach();
  };
  context.on('page',watch);
  const book=await context.newPage(),manual=await context.newPage();
  try{
    await worker.evaluate(key=>chrome.storage.local.remove(key),cacheKey);
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await manual.goto(origin+`/p/t_pc/pc_evaluation/practiceConfig/${source}?task_id=${task}`);
    await manual.waitForFunction(()=>vm.taskInfo.task_total_qs===34);
    await book.goto(bookURL);
    await book.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===7);
    const labels=await book.locator('[data-xet-original-question-number]').allTextContents();
    if(JSON.stringify(labels)!==JSON.stringify(['3.','10.','12.','16.','25.','29.','34.']))throw new Error('Taskless real-world course numbering failed');
    for(let i=0;i<100&&helpers.some(p=>!p.isClosed());i++)await new Promise(resolve=>setTimeout(resolve,50));
    if(helpers.length!==1||!helpers[0].isClosed())throw new Error('Redirected helper leaked or duplicated');
    if(starts!==1)throw new Error('Native Start action must run exactly once, only in the owned helper');
    if(!manual.url().includes('/practiceConfig/')||manual.isClosed())throw new Error('Automated a user-created configuration page');
    const record=await worker.evaluate(async key=>(await chrome.storage.local.get(key))[key],cacheKey);
    if(record.ids.length!==34||JSON.stringify(record).includes('answer'))throw new Error('Incomplete or non-metadata cache');
    const before=requests.length;
    await book.reload();await book.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===7);
    if(requests.length!==before)throw new Error('Cache hit repeats configuration or creates an attempt');
    await worker.evaluate(key=>chrome.storage.local.remove(key),cacheKey);fixed=false;
    await book.reload();await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('后台读取未启动'));
    if(starts!==1||helpers.length!==1)throw new Error('Random configuration started an attempt');
    fixed=true;knownTask=false;
    await book.reload();await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('后台读取未启动'));
    if(starts!==1||helpers.length!==1)throw new Error('Missing course metadata started a taskless attempt');
    const remaining=await worker.evaluate(()=>chrome.storage.session.get(null));
    if(Object.keys(remaining).some(k=>k.startsWith('xetQuestionOrderJob:')))throw new Error('Jobs leaked');
    if(errors.length)throw new Error(errors.join('; '));
    return {tasklessCards:7,defaultFixedFlag:-1,fullPaper:34,labels,nativeConfigStarts:starts,
      markerLossRecovered:true,manualConfigUntouched:true,cachedRevisitRequests:0,randomSkipped:true,
      missingTaskReported:true,helpersClosed:true,errors};
  }catch(error){
    const state=await worker.evaluate(()=>chrome.storage.session.get(null));
    throw new Error(error.message+'; diagnostics='+JSON.stringify({requests,starts,configStates,helpers:helpers.map(p=>({url:p.url(),closed:p.isClosed()})),state,
      hint:await book.locator('.xet-question-order-hint').allTextContents()}));
  }finally{
    context.off('page',watch);
    for(const helper of helpers)if(!helper.isClosed())await helper.close();
    await book.close();await manual.close();await context.unroute(`${origin}/**`);
  }
}
