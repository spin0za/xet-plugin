async(page)=>{
 // For the missing-CSS regression, use an otherwise identical fresh MV3
 // fixture package that omits download.css only from manifest.content_scripts;
 // keep the file packaged so the real background can restore it. Do not inject
 // duplicate content scripts into an already-loaded extension profile.
 const context=page.context(),worker=context.serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
 if(!worker)throw Error('Real MV3 extension required');
 const fixture=await context.newPage(),origin='https://audio-download.pc.xiaoe-tech.com',checks=[],errors=[];
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const faultProfile=await worker.evaluate(()=>!chrome.runtime.getManifest().content_scripts[0].css.includes('src/content/download.css'));
 let slow=false,stage='setup';const releases=[];
 fixture.on('pageerror',e=>errors.push(e.message));fixture.setDefaultTimeout(10000);
 try{
  const styles=await(await page.request.get('https://assets.cdn.xiaoeknow.com/course/pc_course_fe/1.26.133/course_pc_detail/css/CourseAudio.css')).text();
  const files={};for(const ext of ['mp3','m4a'])files[ext]=await(await page.request.get('http://127.0.0.1:4181/sound.'+ext)).body();
  await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
  await fixture.route(origin+'/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/sound.')){
    if(slow)await new Promise(r=>releases.push(r));
    const ext=path.split('.').at(-1);await route.fulfill({contentType:ext==='mp3'?'audio/mpeg':'audio/mp4',body:files[ext]});return;
   }
   if(path==='/bad.mp3'){await route.fulfill({contentType:'application/octet-stream',body:'<html>Expired audio link</html>'});return;}
   const html=`<div class="audio-content-header"><main class="audio-left"><div class="audio-left-main"><div class="audio-left-main__title">音频下载测试课程</div></div>
    <div class="audio-left-player"><div class="study-header-control">
    <button class="iconfont icon-icon_play">▶</button><span class="prev">00:00:00</span><p class="progress"><span></span><i></i></p><span>00:00:01</span>
    <div class="playbackRate"><span class="rate">X 1</span></div><div class="audioPlaySetting"><span class="mode">单曲播放</span></div>
    <div class="volume"><span class="iconfont icon-icon_voice" style="display:inline-block;width:20px">♫</span><div></div></div>
    <audio controls preload="none" src="/sound.mp3"></audio></div></div></main><div class="audio-right"></div></div>`;
   await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>音频下载测试课程</title><style>'+styles+' body{margin:30px;background:#eee}.audio-content-header{background:#343d46}.iconfont{font-family:sans-serif}</style>'+html.replace(/<(div|main|h1|button|span|p|i|audio)(?=[\s>])/g,'<$1 data-v-4cc944c1')+`<script>
    window.playCalls=0;document.addEventListener('play',()=>playCalls++,true);
    document.addEventListener('keyup',event=>{if(event.code==='Space')playCalls++});
   </script>`});
  });
  await fixture.goto(origin+'/p/t_pc/course_pc_detail/audio/a_fixture?product_id=course_fixture');await fixture.bringToFront();
  const button=fixture.locator('.xet-download-button');await button.waitFor();stage='layout';
  const geometry=await fixture.evaluate(()=>{
   const b=document.querySelector('.xet-download-button'),c=b.parentElement,v=c.previousElementSibling,icon=v.querySelector('.iconfont');
   return {inToolbar:c.parentElement.classList.contains('study-header-control'),nextToVolume:v.classList.contains('volume'),width:b.getBoundingClientRect().width,
    height:b.getBoundingClientRect().height,font:parseFloat(getComputedStyle(icon).fontSize),gap:c.getBoundingClientRect().left-v.getBoundingClientRect().right,
    centerOffset:b.getBoundingClientRect().y+b.getBoundingClientRect().height/2-icon.getBoundingClientRect().y-icon.getBoundingClientRect().height/2,
    expectedGap:icon.getBoundingClientRect().left-document.querySelector('.audioPlaySetting .mode').getBoundingClientRect().right,
    wrapperMargin:parseFloat(getComputedStyle(v).marginLeft),buttonCount:document.querySelectorAll('.xet-download-button').length};
  });
  assert(geometry.inToolbar&&geometry.nextToVolume&&geometry.width===geometry.font&&geometry.height===geometry.font&&geometry.gap===geometry.expectedGap&&Math.abs(geometry.centerOffset)<1&&geometry.buttonCount===1,JSON.stringify(geometry));
  await button.hover();assert(await button.evaluate(b=>getComputedStyle(b).backgroundColor)==='rgba(0, 0, 0, 0)','Unwanted gray hover');
  assert(await fixture.locator('.xet-download-tooltip').evaluate(t=>getComputedStyle(t).position)==='absolute','Tooltip leaked into the native toolbar layout');
  checks.push('native audio toolbar: volume-matched icon dimensions, vertical center and spacing, positioned tooltip, transparent hover');
  assert(geometry.expectedGap<geometry.wrapperMargin,'Fixture must reproduce the overflowing native mode label');
  for(const shape of [{width:60,sizing:'content-box'},{width:76,sizing:'content-box'},{width:70,sizing:'border-box'}]){
   await fixture.evaluate(({width,sizing})=>{const bar=document.querySelector('.study-header-control'),copy=bar.cloneNode(true);
    copy.querySelector('.mode').style.width=width+'px';copy.querySelector('.mode').style.boxSizing=sizing;
    copy.querySelector('.xet-download-control').remove();bar.replaceWith(copy)},shape);
   await fixture.waitForFunction(()=>{const b=document.querySelector('.xet-download-button'),v=document.querySelector('.volume .iconfont'),m=document.querySelector('.audioPlaySetting .mode');
    return b&&Math.abs((b.getBoundingClientRect().left-v.getBoundingClientRect().right)-(v.getBoundingClientRect().left-m.getBoundingClientRect().right))<1});
  }
  checks.push('download-to-volume gap matches the visible mode-to-volume gap, including different native mode label widths');
  const [tabId]=await worker.evaluate(async origin=>(await chrome.tabs.query({})).filter(t=>t.url?.startsWith(origin)).map(t=>t.id),origin);
  const sink=async cancel=>worker.evaluate(async({tabId,cancel})=>{await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:cancel=>{
   window.__audioSink={chunks:[],closed:false,aborted:false};window.showSaveFilePicker=async options=>{
    __audioSink.filename=options.suggestedName;__audioSink.types=options.types;__audioSink.activated=navigator.userActivation.isActive;
    if(cancel)throw new DOMException('Cancel','AbortError');return {createWritable:async()=>({write:async b=>__audioSink.chunks.push([...b]),close:async()=>{__audioSink.closed=true},abort:async()=>{__audioSink.aborted=true}})};
   };
  },args:[cancel]})},{tabId,cancel});
  const inspect=async()=>worker.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:()=>window.__audioSink}))[0].result,tabId);
  for(const ext of ['mp3','m4a']){
   stage='save '+ext;await fixture.evaluate(ext=>{document.querySelector('audio').src='/sound.'+ext},ext);await sink(false);await button.click();
   await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent.startsWith('音频已保存'));
   const saved=await inspect();assert(saved.closed&&!saved.aborted&&saved.activated&&saved.filename.endsWith('.'+ext),'Incorrect file type/gesture');
   assert(Buffer.from(saved.chunks.flat()).equals(files[ext]),'Audio bytes changed');
  }
  assert(await fixture.evaluate(()=>playCalls===0&&document.querySelector('audio').paused),'Download unexpectedly played audio');
  checks.push('MP3/M4A original bytes, correct extensions/MIME and trusted picker gesture; no autoplay');
  stage='keyboard/picker cancel';await sink(true);await button.focus();await button.press('Space');
  await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent==='已取消下载');
  assert(await fixture.evaluate(()=>playCalls===0),'Space leaked to native playback handler');
  stage='in-flight cancellation';slow=true;await sink(false);await button.click();
  await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent.startsWith('开始下载'));await button.click();
  await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent==='已取消下载');
  assert((await inspect()).aborted&&!(await inspect()).closed,'Canceled audio committed a partial file');
  slow=false;releases.splice(0).forEach(r=>r());
  stage='source switch cancellation';slow=true;await sink(false);await button.click();
  await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent.startsWith('开始下载'));
  await fixture.evaluate(()=>{document.querySelector('audio').src='/sound.mp3'});
  await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent==='已取消下载');
  slow=false;releases.splice(0).forEach(r=>r());checks.push('keyboard and picker cancellation, download abort, source changes never commit a wrong/partial file');
  stage='invalid content';await fixture.evaluate(()=>{document.querySelector('audio').src='/bad.mp3'});await sink(false);await button.click();
  await fixture.waitForFunction(()=>document.querySelector('.xet-download-status').textContent.includes('格式不符'));
  assert((await inspect()).aborted&&!(await inspect()).closed,'Invalid audio saved');
  stage='fallback';await fixture.evaluate(()=>{document.querySelector('audio').src='/sound.mp3'});
  await worker.evaluate(async tabId=>{await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:()=>{window.showSaveFilePicker=undefined}})},tabId);
  const event=fixture.waitForEvent('download');await button.click();const download=await event;
  assert(download.suggestedFilename().endsWith('.mp3')&&!(await download.failure()),'Fallback did not save MP3');
  checks.push('invalid content rejected; native browser small-file fallback keeps MP3 extension');
  if(faultProfile){stage='missing injected CSS';
  await worker.evaluate(async tabId=>chrome.scripting.removeCSS({target:{tabId},files:['src/content/download.css']}),tabId);
  assert(await button.evaluate(b=>getComputedStyle(b).backgroundColor)!=='rgba(0, 0, 0, 0)','Fixture did not reproduce the unstyled browser button');
  stage='toolbar replacement';await fixture.evaluate(()=>{const bar=document.querySelector('.study-header-control');bar.replaceWith(bar.cloneNode(true));document.querySelector('.xet-download-control').remove()});
  await button.waitFor();assert(await button.count()===1,'Toolbar rebuild duplicated/lost button');
  await fixture.waitForFunction(()=>getComputedStyle(document.querySelector('.xet-download-control')).getPropertyValue('--xet-download-style-ready').trim()==='1');
  assert(await button.evaluate(b=>getComputedStyle(b).backgroundColor)==='rgba(0, 0, 0, 0)','Missing CSS was not automatically restored');
  checks.push('lost injected CSS is restored without a page refresh, duplicate content scripts or default-button/inline-tooltip fallback');
  }else{
   stage='toolbar replacement';await fixture.evaluate(()=>{const bar=document.querySelector('.study-header-control');bar.replaceWith(bar.cloneNode(true));document.querySelector('.xet-download-control').remove()});await button.waitFor();
  }
  await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);await button.waitFor({state:'detached'});
  await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await button.waitFor();
  assert(!errors.length,errors.join('; '));checks.push('native toolbar rebuild and site disable/re-enable');
  await button.blur();await fixture.mouse.move(0,0);await fixture.screenshot({path:'output/playwright/audio-download-controls.png'});
  return {checks,geometry,faultProfile,errors};
 }catch(e){const debug=await fixture.evaluate(()=>{const c=document.querySelector('.xet-download-control');return {control:!!c,inline:c?.getAttribute('style'),marker:c&&getComputedStyle(c).getPropertyValue('--xet-download-style-ready'),visibility:c&&getComputedStyle(c).visibility}});throw Error(stage+': '+e.message+' '+JSON.stringify(debug))}finally{slow=false;releases.splice(0).forEach(r=>r());await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close();}
}
