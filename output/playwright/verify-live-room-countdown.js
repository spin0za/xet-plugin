async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 required');
  const get = async url => { const res=await page.request.get(url); if(!res.ok())throw Error('Pinned fixture unavailable'); return res.text(); };
  const vue = await get('https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.min.js');
  const native = await get('https://assets.cdn.xiaoeknow.com/live/live_pc/1.83.171/live_pc/index.js');
  const extract = (name, tail) => { const start=native.indexOf('{name:"'+name+'",computed:');const end=native.indexOf(tail,start);
    if(start<0||end<start)throw Error('Pinned countdown signature changed');return native.slice(start,end); };
  const normal = extract('countDwon', ',zc=bc'), warm = extract('countDownForWarmUpVedio', ',zn=bn');
  const origin='https://merchant.pc.xiaoe-tech.com',path='/p/t_pc/live_pc/pc/l_room',fixture=await page.context().newPage();
  const calls=[],errors=[],checks=[];fixture.on('pageerror',e=>errors.push(e.message));fixture.setDefaultTimeout(10000);
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  try {
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin],keepAliveEnabled:false}),origin);
    await fixture.route(origin+'/**',async route=>{
      calls.push({method:route.request().method(),path:new URL(route.request().url()).pathname});
      if(route.request().url().includes('/_alive/api/alive/xe.alive.page.get/1.0.0')){
        const enter=Math.floor(Date.now()/1000),start=new Date((enter+120)*1000+8*3600000).toISOString().slice(0,19).replace('T',' ');
        await route.fulfill({json:{code:0,data:{alive_id:'l_room',alive_state:0,enter_time:enter,zb_start_at:enter+120,pushzb_start_at:start}}});return;
      }
      await route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset=utf-8><div id=app><normal-clock></normal-clock><warm-clock></warm-clock></div><script>${vue}</script><script>
      Vue.config.productionTip=false;const realNow=Date.now.bind(Date);window.offset=0;Date.now=()=>realNow()+offset;
      window.advance=ms=>offset+=ms;window.nativeDone=0;window.subscribeChecks=0;const mA={$emit(name){if(name==='countDownDone')nativeDone++}};
      const store=Vue.observable({state:{live:{roomInfo:{}},userInfo:{user_id:'fixture'}}});Vue.mixin({beforeCreate(){this.$store=store}});
      const normal=${normal},warm=${warm};normal.methods.checkAutosubscribe=()=>subscribeChecks++;
      normal.template='<div class=count-down v-show=show>{{time.days}}天{{time.hours}}时{{time.minutes}}分{{time.seconds}}秒</div>';
      warm.template='<div class=count-down-for-warm-up-vedio v-show=show>{{time.days}}天{{time.hours}}时{{time.minutes}}分{{time.seconds}}秒</div>';
      Vue.component('normal-clock',normal);Vue.component('warm-clock',warm);
      fetch('/_alive/api/alive/xe.alive.page.get/1.0.0').then(r=>r.json()).then(r=>{store.state.live.roomInfo=r.data;window.app=new Vue({el:'#app'});
        window.nativeNodes=[...document.querySelectorAll('.count-down,.count-down-for-warm-up-vedio')];
        window.originalFormats=nativeNodes.map(n=>n.__vue__.timeConvert);window.originalTimers=nativeNodes.map(n=>n.__vue__.timeItv)});
      </script>`});
    });
    await fixture.goto(origin+path);await fixture.bringToFront();
    await fixture.waitForFunction(()=>window.nativeNodes?.length===2);
    // Simulate sleep before the extension can attach: Date advances but the
    // browser's performance clock and native interval do not count that gap.
    await fixture.evaluate(()=>advance(45000));
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));
    await fixture.waitForFunction(()=>window.__xetLiveCountdown?.active&&__xetLiveCountdown.kind==='room');
    const snapshot=()=>fixture.evaluate(()=>nativeNodes.map(n=>({text:n.textContent,time:n.__vue__.time,remaining:Number(n.__vue__.time.minutes)*60+Number(n.__vue__.time.seconds),state:n.__vue__.roomInfo.alive_state})));
    const before=await snapshot();assert(before.every(r=>r.remaining>=72&&r.remaining<=75),'Late installation restarted stale entry-time duration: '+JSON.stringify(before));
    assert(await fixture.evaluate(()=>subscribeChecks===1&&nativeNodes.every((n,i)=>n.__vue__.timeItv===originalTimers[i])),'Native mount/subscription or interval was replaced');
    await fixture.evaluate(()=>{advance(30000);document.dispatchEvent(new Event('visibilitychange'))});
    const after=await snapshot();assert(after.every((r,i)=>before[i].remaining-r.remaining>=30&&before[i].remaining-r.remaining<=31),'Visible wake failed to count sleep');
    await fixture.evaluate(()=>nativeNodes.forEach(n=>n.__vue__.timeConvert(999)));
    assert((await snapshot()).every(r=>r.remaining<=45),'Native interval can overwrite correction');
    checks.push('Real MV3 + both pinned native countdown components: late install after sleep, fixed response anchor, immediate wake correction, native ticker cannot overwrite; no rerun of subscription/mount');
    await fixture.evaluate(()=>{advance(10000);window.dispatchEvent(new Event('focus'))});
    assert((await snapshot()).every(r=>r.remaining<=35),'Focus did not correct');
    await fixture.evaluate(()=>{advance(5000);document.dispatchEvent(new Event('resume'))});
    assert((await snapshot()).every(r=>r.remaining<=30),'Resume did not correct');
    await fixture.evaluate(()=>{advance(60000);window.dispatchEvent(new Event('pageshow'))});
    assert((await snapshot()).every(r=>r.remaining===0&&r.state===0),'Expiry became negative or faked live state');
    assert(await fixture.evaluate(()=>nativeDone===0),'Correction prematurely emitted original countDownDone');
    checks.push('Focus/pageshow/resume count wall-clock time, zero clamp without fake broadcast-start, native completion event, navigation or playback');
    await fixture.evaluate(async()=>{const room=nativeNodes[0].__vue__.roomInfo;room.enter_time=Math.floor(Date.now()/1000);
      room.pushzb_start_at=new Date((room.enter_time+180)*1000+8*3600000).toISOString().slice(0,19).replace('T',' ');await Vue.nextTick()});
    assert((await snapshot()).every(r=>r.remaining>=178&&r.remaining<=180),'Fresh server props after monotonic pause used stale response clock');
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!__xetLiveCountdown.active);
    assert(await fixture.evaluate(()=>nativeNodes.every((n,i)=>n.__vue__.timeConvert===originalFormats[i]&&n.__vue__.timeItv===originalTimers[i])),'Disable did not restore exact native formatter/ticker');
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.waitForFunction(()=>__xetLiveCountdown.active);
    await fixture.evaluate(()=>history.pushState({},'','/bought'));await fixture.waitForFunction(()=>!__xetLiveCountdown.active);
    checks.push('Rescheduling and new server clock after sleep; exact formatter/ticker restoration on disable; re-enable and SPA cleanup');
    assert(!errors.length,errors.join('; '));assert(calls.every(c=>c.method==='GET'),'Unexpected write');
    assert(calls.filter(c=>c.path===path).length===1,'Reloaded live room');
    return {checks,errors,calls};
  } finally { await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close(); }
}
