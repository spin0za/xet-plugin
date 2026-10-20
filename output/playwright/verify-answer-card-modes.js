async(page)=>{
  const worker=page.context().serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Load the real MV3 extension in an owned profile');
  const fixture=await page.context().newPage(),errors=[],checks=[];
  fixture.on('pageerror',e=>errors.push(e.message));fixture.setDefaultTimeout(6000);
  const origin='https://merchant.pc.xiaoe-tech.com';
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  try{
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await fixture.setViewportSize({width:1280,height:900});
    await fixture.route(`${origin}/**`,async route=>{
      if(route.request().method()==='POST'){await route.fulfill({json:{code:0,data:{}}});return;}
      await route.fulfill({contentType:'text/html',body:`<!doctype html><style>
        *{box-sizing:border-box}body{font:14px/20px sans-serif;background:#f3f6fa}
        .card{width:240px;height:500px;background:white;padding-top:16px;border-radius:12px}
        .collapsible-card__header{width:208px;height:40px;margin:0 auto 6px;padding:0 8px 0 16px;display:flex;align-items:center;justify-content:space-between;border:1px solid blue}
        .collapsible-card__toggle{width:24px;height:24px;border:0;background:transparent}
        .analysis-card__header{width:208px;height:40px;line-height:40px;margin:0 auto;padding-left:16px;text-align:left}
        .answer-card__content{height:calc(100% - 62px);position:relative}
        .answer-card__content__card{height:90%;overflow:auto;padding:10px 16px 52px;display:flex;flex-wrap:wrap;align-content:flex-start}
        .answer-card__content__card__item{width:32px;height:32px;display:flex;align-items:center;justify-content:center;margin:0 12px 12px 0;border:1px solid #ccc;border-radius:4px}
        .answer-card__content__card__item:nth-child(5n){margin-right:0}.current{background:#1472ff;color:white}
        .answer-card__content__info{position:absolute;bottom:16px;left:16px;display:flex}
        .info-item{display:flex;align-items:center;margin-right:13px}.info-item__block{width:24px;height:16px;border:1px solid;margin-left:4px}
      </style><div class=card><div class=collapsible-card__header><span>答题卡</span><button class=collapsible-card__toggle aria-label=收起>↤</button></div><div class=answer-card__content>
        <div class=answer-card__content__card>${Array.from({length:42},(_,i)=>`<div class="answer-card__content__card__item unanswered ${i===0?'current':''}"><span>${i+1}</span></div>`).join('')}</div>
        <div class=answer-card__content__info><div class=info-item><span class=item>已答</span><span class="info-item__block answered"></span></div><div class=info-item><span class=item>未答</span><span class="info-item__block default"></span></div></div>
        </div></div><script>window.nativeClicks=0;window.cells=[...document.querySelectorAll('.answer-card__content__card__item')];cells.forEach(cell=>cell.onclick=()=>nativeClicks++);</script>`});
    });
    await fixture.goto(`${origin}/p/t_pc/pc_evaluation/practice_sheet/wb_course_fixture`);
    await fixture.bringToFront();
    await fixture.waitForFunction(()=>document.documentElement.hasAttribute('data-xet-analysis-layout'));
    const heading=fixture.locator('.collapsible-card__header');
    const toggle=heading.locator('button');
    const headingGeometry=()=>heading.evaluate(el=>{
      const box=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el.querySelector('span'));
      const text=range.getBoundingClientRect(),button=el.querySelector('button')?.getBoundingClientRect();
      return {offset:(text.left+text.right-box.left-box.right)/2,width:box.width,height:box.height,
        buttonRight:button&&box.right-button.right};
    });
    const withToggle=await headingGeometry();
    assert(Math.abs(withToggle.offset)<0.1&&withToggle.width===208&&withToggle.height===40&&withToggle.buttonRight===9,`Heading or toggle moved: ${JSON.stringify(withToggle)}`);
    await toggle.evaluate(el=>{window.originalToggle=el;window.collapseClicks=0;el.onclick=()=>{collapseClicks++;document.querySelector('.answer-card__content').hidden=!document.querySelector('.answer-card__content').hidden}});
    await toggle.click();await toggle.click();
    assert(await fixture.evaluate(()=>collapseClicks===2&&originalToggle===document.querySelector('.collapsible-card__toggle')&&!document.querySelector('.answer-card__content').hidden),'Native collapse toggle was replaced or intercepted');
    await toggle.evaluate(el=>el.remove());
    assert(Math.abs((await headingGeometry()).offset)<0.1,'Heading shifted without a toggle');
    await heading.evaluate(el=>el.append(originalToggle));
    const legacy=await fixture.evaluate(()=>{
      const el=document.createElement('div');el.className='analysis-card__header';el.textContent='答题卡';document.body.append(el);
      const box=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();
      const offset=(text.left+text.right-box.left-box.right)/2;el.remove();return offset;
    });
    assert(Math.abs(legacy)<0.1,'Legacy answer-card heading is not centered');
    checks.push('heading text precisely centered with/without native toggle and in legacy card; native collapse clicks preserved');
    const read=()=>fixture.evaluate(()=>{
      const el=cells[0],style=getComputedStyle(el),icon=getComputedStyle(el,'::after');
      return {height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,
        mask:decodeURIComponent(icon.maskImage),background:style.backgroundColor,outline:style.outlineWidth,
        children:el.children.length,same:el===document.querySelector('.answer-card__content__card__item')};
    });
    assert((await read()).mask.includes('M3 8h10'),'Unanswered practice was guessed as an outcome');
    await fixture.evaluate(()=>cells[0].className='answer-card__content__card__item answered current');
    assert((await read()).mask.includes('circle'),'Answered practice must show a dot, not a correct check');
    await fixture.locator('.answer-card__content__card__item').first().click();
    assert(await fixture.evaluate(()=>nativeClicks)===1,'Native practice card click was intercepted');
    // Rote-review answer and undo are native class changes, with no DOM rewrite.
    for(const [status,path] of [['success','M3 8l3'],['error','M4 4'],['default','M3 8h10']]){
      await fixture.evaluate(status=>cells[0].className='answer-card__content__card__item '+status+' current',status);
      const state=await read();assert(state.mask.includes(path)&&state.outline==='4px'&&state.same&&state.children===1,`${status} or undo replaced native UI`);
    }
    checks.push('practice answered is not correct; rote-review correct/wrong/undo react without replacing cells');
    const scroll=await fixture.evaluate(()=>{
      const grid=document.querySelector('.answer-card__content__card');
      grid.scrollTop=grid.scrollHeight;
      return {scrolled:grid.scrollTop>0,overflow:getComputedStyle(grid).overflowY,last:cells.at(-1).getBoundingClientRect().bottom,bottom:grid.getBoundingClientRect().bottom};
    });
    assert(scroll.scrolled&&scroll.overflow==='auto'&&scroll.last<=scroll.bottom,'Long practice cards lost native scrolling');
    checks.push('native practice-card scroll still reaches the final cell');
    for(const path of ['practice_analysis/wb_course_fixture','exam_analysis/exam_fixture','errbook/practice/42?readonly=0','errbook/practice/42?readonly=1']){
      await fixture.evaluate(path=>history.pushState({},'',`/p/t_pc/pc_evaluation/${path}`),path);
      const state=await read();assert(state.width===32&&state.height===44&&state.mask.includes('M3 8h10'),`Missing ${path} sizing or empty-state cue`);
      if(path.startsWith('exam_analysis/')){
        const legend=await fixture.evaluate(()=>{
          const node=document.querySelector('.answer-card__content__info');
          node.innerHTML=['success','error','essay'].map((status,i)=>`<div class="info-item"><span class="item">${['正确','错误','问答题'][i]}</span><span class="info-item__block ${status}"></span></div>`).join('');
          return {width:node.getBoundingClientRect().width,extra:getComputedStyle(node,'::after').content};
        });
        assert(legend.width<=208&&legend.extra==='none',`Native exam legend overflows: ${JSON.stringify(legend)}`);
      }
      checks.push(path);
    }
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!document.documentElement.hasAttribute('data-xet-analysis-layout'));
    assert(Math.abs((await headingGeometry()).offset)>1,'Disable did not restore native heading alignment');
    assert((await read()).height===32,'Disable left V2 cells behind');
    assert(await fixture.locator('.answer-card__content__card__item').first().evaluate(el=>getComputedStyle(el,'::after').content)==='none','Disable left symbols behind');
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));
    await fixture.waitForFunction(()=>document.documentElement.hasAttribute('data-xet-analysis-layout'));
    assert((await read()).height===44,'Re-enable did not restore V2');
    await fixture.evaluate(()=>history.pushState({},'','/p/t_pc/course_pc_detail/video/fixture'));
    await fixture.waitForFunction(()=>!document.documentElement.hasAttribute('data-xet-analysis-layout'));
    assert((await read()).height===32,'Answer-card styles leaked onto other routes');
    assert(!errors.length,errors.join('; '));checks.push('disable, re-enable and SPA cleanup');
    return {checks,errors};
  }finally{await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close();}
}
