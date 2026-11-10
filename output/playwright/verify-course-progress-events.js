async(page)=>{
  const context=page.context(),worker=context.serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Real MV3 extension required');
  const origin='https://progress-events.pc.xiaoe-tech.com',results=[];
  for(const build of [{version:'2.7.16',file:'vue.js'},{version:'2.7.16',file:'vue.min.js'},{version:'2.6.14',file:'vue.min.js'}]){
  const vueVersion=build.version,production=build.file==='vue.min.js';
  const vue=await(await fetch('https://cdn.jsdelivr.net/npm/vue@'+vueVersion+'/dist/'+build.file)).text();
  const scenarios=[
    {kind:'camp_pro',query:'',course:'course_fixture'},
    {kind:'video',query:'?product_id=course_fixture',course:'course_fixture'},
    {kind:'audio',query:'?pro_id=course_fixture',course:'course_fixture'},
    {kind:'document',query:'',course:'course_fixture'},
    {kind:'image_text',query:'?parent_pro_id=course_fixture&product_id=p_nested',course:'course_fixture'},
    {kind:'document',query:'?product_id=c_fixture',course:'c_fixture'},
    ...['camp','member','column','big_column','no_permission','middle_page'].map(kind=>({kind,query:'',unsupported:true,course:'course_fixture'})),
    {kind:'video',query:'?product_id=course_other',course:'course_fixture',mismatch:true},
    {kind:'video',query:'?product_id=course_fixture',course:'course_fixture',quanzi:true},
  ];
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  for(const scenario of scenarios){
    const {kind,course,query,unsupported,mismatch,quanzi}=scenario;
    const path='/p/t_pc/course_pc_detail/'+kind+'/'+(kind==='camp_pro'?course:'resource_fixture')+(kind==='no_permission'?'/51':'')+query;
    const fixture=await context.newPage(),calls=[],errors=[],checks=[],releases=[];
    const flags={hold:false,progress:30,fail:false};let previewLoads=0,documents=0,stage='setup';
    fixture.setDefaultTimeout(10000);fixture.on('pageerror',error=>errors.push(error.message));
    try{
      await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
      await fixture.route(origin+'/**',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.pathname==='/vue.js'){await route.fulfill({contentType:'text/javascript',body:vue});return;}
        if(url.pathname==='/preview'){
          previewLoads++;await route.fulfill({contentType:'text/html',body:'<body style="height:3000px">Document preview</body>'});return;
        }
        if(request.method()==='POST'){
          const body=request.postDataJSON();calls.push({path:url.pathname,body});const progress=flags.progress;
          if(flags.hold&&url.pathname==='/catalog')await new Promise(resolve=>releases.push(resolve));
          if(flags.fail&&url.pathname!=='/report'){await route.fulfill({json:{code:500}});return;}
          const data=url.pathname==='/catalog'?{...(flags.serverPermission===undefined?{}:{available:flags.serverPermission?1:0,subscribe:1}),list:[{chapter_id:'lesson',p_id:'0',study_status:2,learn_progress:progress,unlock_state:1}]}:
            url.pathname==='/last'?{resource_id:'lesson',resource_type:51}:{};
          await route.fulfill({json:{code:0,data}});return;
        }
        documents++;
        await route.fulfill({contentType:'text/html',body:`<!doctype html><style>
          body{margin:0}.reading{height:1100px}iframe{height:200px;width:400px}.catalog{height:130px;overflow:auto}.rows{height:600px}
        </style><script src=/vue.js></script><div id=app></div><script>
          window.audit={native:[],reports:0,events:0,aux:0,mediaCalls:0,created:0,destroyed:0};
          window.bus=new Vue();window.originalEmit=Vue.prototype.$emit;
          window.model=Vue.observable({permission:true});
          const course=${JSON.stringify(course)};
          const post=async(path,data)=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
          const Catalog={name:${JSON.stringify(unsupported?({camp:'CampCatalog',member:'MemberCatalog',column:'ColumnCatalog',big_column:'BigColumnCatalog'}[kind]||'OtherCatalog'):'CampProCatalog')},props:['reloadSwitch'],
            data(){return{courseId:course,appId:'fixture',chapterList:[{chapter_id:'lesson',p_id:'0',chapter_title:'Original',study_status:0,learn_progress:0,unlock_state:0}],
              catalogPageSize:50,lastPageSize:1,nextPageSize:1,currentItemPid:0,order_status:'asc',currentSubCourse:'',isOnlyShowWithRightsValue:false,
              activeNames:['chapter'],isSearchShow:false,isPermission:true,isAvailable:true,isQuanzi:${Boolean(quanzi)},community_id:'community_fixture',
              apiMap:{getList:p=>post('/catalog',p),getLearnResource:p=>post('/last',p)}}},
            watch:{reloadSwitch(){this.nativeReset('progress')}},
            methods:{nativeReset(reason){audit.native.push(reason);this.activeNames=[]},sort(){audit.native.push('sort')},filter(){audit.native.push('filter')},unlock(){audit.native.push('unlock')}},
            render(h){return h('div',{class:'catalog'},[h('div',{class:'rows'},this.chapterList.map(row=>h('span',{key:row.chapter_id,attrs:{id:'lesson'}},row.chapter_title+':'+row.learn_progress)))])}};
          const Owner={name:'CourseContentCatalog',props:['reloadSwitch'],computed:{courseInfo(){return{resource_type:${unsupported?5:50},resource_id:course,goods_status:5}},isHasPermission(){return model.permission}},
            methods:{reload(){audit.native.push('owner');this.$refs.CampProCatalog?.nativeReset('owner-reset')}},
            render(h){return h(Catalog,{ref:${JSON.stringify(unsupported?'OtherCatalog':'CampProCatalog')},props:{reloadSwitch:this.reloadSwitch}})}};
          const Outer={name:'ContentCatalog',data(){return{reloadSwitch:0,isSearchActive:false,generation:0}},computed:{courseInformation(){return{resource_type:${unsupported?5:50},resource_id:course}},isPermission(){return model.permission}},
            created(){bus.$on('catalogRefresh',this.onCatalogRefresh)},beforeDestroy(){bus.$off('catalogRefresh',this.onCatalogRefresh)},
            mounted(){this.visibility=()=>{if(document.visibilityState==='visible'){${kind==='video'?'setTimeout(()=>this.$refs.courseContentCatalog.reload(),0)':'this.$refs.courseContentCatalog.reload()'};audit.aux++}};document.addEventListener('visibilitychange',this.visibility)},
            destroyed(){document.removeEventListener('visibilitychange',this.visibility)},
            methods:{onCatalogRefresh(){this.reloadSwitch=this.reloadSwitch?0:1}},
            render(h){return h(Owner,{key:this.generation,ref:'courseContentCatalog',props:{reloadSwitch:this.reloadSwitch}})}};
          const Reading={name:'ReadingContent',mounted(){audit.created++},destroyed(){audit.destroyed++},
            methods:{async complete(){await post('/report',{resource_id:'resource_fixture'});audit.reports++;setTimeout(()=>bus.$emit('catalogRefresh'),5)}},
            render(h){return h('div',{class:'reading'},[h('button',{attrs:{id:'complete'},on:{click:this.complete}},'Complete'),h('iframe',{attrs:{id:'preview',src:'/preview'}}),h('audio',{attrs:{id:'media',preload:'none'}})])}};
          const Base={name:'CourseBaseLayout',data(){return{userId:'account_fixture'}},render:h=>h('div',{attrs:{id:'app'}},[h(Reading),h(Outer)])};
          window.app=new Vue({render:h=>h(Base)}).$mount('#app');
          bus.$on('catalogRefresh',()=>audit.events++);
          window.inspect=()=>{const a=[],q=[app];for(let i=0;i<q.length;i++){a.push(q[i]);q.push(...q[i].$children)}return a};
          window.getCatalog=()=>inspect().find(v=>['CampProCatalog','MemberCatalog','CampCatalog','ColumnCatalog','BigColumnCatalog','OtherCatalog'].includes(v.$options.name));
          window.getOuter=()=>inspect().find(v=>v.$options.name==='ContentCatalog');
          window.getOwner=()=>inspect().find(v=>v.$options.name==='CourseContentCatalog');
        </script>`});
      });
      await fixture.goto(origin+path);await fixture.bringToFront();
      assert(await fixture.evaluate(version=>Vue.version===version,vueVersion),'Wrong Vue version loaded');
      if(unsupported||mismatch||quanzi){
        // Exercise the installed worker's resolver explicitly, so rejection
        // cannot pass merely because the content controller has not run yet.
        const install=await worker.evaluate(async({origin,path})=>{
          const [tab]=await chrome.tabs.query({url:origin+'/*'}),url=origin+path;
          return globalThis.XetCourseProgressSource.resolve({path:new URL(url).pathname,url},{tab,frameId:0,url},
            {siteAccess:globalThis.XetSiteAccess,readSettings:async()=>chrome.storage.local.get({disabledSites:[]})});
        },{origin,path});
        assert(!install.ok,'Unsupported fixture passed the installed worker adapter');
        await fixture.waitForFunction(()=>document.querySelector('#preview')?.contentDocument?.body?.scrollHeight>1000);
        await fixture.evaluate(async()=>{document.dispatchEvent(new Event('visibilitychange'));bus.$emit('catalogRefresh');await Vue.nextTick()});
        assert(await fixture.evaluate(()=>!window.__xetCourseProgress?.active&&audit.native.includes('progress')&&Vue.prototype.$emit===originalEmit),'Unsupported catalog was intercepted');
        assert(!calls.length,'Unsupported page made progress queries');
        results.push({vueVersion,production,kind,query,quanzi:!!quanzi,checks:['unsupported directory/route, social API environment or mismatched parent keeps native behavior and makes no progress reads'],errors});
        continue;
      }
      stage='install';await fixture.waitForFunction(()=>window.__xetCourseProgress?.active);
      assert(await fixture.evaluate(()=>window.__xetCourseProgress.progressWatcherPatched),'Dedicated progress watcher was not patched');
      if(production)assert(await fixture.evaluate(()=>[...(getCatalog()._watchers||[]),...(getCatalog()._scope?.effects||[])].filter(w=>w.user).every(w=>!w.expression)), 'Production test did not erase watcher debug expressions');
      await fixture.evaluate(()=>{
        const catalog=getCatalog();window.saved={catalog,rows:catalog.chapterList,row:catalog.chapterList[0],node:document.querySelector('#lesson'),frame:document.querySelector('#preview'),media:document.querySelector('#media')};
        saved.media.pause=()=>audit.mediaCalls++;saved.media.play=()=>{audit.mediaCalls++;return Promise.resolve()};saved.media.load=()=>audit.mediaCalls++;
        window.scrollTo(0,300);document.querySelector('.catalog').scrollTop=150;saved.frame.contentWindow.scrollTo(0,450);
      });
      stage='completion';await fixture.locator('#complete').evaluate(el=>el.click());
      await fixture.waitForFunction(()=>window.__xetCourseProgress.lastResult?.reason==='progress'&&!window.__xetCourseProgress.work);
      let state=await fixture.evaluate(()=>({audit,same:saved.catalog===getCatalog()&&saved.rows===getCatalog().chapterList&&saved.row===getCatalog().chapterList[0]&&saved.node===document.querySelector('#lesson')&&saved.frame===document.querySelector('#preview')&&saved.media===document.querySelector('#media'),
        progress:saved.row.learn_progress,expanded:getCatalog().activeNames.join(),scroll:scrollY,inner:document.querySelector('.catalog').scrollTop,frame:saved.frame.contentWindow.scrollY,originalBus:Vue.prototype.$emit===originalEmit}));
      assert(state.audit.reports===1&&state.audit.events===1&&state.audit.native.length===0,'Report/event flow was lost or completion rebuilt catalog: '+JSON.stringify(state));
      assert(state.same&&state.progress===30&&state.expanded==='chapter'&&state.scroll===300&&state.inner===150&&state.frame===450&&state.audit.mediaCalls===0&&state.originalBus,'Content, preview, media or scrolling changed');
      assert(previewLoads===1&&documents===1,'Preview or document reloaded');
      assert(calls.find(c=>c.path==='/catalog')?.body.community_id==='community_fixture','Catalog context omitted community id');
      checks.push('real Vue 2 watcher: asynchronous completion/report and other event listeners preserved; catalog, reading iframe, media and scroll identities unchanged');
      stage='unchanged visibility';
      await fixture.evaluate(()=>{window.lastStudyIdentity=getCatalog().lastStudyData;document.dispatchEvent(new Event('visibilitychange'))});
      await fixture.waitForFunction(()=>!window.__xetCourseProgress.work&&!window.__xetCourseProgress.visibilityDispatch);
      assert(await fixture.evaluate(()=>getCatalog().lastStudyData===lastStudyIdentity&&audit.native.length===0),'An unchanged response still invalidated native descendants');
      checks.push('identical tab-return responses retain last-study object identity');
      stage='search';flags.progress=55;
      await fixture.evaluate(async()=>{getCatalog().isSearchShow=true;getOuter().isSearchActive=true;await Vue.nextTick();bus.$emit('catalogRefresh');await Vue.nextTick();document.dispatchEvent(new Event('visibilitychange'))});
      await fixture.waitForFunction(()=>!window.__xetCourseProgress.visibilityDispatch);
      assert(await fixture.evaluate(()=>window.__xetCourseProgress.progressPending&&audit.native.length===0&&saved.row.learn_progress===30),'Automatic refresh destroyed search');
      await fixture.evaluate(()=>{getCatalog().isSearchShow=false;getOuter().isSearchActive=false});
      await fixture.waitForFunction(()=>saved.row.learn_progress===55&&!window.__xetCourseProgress.work);
      checks.push('search preserved; pending progress applied immediately after search closes');
      stage='in-flight completion';flags.hold=true;flags.progress=65;
      const before=calls.filter(c=>c.path==='/catalog').length;
      await fixture.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      await fixture.waitForFunction(()=>!!window.__xetCourseProgress.work);
      await fixture.locator('#complete').evaluate(el=>el.click());
      await fixture.waitForFunction(()=>window.__xetCourseProgress.progressPending);
      flags.hold=false;flags.progress=80;releases.splice(0).forEach(resolve=>resolve());
      await fixture.waitForFunction(()=>saved.row.learn_progress===80&&!window.__xetCourseProgress.work&&!window.__xetCourseProgress.progressPending);
      assert(calls.filter(c=>c.path==='/catalog').length===before+2,'In-flight completion was lost or repeatedly re-queried');
      checks.push('completion during an in-flight read requests exactly one trailing update');
      stage='failed query';flags.fail=true;
      await fixture.evaluate(()=>bus.$emit('catalogRefresh'));
      await fixture.waitForFunction(()=>window.__xetCourseProgress.lastResult?.failures>0&&!window.__xetCourseProgress.work);
      assert(await fixture.evaluate(()=>saved.row.learn_progress===80&&audit.native.length===0&&getCatalog().activeNames.join()==='chapter'),'Failure cleared existing view');
      flags.fail=false;
      stage='server permission change';flags.serverPermission=false;
      await fixture.evaluate(()=>bus.$emit('catalogRefresh'));
      await fixture.waitForFunction(()=>window.__xetCourseProgress.lastResult?.native&&!window.__xetCourseProgress.work);
      assert(await fixture.evaluate(()=>audit.native.includes('owner')),'Server access change did not delegate to native validation');
      flags.serverPermission=undefined;
      checks.push('server-side access changes trigger native catalog validation without reloading reading content');
      stage='native actions';
      await fixture.evaluate(()=>{getOwner().reload();getCatalog().sort();getCatalog().filter();getCatalog().unlock()});
      assert(await fixture.evaluate(()=>['owner','sort','filter','unlock'].every(x=>audit.native.includes(x))),'An explicit action was blocked');
      stage='catalog remount';
      const previousResets=await fixture.evaluate(()=>audit.native.length);
      await fixture.evaluate(()=>getOuter().generation++);
      await fixture.waitForFunction(()=>window.__xetCourseProgress.active&&window.__xetCourseProgress.catalog===getCatalog()&&getCatalog()!==saved.catalog,null,{timeout:2000});
      await fixture.evaluate(()=>bus.$emit('catalogRefresh'));
      await fixture.waitForFunction(()=>getCatalog().chapterList[0].learn_progress===80&&!window.__xetCourseProgress.work);
      assert(await fixture.evaluate(count=>audit.native.length===count&&document.querySelector('#preview')===saved.frame&&document.querySelector('#media')===saved.media&&audit.created===1&&audit.destroyed===0,previousResets),'Remount lost the progress guard or rebuilt reading content');
      checks.push('native catalog remount reconnects without the five-second polling delay; reading content stays mounted');
      stage='permission change';
      await fixture.evaluate(async()=>{model.permission=false;await Vue.nextTick();bus.$emit('catalogRefresh');await Vue.nextTick()});
      assert(await fixture.evaluate(()=>audit.native.includes('progress')),'Permission change incorrectly used quiet progress-only refresh');
      checks.push('read failures preserve data; manual actions and permission changes keep native refresh');
      stage='disable';await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
      await fixture.waitForFunction(()=>!window.__xetCourseProgress.active);
      const resets=await fixture.evaluate(()=>audit.native.filter(x=>x==='progress').length);
      await fixture.evaluate(()=>bus.$emit('catalogRefresh'));
      await fixture.waitForFunction(n=>audit.native.filter(x=>x==='progress').length===n+1,resets);
      assert(await fixture.evaluate(()=>Vue.prototype.$emit===originalEmit),'Native event bus was modified');
      assert(!errors.length,errors.join('; '));checks.push('disable restores the native watcher, event bus untouched');
      results.push({vueVersion,production,kind,query,checks,errors});
    }catch(error){
      const debug=await fixture.evaluate(()=>({active:window.__xetCourseProgress?.active,result:window.__xetCourseProgress?.lastResult,watchers:getCatalog?.()?._scope?.effects?.filter(w=>w.user).map(w=>w.expression),audit:window.audit}));
      throw Error(kind+' '+query+' '+stage+': '+error.message+' '+JSON.stringify({debug,calls,errors}));
    }finally{
      flags.hold=false;releases.splice(0).forEach(resolve=>resolve());
      await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close();
    }
  }
  }
  return results;
}
