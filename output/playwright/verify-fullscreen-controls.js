async (page) => {
  const fixture = await page.context().newPage();
  fixture.setDefaultTimeout(5_000);
  try {
    await fixture.setViewportSize({ width: 1280, height: 720 });
    // Match the public live SDK structure: its mounting wrapper is the native
    // fullscreen target and two Vue-style images hold enter/exit state.
    await fixture.setContent(`<!doctype html><style>
      body {margin:0} header {height:60px} #mount {width:960px;height:540px}
      #mount:fullscreen {width:100vw;height:100dvh;background:black}
      .pc-live-player {position:relative;width:100%;height:100%;background:black}
      .normal_video_wrap_1001 {position:relative;width:960px;height:540px}
      #mount:fullscreen .normal_video_wrap_1001 {width:100%;height:100%}
      video {position:absolute;width:100%;height:100%}
      .myControls {position:absolute;bottom:0;width:100%;z-index:2;color:white}
      .controler-container.hide .myControls {visibility:hidden}
      .button-area-wrapper {display:flex;justify-content:space-between}
      .left-area,.right-area {display:flex;align-items:center;gap:20px}
      .fullBtn {width:24px;height:24px;cursor:pointer}
      #exit {display:none}.speed-control {display:none;position:absolute;bottom:30px}
      #native {display:none;width:640px;height:360px}
    </style><header id=nav>网站导航</header><div id=mount>
      <div class="pc-live-player custom_video_player_10001" id=liveRoot><div class=normal_video_wrap_1001>
        <div class=caption_size_1 style="width:100%;height:100%"><video id=live></video></div>
        <div class="controler-container show"><div class=myControls>
          <input class=slider-wrapper type=range min=0 max=120 value=30>
          <div class=button-area-wrapper><div class=left-area><button id=play>播放</button>
            <button id=replay>重播</button><div class=mute-btn><input type=range value=100></div><span>00:30 / 02:00</span>
          </div><div class=right-area><button id=line>线路</button><div class=speed-btn>
            <button id=speedLabel>1X</button><div class=speed-control>
              ${[2,1.5,1.25,1,0.75].map(rate => `<div class=selector_item data-rate=${rate}>${rate}X</div>`).join("")}
            </div></div><div class="fullscreen-btn controlsBtn">
              <img id=exit class=fullBtn alt=退出全屏 src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
              <img id=enter class=fullBtn alt=全屏 src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
          </div></div></div>
        </div></div>
      </div></div></div><video id=native controls></video>`);
    await fixture.evaluate(() => {
      let paused = true;
      Object.defineProperties(live, { paused: {get:()=>paused}, ended: {get:()=>false} });
      live.play = () => { paused=false; live.dispatchEvent(new Event("play")); return Promise.resolve(); };
      live.pause = () => { paused=true; live.dispatchEvent(new Event("pause")); };
      window.sdkFullscreenClicks = 0;
      window.originalToolbar = document.querySelector(".myControls");
      window.originalControls = [...originalToolbar.querySelectorAll("button,input,img")];
      window.sdkFull = false;
      const update = () => { enter.style.display=sdkFull?"none":"block"; exit.style.display=sdkFull?"block":"none"; };
      enter.addEventListener("click", () => {
        sdkFullscreenClicks++;
        mount.requestFullscreen(); sdkFull=true; update();
      });
      exit.addEventListener("click", () => {
        sdkFullscreenClicks++;
        document.exitFullscreen(); sdkFull=false; update();
      });
      document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) {sdkFull=false;update();} });
      let idle;
      live.addEventListener("pause",()=>{
        clearTimeout(idle); document.querySelector(".controler-container").className="controler-container show";
      });
      liveRoot.addEventListener("mousemove", () => {
        const controls = document.querySelector(".controler-container");
        controls.className="controler-container show"; clearTimeout(idle);
        if(!paused) idle=setTimeout(()=>controls.className="controler-container hide",350);
      });
      play.addEventListener("click", () => paused?live.play():live.pause());
      speedLabel.addEventListener("click",()=>document.querySelector(".speed-control").style.display="block");
      for(const item of document.querySelectorAll(".selector_item")) item.addEventListener("click",()=>{
        live.playbackRate=Number(item.dataset.rate); speedLabel.textContent=item.textContent;
        document.querySelector(".speed-control").style.display="none";
      });
    });
    await fixture.addStyleTag({ path: "src/content/fullscreen.css" });
    for(const path of ["player-dom", "player-interactions", "fullscreen", "media-shortcuts"])
      await fixture.addScriptTag({ path: `src/content/${path}.js` });
    await fixture.evaluate(() => {
      const modules=__xetPlayerHelperModules;
      window.fullscreen=modules.fullscreen.createFullscreenController({playerDom:modules.playerDom});
      window.shortcuts=modules.mediaShortcuts.createShortcutController({playerDom:modules.playerDom,fullscreen});
      fullscreen.start();shortcuts.start();
    });
    const assertOriginal = async () => {
      const result=await fixture.evaluate(()=>({
        root:__xetPlayerHelperModules.playerDom.findActivePlayer()===liveRoot,
        toolbar:document.querySelector(".myControls")===originalToolbar,
        controls:originalControls.every(node=>node.isConnected&&originalToolbar.contains(node)),
        native:live.controls, interactions:liveRoot.hasAttribute("data-xet-interactions"),
      }));
      if(!result.root||!result.toolbar||!result.controls||result.native||result.interactions)
        throw new Error(`Original live controls were replaced: ${JSON.stringify(result)}`);
    };
    const nativeOn = () => fixture.waitForFunction(()=>document.fullscreenElement===mount&&sdkFull);
    const nativeOff = () => fixture.waitForFunction(()=>!document.fullscreenElement&&!sdkFull);
    await fixture.keyboard.press("f"); await nativeOn(); await assertOriginal();
    await fixture.keyboard.press("f"); await nativeOff();
    await fixture.locator("#enter").click(); await nativeOn(); await assertOriginal();
    await fixture.locator("#exit").click(); await nativeOff();
    if(await fixture.evaluate(()=>sdkFullscreenClicks)!==4) throw new Error("F/button paths did not use exactly one SDK action each");
    // SDK mounting wrapper is an ancestor, not the root. T must exit it.
    await fixture.keyboard.press("f"); await nativeOn();
    await fixture.keyboard.press("t");
    await fixture.waitForFunction(()=>!document.fullscreenElement&&liveRoot.dataset.xetWebFullscreen==="true");
    await assertOriginal();
    for(const size of [{width:1280,height:720},{width:720,height:900},{width:1100,height:500}]) {
      await fixture.setViewportSize(size);
      const layout=await fixture.evaluate(()=>{
        const root=liveRoot.getBoundingClientRect(), media=document.querySelector(".normal_video_wrap_1001").getBoundingClientRect();
        const controls=originalToolbar.getBoundingClientRect();
        return {fits:root.width===innerWidth&&root.height===innerHeight&&media.width===innerWidth&&media.height===innerHeight,
          bottom:controls.bottom===innerHeight,nav:getComputedStyle(nav).visibility};
      });
      if(!layout.fits||!layout.bottom||layout.nav!=="hidden") throw new Error(`Live page fullscreen layout: ${JSON.stringify(layout)}`);
    }
    await fixture.locator("#play").click();
    if(await fixture.evaluate(()=>live.paused)) throw new Error("Original play button was intercepted");
    await fixture.locator("#speedLabel").click();
    await fixture.locator('.selector_item[data-rate="1.5"]').click();
    if(await fixture.evaluate(()=>live.playbackRate)!==1.5) throw new Error("Original speed menu was intercepted");
    // The SDK remains the sole owner of control auto-hide.
    await fixture.mouse.move(300,200);
    await fixture.waitForFunction(()=>getComputedStyle(originalToolbar).visibility==="hidden");
    const beforeIdleF=await fixture.evaluate(()=>sdkFullscreenClicks);
    await fixture.keyboard.press("f"); await nativeOn(); await assertOriginal();
    await fixture.keyboard.press("f"); await nativeOff();
    if(await fixture.evaluate(()=>sdkFullscreenClicks)!==beforeIdleF+2) throw new Error("Idle-hidden toolbar bypassed SDK fullscreen");
    await fixture.keyboard.press("t");
    await fixture.mouse.move(320,200);
    await fixture.waitForFunction(()=>getComputedStyle(originalToolbar).visibility==="visible");
    await fixture.evaluate(()=>live.pause());
    await fixture.locator("#enter").click(); await nativeOn(); await assertOriginal();
    if(await fixture.evaluate(()=>liveRoot.dataset.xetWebFullscreen)==="true") throw new Error("Button failed to switch web to native fullscreen");
    await fixture.keyboard.press("t");
    await fixture.waitForFunction(()=>liveRoot.dataset.xetWebFullscreen==="true");
    await fixture.keyboard.press("f"); await nativeOn(); await assertOriginal();
    await fixture.keyboard.press("f"); await nativeOff();
    await fixture.keyboard.press("t"); await fixture.keyboard.press("Escape");
    await fixture.waitForFunction(()=>!liveRoot.dataset.xetWebFullscreen);
    await assertOriginal();
    await fixture.evaluate(()=>{mount.style.display="none";native.style.display="block";});
    // Native players retain their existing UI setting, including no-controls.
    for(const controls of [true,false]) {
      await fixture.evaluate(value=>native.controls=value,controls);
      await fixture.keyboard.press("t");
      if(await fixture.evaluate(()=>native.controls)!==controls) throw new Error("Web fullscreen invented native controls");
      await fixture.keyboard.press("Escape");
      if(await fixture.evaluate(()=>native.controls)!==controls) throw new Error("Native control setting changed on exit");
    }
    await fixture.evaluate(()=>{shortcuts.stop();fullscreen.stop();mount.style.display="";native.style.display="none";});
    await fixture.keyboard.press("f");
    if(await fixture.evaluate(()=>!!document.fullscreenElement)) throw new Error("Disabled fullscreen shortcut still ran");
    await fixture.locator("#enter").click(); await nativeOn();
    await fixture.locator("#exit").click(); await nativeOff();
    return { originalControls:true, sdkFullscreenState:true, sameButtonAndKeyboardPath:true,
      nativeWebTransitions:true, responsive:true, sdkMenusAndAutoHide:true, nativeAttributePreserved:true, cleanup:true };
  } finally { await fixture.close(); }
}
