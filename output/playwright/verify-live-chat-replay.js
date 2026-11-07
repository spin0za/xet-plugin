async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 required');
  const vue = await (await page.request.get('https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.min.js')).text();
  const origin = 'https://merchant.pc.xiaoe-tech.com', path = '/p/t_pc/live_pc/pc/l_replay';
  const fixture = await page.context().newPage(), errors = [], calls = [], checks = [];
  fixture.on('pageerror', e => errors.push(e.message)); fixture.setDefaultTimeout(10000);
  const assert = (ok, msg) => { if (!ok) throw Error(msg); };
  const start = Date.parse('2026-10-03T14:01:23+08:00') / 1000;
  const playlist = '#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-10-03T14:01:23+08:00\n' +
    Array.from({ length: 40 }, (_, i) => '#EXTINF:5,\n' + i + '.ts').join('\n') + '\n#EXT-X-ENDLIST';
  const rows = Array.from({ length: 85 }, (_, i) => ({ comment_id: 'm' + i, alive_id: 'l_replay', user_id: 'someone',
    content_type: 0, created_timestamp: start + i * 2, created_at: '', msg_content: '课堂消息 ' + i }));
  rows.push({ comment_id: 'post', alive_id: 'l_replay', user_id: 'someone', content_type: 0,
    created_timestamp: start + 5000, msg_content: '课后留言 <img src=x onerror=alert(1)>' });
  let badPlaylist = false, hold = false, failHistory = false;
  const releases = [];
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.route('https://media.xiaoeknow.com/**', route => route.fulfill({ headers: { 'access-control-allow-origin': origin },
      contentType: 'application/vnd.apple.mpegurl', body: badPlaylist ? '#EXTM3U\n#EXTINF:200,\nfile.ts\n#EXT-X-ENDLIST' : playlist }));
    await fixture.route(origin + '/**', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON(), url = new URL(route.request().url());
        if (url.pathname === '/_alive/api/alive/xe_alive_save_msg/1.0.0') {
          calls.push({ stage: 'save', body }); rows.push(body); await route.fulfill({ json: { code: 0 } }); return;
        }
        assert(url.pathname === '/_alive/api/alive/xe.alive.get.history.msg/1.0.0', 'Unexpected mutation/API');
        calls.push({ stage: 'history', body });
        if (hold) await new Promise(r => releases.push(r));
        const cursor = body.comment_id ? rows.findIndex(m => m.comment_id === body.comment_id) + 1 : 0;
        const latest = body.loadOrder === 1 && !body.comment_id; // Send-feedback's recent-history lookup.
        const selected = latest ? rows.slice(-20) : rows.slice(cursor, cursor + 7);
        await route.fulfill({ json: failHistory ? { code: 500 } : { code: 0, data: {
          msgs: selected, finish: latest || cursor + 7 >= rows.length } } }); return;
      }
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset=utf-8><style>
      body{margin:0;background:#181b20;color:#ddd;font:14px Arial}.interaction{width:365px;margin:10px auto}.area{position:relative;height:400px}.scroll-container{height:100%;overflow:auto}.native-bubble{display:inline-block;padding:9px 10px;background:#2b2e36;border-radius:4px;white-space:pre-wrap}.text-msg-wrapper{margin:20px 0}.input-container{height:140px}.inputer{width:100%;height:90px;background:transparent;color:white}.send{background:#1764ff;color:white}
      </style><video muted></video><div id=app class=interaction><button @click="tab='teacherMsg'">讲解</button><button @click="tab='discuss'">讨论</button><teacher-area ref=teacher v-show="tab==='teacherMsg'"></teacher-area><discuss-area ref=discuss v-show="tab==='discuss'"></discuss-area><chat-input ref=inputer></chat-input></div>
      <script>${vue}</script><script>
      Vue.config.productionTip=false;window.readWrites=0;window.mediaActions=0;
      const room={alive_id:'l_replay',room_id:'room_replay',user_id:'me',alive_state:3,is_lookback:1};
      const store={state:{live:{roomInfo:room},PlayerModule:{lookBackPlayData:{lineOptions:{lineIndex:0,resolutionIndex:0},lines:[{line_sharpness:[{url:'https://media.xiaoeknow.com/replay.m3u8'}]}]}}}};
      Vue.mixin({beforeCreate(){this.$store=this.$parent?.$store||store}});
      const post=async(u,b)=>(await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)})).json();
      Vue.component('message-wrapper',{name:'messageWrapper',props:['msgArr','partitionName','partitionIndex','topLoadStatus'],methods:{saveMsgReadHistory(){readWrites++}},
        mounted(){this.saveMsgReadHistory()},render(h){return h('div',{class:'msg-part-container'},(this.msgArr||[]).map(msg=>h('div',{class:'text-msg-wrapper',key:msg.comment_id,attrs:{id:'m-'+msg.comment_id}},[h('div',{class:'native-bubble'},[msg.msg_content])])) )}});
      const area={data:()=>({msgArr:[],skipHistoryLoad:false}),template:'<div class=area><div class=scroll-container><message-wrapper ref=messageWrapper :msg-arr=msgArr></message-wrapper></div></div>',mounted(){this.$refs.scrollWrapper={$el:this.$el}}};
      Vue.component('teacher-area',{...area,name:'teacherArea',data:()=>({msgArr:[],skipHistoryLoad:false,infoType:0})});
      Vue.component('discuss-area',{...area,name:'discussArea',data:()=>({msgArr:[],skipHistoryLoad:false,infoType:2})});
      Vue.component('chat-input',{name:'Inputer',data:()=>({roomInfo:room,content:'',input_state:1,isOnReplay:false,isReplyDiscuss:false,isForbidTalk:false,inRecordMode:false}),
        computed:{currentTab(){return this.$parent.tab}},beforeCreate(){this.$axios={post}},template:'<div class=input-container><textarea ref=inputer class=inputer v-model=content></textarea><button class=send @click=send>发送</button></div>',methods:{
          send(){this.input_state=0;const data={content:this.content,content_type:0};setTimeout(()=>this.sendMsg(data),50)},
          async sendMsg(p){const msg={comment_id:p.comment_id,user_id:'me',alive_id:'l_replay',content_type:0,created_timestamp:${start + 6000},msg_content:p.content};await post('/_alive/api/alive/xe_alive_save_msg/1.0.0',msg);this.$parent.$refs.teacher.msgArr.push(msg);this.$parent.$refs.discuss.msgArr.push(msg);this.content='';this.input_state=1}
        }});
      const video=document.querySelector('video');let time=15,paused=true;
      Object.defineProperties(video,{duration:{get:()=>200,configurable:true},currentTime:{get:()=>time,set:v=>{time=v},configurable:true},paused:{get:()=>paused,configurable:true}});
      video.play=()=>{mediaActions++;return Promise.resolve()};video.pause=()=>{mediaActions++};
      window.advance=(n,playing=true)=>{time=n;paused=!playing;video.dispatchEvent(new Event('timeupdate'))};
      window.app=new Vue({el:'#app',data:{tab:'teacherMsg'}});
      </script>` });
    });
    await fixture.goto(origin + path); await fixture.bringToFront();
    await fixture.waitForFunction(() => window.__xetReplayChat?.timeline && __xetReplayChat.panes[0].view.rows.length);
    const pane = fixture.locator('.area:visible .xet-replay-pane');
    await fixture.waitForFunction(() => !__xetReplayChat.panes[0].loading);
    assert(await fixture.evaluate(() => __xetReplayChat.panes[0].view.rows.every(m => m.created_timestamp <= __xetReplayChat.timeline.start + 15)), 'Future chat spoilers visible');
    assert(await fixture.evaluate(() => readWrites) === 2, 'Replay view rewrote native reading position');
    assert(await fixture.evaluate(() => mediaActions) === 0, 'Feature changed playback');
    checks.push('Real MV3 + Vue: PDT-based time map, only past messages, native renderer with no read-history writes or playback mutations');
    const initial = await pane.locator('.native-bubble').count();
    await fixture.evaluate(() => advance(16, false));
    await fixture.waitForFunction(() => __xetReplayChat.panes[0].view.rows.length === 9);
    await fixture.evaluate(() => advance(130));
    await fixture.waitForFunction(() => !__xetReplayChat.panes[0].loading && __xetReplayChat.panes[0].view.rows.length === 66);
    const cached = calls.length;
    await fixture.evaluate(() => { advance(5);document.querySelector('video').dispatchEvent(new Event('seeked')) });
    await fixture.waitForFunction(() => __xetReplayChat.panes[0].view.rows.length === 3);
    assert(calls.length === cached, 'Backward seek did not reuse cache');
    const viewport = pane.locator('.xet-replay-viewport');
    await viewport.hover(); await fixture.mouse.wheel(0, -120);
    await fixture.waitForFunction(() => !__xetReplayChat.panes[0].following);
    await fixture.evaluate(() => advance(100));
    assert(await pane.locator('.native-bubble').count() === 3, 'Manual browsing was overridden');
    await pane.getByRole('button', { name: '返回当前进度', exact: true }).click();
    await fixture.waitForFunction(() => __xetReplayChat.panes[0].view.rows.length === 51);
    checks.push('Pause/progress and seek updates use media time; backward seek uses cache; manual scroll pauses following; resume restores current position');
    await pane.getByRole('button', { name: '课后留言', exact: true }).click();
    await fixture.waitForFunction(() => __xetReplayChat.panes[0].finished);
    assert(await pane.locator('.native-bubble').count() === 1 && (await pane.locator('.native-bubble').textContent()).includes('课后留言'), 'Post-live notes mixed with live chat');
    assert(await pane.locator('.native-bubble img').count() === 0, 'Unsafe HTML inserted');
    await pane.getByRole('button', { name: '原始列表', exact: true }).click();
    assert(await fixture.locator('.area:visible').getAttribute('data-xet-replay-mode') === 'native', 'Native fallback missing');
    await pane.getByRole('button', { name: '跟随回放', exact: true }).click();
    const beforeSend = calls.filter(c => c.stage === 'save').length;
    await fixture.locator('textarea.inputer:not(.xet-chat-draft)').fill('回看时的新留言'); await fixture.locator('button.send').click();
    await fixture.locator('.area:visible .xet-replay-outbox .xet-chat-pending[data-state=saved]').waitFor();
    assert(calls.filter(c => c.stage === 'save').length === beforeSend + 1, 'Replay duplicated a send');
    assert(!(await pane.locator('.xet-replay-viewport').textContent()).includes('回看时的新留言'), 'New note inserted into historical timeline');
    checks.push('Post-live notes separated; native fallback; safe native text rendering; sending feedback remains visible without inserting new notes into past chat');
    await fixture.getByRole('button', { name: '讨论', exact: true }).click();
    await fixture.waitForFunction(() => !__xetReplayChat.panes[1].loading && __xetReplayChat.panes[1].view.rows.length > 0);
    assert(calls.some(c => c.body.infoType === 2), 'Discuss partition not loaded');
    badPlaylist = true;
    await fixture.evaluate(() => { __xetReplayChat.stop();delete window.__xetReplayChat });
    await fixture.waitForFunction(() => window.__xetReplayChat?.active && !__xetReplayChat.timeline && __xetReplayChat.panes[0].status.textContent.includes('无法可靠'));
    assert(await fixture.locator('.area:visible').getAttribute('data-xet-replay-mode') === 'native', 'Unanchored replay guessed start time');
    badPlaylist = false;
    await fixture.locator('.area:visible .xet-replay-retry').click();
    await fixture.waitForFunction(() => !!__xetReplayChat.timeline);
    checks.push('Teacher/discuss partitions; missing PDT keeps native list rather than guessing; retry recovers');
    hold = true; failHistory = true;
    await fixture.locator('.area:visible .xet-replay-mode').filter({ hasText: '课后留言' }).click();
    await fixture.waitForFunction(() => __xetReplayChat.panes.some(p => p.loading));
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => !__xetReplayChat.active && !document.querySelector('.xet-replay-pane'));
    hold = false; releases.splice(0).forEach(r => r()); await fixture.waitForTimeout(100);
    assert(await fixture.locator('[data-xet-replay-original]').count() === 0, 'Stop did not restore native DOM');
    assert(await fixture.evaluate(() => mediaActions) === 0, 'Stop changed video playback');
    checks.push('In-flight lookup cancellation and disable restore native DOM without late UI or video changes');
    assert(!errors.length, errors.join('; '));
    return { checks, errors, historyRequests: calls.filter(c => c.stage === 'history').length, initialMessages: initial };
  } catch (error) {
    const state = await fixture.evaluate(() => ({ path: location.pathname, replay: window.__xetReplayChat ? {
      active: __xetReplayChat.active, mapped: !!__xetReplayChat.timeline,
      panes: __xetReplayChat.panes.map(p => ({ mode: p.mode, count: p.messages.size, rows: p.view.rows.length,
        status: p.status.textContent, loading: p.loading, finished: p.finished, following: p.following })) } : null,
      feedback: !!window.__xetLiveChat?.active, modules: Object.keys(window.__xetPlayerHelperModules || {}) }));
    throw Error(JSON.stringify({ error: error.message, checks, calls: calls.slice(-5), state, errors }));
  } finally {
    hold = false; releases.splice(0).forEach(r => r());
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] })); await fixture.close();
  }
}
