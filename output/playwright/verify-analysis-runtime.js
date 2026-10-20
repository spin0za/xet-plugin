async (page) => {
  const worker=page.context().serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Use a fresh real MV3 profile');
  const fixture=await page.context().newPage(),origin='https://merchant.pc.xiaoe-tech.com';
  const path='/p/t_pc/pc_evaluation/practice_analysis/wb_runtime_fixture?join_id=join_runtime&task_id=task_runtime';
  const errors=[],requests=[];let failRead=false,stage='initial read';
  const assert=(v,m)=>{if(!v)throw Error(m)};
  fixture.on('pageerror',e=>errors.push(e.message));
  try{
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await fixture.route(origin+'/**',async route=>{
      const p=new URL(route.request().url()).pathname;
      if(route.request().method()==='POST'){
        requests.push(p);
        assert(p.endsWith('/commit_record')||p.endsWith('/get_paper_question'),'Unexpected mutating request');
        if(failRead){await route.fulfill({status:503,json:{code:503}});return;}
        await route.fulfill({json:{code:0,data:p.endsWith('/commit_record')?{list:[{id:'qs_runtime',is_marked:1}]}:
          {practice_list:[{id:'qs_runtime',is_collected:1}]}}});return;
      }
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8">
      <main class="practice-analysis"><aside class="answer-card__content__card"><div class="answer-card__content__card__item"><span>1</span></div></aside>
      <section class="analysis-item" id="analysis-1"><header class="question-header"><div class="question-type">单选题</div></header></section></main>
      <script>window.notices=[];document.querySelector('main').__vue__={resourceId:'wb_runtime_fixture',join_id:'join_runtime',
        practiceList:[{id:'qs_runtime',is_collected:true}],$message:{error:text=>window.notices.push(text),success:text=>window.notices.push(text)}};
      new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){
        if(n.nodeType===1&&n.matches('.xet-analysis-feedback'))window.notices.push(n.textContent)}}).observe(document.body,{subtree:true,childList:true});</script>`});
    });
    await fixture.goto(origin+path);await fixture.bringToFront();
    await fixture.waitForSelector('.xet-analysis-actions');
    assert(await fixture.locator('.xet-analysis-card-mark').count()===1,'Initial mark missing');
    stage='quiet failed revalidation';
    failRead=true;const before=requests.length;
    const failedRead=fixture.waitForResponse(r=>r.url().endsWith('/get_paper_question')&&r.status()===503);
    await fixture.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await failedRead;
    await fixture.waitForFunction(()=>document.querySelector('.xet-analysis-action')?.getAttribute('aria-disabled')==='false');
    assert(requests.length===before+2,'Revalidation did not query both endpoints');
    assert(await fixture.locator('.xet-analysis-card-mark').count()===1,'Background failure erased displayed mark');
    assert((await fixture.evaluate(()=>window.notices)).length===0,'Background failure showed a disruptive error');
    await fixture.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
    await fixture.waitForTimeout(450);
    assert(requests.length===before+2,'Repeated focus bypassed retry backoff');
    stage='actual extension reload with an unrefreshed page';
    failRead=false;await fixture.reload();await fixture.waitForSelector('.xet-analysis-actions');
    await worker.evaluate(()=>chrome.runtime.reload()).catch(e=>{
      if(!/closed|destroyed|Target|Execution context/i.test(e.message))throw e;
    });
    // This is deliberately the old document: do not inject replacement scripts.
    await fixture.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await fixture.waitForFunction(()=>window.notices.includes('扩展已更新或停用，请刷新页面后继续使用插件'));
    const after=requests.length;
    for(let i=0;i<3;i++){
      await fixture.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
      await fixture.waitForTimeout(400);
    }
    await fixture.waitForTimeout(1100);
    const notices=await fixture.evaluate(()=>window.notices);
    assert(notices.filter(n=>n==='扩展已更新或停用，请刷新页面后继续使用插件').length===1,'Reload warning repeated');
    assert(!notices.some(n=>/网络|无法读取|通信暂/.test(n)),'Extension invalidation was misreported as network/bridge failure');
    assert(requests.length===after,'Orphaned controller continued to request data');
    assert(await fixture.locator('.xet-analysis-card-mark').count()===1,'Reload erased the last confirmed mark');
    assert(await fixture.locator('.xet-analysis-action:disabled').count()===2,'Orphaned controls still claim to work');
    assert(errors.length===0,errors.join('\n'));
    return{ok:true,requests:requests.length,notices,checked:['real extension reload','no replacement injection','one accurate notice',
      'orphaned retries stopped','last mark preserved','controls frozen','quiet failed revalidation','backoff survives focus','no writes']};
  }catch(e){throw Error(`${stage}: ${e.message}`)}
  finally{await fixture.close()}
}
