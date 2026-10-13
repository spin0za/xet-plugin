async (page) => {
  // An isolated MV3 profile and Vue 2 keyed cards reproduce the real site.
  // All practice endpoints and management actions below are local fixtures.
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw new Error('Load the unpacked extension in an isolated profile');
  const origin = 'https://merchant.pc.xiaoe-tech.com';
  const source = 'wb_course_order_fixture', task = 'pt_order_fixture';
  const cacheKey = `xetQuestionOrder:${origin}|${source}|${task}`;
  const conflictKey = `xetQuestionOrder:${origin}|${source}|pt_conflict_fixture`;
  const retained = Object.fromEntries(Array.from({length:50},(_,i)=>[
    `xetQuestionOrder:https://prior-${i}.pc.xiaoe-tech.com|wb_course_prior_${i}|pt_prior_${i}`,
    {version:1,ids:[`qs_prior_${i}`],savedAt:i+1},
  ]));
  const bookPath = `/p/t_pc/pc_evaluation/errbook/detail/123?tab=1&source_id=${source}`;
  const practicePath = `/p/t_pc/pc_evaluation/practice_analysis/${source}?join_id=uwb_order_fixture&task_id=${task}`;
  const wrong = [41,24,9,14,15,17,18,20,27,38,28,29,30,33,35,36,5];
  const expected = [...wrong].sort((a,b) => a-b);
  const fixture = await context.newPage();
  const errors = [], requests = [], readinessMs = [];
  let stage = 'initial fallback';
  fixture.on('pageerror', error => errors.push(error.message));
  const vue = await (await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  let random = 1, fail = false, count = 41;
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#eee;font:16px sans-serif}.errbook-detail-page{max-width:1000px;margin:20px auto}
    .question-card{padding:20px;margin:12px 0;background:white;border-radius:12px;cursor:pointer}
    .card-meta{color:#999;margin-top:8px}.type-tag{color:#1677ff}button{margin:6px;padding:8px}
    </style><div id=app></div><script>${vue}</script><script>
    const originalWrong=${JSON.stringify(wrong)};
    const make=n=>({id:'qs_'+n,task_id:'${task}',content:'Question '+n,checked:false,answer:'do-not-store-answer'});
    const query=new URLSearchParams(location.search);
    const book=location.pathname.includes('/errbook/detail/');
    const practiceClass=location.pathname.includes('practice_sheet')?'practice-sheet':'practice-analysis';
    window.clicked=null;window.deleted=[];
    window.vm=new Vue({el:'#app',data:{resourceId:'${source}',sourceId:'${source}',join_id:query.get('join_id')||'uwb_order_fixture',
      taskId:'${task}',classifyId:'123',currentTab:Number(query.get('tab')||1),loading:query.has('delayed'),searchText:'',manageMode:false,
      questionList:originalWrong.map(make),practiceList:[],totalPracticeNum:41},
      methods:{manage(){this.manageMode=!this.manageMode;this.questionList=this.questionList.map(q=>({...q,checked:false}))},
        search(){this.questionList=originalWrong.filter(n=>('Question '+n).includes(this.searchText)).map(make)},
        onQuestionClick(q,i){if(this.manageMode){this.$set(this.questionList,i,{...q,checked:!q.checked})}else clicked={id:q.id,index:i}},
        remove(){deleted=this.questionList.filter(q=>q.checked).map(q=>q.id);this.questionList=this.questionList.filter(q=>!q.checked)}},
      template:book?'<div class="errbook-detail-page"><input id="search" v-model="searchText" @input="search"><button id="manage" @click="manage">Manage</button><button id="delete" @click="remove">Delete fixture selections</button><div class="question-list"><div v-for="(q,i) in questionList" :key="q.id" class="question-card" :data-fixture-id="q.id" @click="onQuestionClick(q,i)"><div class="card-body"><div class="card-content">{{q.content}}</div><div class="card-meta"><span class="type-tag">单选题</span> 最近错误：2026-10-10</div></div></div></div></div>':
        '<div class="'+practiceClass+'">Original practice fixture</div>'});
    </script>`;
  // Include extension-created helper tabs; page-only routes would let their
  // dummy merchant requests escape the fixture and leave jobs behind.
  await context.route(`${origin}/**`, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const path = new URL(request.url()).pathname;
      requests.push({path, payload:request.postDataJSON()});
      if (fail) return route.fulfill({status:503,body:'offline'});
      if (path === '/xe.practice.bff/task/answer.config.get/1.0.0') return route.fulfill({json:{code:0,data:{random_setting:random,task_total_qs:count}}});
      if (path === '/evaluation_wechat/practices/commit_record') return route.fulfill({json:{code:0,data:{list:Array.from({length:count},(_,i)=>({id:'qs_'+(i+1),answer:'do-not-store-answer'}))}}});
      throw new Error(`Unexpected endpoint: ${path}`);
    }
    return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
  });
  const displayed = () => fixture.locator('.question-card').evaluateAll(cards => cards.map(c=>Number(c.dataset.fixtureId.slice(3))));
  const waitOrder = async values => {
    await fixture.waitForFunction(values => JSON.stringify([...document.querySelectorAll('.question-card')].map(c=>Number(c.dataset.fixtureId.slice(3))))===JSON.stringify(values),values);
  };
  const readCache = () => worker.evaluate(async key => (await chrome.storage.local.get(key))[key],cacheKey);
  const checkRetention = async () => {
    const stored=await worker.evaluate(()=>chrome.storage.local.get(null));
    for(const [key,value] of Object.entries(retained)) {
      const record=stored[key];
      if(record?.version!==value.version || record?.savedAt!==value.savedAt ||
        JSON.stringify(record?.ids)!==JSON.stringify(value.ids))throw new Error('Previously saved numbering was evicted or changed');
    }
    if(Object.keys(stored).filter(key=>key.startsWith('xetQuestionOrder:')).length!==51)throw new Error('Recapture created duplicate numbering mappings');
  };
  const disable = async disabled => worker.evaluate(({origin,disabled}) => chrome.storage.local.set({disabledSites:disabled?[origin]:[]}),{origin,disabled});
  const measureReady = action => fixture.evaluate(action => new Promise((resolve, reject) => {
    const start = performance.now();
    const finish = () => {
      if (document.querySelectorAll('[data-xet-original-question-number]').length === 17) {
        observer.disconnect(); clearTimeout(timeout); resolve(performance.now() - start);
      }
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.body, {childList:true,subtree:true});
    const timeout = setTimeout(() => {observer.disconnect();reject(new Error('Ready page did not show cached numbering within 1 second'));},1000);
    if (action === 'loading') vm.loading = false; // Deliberately absent from the template: no DOM signal.
    else history.back();
  }),action);
  try {
    await worker.evaluate(async ({cacheKey,retained}) => { await chrome.storage.local.remove(cacheKey); await chrome.storage.local.set({...retained,disabledSites:[],keepAliveEnabled:false,questionOrderStrategy:'tabs'}); },{cacheKey,retained});
    await fixture.goto(origin+bookPath);
    await fixture.locator('.xet-question-order-hint').waitFor({timeout:10000});
    if (JSON.stringify(await displayed())!==JSON.stringify(wrong) || await fixture.locator('[data-xet-original-question-number]').count()) throw new Error('Missing mappings fabricated an ordinal');
    random = 0;
    await fixture.goto(origin+practicePath);
    stage = 'capture original analysis';
    await worker.evaluate(async key => {for(let i=0;i<100;i++){if((await chrome.storage.local.get(key))[key])return;await new Promise(r=>setTimeout(r,100));}throw new Error('Original numbering not captured');},cacheKey);
    const saved=await readCache();
    if(saved.ids.length!==41 || JSON.stringify(saved).includes('answer')) throw new Error('Stored more than question identity metadata');
    await checkRetention();
    const cachedVisits = [];
    for (const path of [practicePath.replace('uwb_order_fixture','uwb_another_attempt'),
      practicePath.replace('practice_analysis','practice_sheet')]) {
      stage = 'cached manual practice/analysis visit';
      const before = requests.length;
      await fixture.goto(origin+path);
      await fixture.waitForFunction(()=>window.__xetQuestionOrderReadiness?.instance===vm);
      // Give an erroneously repeated extraction time to reach the mock API.
      await fixture.waitForTimeout(250);
      cachedVisits.push(requests.length-before);
      if (requests.length!==before || JSON.stringify(await readCache())!==JSON.stringify(saved)) {
        throw new Error('Cached manual visit repeated extraction or rewrote the mapping');
      }
    }
    stage = 'reactive readiness without a DOM mutation';
    await fixture.goto(origin+bookPath+'&delayed=1');
    await fixture.waitForFunction(()=>window.__xetQuestionOrderReadiness?.instance===vm);
    if(await fixture.locator('[data-xet-original-question-number]').count())throw new Error('Numbered an unready page');
    readinessMs.push(await measureReady('loading'));
    await waitOrder(expected);
    stage = 'history-back readiness';
    await fixture.evaluate(()=>{
      history.pushState({},'','/p/t_pc/course_pc_detail/video/fixture');dispatchEvent(new PopStateEvent('popstate'));
    });
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-original-question-number]'));
    if(await fixture.evaluate(()=>Boolean(window.__xetQuestionOrderReadiness)))throw new Error('Readiness watcher leaked outside its route');
    readinessMs.push(await measureReady('back'));
    await waitOrder(expected);
    await fixture.goto(origin+bookPath);
    stage = 'restore original order';
    await waitOrder(expected);
    await fixture.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===17);
    const labels=await fixture.locator('[data-xet-original-question-number]').allTextContents();
    if(JSON.stringify(labels)!==JSON.stringify(expected.map(n=>`${n}.`)))throw new Error('Original question-number gaps were lost');
    stage = 'missing task metadata';
    await fixture.evaluate(()=>vm.questionList.unshift(...[3,2].map(n=>({id:'qs_'+n,task_id:'',content:'Question '+n,checked:false}))));
    await waitOrder([2,3,...expected]);
    await fixture.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===19);
    if(await fixture.locator('[data-fixture-id=qs_2] [data-xet-original-question-number]').innerText()!=='2.')throw new Error('Missing task ID did not recover its number');
    if(await fixture.locator('.xet-question-order-hint').count())throw new Error('Resolved metadata still showed missing-number hint');
    await fixture.locator('[data-fixture-id=qs_2]').click();
    if(JSON.stringify(await fixture.evaluate(()=>clicked))!==JSON.stringify({id:'qs_2',index:1}))throw new Error('Fallback sorting broke native click identity');
    await fixture.locator('#manage').click();
    await waitOrder([2,3,...expected]);
    await fixture.locator('[data-fixture-id=qs_2]').click();
    if(JSON.stringify(await fixture.evaluate(()=>vm.questionList.filter(q=>q.checked).map(q=>q.id)))!==JSON.stringify(['qs_2']))throw new Error('Fallback sorting broke management selection');
    stage = 'ambiguous taskless mapping';
    await worker.evaluate(({key})=>chrome.storage.local.set({[key]:{version:1,
      ids:Array.from({length:41},(_,i)=>'qs_'+(i===1?3:i===2?2:i+1)),savedAt:1}}),{key:conflictKey});
    await waitOrder([3,2,...wrong]);
    await fixture.locator('.xet-question-order-hint').waitFor();
    if(await fixture.locator('[data-fixture-id=qs_2] [data-xet-original-question-number], [data-fixture-id=qs_3] [data-xet-original-question-number]').count())throw new Error('Ambiguous taskless number was guessed');
    await worker.evaluate(key=>chrome.storage.local.remove(key),conflictKey);
    await waitOrder([2,3,...expected]);
    await disable(true);
    await waitOrder([3,2,...wrong]);
    await fixture.goto(origin+bookPath);
    await disable(false);
    await waitOrder(expected);
    await fixture.locator('.question-card').first().click();
    if((await fixture.evaluate(()=>clicked)).id!=='qs_5')throw new Error('Sorted card opened another question');
    await fixture.locator('#manage').click();
    stage = 'manage mode';
    await waitOrder(expected);
    await fixture.locator('[data-fixture-id=qs_5]').click();
    if(JSON.stringify(await fixture.evaluate(()=>vm.questionList.filter(q=>q.checked).map(q=>q.id)))!==JSON.stringify(['qs_5']))throw new Error('Sorted management selected the wrong native index');
    await fixture.locator('#search').fill('Question 4');
    stage = 'search';
    await waitOrder([41]);
    if(await fixture.locator('[data-xet-original-question-number]').innerText()!=='41.')throw new Error('Search renumbered the result');
    await fixture.locator('#search').fill('');
    stage = 'clear search';
    await waitOrder(expected);
    await fixture.locator('[data-fixture-id=qs_5]').click();
    await fixture.locator('#delete').click();
    stage = 'fixture deletion';
    await waitOrder(expected.filter(n=>n!==5));
    if(JSON.stringify(await fixture.evaluate(()=>deleted))!==JSON.stringify(['qs_5']))throw new Error('Fixture deletion targeted the wrong question');
    await disable(true);
    stage = 'disable restoration';
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-original-question-number]'));
    if(await fixture.evaluate(()=>Boolean(window.__xetQuestionOrderReadiness)))throw new Error('Site disable did not remove the Vue readiness watcher');
    await waitOrder(wrong.filter(n=>n!==5));
    if(await fixture.locator('[data-xet-question-order-id],.xet-question-order-hint').count())throw new Error('Disable did not clean up metadata and hints');
    await disable(false);
    stage = 'reenable';
    await waitOrder(expected.filter(n=>n!==5));
    await fixture.evaluate(()=>vm.questionList.push({id:'qs_999',task_id:vm.taskId,content:'Unmatched question',checked:false}));
    await fixture.locator('.xet-question-order-hint').waitFor();
    if(await fixture.locator('[data-fixture-id=qs_999] [data-xet-original-question-number]').count())throw new Error('Unknown question got a guessed number');
    await fixture.goto(origin+bookPath.replace('tab=1','tab=2'));
    await fixture.waitForTimeout(300);
    if(await fixture.locator('[data-xet-original-question-number],.xet-question-order-hint').count())throw new Error('Unrelated error-book tabs modified');
    random=1;
    stage = 'random practice';
    // Cached fixed mappings intentionally bypass network revalidation. A fresh
    // uncached random practice must still refuse to persist attempt ordinals.
    await worker.evaluate(key=>chrome.storage.local.remove(key),cacheKey);
    await fixture.goto(origin+practicePath);
    await worker.evaluate(async key=>{for(let i=0;i<100;i++){if(!(await chrome.storage.local.get(key))[key])return;await new Promise(r=>setTimeout(r,100));}throw new Error('Random practice retained fixed ordinals');},cacheKey);
    await fixture.goto(origin+bookPath);
    await fixture.locator('.xet-question-order-hint').waitFor();
    await waitOrder(wrong);
    random=0;
    stage = 'practice-sheet capture';
    await fixture.goto(origin+practicePath.replace('practice_analysis','practice_sheet'));
    await worker.evaluate(async key=>{for(let i=0;i<100;i++){if((await chrome.storage.local.get(key))[key])return;await new Promise(r=>setTimeout(r,100));}throw new Error('Practice-sheet capture failed');},cacheKey);
    stage = 'batched rendering with native deletion';
    count=60;
    await worker.evaluate(key=>chrome.storage.local.remove(key),cacheKey);
    await fixture.goto(origin+practicePath);
    await worker.evaluate(async key=>{for(let i=0;i<100;i++){if((await chrome.storage.local.get(key))[key]?.ids.length===60)return;await new Promise(r=>setTimeout(r,100));}throw new Error('Updated numbering was not captured');},cacheKey);
    await checkRetention();
    await fixture.goto(origin+bookPath);
    await waitOrder(expected);
    await fixture.evaluate(()=>{
      const watcher=new MutationObserver(()=>{
        if(document.querySelectorAll('[data-xet-original-question-number]').length>=20){
          watcher.disconnect();vm.questionList.pop();
        }
      });
      watcher.observe(document.querySelector('.question-list'),{childList:true,subtree:true});
      vm.questionList.push(...Array.from({length:19},(_,i)=>({id:'qs_'+(i+42),task_id:vm.taskId,content:'More questions',checked:false})));
    });
    await waitOrder([...expected,...Array.from({length:18},(_,i)=>i+42)]);
    await fixture.waitForFunction(()=>document.querySelectorAll('[data-xet-original-question-number]').length===35);
    if(await fixture.locator('[data-fixture-id=qs_60]').count())throw new Error('Batched render resurrected a deleted native card');
    stage = 'network failure fallback';
    fail=true;
    await worker.evaluate(key=>chrome.storage.local.remove(key),cacheKey);
    await fixture.goto(origin+practicePath);
    await fixture.waitForTimeout(300);
    await fixture.goto(origin+bookPath);
    await fixture.locator('.xet-question-order-hint').waitFor();
    await waitOrder(wrong);
    if(await fixture.locator('[data-xet-original-question-number]').count())throw new Error('Failed read generated guessed numbers');
    if(requests.some(r=>!/answer.config.get|commit_record/.test(r.path)))throw new Error('Mutating endpoint requested');
    if(errors.length)throw new Error(errors.join('\n'));
    return {passed:true,cachedVisits,readinessMs,originalNumbers:expected,verified:['real Vue 2 keyed cards','cached manual practice and analysis skip requests and writes','immediate reactive readiness without a DOM mutation','immediate history-back restoration','readiness watcher cleanup','first-visit fallback','persistent full-order mapping without scrolling','missing task IDs recover numbers and sorting','fallback retains native click and management identities','ambiguous fallback restores native order without guessing','retains 50 prior mappings across sites','cleared cache permits recapture without duplicate mappings','search gaps','click navigation','management native indexes','fixture deletion','site-disable restoration','unknown IDs','uncached random practice','practice-sheet capture','batched render during native changes','network failure fallback'],requests:requests.length};
  } catch(error) {
    throw new Error(JSON.stringify({stage,message:error.message,errors,requests,cache:await readCache(),
      display:await displayed(),labels:await fixture.locator('[data-xet-original-question-number]').allTextContents(),
      native:await fixture.evaluate(()=>vm.questionList.map(q=>q.id))}));
  } finally {
    await disable(true); await fixture.close();
    await worker.evaluate(async origin => {
      for(let i=0;i<100;i++){
        const jobs=Object.entries(await chrome.storage.session.get(null));
        if(!jobs.some(([key,job])=>key.startsWith('xetQuestionOrderJob:')&&job.origin===origin))return;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw new Error('Fixture background jobs were not cleaned up');
    },origin);
    await worker.evaluate(keys=>chrome.storage.local.remove(keys),[cacheKey,conflictKey,...Object.keys(retained)]);
    await disable(false); await context.unroute(`${origin}/**`);
    await worker.evaluate(()=>chrome.storage.local.set({questionOrderStrategy:'direct'}));
  }
}
