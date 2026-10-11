async (page) => {
  // Real MV3 extension, independent profile, local content only. No real answers.
  const context=page.context();
  const worker=context.serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw new Error('Load the extension in an isolated profile');
  const origin='https://merchant.pc.xiaoe-tech.com';
  const fixture=await context.newPage(), errors=[];
  fixture.on('pageerror',error=>errors.push(error.message));
  const html=`<!doctype html><meta charset=utf-8><style>
    body{font:20px Arial,sans-serif;padding:24px;color:#333}
    .question-content{font-weight:700}.xe-preview__content{font-family:Arial,sans-serif}
    .card-content,.question-content,.question-option-item__content{padding:12px}
    .iconfont{font-family:monospace}
    </style><div class=errbook-detail-page>
    <div class=card-content><div class=xe-preview__content>
      <p id=reference>客「すみません。お手洗いはどこですか。」</p>
      <p><strong style="font-size:medium"><span id=imported style='font-size:12pt;line-height:18.4px;font-family:"Source Han Serif JP SemiBold",serif'>スタッフ「お客様にご案内（　　　）。ただいま、2階に無料茶道体験レッスンを行っております。」</span></strong></p>
      <p><font id=legacy face="Times New Roman">Imported legacy face</font></p>
      <p><span id=shorthand style="font:italic 18px serif">Imported shorthand font</span></p>
      <span id=outside style="font-family:serif">Outside question content</span>
    </div></div></div>
    <div class=question-content><div class=xe-preview__content>
      <span id=stem style="font-family:serif"><em id=emphasis style="font-family:serif;text-decoration:underline">Original practice question</em></span>
      <span class=katex style="font-family:monospace"><span id=formula style="font-family:serif">Formula</span></span>
      <code id=code style="font-family:monospace">Code example</code>
      <button id=control style="font-family:monospace">Control</button>
      <span class=iconfont id=icon style="font-family:monospace">Icon</span>
      <div class=xgplayer><span id=player-label style="font-family:monospace">Player</span></div>
    </div></div>
    <div class=question-option-item role=button><div class=question-option-item__content><span id=option style="FONT-FAMILY:serif">Answer option</span></div></div>
    <span id=unrelated style="font-family:serif">Unrelated content</span>`;
  const toggle=disabled=>worker.evaluate(({origin,disabled})=>chrome.storage.local.set({
    disabledSites:disabled?[origin]:[],keepAliveEnabled:false,
  }),{origin,disabled});
  const read=()=>fixture.evaluate(()=>{
    const props=id=>{const s=getComputedStyle(document.getElementById(id));return {
      family:s.fontFamily,weight:s.fontWeight,size:s.fontSize,height:s.lineHeight,
      style:s.fontStyle,decoration:s.textDecorationLine,
    };};
    return Object.fromEntries(['reference','imported','legacy','shorthand','stem','emphasis','option','formula','code','control','icon','player-label','unrelated'].map(id=>[id,props(id)]));
  });
  const check=async original=>{
    const result=await read();
    for(const id of ['imported','legacy','shorthand','stem','emphasis','option']) {
      if(result[id].family!==result.reference.family)throw new Error(`Font mismatch: ${id}`);
      for(const prop of ['weight','size','height','style','decoration']) {
        if(result[id][prop]!==original[id][prop])throw new Error(`Changed ${id}'s ${prop}`);
      }
    }
    for(const id of ['formula','code','control','icon','player-label','unrelated']) {
      if(JSON.stringify(result[id])!==JSON.stringify(original[id]))throw new Error(`Typography leaked into ${id}`);
    }
    return result;
  };
  try {
    await toggle(true);
    await fixture.route(`${origin}/**`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
    await fixture.goto(`${origin}/p/t_pc/pc_evaluation/errbook/detail/42?tab=1`);
    const original=await read();
    if(original.imported.family===original.reference.family)throw new Error('Fixture did not reproduce imported serif font');
    const questionHtml=()=>fixture.locator('#reference, #imported, #legacy, #shorthand, #stem, #option').evaluateAll(nodes=>nodes.map(node=>node.outerHTML));
    const originalHtml=await questionHtml();
    await toggle(false);
    await fixture.waitForFunction(()=>document.documentElement.hasAttribute('data-xet-question-typography'));
    const normalized=await check(original);
    if(JSON.stringify(await questionHtml())!==JSON.stringify(originalHtml))throw new Error('Normalization rewrote question HTML');
    const routes=['practice_sheet/fixture','practice_analysis/fixture','practice_sheet/fixture?mode=rote',
      'errbook/practice/42?readonly=1','exam_sheet/fixture','exam_analysis/fixture','errbook/detail/42'];
    for(const route of routes) {
      await fixture.evaluate(route=>{history.pushState({},'',`/p/t_pc/pc_evaluation/${route}`);dispatchEvent(new PopStateEvent('popstate'));},route);
      await check(original);
    }
    await fixture.evaluate(()=>{
      const span=document.createElement('span');span.id='dynamic';span.style.fontFamily='serif';span.textContent='Dynamic question';
      document.querySelector('.question-content .xe-preview__content').append(span);
    });
    if(await fixture.locator('#dynamic').evaluate(el=>getComputedStyle(el).fontFamily)!==normalized.reference.family)throw new Error('Dynamic question kept imported font');
    await fixture.evaluate(()=>{history.pushState({},'','/p/t_pc/course_pc_detail/video/fixture');dispatchEvent(new PopStateEvent('popstate'));});
    if(JSON.stringify(await read())!==JSON.stringify(original))throw new Error('Overrides leaked outside evaluation routes');
    await fixture.evaluate(()=>{history.pushState({},'','/p/t_pc/pc_evaluation/practice_sheet/fixture');dispatchEvent(new PopStateEvent('popstate'));});
    await check(original);
    await toggle(true);
    await fixture.waitForFunction(()=>!document.documentElement.hasAttribute('data-xet-question-typography'));
    if(JSON.stringify(await read())!==JSON.stringify(original))throw new Error('Site disable did not restore original fonts');
    await toggle(false);
    await fixture.waitForFunction(()=>document.documentElement.hasAttribute('data-xet-question-typography'));
    await check(original);
    if(errors.length)throw new Error(errors.join('\n'));
    return {passed:true,originalFont:original.imported.family,normalizedFont:normalized.imported.family,
      routes,verified:['inline and legacy font faces','shorthand fonts','original HTML unchanged','preserves emphasis and sizing',
        'formula/control exclusions','dynamic content','unrelated pages unchanged','site-disable restoration','restart'],errors};
  } finally {await toggle(false);await fixture.close();}
}
