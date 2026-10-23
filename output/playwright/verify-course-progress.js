async(page)=>{
  const worker=page.context().serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Load the real MV3 extension');
  const origin='https://merchant.pc.xiaoe-tech.com',path='/p/t_pc/course_pc_detail/camp_pro/course_fixture';
  const fixture=await page.context().newPage(),checks=[],errors=[],calls=[];
  const flags={fail:false,delay:false,version:1};const releases=[];let stage='setup';
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  fixture.on('pageerror',e=>errors.push(e.message));fixture.setDefaultTimeout(8000);
  try{
    await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false}));
    await fixture.route(`${origin}/**`,async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='POST'){
        const body=request.postDataJSON();calls.push({path:url.pathname,body});
        const version=flags.version;
        if(flags.delay&&url.pathname==='/fixture/catalog')await new Promise(r=>{releases.push(r)});
        if(flags.fail){await route.fulfill({json:{code:500,data:null}});return;}
        let data;
        if(url.pathname==='/fixture/catalog')data={list:body.p_id==='chapter_one'?
          [{chapter_id:'video_one',study_status:2,learn_progress:version===1?75:88,unlock_state:1,unlock_date:'2026-01-01',chapter_title:'must not replace title'}]:
          [{chapter_id:'chapter_one',study_status:2,learn_progress:100,unlock_state:1,chapter_title:'must not replace title'}]};
        else if(url.pathname==='/fixture/last')data={resource_id:'video_one',resource_type:3,jump_url:'/p/course/video/video_one',last_learn_course_name:'Lesson',sub_course_id:''};
        else if(url.pathname.includes('learning_resource_progress'))data={progress:42,include_elective:0};
        else {await route.fulfill({json:{code:0,data:{}}});return;}
        await route.fulfill({json:{code:0,data}});return;
      }
      await route.fulfill({contentType:'text/html',body:`<!doctype html><style>
        .camp_pro{height:2000px}.catalog-scroll{height:180px;overflow:auto}.rows{height:700px}
      </style><div class=camp_pro><h1>Course</h1><div class=catalog-scroll><div class=rows><span id=lesson>initial</span></div></div></div><script>
      window.APPID='app_fixture';window.nativeReloads=0;window.auxVisible=0;window.saves=0;
      const post=async(path,payload)=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json();
      const chapter={chapter_id:'chapter_one',p_id:'0',study_status:0,learn_progress:0,unlock_state:0,chapter_title:'Original chapter'};
      const lesson={chapter_id:'video_one',p_id:'chapter_one',study_status:0,learn_progress:0,unlock_state:0,chapter_title:'Original lesson'};
      window.child={$options:{},$children:[],chapterItem:chapter,chapterChildren:[lesson],catalogPageSize:50,lastPageSize:1,nextPageSize:1,catalogOrder:'asc',subCourseId:'',isOnlyShowWithRights:false};
      window.catalog={$options:{name:'CampProCatalog'},$children:[child],courseId:'course_fixture',appId:APPID,
        chapterList:[chapter],currentItemPid:0,catalogPageSize:20,lastPageSize:1,nextPageSize:1,order_status:'asc',currentSubCourse:'',isOnlyShowWithRightsValue:false,
        activeNames:['chapter_one'],chapterPage:1,lastStudyResourceId:'old_video',lastStudyData:{},lastStudyPId:'old_chapter',
        apiMap:{getList:p=>post('/fixture/catalog',p),getLearnResource:p=>post('/fixture/last',p)},
        $set(object,key,value){object[key]=value;document.querySelector('#lesson').textContent=lesson.study_status+'/'+lesson.learn_progress},};
      window.owner={$options:{name:'CourseContentCatalog'},$refs:{CampProCatalog:catalog},$children:[catalog],reload(){nativeReloads++;catalog.chapterList=[];catalog.activeNames=[]}};
      window.header={$options:{name:'ContinueStudy'},$children:[],campProCourseInfo:{course_id:'course_fixture'},progerss:0};
      window.root={$options:{name:'CourseCampPro'},$children:[owner,header]};document.querySelector('.camp_pro').__vue__=root;
      window.originalReload=owner.reload;window.originalRows=catalog.chapterList;window.originalLesson=lesson;window.originalNode=document.querySelector('#lesson');
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){owner.reload();auxVisible++}});
      </script>`});
    });
    await fixture.goto(origin+path);await fixture.bringToFront();stage='install';
    await fixture.waitForFunction(()=>typeof globalThis.__xetCourseProgress?.owner?.reload==='function');
    await fixture.evaluate(()=>{window.nativeReloads=0;window.auxVisible=0;window.scrollTo(0,500);document.querySelector('.catalog-scroll').scrollTop=200});
    // Headless Chromium keeps tabs visible; dispatch the same document event
    // through the browser's capture/bubble path to exercise both listeners.
    const returnToTab=()=>fixture.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await returnToTab();stage='initial refresh';
    await fixture.waitForFunction(()=>globalThis.__xetCourseProgress.lastResult?.ok&& !globalThis.__xetCourseProgress.work);
    const result=await fixture.evaluate(()=>({reloads:nativeReloads,aux:auxVisible,status:originalLesson.study_status,progress:originalLesson.learn_progress,
      unlock:originalLesson.unlock_state,total:header.progerss,last:catalog.lastStudyResourceId,pid:catalog.lastStudyPId,
      same:catalog.chapterList===originalRows&&child.chapterChildren[0]===originalLesson&&document.querySelector('#lesson')===originalNode,
      title:originalLesson.chapter_title,active:catalog.activeNames,scroll:scrollY,inner:document.querySelector('.catalog-scroll').scrollTop}));
    assert(result.reloads===0&&result.aux>=1,`Native visibility refresh was not replaced, or other listener blocked: ${JSON.stringify(result)}`);
    assert(result.status===2&&result.progress===75&&result.unlock===1&&result.total===42&&result.last==='video_one'&&result.pid==='chapter_one','Missing partial update');
    assert(result.same&&result.title==='Original lesson'&&result.active.join()==='chapter_one'&&result.scroll===500&&result.inner===200,'UI state or native nodes changed');
    assert(calls.filter(c=>c.path==='/fixture/catalog').length===2,'Did not restrict reads to loaded root and child pages');
    checks.push('real MV3 + document visibility event: progress, completion, unlock and last study update; other visibility listener runs; rows, expansion and both scroll positions preserved');
    flags.fail=true;stage='failure';
    await returnToTab();
    await fixture.waitForFunction(()=>globalThis.__xetCourseProgress.lastResult?.failures>0&&!globalThis.__xetCourseProgress.work);
    assert(await fixture.evaluate(()=>originalLesson.learn_progress===75&&nativeReloads===0&&catalog.chapterList===originalRows),'Failure cleared existing state');
    flags.fail=false;flags.delay=true;flags.version=2;stage='race';
    await returnToTab();
    await fixture.waitForFunction(()=>!!globalThis.__xetCourseProgress.work);
    // A filter/sort change invalidates responses for the previous view.
    await fixture.evaluate(()=>catalog.currentSubCourse='another_subcourse');
    flags.delay=false;releases.splice(0).forEach(r=>r());
    await fixture.waitForFunction(()=>!globalThis.__xetCourseProgress.work);
    assert(await fixture.evaluate(()=>originalLesson.learn_progress===75),'Late result overwrote a different subcourse');
    checks.push('failed reads retain existing data; late responses cannot overwrite another subcourse');
    await fixture.evaluate(()=>owner.reload());
    assert(await fixture.evaluate(()=>nativeReloads===1),'An explicit reload was incorrectly replaced by a quiet read');
    stage='disable';await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!globalThis.__xetCourseProgress.active);
    assert(await fixture.evaluate(()=>owner.reload===originalReload),'Disable did not restore native method');
    await fixture.evaluate(()=>owner.reload());
    assert(await fixture.evaluate(()=>nativeReloads===2),'Manual native reload was lost');
    stage='re-enable';await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));
    await fixture.waitForFunction(()=>globalThis.__xetCourseProgress.active);
    stage='route exit';await fixture.evaluate(()=>history.pushState({},'','/p/t_pc/course_pc_detail/video/other'));
    await fixture.waitForFunction(()=>!globalThis.__xetCourseProgress.active);
    assert(await fixture.evaluate(()=>owner.reload===originalReload),'Route exit did not restore native method');
    assert(!errors.length,errors.join('; '));checks.push('site disable/re-enable and SPA cleanup restore native reload');
    return {checks,errors};
  }catch(error){
    const state=await fixture.evaluate(()=>({installed:!!globalThis.__xetCourseProgress,active:globalThis.__xetCourseProgress?.active,
      work:!!globalThis.__xetCourseProgress?.work,result:globalThis.__xetCourseProgress?.lastResult,visibility:document.visibilityState,
      nativeReloads:window.nativeReloads,aux:window.auxVisible,modules:Object.keys(globalThis.__xetPlayerHelperModules||{})}));
    throw Error(`${stage}: ${error.message}; ${JSON.stringify({state,calls,errors})}`);
  }finally{flags.delay=false;releases.splice(0).forEach(r=>r());await worker.evaluate(()=>chrome.storage.local.set({disabledSites:[]}));await fixture.close();}
}
