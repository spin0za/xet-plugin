async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 extension required');
  const response = await page.request.get('https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.min.js');
  if (!response.ok()) throw Error('Pinned Vue fixture unavailable');
  const vue = await response.text(), fixture = await page.context().newPage();
  const origin = 'https://merchant.pc.xiaoe-tech.com', path = '/detail/l_fixture/4';
  const errors = [], checks = [], calls = [];
  fixture.on('pageerror', e => errors.push(e.message));
  fixture.setDefaultTimeout(8000);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.route(`${origin}/**`, async route => {
      calls.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
      if (route.request().url().includes('/api/xe.goods.detail.get/2.0.0')) {
        await route.fulfill({ json: { code: 0, data: { time: 120000 } } }); return;
      }
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>
      body{font:16px sans-serif}.status-wrapper{display:flex;gap:10px;color:#333}.sec{background:#ff6565;color:white}
      </style><div id=app><countdown :time="infos.time" :status="infos.status"></countdown></div>
      <script>${vue}</script><script>
      window.offset=0;const nativeNow=Date.now.bind(Date);Date.now=()=>nativeNow()+offset;
      window.advance=ms=>{offset+=ms};window.renderCount=0;
      Vue.component('countdown',{
        props:['time','status'],data:()=>({count:0,liveStatus:-1,day:'',hour:'',min:'',sec:'',timer:null}),
        template:'<div class="status-wrapper"><template v-if="liveStatus===0">直播倒计时：<span>{{day}} 天</span><span>{{hour}} 时</span><span>{{min}} 分</span><span class="sec">{{sec}} 秒</span></template><span v-else>直播中</span></div>',
        watch:{status:{immediate:true,handler(t,p){if(t!==p)this.liveStatus=t}},
          time:{immediate:true,handler(t,p){if(t<=0||t===p)return;this.count=t;if(this.status===0){this.getTime(this.count);this.timer=setInterval(()=>{if(this.count<=0){clearInterval(this.timer);this.timer=null;this.liveStatus=1;return}this.getTime(this.count)},1000)}}}},
        methods:{getTime(t){renderCount++;let e=Number(t),d=Math.floor(e/86400000);e-=d*86400000;let h=Math.floor(e/3600000);e-=h*3600000;let m=Math.floor(e/60000);e-=m*60000;
          this.day=d;this.hour=this.formate(h);this.min=this.formate(m);this.sec=this.formate(Math.floor(e/1000));this.count-=1000},formate(n){return n<10?'0'+n:n}}
      });
      fetch('/api/xe.goods.detail.get/2.0.0').then(r=>r.json()).then(r=>{
        window.app=new Vue({el:'#app',data:{infos:{time:r.data.time,status:0}}});
        window.nativeNode=document.querySelector('.status-wrapper');window.nativeGetTime=nativeNode.__vue__.getTime;
      });
      </script>` });
    });
    await fixture.goto(origin + path); await fixture.bringToFront();
    await fixture.waitForFunction(() => window.__xetLiveCountdown?.active);
    assert(await fixture.evaluate(() => {
      const v=nativeNode.__vue__;return v.timer===null&&v.getTime===nativeGetTime&&v.count>117000&&v.count<=120000;
    }), 'Native ticker not replaced, formatter changed or bad initial duration');
    const snapshot = () => fixture.evaluate(() => {
      const v=nativeNode.__vue__;return {left:v.count,status:v.liveStatus,text:nativeNode.textContent, renders:renderCount};
    });
    const before = await snapshot();
    await fixture.evaluate(() => { advance(45000); document.dispatchEvent(new Event('visibilitychange')); });
    const after = await snapshot();
    assert(before.left-after.left>=45000&&before.left-after.left<47000,'Wake event failed to account for 45 missed seconds');
    assert(after.text.includes('分')&&await fixture.evaluate(()=>document.querySelector('.status-wrapper')===nativeNode),`Native DOM/format lost: ${JSON.stringify(after)}`);
    checks.push('Real MV3 + Vue 2 native watcher/formatter: 45 elapsed background seconds applied immediately without refreshing or replacing DOM');
    await fixture.evaluate(() => { advance(90000); window.dispatchEvent(new Event('pageshow')); });
    await fixture.waitForFunction(() => nativeNode.__vue__.liveStatus===1);
    assert((await snapshot()).left===0,'Expiry did not clamp at zero');
    await fixture.evaluate(() => { advance(5000); window.dispatchEvent(new Event('focus')); });
    assert((await snapshot()).left===0,'Expired countdown became negative');
    checks.push('Past-start wake clamps to zero and switches to the native broadcasting state, without navigation');
    // A fresh server response can reschedule the same component. Native time
    // and parent infos watchers run in one Vue flush; neither may restart it twice.
    await fixture.evaluate(async () => {
      const r=await fetch('/api/xe.goods.detail.get/2.0.0').then(r=>r.json());
      app.infos={time:r.data.time+60000,status:0};await Vue.nextTick();
    });
    await fixture.waitForFunction(() => nativeNode.__vue__.count>170000&&nativeNode.__vue__.timer===null);
    await fixture.evaluate(() => { advance(15000); window.dispatchEvent(new Event('focus')); });
    assert((await snapshot()).left>160000&&(await snapshot()).left<166000,'Reschedule deadline was reset or duplicate native interval survived');
    await worker.evaluate(origin => chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(() => !window.__xetLiveCountdown.active);
    assert(await fixture.evaluate(()=>nativeNode.__vue__.timer!==null),'Disable failed to restore native ticking');
    await worker.evaluate(() => chrome.storage.local.set({disabledSites:[]}));
    await fixture.waitForFunction(() => window.__xetLiveCountdown.active&&nativeNode.__vue__.timer===null);
    await fixture.evaluate(() => history.pushState({},'', '/bought'));
    await fixture.waitForFunction(() => !window.__xetLiveCountdown.active);
    checks.push('Fresh server props, disable/re-enable and SPA route exit correctly reset/restore the native lifecycle');
    assert(!errors.length,errors.join('; '));
    assert(calls.every(c=>c.method==='GET'),'Unexpected write request');
    assert(calls.filter(c=>c.path==='/detail/l_fixture/4').length===1,'Page reloaded');
    return {checks, errors, calls};
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({disabledSites:[]}));
    await fixture.close();
  }
}
