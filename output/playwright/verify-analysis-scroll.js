async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw new Error('Use an owned persistent profile with the real MV3 extension');
  const origin = 'https://merchant.pc.xiaoe-tech.com';
  const path = '/p/t_pc/pc_evaluation/practice_analysis/wb_course_fixture';
  const questions = Array.from({length:42}, (_,i)=>({id:`qs_fixture_${i+1}`,is_collected:false,is_marked:false,type:0}));
  const fixture = await page.context().newPage(), errors = [], checks = [];
  fixture.on('pageerror', e=>errors.push(e.message));
  fixture.setDefaultTimeout(6000);
  const assert = (value,message) => { if(!value) throw new Error(message); };
  const wait = () => fixture.waitForTimeout(350); // Native keyboard paging animates.
  try {
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await fixture.setViewportSize({width:1440,height:900});
    await fixture.route(`${origin}/**`, async route=>{
      if(route.request().method()==='POST') {
        const endpoint=new URL(route.request().url()).pathname;
        const data=endpoint.endsWith('/commit_record') ? {list:questions} :
          endpoint.endsWith('/get_paper_question') ? {practice_list:questions} : {};
        await route.fulfill({json:{code:0,data}});return;
      }
      await route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset=utf-8><style>
        *{box-sizing:border-box}body{margin:0;height:100vh;overflow:auto;background:#f5f5f5;font:16px sans-serif}
        .analysis-base-layout{display:flex;align-items:center;flex-direction:column;min-height:100vh;margin:0 40px}
        .analysis-base-layout__header{position:fixed;z-index:2;top:0;left:0;right:0;height:80px;padding:20px;background:white}
        .analysis-base-layout__title{width:100%;height:48px;background:white;margin-top:16px;border-radius:12px}
        .analysis-base-layout__content{width:100%;height:calc(100vh - 160px);display:flex;justify-content:space-between;margin-top:16px;padding-bottom:24px}
        .analysis-card{width:240px;height:100%;margin-right:16px;background:white;display:flex;flex-direction:column;border-radius:12px;overflow:hidden}
        .analysis-card__slot{height:100%}.collapsible-card{height:100%;display:flex;flex-direction:column}
        .collapsible-card__header{margin:16px;padding:12px;border:1px solid #1472ff;border-radius:8px}
        .answer-card__content{position:relative;height:100%;flex:1;min-height:0}
        .answer-card__content__card{padding:10px 16px 52px;display:flex;align-content:flex-start;flex-wrap:wrap;overflow-y:auto;height:90%}
        .answer-card__content__card__item{margin-right:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #ccc;border-radius:4px;cursor:pointer}
        .answer-card__content__card__item:nth-child(5n){margin-right:0}.current{color:white;background:#1472ff}
        .answer-card__content__info{position:absolute;bottom:16px;left:16px}
        .analysis-regional{position:relative;flex:1;height:100%;padding:16px;background:white;overflow:hidden;border-radius:12px}
        .analysis{height:100%;overflow:hidden}.analysis-only-error{display:flex;align-items:center;height:40px;background:#f5f5f5;position:relative;border-radius:8px}
        .analysis-only-content{position:relative;overflow-y:auto;height:calc(100% - 40px);padding-top:24px}
        .analysis-item{height:660px;padding:24px 0;border-bottom:1px solid #ebebeb}.analysis-item:first-child{padding-top:0}
        .analysis-base-layout__content ::-webkit-scrollbar{display:none}
        .question-header{height:42px}p{line-height:1.7}footer{height:160px;background:#333;color:white;padding:24px}
        #player{position:relative;width:640px;height:360px;background:#ddd}video{width:100%;height:100%}
        #player:fullscreen{width:100%;height:100%}.xgplayer-controls{position:absolute;bottom:0;background:#333;color:white;width:100%;height:48px}
        textarea{width:200px;height:56px;display:block}
      </style><main class=practice-analysis><header class=analysis-base-layout__header>网站导航</header><div class=analysis-base-layout>
        <section style="height:80px"></section><section class=analysis-base-layout__title>查看结果</section>
        <section class=analysis-base-layout__content><div class=analysis-card><div class=analysis-card__slot>
          <aside class=collapsible-card><div class=collapsible-card__header>答题卡</div><div class=answer-card__content>
            <div class=answer-card__content__card>${questions.map((q,i)=>`<div class="answer-card__content__card__item ${i===0?'current':''}"><span>${i+1}</span></div>`).join('')}</div>
            <div class=answer-card__content__info>正确 □　错误 □</div></div></aside></div></div>
          <div class=analysis-regional><div class=analysis><div class=analysis-only-error>解析　<label><input id=only type=checkbox>仅看错题</label></div>
            <div class=analysis-only-content>${questions.map((q,i)=>`<section class=analysis-item id=analysis-${i+1}>
              <div class=question-header><div class=question-type>${i+1}. 单选题</div></div><p>第 ${i+1} 题：题干和解析</p>
              ${i===0?'<textarea aria-label=笔记>笔记</textarea><div id=player class=xgplayer><video></video><div class=xgplayer-controls><button class=xgplayer-play>播放</button><span>倍速</span><button class=xgplayer-fullscreen>全屏</button></div></div>':''}
            </section>`).join('')}</div></div></div></section></div><footer>网站页脚</footer></main><script>
          const root=document.querySelector('.practice-analysis'),list=document.querySelector('.analysis-only-content');
          root.__vue__={resourceId:'wb_course_fixture',join_id:'join_fixture',practiceList:${JSON.stringify(questions)}};
          window.nativeClicks=0;
          const applyFilter=()=>document.querySelectorAll('.analysis-item').forEach((q,i)=>q.style.display=only.checked&&i%2?'none':'');
          only.onchange=applyFilter;
          document.querySelectorAll('.answer-card__content__card__item').forEach((cell,i)=>cell.onclick=()=>{
            nativeClicks++;
            if(i%2){only.checked=false;applyFilter();}
            queueMicrotask(()=>{
              document.querySelector('.current')?.classList.remove('current');cell.classList.add('current');
              document.getElementById('analysis-'+(i+1)).scrollIntoView();window.scrollTo(0,0);
            });
          });
          document.querySelector('.xgplayer-fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():player.requestFullscreen();
          window.toolbar=document.querySelector('.xgplayer-controls');
        </script></html>`});
    });
    await fixture.goto(`${origin}${path}?join_id=join_fixture`);
    await fixture.bringToFront();
    await fixture.waitForSelector('[data-xet-analysis-scroll]');
    const owners=()=>fixture.evaluate(()=>[...document.querySelectorAll('.practice-analysis *')].filter(el=>
      el.tagName!=='TEXTAREA'&&!el.closest('.xgplayer')&&/^(auto|scroll|hidden)$/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2
    ).map(el=>el.className));
    assert((await owners()).length===0,`Nested scroll owners: ${await owners()}`);
    checks.push('one document scroll owner');
    await fixture.locator('.analysis-base-layout__header').click();
    await fixture.keyboard.press('PageDown');await wait();
    const down=await fixture.evaluate(()=>scrollY);
    assert(down>500,'PageDown did not move the questions');
    assert(await fixture.locator('.analysis-only-content').evaluate(el=>el.scrollTop)===0,'Inner list still scrolls');
    await fixture.keyboard.press('PageUp');await wait();
    assert(await fixture.evaluate(()=>scrollY)<down-400,'PageUp did not reverse the document scroll');
    await fixture.mouse.move(1000,400);await fixture.mouse.wheel(0,500);await wait();
    assert(await fixture.evaluate(()=>scrollY)>300,'Wheel over question did not scroll document');
    const beforeCardWheel=await fixture.evaluate(()=>scrollY);
    await fixture.mouse.move(160,300);await fixture.mouse.wheel(0,400);await wait();
    assert(await fixture.evaluate(()=>scrollY)>beforeCardWheel+250,'Wheel over answer card was trapped');
    checks.push('PageDown/PageUp and wheel over either column');
    await fixture.locator('.answer-card__content__card__item').nth(19).click();await wait();
    const top=await fixture.locator('#analysis-20').evaluate(el=>el.getBoundingClientRect().top);
    assert(Math.abs(top-152)<2,`Native jump was undone or obscured: ${top}`);
    assert(await fixture.evaluate(()=>nativeClicks)===1,'Native answer-card handler was suppressed or duplicated');
    assert(await fixture.locator('.current span').textContent()==='20','Native selected-cell state lost');
    const sticky=await fixture.locator('.analysis-card').evaluate(el=>el.getBoundingClientRect().top);
    assert(sticky===96,`Answer card is not sticky: ${sticky}`);
    checks.push('jump to question 20, original selection and sticky card');
    await fixture.locator('#only').check();await wait();
    assert(await fixture.locator('#analysis-20').isHidden(),'Only-errors filter no longer applies');
    await fixture.locator('.answer-card__content__card__item').nth(21).click();await wait();
    assert(!(await fixture.locator('#only').isChecked()),'Native correct-question click failed to clear filter');
    assert(Math.abs(await fixture.locator('#analysis-22').evaluate(el=>el.getBoundingClientRect().top)-152)<2,'Post-filter jump failed');
    checks.push('only-errors filtering and jumping to a hidden correct question');
    await fixture.evaluate(()=>window.scrollTo(0,document.scrollingElement.scrollHeight));await wait();
    const lastBottom=await fixture.locator('#analysis-42').evaluate(el=>el.getBoundingClientRect().bottom);
    assert(lastBottom<900&&lastBottom>0,`Last question is clipped: ${lastBottom}`);
    checks.push('document scrollbar reaches final question and footer');
    // Long answer cards on short screens must flow, never clip or scroll alone.
    await fixture.setViewportSize({width:1440,height:380});await wait();
    assert(await fixture.locator('.analysis-card').getAttribute('data-xet-analysis-sticky-card')===null,'Oversize sidebar remained pinned');
    assert((await owners()).length===0,'Short viewport introduced nested scrolling');
    await fixture.setViewportSize({width:1440,height:900});await wait();
    await fixture.locator('.answer-card__content__card__item').first().click();await wait();
    await fixture.locator('#player').scrollIntoViewIfNeeded();
    await fixture.keyboard.press('t');
    await fixture.waitForFunction(()=>document.documentElement.classList.contains('xet-web-fullscreen-active'));
    assert(await fixture.evaluate(()=>getComputedStyle(document.body).overflowY)==='hidden','Scroll CSS broke page fullscreen lock');
    assert(await fixture.evaluate(()=>toolbar.isConnected&&!document.querySelector('video').controls),'Original toolbar replaced');
    await fixture.keyboard.press('Escape');
    await fixture.waitForFunction(()=>!document.documentElement.classList.contains('xet-web-fullscreen-active'));
    await fixture.locator('.xgplayer-fullscreen').click();
    await fixture.waitForFunction(()=>!!document.fullscreenElement);
    assert(await fixture.evaluate(()=>toolbar.isConnected),'Native fullscreen lost toolbar');
    await fixture.evaluate(()=>document.exitFullscreen());
    checks.push('short viewport, web fullscreen lock and original native controls');
    await fixture.evaluate(()=>history.pushState({},'','/p/t_pc/pc_evaluation/practice_record'));
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-analysis-scroll]'));
    assert(await fixture.locator('.analysis-only-content').evaluate(el=>getComputedStyle(el).overflowY)==='auto','Layout leaked to other route');
    await fixture.evaluate(path=>history.pushState({},'',path+'?join_id=join_fixture'),path);
    await fixture.waitForSelector('[data-xet-analysis-scroll]');
    await fixture.screenshot({path:'output/playwright/analysis-single-scroll.png'});
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-analysis-scroll]'));
    assert(await fixture.locator('.analysis-only-content').evaluate(el=>getComputedStyle(el).overflowY)==='auto','Disable did not restore native scrolling');
    assert(!await fixture.locator('.analysis-card').getAttribute('data-xet-analysis-sticky-card'),'Sticky marker leaked');
    checks.push('SPA navigation, return and site-disable cleanup');
    assert(!errors.length,`Page errors: ${errors.join('; ')}`);
    return {checks,errors};
  } catch(error) {
    throw new Error(`${error.message}; page errors: ${errors.join('; ')}; root: ${await fixture.locator('.practice-analysis').evaluate(el=>el.outerHTML.slice(0,200)).catch(()=> 'unavailable')}`);
  } finally { await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close(); }
}
