async page => {
  const context = page.context(), worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Use a fresh persistent profile with the real MV3 extension');
  const origin = 'https://review-numbers.pc.xiaoe-tech.com', source = 'wb_review_fixture';
  const path = '/p/t_pc/pc_evaluation/errbook/practice/123';
  const cacheKey = `xetQuestionOrder:${origin}|${source}|pt_fixture`, conflictKey = cacheKey.replace('pt_fixture','pt_conflict');
  const ids = Array.from({length:130}, (_,i) => 'qs_'+(i+1));
  const fixture = await context.newPage(), errors = [], requests = [], checks = [];
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  fixture.on('pageerror', e => errors.push(e.message)); fixture.setDefaultTimeout(10000);
  const vue = await (await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  const headers = () => fixture.locator('.question-block__index').allTextContents();
  const cells = () => fixture.locator('.answer-card__content__card__item > span').allTextContents();
  const waitNumber = number => fixture.waitForFunction(number => document.querySelector('.question-block__index')?.textContent === number+'.' &&
    document.querySelector('.answer-card__content__card__item > span')?.textContent === String(number), number);
  let stage = 'setup';
  try {
    await worker.evaluate(async ({cacheKey,conflictKey,ids}) => {
      await chrome.storage.local.remove(conflictKey);
      await chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false,
        [cacheKey]: {version:1,ids,savedAt:1} });
    }, {cacheKey,conflictKey,ids});
    await fixture.route(origin+'/**', async route => {
      if (route.request().method() !== 'GET') {
        requests.push(new URL(route.request().url()).pathname);
        await route.fulfill({status:500,body:'Readonly review must not request a paper'}); return;
      }
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8">
        <title>Readonly original numbers</title><style>body{font:16px sans-serif}.errbook-practice{padding:20px}
        .question-wrapper{padding:20px;margin:12px;background:#fff}.answer-card__content__card__item{display:inline-flex;padding:12px}
        .question-block__index{margin-right:12px}.question-header .question-index{display:none}</style>
        <div id="app"></div><script>${vue}</script><script>
        window.make=(id,type=0)=>({id,type,task_id:'',child_info:[]});
        window.vm=new Vue({el:'#app',name:'AnswerPage',data:{sourceId:'${source}',classifyId:'123',tab:1,
          isReadonly:true,isCollect:false,pageLoading:false,questionId:'qs_19',questionList:[make('qs_19')],
          totalNum:1,answerSheetArray:[{answerIndex:1,text:'1'}],currentQuestionNum:0,clicks:[]},
          methods:{switchQuestion(a,i){this.currentQuestionNum=i;this.clicks.push({answerIndex:a.answerIndex,index:i});},
            wrapperClass(q){return q.type===6?'is-material-wrapper':''},anchor(i){return 'practice-question-anchor-'+(i+1)}},
          template:'<main class="errbook-practice"><header id="totals">已完成 {{questionList.length}}/{{totalNum}} 题</header>'+ 
            '<aside><div v-for="(a,i) in answerSheetArray" class="answer-card__content__card__item error current" @click="switchQuestion(a,i)"><span>{{a.text}}</span><i class="status-icon">×</i></div></aside>'+
            '<section class="all-questions-container"><div v-for="(q,i) in questionList" :key="q.id" class="question-wrapper" :class="wrapperClass(q)" :id="anchor(i)">'+
              '<div v-if="q.type!==6" class="question-block__meta"><span class="question-block__index">{{i+1}}.</span><span>单选题</span></div>'+
              '<div v-if="q.type!==6" class="question-header"><span class="question-index">{{i+1}}.</span><p>{{q.id}}</p></div>'+
              '<div v-else><span class="question-index">1.</span><span class="question-index">2.</span></div>'+
              '<button class="collect">收藏</button><button class="draft">涂画</button></div></section></main>'});
        window.showQuestions=(values,selected=true)=>{
          const qid=selected?values[0].id:'';
          history.replaceState({},'', '${path}?tab=1&source_id=${source}&readonly=1'+(qid?'&question_id='+qid:''));
          vm.questionId=qid;vm.questionList=values;vm.totalNum=values.length;vm.currentQuestionNum=0;
          vm.answerSheetArray=values.map((q,i)=>({answerIndex:i+1,text:String(i+1)}));
          dispatchEvent(new PopStateEvent('popstate'));
        };
        </script>`});
    });
    await fixture.goto(origin+path+`?tab=1&source_id=${source}&readonly=1&question_id=qs_19`); await fixture.bringToFront();
    stage='cached original'; await waitNumber(19);
    assert((await fixture.locator('#totals').innerText()).includes('1/1'), 'Completion count changed to original ordinal');
    assert(await fixture.evaluate(() => vm.answerSheetArray[0].answerIndex===1 && vm.answerSheetArray[0].text==='1' && vm.currentQuestionNum===0), 'Vue indexing mutated');
    await fixture.locator('.answer-card__content__card__item').click();
    assert(await fixture.evaluate(() => vm.clicks.at(-1).index===0 && vm.clicks.at(-1).answerIndex===1), 'Native card click got original ordinal instead of local index');
    assert(await fixture.locator('.status-icon').innerText() === '×', 'Answer status icon replaced');
    checks.push('header/card show original 19 while native index, click, anchor, status and 1/1 total remain intact');
    stage='native rerender';
    await fixture.evaluate(() => { document.querySelector('.question-block__index').firstChild.data='1.';document.querySelector('.answer-card__content__card__item > span').firstChild.data='1';vm.$forceUpdate(); });
    await waitNumber(19);
    checks.push('Vue/text-node rerenders restore original display without replacing controls');
    stage='same-book question switch';
    await fixture.evaluate(() => showQuestions([make('qs_113')])); await waitNumber(113);
    stage='multiple readonly questions';
    await fixture.evaluate(() => showQuestions([make('qs_113'),make('qs_19')],false));
    await fixture.waitForFunction(() => [...document.querySelectorAll('.answer-card__content__card__item > span')].map(e=>e.textContent).join(',')==='113,19');
    assert((await headers()).join(',')==='113.,19.', 'Question wrappers reordered or labeled by DOM position');
    assert(await fixture.evaluate(() => vm.questionList.map(q=>q.id).join(',')==='qs_113,qs_19' && vm.answerSheetArray.map(a=>a.answerIndex).join(',')==='1,2'), 'Readonly question order changed');
    checks.push('same-book question_id changes and multiple readonly questions use identity, never local order');
    stage='material child scope';
    await fixture.evaluate(() => showQuestions([make('qs_19'),make('qs_113',6)],false));
    await fixture.waitForFunction(() => [...document.querySelectorAll('.answer-card__content__card__item > span')].map(e=>e.textContent).join(',')==='19,113');
    assert((await fixture.locator('.is-material-wrapper .question-index').allTextContents()).join(',')==='1.,2.', 'Material child labels corrupted');
    checks.push('material parent card gets its original ordinal; child numbers stay local');
    stage='unknown number';
    await fixture.evaluate(() => showQuestions([make('qs_unknown')])); await waitNumber('?');
    assert(await fixture.locator('.xet-question-order-hint').isVisible(), 'Missing mapping failed silently');
    await worker.evaluate(({cacheKey,ids}) => chrome.storage.local.set({[cacheKey]:{version:1,ids:[...ids,'qs_unknown'],savedAt:2}}),{cacheKey,ids});
    await waitNumber(131);
    stage='conflict';
    await fixture.evaluate(() => showQuestions([make('qs_19')])); await waitNumber(19);
    await worker.evaluate(({conflictKey,ids}) => chrome.storage.local.set({[conflictKey]:{version:1,ids:[...ids].reverse(),savedAt:3}}),{conflictKey,ids});
    await waitNumber('?');
    await worker.evaluate(key => chrome.storage.local.remove(key), conflictKey); await waitNumber(19);
    checks.push('unknown/conflicting mappings show ?, update from cache notifications, and never start network/tab helpers');
    stage='disable cleanup';
    await worker.evaluate(origin => chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(() => document.querySelector('.question-block__index')?.textContent==='1.');
    assert((await cells()).join(',')==='1', 'Disable did not restore native card text');
    assert(await fixture.locator('[data-xet-question-order-id],.xet-question-order-hint').count()===0, 'Disable leaked numbering UI');
    await worker.evaluate(() => chrome.storage.local.set({disabledSites:[]})); await waitNumber(19);
    stage='editable practice scope';
    await fixture.evaluate(() => { history.replaceState({},'',location.href.replace('readonly=1','readonly=0'));vm.isReadonly=false;dispatchEvent(new PopStateEvent('popstate')); });
    await fixture.waitForFunction(() => document.querySelector('.question-block__index')?.textContent==='1.');
    assert((await cells()).join(',')==='1', 'Editable practice was relabeled');
    checks.push('disable restores native numbering and editable practice is untouched');
    assert(requests.length===0, 'Unexpected requests: '+requests.join(','));
    assert(errors.length===0, errors.join('\n'));
    return {passed:true,checks,requests:requests.length};
  } catch(error) { throw Error(stage+': '+error.message+' errors='+errors.join(';')+' state='+JSON.stringify(await fixture.evaluate(()=>({vm:!!window.vm,root:document.querySelector('.errbook-practice')?.className,headers:[...document.querySelectorAll('.question-block__index')].map(e=>e.textContent)})))); }
  finally {
    await worker.evaluate(async keys => {
      await chrome.storage.local.remove(keys);
      await chrome.storage.local.set({disabledSites:[]});
    }, [cacheKey,conflictKey]);
    await fixture.close();
  }
}
