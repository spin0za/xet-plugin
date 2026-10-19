async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('A fresh real MV3 profile is required');
  const origin='https://merchant.pc.xiaoe-tech.com', path='/p/t_pc/pc_evaluation/practice_record';
  const fixture=await page.context().newPage(), observed=await page.context().newPage();
  const errors=[], requests=[];
  const title='练习任务-【练习】第十讲：在线练习与逐题讲解，完整标题不能截断。'+'很长的完整课程标题，应该自然换行而不是显示省略号。'.repeat(8);
  const assert=(v,m)=>{if(!v)throw Error(m)};
  fixture.on('pageerror',e=>errors.push(e.message));
  function resultHtml(account='user_fixture',resource='wb_course_observed',join='join_observed') {
    return `<main id="result"><div class="practice-result">结果页面</div></main><script>
      window.USERID='${account}';document.querySelector('#result').__vue__={practice_id:'${resource}',join_id:'${join}',
      resultPageData:{totalNum:42},practice_title:'已打开的历史结果',course_id:'course_fixture',taskId:'task_fixture'};
      </script>`;
  }
  function listHtml(tab) {
    return `<div class="practice-record-page"><nav class="main-tab-bar">练习历史　我的错题　题目收藏</nav>
      <div class="practice-history-tab"><div class="sub-header">${['练习','考试','作业','刷题本'].map((t,i)=>
        `<button class="sub-tab-item ${i===tab?'active':''}">${t}</button>`).join('')}</div><div class="list-grid"></div></div></div>
      <style>.practice-record-page{max-width:1180px;margin:20px auto}.list-grid{display:flex;gap:24px;flex-wrap:wrap}
      .resource-card{width:269px;cursor:pointer;background:#f5f7fa;border-radius:8px;overflow:hidden}
      .resource-card__cover{width:269px;height:152px;background:#1472ff}.resource-card__info{padding:16px}
      .resource-card__title{font-size:16px;line-height:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .card-line{color:#999;font-size:12px}.sub-header{margin-bottom:20px}.sub-tab-item{padding:8px 20px}</style>
      <script>
      window.USERID='user_fixture';window.nativePracticeClicks=0;window.nativeOtherClicks=0;
      const rows=[{id:'wb_course_fixture',name:${JSON.stringify(title)},created_at:'2026-06-07'},
        {id:'wb_course_missing',name:'第九讲：尚未取得作答编号',created_at:'2026-08-09'},
        {id:'wb_course_observed',name:'已打开的结果页面，可以恢复结果入口',created_at:'2026-06-07'}];
      const v={$options:{name:'PracticeHistoryTab'},list:rows,activeSubTab:${tab},loading:false,noMore:false,
        loadMore(){this.loading=true;setTimeout(()=>{this.list.push({id:'wb_course_server',name:'第八讲：网站返回已有作答编号',
          join_id:'join_server',join_time:'2026-10-19 09:00:00',resource_id:'course_fixture',task_id:'task_fixture'});
          this.loading=false;this.noMore=true;render()},50)}};
      function render(){const grid=document.querySelector('.list-grid');grid.replaceChildren();
        for(const item of v.list){const card=document.createElement('div');card.className='resource-card';
          card.innerHTML='<div class="resource-card__cover"></div><div class="resource-card__info"><div class="resource-card__title"></div><div class="card-line">发布时间：2026-06-07</div></div>';
          card.querySelector('.resource-card__title').textContent=item.name;card.__vue__={item};
          card.onclick=()=>{if(v.activeSubTab===0)window.nativePracticeClicks++;else window.nativeOtherClicks++};grid.append(card)}}
      document.querySelector('.practice-record-page').__vue__={$children:[v]};render();
      </script>`;
  }
  let stage='setup';
  try {
    await worker.evaluate(async ({origin,title})=>{
      await chrome.storage.local.set({disabledSites:[],enabled:true,keepAliveEnabled:false});
      const key=`xetPracticeHistory:${origin}|user_fixture|`;
      await chrome.storage.local.set({
        [key+'join_one']:{version:1,resourceId:'wb_course_fixture',joinId:'join_one',taskId:'task_fixture',productId:'course_fixture',title,startedAt:'2026-10-18 12:34:56'},
        [key+'join_two']:{version:1,resourceId:'wb_course_fixture',joinId:'join_two',taskId:'task_fixture',productId:'course_fixture',title,startedAt:''},
        [`xetPracticeHistory:${origin}|different_user|join_other`]:{version:1,resourceId:'wb_course_fixture',joinId:'join_other',title:'Other account'},
      });
    },{origin,title});
    await page.context().route(`${origin}/**`,async route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/fixture-font'){
        try{await route.fulfill({path:'/mnt/c/Windows/Fonts/msyh.ttc',contentType:'font/ttf'});}
        catch{await route.fulfill({status:404,body:''});}return;
      }
      if(route.request().method()==='POST'){
        requests.push({path:u.pathname,body:route.request().postDataJSON()});
        assert(u.pathname==='/evaluation_wechat/practices/commit_result','Unexpected/mutating API');
        await route.fulfill({json:{code:0,data:{total_qs:42}}});return;
      }
      const body=u.pathname===path?listHtml(Number(u.searchParams.get('subTab')||0)):
        resultHtml('user_fixture',u.pathname.split('/').pop(),u.searchParams.get('join_id'));
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-CN"><head><style>@font-face{font-family:Fixture;src:url('/fixture-font')}body{font-family:Fixture,sans-serif}</style></head><body>${body}</body></html>`});
    });
    stage='existing open result discovery';
    await observed.goto(`${origin}/p/t_pc/pc_evaluation/practice_result/wb_course_observed?join_id=join_observed&task_id=task_fixture`);
    await fixture.goto(origin+path);
    await fixture.bringToFront();
    await fixture.waitForFunction(()=>document.querySelectorAll('.xet-history-attempts a').length===3);
    stage='list layout and full titles';
    const metrics=await fixture.evaluate(()=>{
      const cards=[...document.querySelectorAll('.resource-card')];
      const r=cards.map(c=>c.getBoundingClientRect());const title=cards[0].querySelector('.resource-card__title');
      return {width:r[0].width,nextTop:r[1].top,firstBottom:r[0].bottom,whiteSpace:getComputedStyle(title).whiteSpace,
        titleHeight:title.getBoundingClientRect().height,publicationVisible:[...cards[0].querySelectorAll('.card-line')].some(e=>getComputedStyle(e).display!=='none')};});
    assert(metrics.width>800&&metrics.nextTop>=metrics.firstBottom,'Cards remain a grid');
    assert(metrics.whiteSpace==='normal'&&metrics.titleHeight>50,'Title still truncated');
    assert(!metrics.publicationVisible,'Publication date remains visible');
    const details=await fixture.locator('.xet-history-details').first().innerText();
    assert(details.includes('2026-10-18 12:34:56')&&!details.includes('网站未提供'),'Incorrect start time or unknown placeholder');
    assert(await fixture.locator('.resource-card').first().locator('.xet-history-attempts span').count()===1,'Missing start time rendered a row');
    assert(await fixture.locator('.resource-card').nth(2).locator('.xet-history-attempts span').count()===0,'Observed result invented a timestamp');
    assert(!(await fixture.locator('.resource-card').nth(2).innerText()).includes('练习开始时间'),'Unknown time label remains');
    assert(await fixture.locator('a[href*="join_other"]').count()===0,'Leaked another account');
    stage='missing record cannot start new practice';
    await fixture.locator('.resource-card').nth(1).click();
    assert(await fixture.evaluate(()=>window.nativePracticeClicks)===0,'Missing join opened new practice');
    assert(new URL(fixture.url()).pathname===path,'Missing record navigated');
    stage='pagination and server record';
    await fixture.locator('.xet-history-more').click();
    await fixture.waitForFunction(()=>document.querySelector('a[href*="join_server"]'));
    assert(requests.length===1&&requests[0].body.join_id==='join_server','Wrong verification request');
    const serverDetails=await fixture.locator('.resource-card').nth(3).innerText();
    assert(serverDetails.includes('2026-10-19 09:00:00'),'Lost real start time');
    await fixture.screenshot({path:'output/playwright/practice-history-list.png',fullPage:true});
    stage='actual result link';
    await fixture.locator('a[href*="join_one"]').click();
    await fixture.waitForURL('**/practice_result/wb_course_fixture?**');
    assert(new URL(fixture.url()).searchParams.get('join_id')==='join_one','Wrong result attempt');
    assert(!new URL(fixture.url()).searchParams.has('isJustCommitted'),'History claimed a new submission');
    stage='all history categories';
    for(const subTab of [1,2,3]){
      await fixture.goto(`${origin}${path}?subTab=${subTab}`);
      await fixture.waitForSelector('[data-xet-history-list]');
      assert(await fixture.locator('.resource-card').first().evaluate(e=>e.getBoundingClientRect().width)>800,'Another category remains grid');
      await fixture.locator('.resource-card').first().click();
      assert(await fixture.evaluate(()=>window.nativeOtherClicks)===1,'Changed another category native navigation');
    }
    stage='disable cleanup';
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-history-list]'));
    assert(await fixture.locator('.resource-card').first().evaluate(e=>e.getBoundingClientRect().width)===269,'Disable did not restore grid');
    assert(errors.length===0,errors.join('\n'));
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));
    return {ok:true,metrics,requests:requests.length,checked:['real MV3','all four categories','full title wrapping','multiple attempts',
      'account scope','start dates not publication dates','missing record blocks new practice','pagination','result navigation','disable cleanup']};
  }catch(error){throw Error(`${stage}: ${error.message}`)}
  finally{await fixture.close();await observed.close()}
}
