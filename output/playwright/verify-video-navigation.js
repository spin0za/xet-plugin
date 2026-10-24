async(page)=>{
 const verify=async(playerName)=>{
  const context=page.context(),worker=context.serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Real MV3 extension required');
  const fixture=await context.newPage(),origin='https://video-nav.pc.xiaoe-tech.com';
  const prefix='/p/t_pc/course_pc_detail/video/',query='?product_id=course_fixture';
  const calls=[],errors=[],checks=[],releases=[];let hold=false,documents=0,stage='setup';
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  fixture.setDefaultTimeout(10000);fixture.on('pageerror',e=>errors.push(e.message));
  try{
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    const vue=await(await fetch('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.js')).text();
    const router=await(await fetch('https://cdn.jsdelivr.net/npm/vue-router@3.6.5/dist/vue-router.js')).text();
    await fixture.route(`${origin}/**`,async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/vue.js'){await route.fulfill({contentType:'text/javascript',body:vue});return;}
      if(url.pathname==='/router.js'){await route.fulfill({contentType:'text/javascript',body:router});return;}
      if(request.method()==='POST'){
        const body=request.postDataJSON();calls.push({path:url.pathname,...body});
        if(url.pathname==='/read-video'&&hold&&body.id==='v_b')await new Promise(r=>releases.push(r));
        const data={video_info:{resource_id:body.id==='v_bad'?'stale_resource':body.id,title:'Title '+body.id,course_id:'course_fixture',video_length:100},video_urls:[{url:'/media/'+body.id}],advanced_setup:[]};
        await route.fulfill({json:data});return;
      }
      if(url.pathname.startsWith(prefix)){
        documents++;
        await route.fulfill({contentType:'text/html',body:`<!doctype html><style>
          body{margin:0}.content_header{height:240px;background:#ddd}.catalog{height:160px;overflow:auto}
          .catalog-list{height:700px}.section_item_box{display:block;height:40px}.main_content{min-height:2000px}.panes{display:flex;gap:20px}.native-controls{height:30px}
        </style><script src=/vue.js></script><script src=/router.js></script><div id=app></div><script>
        window.audit={created:[],destroyed:[],reports:[],reads:[],native:[],visibility:0};
        window.bus=new Vue();window.store=Vue.observable({videoInfo:{video_info:{resource_id:location.pathname.split('/').pop(),title:'Initial',course_id:'course_fixture',video_length:100}}});
        const id=()=>location.pathname.split('/').pop();
        const post=async(path,body)=>{audit.reads.push({path,...body});return(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json()};
        const Player=Vue.extend({name:'${playerName}',data(){return{playTime:20,player:{duration:100,currentTime:20,pause(){},off(){},destroy(){audit.destroyed.push(this.id)},id:id()},dotReport:{destroy(){}}}},
          computed:{resourceId(){return id()},videoInfo(){return store.videoInfo}},
          created(){this.onEventBus()},mounted(){this.initVideo();this.addVisibilityChangeEvent()},
          destroyed(){this.player.off()},methods:{initVideo(){audit.created.push({id:this.resourceId,data:this.videoInfo.video_info.resource_id});},
            onEventBus(){bus.$on('sort',()=>this.initLoop())},initLoop(){},
            addVisibilityChangeEvent(){document.addEventListener('visibilitychange',()=>this.handleVideoStudyReport(20))},
            handleVideoStudyReport(p){audit.reports.push({id:this.resourceId,data:this.videoInfo.video_info.resource_id,progress:p})}},
          render(h){return h('div',{class:'native-player'},[h('span',this.resourceId),h('button',{class:'native-controls'},'Native speed/fullscreen')])}});
        const Header=Vue.extend({name:'ContentHeader',created(){this.onEventBus()},methods:{onEventBus(){bus.$on('sort',()=>{})}},render:h=>h(Player)});
        const Row={props:['item'],data(){return{sectionItem:this.item}},methods:{go(){if(this.sectionItem.unlock_state)this.openCatalogTarget('/p/t_pc/course_pc_detail/video/'+this.sectionItem.chapter_id+'?product_id='+this.sectionItem.course_id)},openCatalogTarget(url){audit.native.push(url)}},
          render(h){return h('button',{class:'section_item_box',attrs:{'data-id':this.item.chapter_id},on:{click:this.go}},this.item.chapter_id)}};
        const Catalog={name:'CampProCatalog',data(){return{activeNames:['chapter'],lastStudyResourceId:'v_a',chapterList:[1,2,3],items:['v_a','v_b','v_c','v_locked','v_other','v_bad'].map(id=>({chapter_id:id,resource_type:3,course_id:id==='v_other'?'course_other':'course_fixture',unlock_state:id==='v_locked'?0:1}))}},
          render(h){return h('div',{class:'catalog'},[h('div',{class:'catalog-list'},this.items.map(item=>h(Row,{key:item.chapter_id,props:{item}})))])}};
        const ContentCatalog={name:'ContentCatalog',render:h=>h(Catalog)};
        const Detail={name:'ContentDetail',data(){return{loaded:id()}},render(h){return h('p',{class:'detail'},this.loaded)}};
        const Comments={name:'ContentComments',data(){return{loaded:id()}},render(h){return h('p',{class:'comments'},this.loaded)}};
        const Pane={name:'SsTabPane',props:['name'],render(h){return h('div',this.$slots.default)}};
        const Tabs={name:'ContentSwitchTab',data(){return{active:'content_catelog'}},render(h){return h('div',{class:'content_switch_tab panes'},[
          h('keep-alive',{key:'content_detail'},[h(Pane,{attrs:{name:'content_detail'}},[h(Detail)])]),h('keep-alive',{key:'content_catelog'},[h(Pane,{attrs:{name:'content_catelog'}},[h(ContentCatalog)])]),
          h('keep-alive',{key:'course_comments'},[h(Pane,{attrs:{name:'course_comments'}},[h(Comments)])])])}};
        const Wares={name:'CourseWares',data(){return{loaded:id()}},render(h){return h('p',{class:'wares'},this.loaded)}};
        const Base={name:'CourseBaseLayout',data(){return{currentUrl:location.href,isShowCommonHeader:false,isShowLoading:false,userId:'fixture'}},
          computed:{resourceId(){return id()},videoInfo(){return store.videoInfo}},methods:{
            async initCourseCoreData(){store.videoInfo=await post('/read-video',{id:this.resourceId})},
            async initGoodsInfo(p){await post('/read-goods',{id:p.resource_id})},
            async initMsgCollectData(p){await post('/read-collect',{id:p.resource_id})},
            async initIsPermission(p){await post('/read-permission',{id:p.resource_id})}},
          render(h){return h('div',{class:'course_base_layout'},[h('div',{class:'content_header'},this.$scopedSlots.contentHeader()),h('div',{class:'main_content'},[h(Tabs),h(Wares)])])}};
        const Course={name:'CourseVideo',render(h){return h(Base,{scopedSlots:{contentHeader:()=>[h(Header)]}})}};
        const router=new VueRouter({mode:'history',routes:[{path:'/p/t_pc/course_pc_detail/video/:id',name:'video',component:Course}]});
        window.app=new Vue({router,render:h=>h('div',{attrs:{id:'app'}},[h('router-view')])}).$mount('#app');
        document.addEventListener('visibilitychange',()=>audit.visibility++);
        </script>`});return;
      }
      await route.fulfill({body:''});
    });
    await fixture.goto(origin+prefix+'v_a'+query);await fixture.bringToFront();
    await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation?.active);stage='first switch';
    await fixture.evaluate(()=>{window.initialCatalog=document.querySelector('.catalog');initialCatalog.scrollTop=40;window.scrollTo({top:200,behavior:'instant'});document.documentElement.style.scrollBehavior='smooth'});
    await fixture.locator('[data-id=v_b]').click();
    await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation?.lastResult?.id==='v_b');
    let result=await fixture.evaluate(()=>({id:location.pathname.split('/').pop(),player:document.querySelector('.native-player').innerText,
      same:initialCatalog===document.querySelector('.catalog'),scroll:initialCatalog.scrollTop,pageScroll:scrollY,detail:document.querySelector('.detail').textContent,
      comments:document.querySelector('.comments').textContent,wares:document.querySelector('.wares').textContent,audit}));
    assert(documents===1&&result.same&&result.scroll===40,`Document or catalog was replaced / scrolled: ${JSON.stringify(result)}`);
    assert(result.pageScroll===0,'Catalog navigation did not jump to the player at the top');
    assert(result.player.includes('v_b')&&result.player.includes('Native speed/fullscreen')&&[result.detail,result.comments,result.wares].every(x=>x==='v_b'),`Player or metadata kept old resource: ${JSON.stringify(result)}`);
    assert(result.audit.destroyed.includes('v_a')&&result.audit.reports.every(r=>r.id===r.data),'Old player not disposed or progress crossed resource IDs');
    checks.push('real Vue 2 + MV3: document/catalog identity, native controls, metadata, old-player disposal and progress IDs');
    checks.push('catalog click jumps instantly to the player, preserving inner catalog scroll even with smooth-scroll CSS');
    stage='back/forward';await fixture.evaluate(()=>window.scrollTo({top:350,behavior:'instant'}));await fixture.goBack();
    await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation.lastResult.id==='v_a');
    await fixture.goForward();await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation.lastResult.id==='v_b');
    assert(documents===1,'Back/forward reloaded the document');
    assert(await fixture.evaluate(()=>scrollY>0),'Browser history incorrectly forced the page back to the player');
    checks.push('browser back/forward switch player without reloading or forcing a jump to the top');
    stage='current video click';const readsBefore=calls.filter(c=>c.path==='/read-video').length;
    await fixture.locator('[data-id=v_b]').click();
    await fixture.waitForFunction(()=>scrollY===0&&!globalThis.__xetVideoNavigation.draining);
    assert(calls.filter(c=>c.path==='/read-video').length===readsBefore,'Clicking the current video unnecessarily reloaded it');
    checks.push('clicking the current catalog video also returns to the player without reloading');
    stage='rapid clicks';await fixture.goBack();await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation.lastResult.id==='v_a');
    hold=true;await fixture.locator('[data-id=v_b]').click();
    await fixture.waitForFunction(()=>location.pathname.endsWith('/v_b'));
    await fixture.locator('[data-id=v_c]').click();
    hold=false;releases.splice(0).forEach(r=>r());
    await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation.lastResult.id==='v_c');
    assert(await fixture.evaluate(()=>audit.created.at(-1).id==='v_c'&&audit.created.at(-2).id==='v_a'),'An intermediate skipped video was started');
    assert(await fixture.evaluate(()=>scrollY===0),'Latest queued catalog click did not return to the player');
    checks.push('rapid clicks serialize native reads and start only the latest queued video');
    stage='guards';const nativeBefore=await fixture.evaluate(()=>audit.native.length);
    await fixture.locator('[data-id=v_locked]').click();
    assert(await fixture.evaluate(()=>location.pathname.endsWith('/v_c')&&audit.native.length===0),'Locked video bypassed native gate');
    await fixture.locator('[data-id=v_other]').click();
    await fixture.locator('[data-id=v_a]').click({modifiers:['Control']});
    assert(await fixture.evaluate(()=>audit.native.length)===nativeBefore+2,'Cross-course or modifier click was intercepted');
    await fixture.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    result=await fixture.evaluate(()=>({reports:audit.reports,aux:audit.visibility,listeners:bus._events.sort.length}));
    assert(result.reports.at(-1).id==='v_c'&&result.reports.every(r=>r.id===r.data)&&result.aux>=1,'Stale visibility callback reported a new resource');
    assert(result.listeners<=4,'Repeated switches leaked native event-bus listeners');
    checks.push('locked/cross-course/modifier behavior preserved; stale reports suppressed and managed listeners removed');
    stage='disable';await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!globalThis.__xetVideoNavigation.active);
    await fixture.locator('[data-id=v_a]').click();
    assert(await fixture.evaluate(()=>audit.native.length)===nativeBefore+3,'Disable did not restore native navigation');
    checks.push('disable restores native navigation');
    stage='failed read';await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));
    await fixture.waitForFunction(()=>globalThis.__xetVideoNavigation.active);
    await fixture.locator('[data-id=v_bad]').click();
    await fixture.waitForFunction(()=>location.pathname.endsWith('/v_bad')&&globalThis.audit?.created?.[0]?.id==='v_bad');
    assert(documents===2,'An invalid resource response did not fall back to native document navigation');
    assert(!errors.length,errors.join('; '));checks.push('invalid resource response falls back to a normal page load instead of starting a mismatched player');
    return {checks,documents,errors};
  }catch(e){
    const debug=await fixture.evaluate(()=>({href:location.href,state:globalThis.__xetVideoNavigation&&{active:__xetVideoNavigation.active,hidden:__xetVideoNavigation.hidden,id:__xetVideoNavigation.id,failed:__xetVideoNavigation.failed,result:__xetVideoNavigation.lastResult},audit:window.audit,
      vnodes:(()=>{const out=[];const t=globalThis.__xetVideoNavigation?.base?.$children.find(v=>v.$options.name==='ContentSwitchTab');function walk(n,d){if(!n||d>4)return;out.push({d,tag:n.tag,name:n.componentOptions?.Ctor.options.name,key:String(n.key)});[...(n.children||[]),...(n.componentOptions?.children||[])].forEach(c=>walk(c,d+1))}walk(t?._vnode,0);return out})()}));
    throw Error(stage+': '+e.message+' '+JSON.stringify({debug,documents,errors,calls}));
  }finally{hold=false;releases.splice(0).forEach(r=>r());await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close();}
 };
 return {basic:await verify('BasicVideoPlayer'),legacy:await verify('OldVideoPlayer')};
}
