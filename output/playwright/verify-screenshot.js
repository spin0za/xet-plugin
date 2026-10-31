async (page) => {
  const worker=page.context().serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Load the real MV3 extension in a fresh isolated profile');
  const origin='https://merchant.pc.xiaoe-tech.com', embed='https://iframe.xiaoeknow.com', cdn='https://capture-cdn.test';
  const fixture=await page.context().newPage(), errors=[];
  fixture.setDefaultTimeout(8000);fixture.on('pageerror',e=>errors.push(e.message));
  const assert=(v,m)=>{if(!v)throw Error(m)};
  let stage='setup';
  const files={};
  for(const name of ['frame','portrait'])files[name]=await (await page.context().request.get(`http://127.0.0.1:4181/${name}.mp4`)).body();
  function html(mode) {
    const live=mode.startsWith('live'), native=mode==='native';
    const video=`<video muted preload=auto ${mode==='taint'?'':'crossorigin=anonymous'} src="${cdn}/${mode==='portrait'?'portrait':'frame'}.mp4"></video>`;
    const toolbar=live?`<div class=myControls><div class=button-area-wrapper><div class=left-area></div><div class=right-area>
      <span class=speed-btn>1.0X</span><div class="fullscreen-btn controlsBtn"><button class=fullBtn>全屏</button></div></div></div></div>`:
      `<div class=xgplayer-controls><div class=xg-right-grid><button class=xgplayer-fullscreen>全屏</button><button class=xgplayer-volume>音量</button></div></div>`;
    return `<!doctype html><meta charset=utf-8><style>
      body{margin:0;padding:20px;background:#ddd;font:14px sans-serif}
      .xgplayer,.pc-live-player{position:relative;width:420px;height:236px;background:black}
      video{display:block;width:100%;height:100%;object-fit:contain} video:only-child{width:420px;height:236px}
      .xgplayer-controls,.myControls{position:absolute;bottom:0;left:0;right:0;height:40px;background:#e60088;color:white;z-index:4}
      .xg-right-grid{display:flex;flex-direction:row-reverse;height:40px}
      .xgplayer-fullscreen,.xgplayer-volume{width:28px;height:28px;margin:6px 8px;color:white}
      .button-area-wrapper{display:flex;justify-content:space-between}.right-area{display:flex;align-items:center;gap:0}
      .fullscreen-btn{width:24px;height:24px;margin:8px 0 8px 24px}.fullBtn{width:24px;height:24px;font-size:0}
      .pc-live-player .right-area>.xet-download-live{margin-left:24px}
      .xet-download-control{font-family:Arial,sans-serif}
      iframe{display:block;width:700px;height:450px;border:0}
    </style><input id=notes aria-label=笔记>
    ${mode==='embed'?`<iframe src="${embed}/fixture?mode=xg" allowfullscreen></iframe>`:mode==='audio'?'<audio controls></audio>':native?video:
      `<div class="${live?'pc-live-player':'xgplayer'}"><div class="${live?'normal_video_wrap_1001':'xgplayer-video-wrap'}">${video}</div>${mode==='live-late'?'':toolbar}</div>`}
    <script>window.pictureClicks=0;document.querySelector('.xgplayer,.pc-live-player')?.addEventListener('click',e=>{if(e.target.tagName==='VIDEO')pictureClicks++});
    window.mountToolbar=()=>document.querySelector('.pc-live-player').insertAdjacentHTML('beforeend',${JSON.stringify(toolbar)});
    document.querySelector('.fullBtn')?.addEventListener('click',e=>{e.stopPropagation();document.querySelector('.pc-live-player').requestFullscreen()});</script>`;
  }
  await worker.evaluate(()=>chrome.storage.local.set({enabled:true,disabledSites:[],keepAliveEnabled:false}));
  await page.context().grantPermissions(['clipboard-read'],{origin});
  await page.context().route(`${cdn}/**`,async route=>route.fulfill({body:files[new URL(route.request().url()).pathname.includes('portrait')?'portrait':'frame'],contentType:'video/mp4',headers:{'Access-Control-Allow-Origin':'*'}}));
  for(const host of [origin,embed])await page.context().route(`${host}/**`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html(new URL(route.request().url()).searchParams.get('mode')||'xg')}));
  async function readPng() {
    return fixture.evaluate(async()=>{
      const items=await navigator.clipboard.read(), blob=await items[0].getType('image/png');
      const image=await createImageBitmap(blob), canvas=document.createElement('canvas');
      canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const left=[...ctx.getImageData(20,20,1,1).data],right=[...ctx.getImageData(image.width-20,20,1,1).data];
      return {width:image.width,height:image.height,left,right};
    });
  }
  async function setClipboard(text) {
    // Only the owned test browser. Keep page clipboard-write denied so the
    // actual extension permission (not a test-page grant) authorizes copies.
    await worker.evaluate(async({url,text})=>{
      const [tab]=await chrome.tabs.query({url});
      await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
        func:async value=>navigator.clipboard.writeText(value),args:[text]});
    },{url:fixture.url(),text});
  }
  async function ready(target=fixture) {
    await target.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    await target.locator('.xet-screenshot-button').waitFor();
  }
  async function capture(target=fixture,keyboard=false,width=1280,height=720) {
    await target.evaluate(()=>{const s=document.querySelector('.xet-screenshot-status');s.hidden=true;s.textContent='';});
    const before=await target.locator('video').evaluate(v=>({paused:v.paused,time:v.currentTime}));
    if(keyboard){await target.locator('.xet-screenshot-button').focus();await fixture.keyboard.press('Alt+a');}
    else await target.locator('.xet-screenshot-button').click();
    await target.waitForFunction(()=>document.querySelector('.xet-screenshot-status')?.textContent.includes('已复制视频帧'));
    const png=await readPng();assert(png.width===width&&png.height===height,`Not intrinsic resolution: ${JSON.stringify(png)}`);
    if(keyboard)assert(await target.evaluate(()=>document.activeElement?.classList.contains('xet-screenshot-button')),'Capture blurred keyboard focus');
    assert(png.left[0]>240&&png.left[1]<40&&png.left[2]<20,`Wrong frame pixels / captured UI instead of video: ${JSON.stringify(png)}`);
    if(width>height)assert(png.right[2]>240&&png.right[0]<10,'Right edge of original frame missing');
    const after=await target.locator('video').evaluate(v=>({paused:v.paused,time:v.currentTime}));
    assert(JSON.stringify(before)===JSON.stringify(after),'Capture altered playback or seek');
    assert(await target.evaluate(()=>pictureClicks)===0,'Screenshot click reached player picture handler');
    return png;
  }
  try {
    stage='normal, native and web fullscreen';
    await fixture.goto(origin+'/fixture?mode=xg');await fixture.bringToFront();await ready();
    const layout=await fixture.evaluate(()=>{
      const d=document.querySelector('.xet-download-button').getBoundingClientRect(),s=document.querySelector('.xet-screenshot-button').getBoundingClientRect();
      return {download:{x:d.x,y:d.y,w:d.width,h:d.height},shot:{x:s.x,y:s.y,w:s.width,h:s.height}};
    });
    assert(layout.shot.x>layout.download.x&&layout.shot.y===layout.download.y&&layout.shot.w===layout.download.w,'Screenshot not aligned on right of download');
    await capture();await capture(fixture,true);
    await fixture.keyboard.press('t');await fixture.waitForFunction(()=>document.querySelector('[data-xet-web-fullscreen=true]'));
    await capture(fixture,true);
    await fixture.keyboard.press('f');await fixture.waitForFunction(()=>!!document.fullscreenElement);await capture();
    await fixture.keyboard.press('f');await fixture.waitForFunction(()=>!document.fullscreenElement);
    await fixture.locator('.xet-screenshot-button').hover();await fixture.screenshot({path:'output/playwright/screenshot-controls.png'});
    stage='editing and untrusted events';
    await setClipboard('fixture: keep clipboard');
    await fixture.locator('#notes').focus();await fixture.keyboard.press('Alt+a');
    assert(await fixture.evaluate(()=>navigator.clipboard.readText())==='fixture: keep clipboard','Editing shortcut overwrote the clipboard');
    await fixture.evaluate(()=>{
      document.querySelector('.xet-screenshot-button').click();
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',altKey:true}));
    });
    assert(await fixture.evaluate(()=>navigator.clipboard.readText())==='fixture: keep clipboard','Untrusted page events copied a frame');
    await fixture.evaluate(()=>{document.querySelector('.xet-screenshot-status').textContent='';});
    await fixture.locator('.xet-screenshot-button').focus();await fixture.keyboard.press('Space');
    await fixture.waitForFunction(()=>document.querySelector('.xet-screenshot-status')?.textContent.includes('已复制视频帧'));
    assert((await readPng()).width===1280,'Native keyboard button activation failed');
    const count=await fixture.locator('.xet-screenshot-button').count();assert(count===1,'Duplicate capture controls');
    stage='live original controls';
    await fixture.goto(origin+'/fixture?mode=live');await ready();await capture();await fixture.keyboard.press('t');await capture(fixture,true);await fixture.keyboard.press('Escape');
    stage='late toolbar and rebuild';
    await fixture.goto(origin+'/fixture?mode=live-late');await fixture.waitForFunction(()=>document.querySelector('video').readyState>=2);
    assert(await fixture.locator('.xet-screenshot-button').count()===0,'Capture button floated outside native toolbar');
    await fixture.evaluate(()=>mountToolbar());await ready();await capture();
    await fixture.evaluate(()=>{document.querySelector('.myControls').remove();mountToolbar();});await ready();
    assert(await fixture.locator('.xet-screenshot-button').count()===1,'Toolbar rebuild duplicated capture control');await capture();
    stage='audio has no frame controls';
    await fixture.goto(origin+'/fixture?mode=audio');await fixture.locator('.xet-download-button').waitFor();
    assert(await fixture.locator('.xet-screenshot-button').count()===0,'Audio received a video frame button');
    stage='portrait intrinsic resolution';
    await fixture.goto(origin+'/fixture?mode=portrait');await ready();await capture(fixture,false,720,1280);
    stage='native video';
    await fixture.goto(origin+'/fixture?mode=native');await ready();await capture();
    stage='no ready frame and CORS restrictions';
    await fixture.goto(origin+'/fixture?mode=taint');await ready();
    await setClipboard('fixture: protected sentinel');
    await fixture.locator('.xet-screenshot-button').click();
    await fixture.waitForFunction(()=>document.querySelector('.xet-screenshot-status')?.textContent.includes('跨域限制'));
    assert(await fixture.evaluate(()=>navigator.clipboard.readText())==='fixture: protected sentinel','CORS failure overwrote clipboard');
    await fixture.evaluate(()=>{const v=document.querySelector('video');v.removeAttribute('src');v.load();});
    await fixture.locator('.xet-screenshot-button').click();
    await fixture.waitForFunction(()=>document.querySelector('.xet-screenshot-status')?.textContent.includes('尚未加载'));
    assert(await fixture.evaluate(()=>navigator.clipboard.readText())==='fixture: protected sentinel','Empty frame overwrote clipboard');
    stage='cross-origin iframe without clipboard policy delegation';
    await fixture.goto(origin+'/fixture?mode=embed');const child=fixture.frame({url:/iframe\.xiaoeknow\.com/});await ready(child);await capture(child);await capture(child,true);
    stage='iframe web fullscreen';
    await fixture.keyboard.press('t');await fixture.waitForFunction(()=>document.querySelector('iframe[data-xet-web-fullscreen=true]'));
    await capture(child,true);
    // Test the two modes independently, after the parent has restored its
    // iframe/popover; do not race native fullscreen against the web-mode relay.
    await fixture.keyboard.press('Escape');await fixture.waitForFunction(()=>!document.querySelector('iframe[data-xet-web-fullscreen=true]'));
    stage='iframe native fullscreen';
    await fixture.keyboard.press('f');await child.waitForFunction(()=>!!document.fullscreenElement);await capture(child,true);
    stage='iframe native exit';
    await fixture.keyboard.press('f');await child.waitForFunction(()=>!document.fullscreenElement);
    stage='disable cleanup';
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await child.waitForFunction(()=>!document.querySelector('.xet-screenshot-button'));
    assert(errors.length===0,errors.join('\n'));
    return {ok:true,layout,checked:['real clipboard PNG pixels','1280x720 and portrait 720x1280','button and Alt+A','normal/web/native fullscreen','live/native/iframe players','original controls retained','late toolbar/rebuild and audio exclusion','no seek/pause changes','editing and untrusted-event guards','Space activates button without toggling video','CORS/not-ready errors keep clipboard unchanged','disable cleanup']};
  } catch(e){
    const status=[];for(const f of fixture.frames())status.push({url:f.url(),messages:await f.locator('.xet-screenshot-status').allTextContents(),video:await f.locator('video').count(),buttons:await f.locator('.xet-screenshot-button').count(),state:await f.evaluate(()=>({focus:document.hasFocus(),active:document.activeElement?.tagName,web:document.querySelector('[data-xet-web-fullscreen]')?.tagName,fullscreen:document.fullscreenElement?.tagName}))});
    throw Error(`${stage}: ${e.message}; statuses=${JSON.stringify(status)}`);
  } finally {await fixture.close();}
}
