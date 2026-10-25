async (page) => {
  const worker=page.context().serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('A fresh real MV3 profile is required');
  const origin='https://merchant.pc.xiaoe-tech.com',path='/p/t_pc/pc_evaluation/practice_record';
  const fixture=await page.context().newPage(),observed=await page.context().newPage();
  const errors=[],requests=[],title='第十讲：'+ '完整课程标题应该换行而不是截断。'.repeat(40);
  const answerFlags={join_one:1,join_two:1,join_blank:0,join_observed:1,join_unknown:null,join_failed:'fail'};
  const assert=(v,m)=>{if(!v)throw Error(m)};
  fixture.on('pageerror',e=>errors.push(e.message));
  const prefix=`xetPracticeHistory:${origin}|user_fixture|`;
  const record=(joinId,submittedAt=0)=>({version:1,resourceId:'wb_course_fixture',joinId,taskId:'task_fixture',productId:'course_fixture',title,submittedAt});
  function listHtml(tab){return `<main class="practice-record-page"><div class="practice-history-tab">
    <nav>${['练习','考试','作业','刷题本'].map((t,i)=>`<button class="sub-tab-item ${i===tab?'active':''}">${t}</button>`).join('')}</nav>
    <div class="list-grid"></div></div></main><style>
    .practice-record-page{max-width:1180px;margin:20px auto}.list-grid{display:flex;gap:24px;flex-wrap:wrap}
    .resource-card{width:269px;cursor:pointer;background:#f5f7fa;border-radius:8px;overflow:hidden}
    .resource-card__cover{height:152px}.resource-card__info{padding:16px}
    .resource-card__title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style><script>
    window.USERID='user_fixture';window.nativeClicks=0;
    const rows=[{id:'wb_course_missing',name:'无用旧入口',created_at:'2026-08-09'},
      {id:'wb_course_other',name:'其他类型记录',created_at:'2026-06-07'}];
    const v={$options:{name:'PracticeHistoryTab'},list:rows,activeSubTab:${tab},loading:false,noMore:false,
      loadMore(){this.noMore=true;this.list.push({id:'wb_extra',name:'下一页'});render()}};
    function render(){const grid=document.querySelector('.list-grid');grid.replaceChildren();
      for(const item of rows){const card=document.createElement('div');card.className='resource-card';
      card.innerHTML='<div class="resource-card__cover"></div><div class="resource-card__info"><div class="resource-card__title"></div><div class="card-line">发布时间：2026-08-09</div></div>';
      card.querySelector('.resource-card__title').textContent=item.name;card.__vue__={item};card.onclick=()=>window.nativeClicks++;grid.append(card)}}
    document.querySelector('main').__vue__={$children:[v]};render();</script>`}
  function resultHtml(u){return `<main><div class="practice-result">结果页面</div></main><script>
    window.USERID='user_fixture';document.querySelector('main').__vue__={practice_id:'${u.pathname.split('/').pop()}',
      join_id:'${u.searchParams.get('join_id')}',resultPageData:{totalNum:42},practice_title:'已打开的历史结果',taskId:'task_fixture'};</script>`}
  let stage='setup';
  try{
    await worker.evaluate(async ({prefix,one,two})=>{
      for(const area of [chrome.storage.local,chrome.storage.sync]){
        const all=await area.get(null);
        await area.remove(Object.keys(all).filter(k=>k.startsWith(prefix)||k.startsWith(prefix.replace('|user_fixture|','|other_user|'))));
      }
      await chrome.storage.local.set({disabledSites:[],enabled:true,keepAliveEnabled:false,[prefix+'join_one']:one});
      await chrome.storage.sync.set({[prefix+'join_two']:two,
        [prefix.replace('|user_fixture|','|other_user|')+'join_private']:{...two,joinId:'join_private'}});
    },{prefix,one:record('join_one',Date.now()-10000),two:record('join_two',Date.now())});
    await page.context().route(`${origin}/**`,async route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/fixture-font'){
        try{await route.fulfill({path:'/mnt/c/Windows/Fonts/msyh.ttc',contentType:'font/ttf'});}
        catch{await route.fulfill({status:404,body:''});}return;
      }
      if(route.request().method()==='POST'){
        const body=route.request().postDataJSON();requests.push({path:u.pathname,joinId:body.join_id});
        assert(['/evaluation_wechat/practices/commit_result','/evaluation_wechat/practices/commit_record'].includes(u.pathname),'Unexpected/mutating API');
        if(u.pathname.endsWith('/commit_result'))await route.fulfill({json:{code:0,data:{total_qs:42,correct_qs:0}}});
        else {
          const flag=answerFlags[body.join_id] ?? (body.join_id==='join_unknown'?null:1);
          if(flag==='fail')await route.fulfill({status:503,body:'temporarily unavailable'});
          else await route.fulfill({json:{code:0,data:{list:[{id:'qs_one',is_answer:flag,answer_state:false},{id:'qs_two',is_answer:0,answer_state:false}]}}});
        }return;
      }
      await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Fixture;src:url(/fixture-font)}body{font-family:Fixture,sans-serif}</style>'+
        (u.pathname===path?listHtml(Number(u.searchParams.get('subTab')||0)):resultHtml(u))});
    });
    stage='cache and cloud-only records';
    await fixture.goto(origin+path);await fixture.bringToFront();
    await fixture.waitForFunction(()=>document.querySelectorAll('.xet-history-result-link').length===2);
    assert(await fixture.locator('.list-grid').isHidden(),'Old new-practice entries remain visible');
    assert(await fixture.locator('.xet-history-result-link').first().getAttribute('href').then(h=>h.includes('join_two')),'Newest submission not first');
    assert(await fixture.locator('a[href*="join_private"]').count()===0,'Another account leaked');
    assert((await fixture.locator('.xet-history-records').innerText()).includes('交卷时间：'),'Missing submission time');
    assert(!(await fixture.locator('.xet-history-records').innerText()).includes('发布时间'),'Resource date used as attempt date');
    const metrics=await fixture.locator('.xet-history-result-link').first().evaluate(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));
    assert(metrics.width>800&&metrics.height>60,'Long title truncated');
    stage='migration and second-device local cache';
    await fixture.waitForFunction(async()=>document.querySelector('.xet-history-records')?.dataset.records?.includes('join_one'));
    const uploaded=await worker.evaluate(async prefix=>(await chrome.storage.sync.get(prefix+'join_one'))[prefix+'join_one'],prefix);
    assert(uploaded?.submittedAt>0,'Existing valid local record was not migrated');
    await worker.evaluate(async prefix=>{const all=await chrome.storage.local.get(null);await chrome.storage.local.remove(Object.keys(all).filter(k=>k.startsWith(prefix)));},prefix);
    await fixture.reload();await fixture.waitForFunction(()=>document.querySelectorAll('.xet-history-result-link').length===2);
    stage='recover old result without inventing a date';
    await observed.goto(`${origin}/p/t_pc/pc_evaluation/practice_result/wb_observed?join_id=join_observed`);
    await fixture.reload();await fixture.bringToFront();
    await fixture.waitForSelector('a[href*="join_observed"]');
    assert(await fixture.locator('a[href*="join_observed"]').locator('..').locator('span').count()===0,'Old visit invented submit time');
    stage='live cross-device update';
    await worker.evaluate(({prefix,r})=>chrome.storage.sync.set({[prefix+r.joinId]:r}),{prefix,r:record('join_remote',Date.now()+1000)});
    await fixture.waitForSelector('a[href*="join_remote"]');
    stage='legacy white paper, unknown flags and network failures';
    await worker.evaluate(({prefix,blank,unknown,failed})=>chrome.storage.sync.set({
      [prefix+blank.joinId]:blank,[prefix+unknown.joinId]:unknown,[prefix+failed.joinId]:failed,
    }),{prefix,blank:record('join_blank'),unknown:record('join_unknown'),failed:record('join_failed')});
    await fixture.waitForFunction(()=>document.querySelector('.xet-history-records')?.dataset.records?.includes('join_unknown'));
    await fixture.waitForFunction(()=>!document.querySelector('a[href*="join_blank"]'));
    await fixture.waitForFunction(()=>document.querySelectorAll('.xet-history-result-link').length===6);
    assert(await fixture.locator('a[href*="join_one"]').count()===1,'All-wrong record was hidden');
    const blank=await worker.evaluate(async k=>(await chrome.storage.local.get(k))[k],prefix+'join_blank');
    assert(blank?.hasAnswers===false,'Legacy white paper was not cached');
    await fixture.reload();await fixture.waitForSelector('a[href*="join_unknown"]');
    assert(await fixture.locator('a[href*="join_blank"]').count()===0,'Reload resurrected a white paper');
    const blankChecks=requests.filter(r=>r.joinId==='join_blank').length;
    assert(blankChecks===1,'Verified white paper was fetched repeatedly');
    await worker.evaluate(k=>chrome.storage.local.remove(k),prefix+'join_blank');
    await fixture.reload();await fixture.waitForSelector('a[href*="join_unknown"]');
    assert(await fixture.locator('a[href*="join_blank"]').count()===0,'Cloud-only white-paper marker was ignored');
    assert(requests.filter(r=>r.joinId==='join_blank').length===1,'Cloud-only white paper was fetched again');
    await observed.goto(`${origin}/p/t_pc/pc_evaluation/practice_result/wb_course_fixture?join_id=join_blank`);
    await fixture.reload();await fixture.bringToFront();
    await fixture.waitForSelector('a[href*="join_unknown"]');
    assert(await fixture.locator('a[href*="join_blank"]').count()===0,'Revisiting result resurrected blank history');
    const remoteBlank=await worker.evaluate(async k=>(await chrome.storage.sync.get(k))[k],prefix+'join_blank');
    assert(remoteBlank?.hasAnswers===false,'Blank classification did not sync');
    await fixture.screenshot({path:'output/playwright/practice-history-list.png',fullPage:true});
    stage='result navigation';
    await fixture.locator('a[href*="join_one"]').click();await fixture.waitForURL('**/practice_result/wb_course_fixture?**');
    const u=new URL(fixture.url());assert(u.searchParams.get('join_id')==='join_one'&&!u.searchParams.has('isJustCommitted'),'Wrong result link');
    stage='other categories and cleanup';
    for(const tab of [1,2,3]){
      await fixture.goto(`${origin}${path}?subTab=${tab}`);await fixture.waitForSelector('[data-xet-history-list]');
      await fixture.waitForFunction(()=>!document.querySelector('[data-xet-history-results]'));
      assert(await fixture.locator('.resource-card').first().evaluate(e=>e.getBoundingClientRect().width)>800,'Other category remains grid');
      await fixture.locator('.resource-card').first().click();assert(await fixture.evaluate(()=>window.nativeClicks)===1,'Other native action blocked');
      await fixture.locator('.xet-history-more').click();await fixture.waitForFunction(()=>document.querySelectorAll('.resource-card').length===3);
    }
    stage='sync failure and explicit retry';
    await worker.evaluate(()=>{globalThis.originalSyncSet=chrome.storage.sync.set;chrome.storage.sync.set=async()=>{throw Error('QUOTA_BYTES')};});
    await worker.evaluate(({prefix,r})=>chrome.storage.local.set({[prefix+r.joinId]:r}),{prefix,r:record('join_pending',Date.now()+2000)});
    await fixture.goto(origin+path);await fixture.waitForSelector('a[href*="join_pending"]');
    await fixture.waitForFunction(()=>document.querySelector('.xet-history-status')?.textContent.includes('额度已满'));
    await worker.evaluate(()=>{chrome.storage.sync.set=globalThis.originalSyncSet;delete globalThis.originalSyncSet;});
    await fixture.getByRole('button',{name:'重试同步'}).click();
    await fixture.waitForFunction(()=>!document.querySelector('.xet-history-status')?.textContent.includes('额度已满'));
    assert((await worker.evaluate(async k=>(await chrome.storage.sync.get(k))[k],prefix+'join_pending'))?.submittedAt>0,'Retry did not sync pending record');
    stage='empty account';
    await fixture.evaluate(()=>{window.USERID='user_empty';});
    await fixture.waitForFunction(()=>document.querySelector('.xet-history-status')?.textContent.includes('暂无可查看结果'));
    assert(await fixture.locator('.xet-history-result-link').count()===0,'Old account records remain visible');
    assert(await fixture.locator('.list-grid').isHidden(),'Empty account exposed useless old entries');
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-history-list]'));
    assert(await fixture.locator('.list-grid').isVisible(),'Disable did not restore original entries');
    assert(await fixture.locator('.xet-history-records').count()===0,'Disable left injected list');
    assert(errors.length===0,errors.join('\n'));
    return{ok:true,requests:requests.length,metrics,checked:['real MV3','sync-only records','migration','local cache reset','account isolation',
      'hide useless entries','independent of native pagination','full titles','latest first','result links','no invented old dates',
      'live sync updates','legacy white papers hidden','all-wrong and partial work retained','unknown and failed reads retained',
      'cached/cloud-only empty markers','no resurrection on result revisit','quota fallback and retry','other categories unchanged','disable cleanup']};
  }catch(e){throw Error(`${stage}: ${e.message}`)}
  finally{await fixture.close();await observed.close()}
}
