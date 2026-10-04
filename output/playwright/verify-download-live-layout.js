async (page) => {
  const fixture = await page.context().newPage();
  fixture.setDefaultTimeout(5_000);
  let stage='late toolbar';
  try {
    await fixture.route('https://download-live-layout.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));
    await fixture.goto('https://download-live-layout.test/fixture');
    await fixture.setViewportSize({ width:1280, height:720 });
    // Reproduce the public live SDK: 20px icons, 32px leading margins,
    // white flex strip, and its own show/hide state. No private media is used.
    await fixture.setContent(`<!doctype html><style>
      body {margin:0;background:#15181e;font:14px sans-serif}
      header {height:50px;color:white} #mount {width:960px;height:540px}
      #mount:fullscreen {width:100vw;height:100dvh}
      .pc-live-player {width:100%;height:100%;position:relative;background:#222}
      .normal_video_wrap_1001 {position:relative;width:100%;height:100%}
      video {position:absolute;width:100%;height:100%}
      .myControls {position:absolute;bottom:0;width:100%;padding:8px 0;color:white;z-index:2}
      .button-area-wrapper {display:flex;align-items:center;justify-content:space-between;margin:5px 16px 0}
      .flex_center {display:flex;align-items:center}
      .controlsBtn {position:relative;width:20px;height:20px;cursor:pointer}
      .pc-live-player .control-right-btn[data-v-fixture] {margin-left:32px!important;margin-right:0!important}
      .pc-live-player .right-area > div[data-v-fixture]:first-child {margin-left:0!important}
      .fullscreen-btn[data-v-button] {margin-left:0!important}
      .fullBtn {width:100%;height:100%}
      .controler-container.hide .myControls {visibility:hidden;opacity:0;pointer-events:none}
      .left-area {gap:32px}.speed-btn {width:34px}
    </style><header>直播播放器测试（本地夹具）</header><div id=mount>
      <div class="pc-live-player custom_video_player_10001" id=liveRoot>
        <div class=normal_video_wrap_1001><div class=caption_size_1><video id=live></video></div></div>
      </div></div>`);
    await fixture.evaluate(() => {
      const icon = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M7 2H2v5m11-5h5v5M2 13v5h5m11-5v5h-5" stroke="white" stroke-width="2" fill="none"/></svg>`);
      window.toolbarHTML = `<div class="controler-container show"><div class=myControls>
        <div style="height:3px;background:#1472ff;margin:0 16px 8px"></div><div class=button-area-wrapper>
          <div class="flex_center left-area"><span>▶</span><div class="mute-btn controlsBtn">◖))</div><span>00:30 / 02:00</span></div>
          <div class="flex_center right-area"><div class="control-right-btn" data-v-fixture>线路</div>
            <div class="speed-btn control-right-btn" data-v-fixture>1.0X</div>
            <div class="fullscreen-btn controlsBtn control-right-btn" data-v-fixture data-v-button>
              <img class=fullBtn data-exit style="display:none" src="${icon}">
              <img class=fullBtn data-enter src="${icon}">
            </div></div></div></div></div>`;
      window.sdkFull=false; window.pictureClicks=0; window.sourceRequests=0;
      const update=()=>{
        document.querySelector('[data-enter]').style.display=sdkFull?'none':'block';
        document.querySelector('[data-exit]').style.display=sdkFull?'block':'none';
      };
      window.mountToolbar=()=>{
        document.querySelector('.normal_video_wrap_1001').insertAdjacentHTML('beforeend',toolbarHTML);
        document.querySelector('[data-enter]').addEventListener('click',()=>{mount.requestFullscreen();sdkFull=true;update();});
        document.querySelector('[data-exit]').addEventListener('click',()=>{document.exitFullscreen();sdkFull=false;update();});
      };
      document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.querySelector('[data-enter]')){sdkFull=false;update();}});
      document.querySelector('.normal_video_wrap_1001').addEventListener('click',event=>{if(event.target===event.currentTarget)pictureClicks++;});
      window.chrome={runtime:{sendMessage:async()=>{sourceRequests++;return {ok:false,error:'测试仅验证按钮响应，不下载媒体'};}}};
      window.showSaveFilePicker=undefined;
    });
    for(const path of ["fullscreen.css","download.css"]) await fixture.addStyleTag({path:`src/content/${path}`});
    for(const path of ["player-dom","download-stream","download","player-interactions","fullscreen","media-shortcuts"])
      await fixture.addScriptTag({path:`src/content/${path}.js`});
    await fixture.evaluate(()=>{
      const m=__xetPlayerHelperModules;
      window.download=m.download.createDownloadController({playerDom:m.playerDom});download.start();
      window.fullscreen=m.fullscreen.createFullscreenController({playerDom:m.playerDom});fullscreen.start();
      window.shortcuts=m.mediaShortcuts.createShortcutController({playerDom:m.playerDom,fullscreen});shortcuts.start();
    });
    if(await fixture.locator('.xet-download-button').count()) throw new Error('Live button floated before toolbar mounted');
    await fixture.evaluate(()=>mountToolbar());
    const button=fixture.locator('.xet-download-button');
    await button.waitFor();
    await fixture.evaluate(()=>window.originalButton=document.querySelector('.xet-download-button'));
    const layouts=[];
    const measure=async(mode)=>{
      const geometry=await fixture.evaluate(()=>{
        const b=document.querySelector('.xet-download-button'), container=b.parentElement;
        const box=el=>{const {x,y,width,height,right,bottom}=el.getBoundingClientRect();return {x,y,width,height,right,bottom};};
        const speed=box(document.querySelector('.right-area .speed-btn, .right-area .mute-btn')), full=box(document.querySelector('.fullscreen-btn'));
        const d=box(b), root=box(liveRoot), style=getComputedStyle(b);
        return {button:d,root,icon:box(b.querySelector('svg')),full,leftGap:d.x-speed.right,rightGap:full.x-d.right,
          background:style.backgroundColor,shadow:style.boxShadow,color:style.color,
          parent:container.parentElement.className, native:container.classList.contains('xet-download-native'),
          duplicate:document.querySelectorAll('.xet-download-button').length,same:b===originalButton};
      });
      const {button:b,icon,full,root}=geometry;
      if(geometry.native||!geometry.parent.includes('right-area')||geometry.duplicate!==1||!geometry.same||
        geometry.leftGap!==32||geometry.rightGap!==32||b.width!==20||b.height!==20||icon.width!==20||
        icon.height!==20||b.y!==full.y||b.x<root.x||b.right>root.right||b.bottom>root.bottom||
        b.y<root.bottom-70||geometry.color!=='rgb(255, 255, 255)'||geometry.background!=='rgba(0, 0, 0, 0)'||geometry.shadow!=='none')
        throw new Error(`Live download ${mode}: ${JSON.stringify(geometry)}`);
      layouts.push({mode,leftGap:geometry.leftGap,rightGap:geometry.rightGap,iconSize:b.width});
    };
    for(const width of [960,540]) {
      await fixture.evaluate(width=>{mount.style.width=`${width}px`;mount.style.height=`${width*9/16}px`;},width);
      await button.hover(); await measure(`normal-${width}`);
    }
    stage='download action';
    await button.click();
    await fixture.waitForFunction(()=>sourceRequests===1&&document.querySelector('.xet-download-status').textContent.includes('测试仅'));
    if(await fixture.evaluate(()=>pictureClicks)) throw new Error('Download action toggled video playback');
    await fixture.evaluate(()=>{document.querySelector('.xet-download-status').hidden=true;document.activeElement.blur();});
    stage='native fullscreen';
    await fixture.keyboard.press('f');
    await fixture.waitForFunction(()=>document.fullscreenElement===mount&&sdkFull);
    await measure('native');
    stage='web fullscreen';
    await fixture.keyboard.press('t');
    await fixture.waitForFunction(()=>!document.fullscreenElement&&liveRoot.dataset.xetWebFullscreen==='true');
    for(const viewport of [{width:1280,height:720},{width:720,height:900}]) {
      await fixture.setViewportSize(viewport);await measure(`web-${viewport.width}`);
    }
    await fixture.evaluate(()=>document.querySelector('.controler-container').className='controler-container hide');
    if(await button.isVisible()) throw new Error('Download button did not hide with the SDK toolbar');
    await fixture.evaluate(()=>document.querySelector('.controler-container').className='controler-container show');
    await measure('shown-again');
    await fixture.keyboard.press('Escape'); await measure('restored');
    // Rebuild the whole toolbar, as Vue does on a player/line change. Keep
    // the original button and event handler, not a second progress indicator.
    stage='rebuilt toolbar';
    await fixture.evaluate(()=>{document.querySelector('.controler-container').remove();mountToolbar();});
    await fixture.waitForFunction(()=>document.querySelector('.right-area .xet-download-button')===originalButton);
    await measure('rebuilt');
    // A live (rather than replay) skin puts volume on the right, before fullscreen.
    await fixture.evaluate(()=>{
      const volume=document.querySelector('.speed-btn');
      volume.className='mute-btn controlsBtn control-right-btn';volume.textContent='◖))';
    });
    await measure('right-volume');
    await fixture.setViewportSize({width:1280,height:720});
    await fixture.evaluate(()=>{mount.style.width='960px';mount.style.height='540px';});
    await fixture.mouse.move(1100,650);
    await fixture.screenshot({path:'output/playwright/download-live-controls.png'});
    await button.hover();
    await fixture.screenshot({path:'output/playwright/download-live-hover.png'});
    await fixture.evaluate(()=>{download.stop();shortcuts.stop();fullscreen.stop();});
    if(await button.count()) throw new Error('Stop left live download UI behind');
    return {lateToolbar:true,layouts,transparentHover:true,stableButton:true,downloadAction:true,
      sdkHideShow:true,rebuiltToolbar:true,noDuplicate:true,stopped:true};
  } catch(error) {
    const state=await fixture.evaluate(()=>({sourceRequests:window.sourceRequests,sdkFull:window.sdkFull,
      fullscreen:document.fullscreenElement?.id,web:document.querySelector('#liveRoot')?.dataset.xetWebFullscreen,
      buttons:document.querySelectorAll('.xet-download-button').length,status:document.querySelector('.xet-download-status')?.textContent}));
    throw new Error(`${stage}: ${error.message}: ${JSON.stringify(state)}`);
  } finally {await fixture.close();}
}
