async (page) => {
  const context=page.context(),worker=context.serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw new Error('Load the real MV3 extension in a fresh isolated profile');
  const origin='https://direct-order-fixture.pc.xiaoe-tech.com';
  const newSource='wb_course_direct_new',resumeSource='wb_course_direct_resume';
  const taskOf=source=>'pt_'+source;
  const cacheKey=source=>`xetQuestionOrder:${origin}|${source}|${taskOf(source)}`;
  const sources={
    [newSource]:{total:22,last:true,random:-1,count:-1,wrong:[22,3,12,10]},
    [resumeSource]:{total:34,last:false,random:0,count:0,wrong:[34,29,25,16,12,10,3]},
  };
  const bookURL=source=>origin+`/p/t_pc/pc_evaluation/errbook/detail/228676040?tab=1&source_id=${source}`;
  const vue=await(await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  const requests=[],errors=[],extraPages=[];let fault='',stage='initial',newAttempts=0;
  const html=`<!doctype html><meta charset=utf-8><div id=app></div><script>${vue}</script><script>
    const source=new URLSearchParams(location.search).get('source_id'),sets=${JSON.stringify(sources)};
    window.vm=new Vue({el:'#app',data:{sourceId:source,classifyId:228676040,currentTab:1,loading:false,
      questionList:sets[source].wrong.map(n=>({id:'qs_'+source+'_'+n,task_id:'',content:'Question '+n}))},
      template:'<div class="errbook-detail-page"><div class="question-list"><div class="question-card" v-for="q in questionList" :key="q.id"><div class="card-body">{{q.content}}</div></div></div></div>'});
  </script>`;
  await context.route(`${origin}/**`,async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='POST'){
      if(!url.pathname.includes('/errbook/detail/'))throw new Error('Direct strategy loaded a practice page');
      return route.fulfill({contentType:'text/html',body:html});
    }
    const body=request.postDataJSON(),source=body.practice_id,s=sources[source];
    requests.push({path:url.pathname,body});
    if(!s)throw new Error('Wrong source');
    if(url.pathname.endsWith('/get.practice.type/1.0.0'))return route.fulfill({json:{code:0,data:{course_task_id:taskOf(source)}}});
    if(body.task_id!==taskOf(source))throw new Error('Wrong or missing task');
    if(url.pathname.endsWith('/answer.config.get/1.0.0')){
      await new Promise(resolve=>setTimeout(resolve,120));
      return route.fulfill({json:{code:0,data:{random_setting:s.random,task_total_qs:s.total,is_last_commit:s.last,practice_num:s.count}}});
    }
    if(url.pathname.endsWith('/join')){
      if(body.gen_config){
        if(JSON.stringify(body.gen_config)!==JSON.stringify({random_setting:0,practice_num:s.total,practice_mode:0}))throw new Error('Not the native fixed/full generation payload');
        if(!s.last)throw new Error('Replaced an existing attempt with new generation');
        newAttempts++;s.last=false;s.random=0;s.count=0;
      }
      if(fault==='lost-join')return route.fulfill({status:503,body:'lost response after server creation'});
      return route.fulfill({json:{code:0,data:{join_id:'uwb_'+source,gen_config:{random_setting:0,
        practice_num:fault==='partial'?5:s.total,practice_mode:source===resumeSource?1:0}}}});
    }
    if(url.pathname.endsWith('/commit_record')){
      if(body.join_id!=='uwb_'+source||body.filter_delete!==false)throw new Error('Wrong record read');
      if(fault==='paper')return route.fulfill({status:503,body:'offline'});
      return route.fulfill({json:{code:0,data:{list:Array.from({length:s.total},(_,i)=>({id:'qs_'+source+'_'+(i+1),answer:'NEVER-PERSIST'}))}}});
    }
    throw new Error('Unexpected account write: '+url.pathname);
  });
  const book=await context.newPage(),second=await context.newPage();
  const watch=created=>{extraPages.push(created);};context.on('page',watch);
  for(const p of [book,second])p.on('pageerror',e=>errors.push(e.message));
  const labels=()=>book.locator('[data-xet-original-question-number]').allTextContents();
  const numbers=async(source,p=book)=>{
    await p.waitForFunction(count=>document.querySelectorAll('[data-xet-original-question-number]').length===count,sources[source].wrong.length);
    const expected=[...sources[source].wrong].sort((a,b)=>a-b).map(n=>n+'.');
    if(JSON.stringify(await p.locator('[data-xet-original-question-number]').allTextContents())!==JSON.stringify(expected))throw new Error('Wrong original order');
  };
  const record=source=>worker.evaluate(async key=>(await chrome.storage.local.get(key))[key],cacheKey(source));
  const countJoins=source=>requests.filter(r=>r.path.endsWith('/join')&&r.body.practice_id===source).length;
  const clear=source=>worker.evaluate(key=>chrome.storage.local.remove(key),cacheKey(source));
  try{
    await worker.evaluate(keys=>chrome.storage.local.remove(keys),[cacheKey(newSource),cacheKey(resumeSource)]);
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false,questionOrderStrategy:'direct'}));
    await Promise.all([book.goto(bookURL(newSource)),second.goto(bookURL(newSource))]);
    await numbers(newSource);await numbers(newSource,second);
    if(newAttempts!==1||countJoins(newSource)!==1)throw new Error('Concurrent books duplicated generation');
    const first=await record(newSource);
    if(first.ids.length!==22||JSON.stringify(first).includes('answer'))throw new Error('Partial paper or answers persisted');
    stage='cache revisit';const before=requests.length;
    await book.reload();await numbers(newSource);
    if(requests.length!==before)throw new Error('Cache revisit sent API requests');
    stage='existing rote attempt';await book.goto(bookURL(resumeSource));await numbers(resumeSource);
    const resumed=await record(resumeSource);
    if(resumed.ids.length!==34||countJoins(resumeSource)!==1||newAttempts!==1)throw new Error('Existing attempt was not resumed without generation');
    const resumeRequest=requests.find(r=>r.path.endsWith('/join')&&r.body.practice_id===resumeSource);
    if(resumeRequest.body.gen_config)throw new Error('Modified the existing rote-practice mode');
    stage='failure without fallback';await clear(resumeSource);fault='paper';await book.reload();
    await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('后台读取未能完成'));
    const joins=countJoins(resumeSource);fault='';await book.reload();await numbers(resumeSource);
    if(countJoins(resumeSource)!==joins)throw new Error('Retry repeated join instead of using the persisted record ID');
    stage='lost mutation response';await clear(newSource);sources[newSource].last=true;sources[newSource].random=-1;sources[newSource].count=-1;
    fault='lost-join';await book.goto(bookURL(newSource));
    await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('后台读取未能完成'));
    const creations=newAttempts;fault='';await book.reload();await numbers(newSource);
    if(newAttempts!==creations)throw new Error('Uncertain join was blindly replayed as a new attempt');
    stage='random exclusion';await clear(newSource);sources[newSource].random=1;const oldJoins=countJoins(newSource);await book.reload();
    await book.waitForFunction(()=>document.querySelector('.xet-question-order-hint')?.textContent.includes('后台读取未启动'));
    if(countJoins(newSource)!==oldJoins)throw new Error('Random practice was resumed or generated');
    if(extraPages.length)throw new Error('Direct strategy created a visible or background tab');
    if(errors.length)throw new Error(errors.join('; '));
    if(requests.some(r=>!/get.practice.type|answer.config.get|practices\/join$|commit_record$/.test(r.path)))throw new Error('Answer or submit endpoint requested');
    return {directDefault:true,newFullPaper:22,resumedFullPaper:34,concurrentGenerationCount:1,cachedRevisitRequests:0,
      newTabs:extraPages.length,practicePageLoads:0,existingRoteModePreserved:true,readRetryNewJoins:0,
      lostJoinDuplicateCreations:0,randomSkipped:true,failureReportedWithoutFallback:true,errors};
  }catch(error){throw new Error(stage+': '+error.message+'; diagnostics='+JSON.stringify({requests,extraPages:extraPages.map(p=>p.url()),hint:await book.locator('.xet-question-order-hint').allTextContents()}));}
  finally{
    context.off('page',watch);await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await book.close();await second.close();for(const p of extraPages)if(!p.isClosed())await p.close();
    await worker.evaluate(async({origin,keys})=>{
      const state=await chrome.storage.session.get(null);
      for(const [key,job]of Object.entries(state))if(key.startsWith('xetQuestionOrderDirect:')&&job.origin===origin){await chrome.alarms.clear(key);await chrome.storage.session.remove(key);}
      await chrome.storage.local.remove(keys);await chrome.storage.local.set({disabledSites:[],questionOrderStrategy:'direct'});
    },{origin,keys:[cacheKey(newSource),cacheKey(resumeSource)]});
    await context.unroute(`${origin}/**`);
  }
}
