async (page) => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 extension required');
  const get = async url => { const r=await page.request.get(url);if(!r.ok())throw Error('Pinned native fixture unavailable');return r.text(); };
  const vue=await get('https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.min.js');
  const native=await get('https://assets.cdn.xiaoeknow.com/live/live_pc/1.83.171/live_pc/index.js');
  const start=native.indexOf('send(){if(this.disableClass)return;'), end=native.indexOf(',openTakeGoodsList(',start);
  if(start<0||end<start)throw Error('Native Inputer send signature changed');
  const methods=native.slice(start,end);
  const fixture=await page.context().newPage(),origin='https://merchant.pc.xiaoe-tech.com';
  const path='/p/t_pc/live_pc/pc/l_fixture',calls=[],errors=[],checks=[];
  let checkHold=false,saveHold=false,historyHold=false,failHistory=false,failCheck=false,failSave=false,failIM=false,limitIM=false;
  let historyTransform=rows=>rows;
  const persisted=new Map();
  const releases=[];fixture.on('pageerror',e=>errors.push(e.message));fixture.setDefaultTimeout(8000);
  const assert=(yes,message)=>{if(!yes)throw Error(message)};
  assert(native.includes('o.data.data.is_limit_im?t():e()')&&native.includes('tv.sendFakeMsg(A),r()'), 'Pinned native persisted-only branch changed');
  try {
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await fixture.route('https://sensitive.xiaoeknow.com/**',async route=>{
      const body=Object.fromEntries(new URLSearchParams(route.request().postData()));calls.push({stage:'check',body});
      if(checkHold)await new Promise(r=>releases.push(r));
      await route.fulfill({headers:{'access-control-allow-origin':origin},json:failCheck?
        {code:1,bizCode:110,msg:'Fixture rejected',data:{}}:{code:0,data:{}}});
    });
    await fixture.route(`${origin}/**`,async route=>{
      const url=new URL(route.request().url());
      if(route.request().method()==='POST'){
        const body=route.request().postDataJSON();
        const stage=url.pathname.includes('get.history.msg')?'history':url.pathname.includes('save_msg')?'save':'im';calls.push({stage,body});
        if(stage==='history'){
          if(historyHold)await new Promise(r=>releases.push(r));
          await route.fulfill({json:failHistory?{code:500}:{code:0,data:{msgs:historyTransform([...persisted.values()].slice(-20)),finish:true}}});return;
        }
        if(saveHold&&url.pathname.includes('save_msg'))await new Promise(r=>releases.push(r));
        if(stage==='save'&&!failSave)persisted.set(body.comment_id,{...body});
        await route.fulfill({json:{code:stage==='save'?(failSave?500:0):(failIM?500:0),data:{is_limit_im:limitIM}}});return;
      }
      await route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset=utf-8><style>
      body{background:#181b20;color:#ddd;font:14px Arial;margin:0}.interaction{width:365px;margin:12px auto}.scroll-wrapper{height:390px;overflow:auto;padding:0 18px}.text-msg-wrapper{margin:20px 0}.native-bubble{display:inline-block;padding:9px 10px;background:#2b2e36;border-radius:4px;white-space:pre-wrap}.input-container{border-top:1px solid #333;background:#181b20;padding:10px 18px}.inputer{box-sizing:border-box;resize:none;border:0;outline:none;background:transparent;color:#ddd;width:100%;height:110px;font:14px Arial}.content-footer{text-align:right}.send{background:#1764ff;color:white;font:14px Arial;border:0;border-radius:3px;padding:6px 12px}
      </style><div id=app><div class=interaction><area-view ref=teacher v-show="tab==='teacherMsg'"></area-view><area-view ref=discuss v-show="tab==='discuss'"></area-view><chat-input ref=inputer></chat-input></div></div><script>${vue}</script><script>
      Vue.config.productionTip=false;window.Vc={report(){}};window.ue={a:{stringify:x=>new URLSearchParams(x).toString()}};window.i18n={t:k=>k};
      window.isAnonymous=false;window.payloads=[];window.hot=0;
      const room={alive_id:'l_fixture',room_id:'room_fixture',app_id:'app_fixture',user_id:'user_fixture',user_type:0,show_on_wall:1,alive_mode:1,alive_state:1,is_lookback:0};
      const post=async(url,body,form=false)=>(await fetch(url,{method:'POST',headers:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'},body:form?body:JSON.stringify(body)})).json();
      window.mA={$emit:async(name,payload,success,failure)=>{
        if(name!=='send_new_msg')return;payloads.push(JSON.parse(JSON.stringify(payload)));
        const data={comment_id:payload.comment_id||crypto.randomUUID().replaceAll('-',''),msg_content:payload.content,user_id:room.user_id,alive_id:room.alive_id,content_type:payload.content_type,is_show:payload.is_show};
        const saved=await post('/_alive/api/alive/xe_alive_save_msg/1.0.0',data);
        if(saved.code!==0||saved.data.is_limit_im){app.$refs.teacher.msgArr.push(data);app.$refs.discuss.msgArr.push(data);success();return;}
        const ack=await post('/fixture/im',data);
        if(ack.code!==0){failure({});return;}
        const msg={...data,msg_tag:'ack_'+data.comment_id};app.$refs.teacher.msgArr.push(msg);app.$refs.discuss.msgArr.push(msg);success();
      }};
      Vue.component('native-msg',{props:['msg'],template:'<div class="text-msg-wrapper"><div class="native-bubble">{{msg.msg_content}}</div></div>'});
      Vue.component('message-wrapper',{props:['rows'],template:'<div class="msg-part-container"><native-msg v-for="m in rows" :key="m.comment_id" :msg="m"></native-msg></div>'});
      Vue.component('area-view',{name:'teacherArea',data:()=>({msgArr:[]}),template:'<div class="scroll-wrapper"><message-wrapper ref="messageWrapper" :rows="msgArr"></message-wrapper></div>',mounted(){if(this===this.$parent.$refs.discuss)this.$options.name='discussArea'}});
      Vue.component('chat-input',{name:'Inputer',data:()=>({content:'',input_state:1,roomInfo:room,grayList:{},disableClass:'',isForbidTalk:false,inRecordMode:false,isOnReplay:false,isElink:false,isAskQuestion:false,isReplyDiscuss:false,showUserAuthDialog:false,showEmoji:false,currentRoundPrizeInfo:null,currentTab:'teacherMsg',isShowOnWall:1}),
        template:'<div class="input-container"><div class="content-body"><label><textarea ref="inputer" class="inputer" maxlength="3000" placeholder="请输入您的讨论内容" v-model.trim="content" @keydown.enter.exact.prevent="send"></textarea></label></div><div class="content-footer"><button class="send" @click="send">发送</button></div></div>',
        beforeCreate(){this.$store={state:{msgAuthorization:1,live:{roomInfo:room,isRoundEnding:false}},dispatch:(type,value)=>{if(type==='live/updateInteractionTabName'){this.currentTab=value;app.tab=value}}};this.$route={params:{id:'l_fixture'}};this.$axios={post:(u,b)=>post(u,b,typeof b==='string')};this.$message={error(){}}},
        methods:{${methods},resetReply(){this.isReplyDiscuss=false;this.content=''},liveHotHandle(){hot++},handleGetAward(){}}
      });
      window.app=new Vue({el:'#app',data:{tab:'teacherMsg'}});window.originalSend=app.$refs.inputer.sendMsg;
      </script>`});
    });
    await fixture.goto(origin+path);await fixture.bringToFront();
    await fixture.waitForFunction(()=>window.__xetLiveChat?.active);
    const input=fixture.locator('textarea.inputer:not(.xet-chat-draft)');
    const send=async value=>{await input.fill(value);await input.press('Enter')};
    await fixture.evaluate(()=>app.$refs.inputer.$store.state.msgAuthorization=0);
    await send('需要授权');
    assert(calls.length===0&&await fixture.locator('.xet-chat-pending').count()===0,'Authorization gate was bypassed');
    await fixture.evaluate(()=>{app.$refs.inputer.$store.state.msgAuthorization=1;app.$refs.inputer.disableClass='disable'});
    await send('禁言测试');
    assert(calls.length===0&&await fixture.locator('.xet-chat-pending').count()===0,'Disabled native composer bypassed');
    await fixture.evaluate(()=>{app.$refs.inputer.disableClass='';app.$refs.inputer.isAskQuestion=true});
    checkHold=true;await send('第一条 <img src=x onerror=alert(1)>');
    await fixture.locator('.xet-chat-pending').waitFor();
    assert(await fixture.locator('.xet-chat-draft').inputValue()==='','New draft did not appear immediately');
    assert(await fixture.locator('.xet-chat-status').textContent()==='发送中…','Missing immediate pending state');
    assert(await fixture.locator('.xet-chat-bubble img').count()===0,'Message rendered as HTML');
    assert(calls.length===1&&calls[0].stage==='check','Original validation was bypassed');
    await fixture.locator('.xet-chat-draft').fill('下一条草稿');
    await fixture.locator('.xet-chat-draft').press('Control+Enter');
    assert(await fixture.locator('.xet-chat-draft').inputValue()==='下一条草稿\n','Native Ctrl+Enter newline changed');
    await fixture.locator('.xet-chat-draft').fill('下一条草稿');
    await fixture.locator('.xet-chat-draft').press('Enter');
    assert(calls.length===1,'Repeated Enter queued or duplicated a send');
    await fixture.screenshot({path:'output/playwright/live-chat-pending.png'});
    checkHold=false;releases.splice(0).forEach(r=>r());
    await fixture.waitForFunction(()=>!document.querySelector('.xet-chat-pending')&&!document.querySelector('.xet-chat-draft'));
    assert(await input.inputValue()==='下一条草稿','Older success callback erased the next draft');
    assert(calls.map(c=>c.stage).join(',')==='check,save,im','Request order changed');
    assert(calls[0].body.msg_content===calls[1].body.msg_content,'Sent content changed');
    assert(await fixture.evaluate(()=>payloads[0].isQuestion===true),'Question metadata changed');
    assert(await fixture.locator('.scroll-wrapper:visible .native-bubble').count()===1,'Duplicate confirmed message');
    checks.push('Actual pinned native Inputer.send/sendMsg + Vue 2 + real MV3: immediate pending, native check/save/IM order, no duplicate send, safe text, new draft preserved, one confirmed bubble');
    checks.push('Native authorization/mute gates, question metadata and Ctrl+Enter retained');
    await fixture.evaluate(()=>app.$refs.inputer.isShowOnWall=0);
    failSave=true;await send('保存失败测试');
    await fixture.locator('.xet-chat-pending[data-state=unconfirmed]').waitFor();
    await fixture.waitForFunction(()=>document.querySelector('[data-xet-chat-unconfirmed]'));
    assert((await fixture.locator('.xet-chat-status').textContent()).includes('未确认'),'Native fake success marked delivered');
    assert(await fixture.evaluate(()=>app.$refs.discuss.$el.contains(document.querySelector('.xet-chat-pending'))),'Failure was left hidden in the previous native tab');
    assert(await fixture.locator('.scroll-wrapper:visible .native-bubble:visible').count()===1,'Native fake fallback duplicated an unconfirmed message');
    const beforeRestore=calls.length;
    await fixture.getByRole('button',{name:'恢复编辑',exact:true}).click();
    assert(await input.inputValue()==='保存失败测试','Failure did not restore original text');
    assert(beforeRestore===calls.length,'Restoring text sent another message');
    assert(calls.filter(c=>c.stage==='history').length===3,'Missing history must stop after three bounded checks');
    await fixture.screenshot({path:'output/playwright/live-chat-unconfirmed.png'});
    failSave=false;await fixture.getByRole('button',{name:'移除提示',exact:true}).click();
    checks.push('Native save-error fake bubble remains explicitly unconfirmed; restore is user-initiated, does not send, and no false delivery/duplicate bubble');
    failCheck=true;await send('审核拒绝测试');
    await fixture.locator('.xet-chat-pending[data-state=unconfirmed]').waitFor();
    assert((await fixture.locator('.xet-chat-status').textContent()).includes('未发送'),'Rejected text not identified');
    assert(calls.at(-1).stage==='check','Rejected content went to persistence or IM');
    await input.fill('已有草稿');await fixture.getByRole('button',{name:'恢复编辑',exact:true}).click();
    assert(await input.inputValue()==='已有草稿','Restore overwrote an existing draft');
    failCheck=false;await fixture.getByRole('button',{name:'移除提示',exact:true}).click();
    failIM=true;await send('已保存但IM失败测试');await fixture.locator('.xet-chat-pending[data-state=saved]').waitFor();
    assert((await fixture.locator('.xet-chat-status').textContent()).includes('已保存到消息记录'),'Persisted message without IM ack was not confirmed saved');
    assert(!await fixture.getByRole('button',{name:'恢复编辑',exact:true}).isVisible(),'Saved message encourages resending');
    failIM=false;await fixture.getByRole('button',{name:'移除提示',exact:true}).click();
    checks.push('Moderation rejection never bypassed; history-confirmed save is distinct from IM delivery; restoring a failed message cannot overwrite an existing draft');
    await fixture.evaluate(()=>Object.assign(app.$refs.inputer.roomInfo,{alive_state:3,is_lookback:1}));
    limitIM=true;const replayStart=calls.length;await send('回放留言');
    await fixture.waitForFunction(()=>!document.querySelector('.xet-chat-pending'));
    assert(calls.slice(replayStart).map(c=>c.stage).join(',')==='check,save,history','Replay did not follow persisted-only native branch and one history check');
    assert(await fixture.locator('.scroll-wrapper:visible .native-bubble:visible').filter({hasText:'回放留言'}).count()===1,'Replay echo hidden or duplicated after server confirmation');
    assert(await fixture.locator('.text-msg-wrapper').filter({hasText:'回放留言'}).evaluateAll(els=>els.every(el=>!el.hasAttribute('data-xet-chat-unconfirmed'))),'Confirmed replay echo stayed hidden');
    assert(await fixture.evaluate(()=>app.$refs.inputer.isOnReplay===false),'Fixture must reproduce real replay with isOnReplay=false');
    checks.push('Replay alive_state=3/is_lookback=1 with isOnReplay=false: saved/no-IM branch restores exactly one native bubble, no false warning or resend');
    let delayedOnce=true;historyTransform=rows=>{if(delayedOnce){delayedOnce=false;return rows.slice(0,-1)}return rows};
    const delayedStart=calls.length;await send('稍后才可查询的留言');
    await fixture.waitForFunction(()=>!document.querySelector('.xet-chat-pending'));
    assert(calls.slice(delayedStart).filter(c=>c.stage==='history').length===2,'Delayed persistence was not checked again');
    historyTransform=rows=>rows;
    // Wrong user, room, or comment ID must never satisfy server confirmation.
    for(const field of ['user_id','alive_id','comment_id']){
      historyTransform=rows=>rows.map(m=>({...m,[field]:'wrong'}));
      await send('不匹配的'+field);await fixture.locator('.xet-chat-pending[data-state=unconfirmed]').waitFor();
      assert(!(await fixture.locator('.xet-chat-status').textContent()).includes('已保存'),'Unrelated history falsely confirmed');
      await fixture.getByRole('button',{name:'移除提示',exact:true}).click();
    }
    historyTransform=rows=>rows;failHistory=true;await send('查询失败不能确认');
    await fixture.locator('.xet-chat-pending[data-state=unconfirmed]').waitFor();
    await fixture.getByRole('button',{name:'移除提示',exact:true}).click();failHistory=false;
    // A delayed history reply after native IM confirmation cannot resurrect UI.
    historyHold=true;await send('迟到的历史回复');await fixture.locator('.xet-chat-pending[data-state=checking]').waitFor();
    await fixture.evaluate(()=>{const r=[...__xetLiveChat.records][0],a=app.$refs.discuss,m=a.msgArr.find(m=>m.comment_id===r.commentId);Vue.set(m,'msg_tag','late_ack')});
    await fixture.waitForFunction(()=>!document.querySelector('.xet-chat-pending'));
    historyHold=false;releases.splice(0).forEach(r=>r());
    checks.push('Wrong user/room/ID and failed history never confirm; bounded retries; late lookup after IM acknowledgement cannot resurrect UI');
    // Cancelling while a history query is in flight leaves no polling or late UI.
    historyHold=true;await send('停用期间的查询');await fixture.locator('.xet-chat-pending[data-state=checking]').waitFor();
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!window.__xetLiveChat.active&&!document.querySelector('.xet-chat-pending'));
    const stoppedHistory=calls.filter(c=>c.stage==='history').length;
    historyHold=false;releases.splice(0).forEach(r=>r());await fixture.waitForTimeout(1200);
    assert(!await fixture.locator('.xet-chat-pending').count()&&calls.filter(c=>c.stage==='history').length===stoppedHistory,'Disabled history resurrected UI or retried');
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.waitForFunction(()=>window.__xetLiveChat.active);
    limitIM=false;await fixture.evaluate(()=>Object.assign(app.$refs.inputer.roomInfo,{alive_state:1,is_lookback:0}));
    const beforeClick=calls.length;await input.fill('点击发送测试');await fixture.locator('button.send').click();
    await fixture.waitForFunction(()=>!document.querySelector('.xet-chat-pending')&&!document.querySelector('.xet-chat-draft'));
    assert(calls.length===beforeClick+3,'Click-send did not keep exactly one native pipeline');
    saveHold=true;await send('禁用期间的发送');await fixture.locator('.xet-chat-draft').fill('禁用时保留草稿');
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!window.__xetLiveChat.active&&!document.querySelector('.xet-chat-draft'));
    assert(await input.inputValue()==='禁用时保留草稿','Disable lost the draft');
    saveHold=false;releases.splice(0).forEach(r=>r());
    await fixture.waitForFunction(()=>app.$refs.inputer.input_state===1);
    assert(await input.inputValue()==='禁用时保留草稿','Late native callback after disable erased draft');
    assert(await fixture.evaluate(()=>app.$refs.inputer.sendMsg===originalSend),'Disable did not restore native method');
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.waitForFunction(()=>window.__xetLiveChat.active);
    checkHold=true;await send('切换直播前的消息');await fixture.locator('.xet-chat-draft').fill('旧直播草稿');
    await fixture.evaluate(()=>{
      history.pushState({},'','/p/t_pc/live_pc/pc/l_other');
      app.$refs.inputer.roomInfo={...app.$refs.inputer.roomInfo,alive_id:'l_other'};app.$refs.inputer.content='新直播自己的草稿';
    });
    await fixture.waitForFunction(()=>!window.__xetLiveChat.active&&!document.querySelector('.xet-chat-draft'));
    assert(await input.inputValue()==='新直播自己的草稿','Old-room cleanup overwrote the new-room draft');
    checkHold=false;releases.splice(0).forEach(r=>r());
    await fixture.waitForFunction(()=>app.$refs.inputer.input_state===1);
    checks.push('Disable during in-flight send and late completion preserve draft; native method restored; re-enable and SPA route cleanup work');
    assert(!errors.length,errors.join('; '));
    return{checks,errors,stages:calls.map(c=>c.stage)};
  }finally{
    releases.splice(0).forEach(r=>r());await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close();
  }
}
