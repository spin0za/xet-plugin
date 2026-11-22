async page => {
  const context=page.context(),worker=context.serviceWorkers().find(w=>w.url().endsWith('/src/background.js'));
  if(!worker)throw Error('Fresh persistent profile with real extension required');
  const origin='https://autoload.pc.xiaoe-tech.com',path='/p/t_pc/pc_evaluation/practice_record';
  const fixture=await context.newPage(),errors=[],requests=[],checks=[];
  fixture.on('pageerror',e=>errors.push(e.message));fixture.setDefaultTimeout(10000);
  const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
  const waitForHold=async()=>{const deadline=Date.now()+10000;while(!release&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert(release,'Expected held page request was not issued')};
  const vue=await(await context.request.get('https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js')).text();
  let fault=false,repeat=false,hold=false,release,stage='setup';
  const historyKey=`xetPracticeHistory:${origin}|user_fixture|join_saved`;
  const switchView=async(kind,tab=0)=>{
    await fixture.evaluate(({kind,tab})=>showView(kind,tab),{kind,tab});
    await fixture.waitForFunction(()=>recordVM.noMore&&!recordVM.loading);
    await fixture.waitForFunction(()=>!document.querySelector('.xet-history-more'));
  };
  try{
    await worker.evaluate(async historyKey=>chrome.storage.local.set({disabledSites:[],keepAliveEnabled:false,
      [historyKey]:{version:1,resourceId:'wb_saved',taskId:'pt_saved',productId:'course_saved',joinId:'join_saved',
        title:'已交卷的有效练习',submittedAt:Date.now(),hasAnswers:true}}),historyKey);
    await fixture.route(origin+'/**',async route=>{
      const u=new URL(route.request().url());
      if(route.request().method()==='POST'){
        const b=route.request().postDataJSON(),kind=u.pathname.includes('list_classfy')?1:u.pathname.includes('coll.list')?2:0;
        const tab=kind===1?b.type-1:kind===2?[34,27,74].indexOf(b.resource_type):u.pathname.includes('student_exercise')?2:u.pathname.includes('drill/owner')?3:u.pathname.includes('exam.user.res')?1:0;
        const number=b.page||b.page_index||b.pageIndex,filter=b.commit_type||b.exerciseStatus||0;
        assert(Number.isInteger(number),'Unexpected/mutating endpoint '+u.pathname);
        requests.push({kind,tab,page:number,filter,path:u.pathname});
        if(hold&&kind===1&&number===2)await new Promise(r=>{release=r});
        if(fault&&kind===1&&number===2){await route.fulfill({status:503,body:'offline'});return;}
        const n=repeat&&kind===1&&number===2?1:number;
        const rows=Array.from({length:7},(_,i)=>({id:`row_${kind}_${tab}_${filter}_${i}`,resource_id:`wb_${kind}_${tab}_${filter}_${i}`,
          source_id:`wb_${kind}_${tab}_${filter}_${i}`,collection_id:`coll_${kind}_${tab}_${i}`,
          name:'记录 '+i,title:'作业 '+i,collection_name:'收藏 '+i,qs_count:i%3===0?0:1})).slice((n-1)*3,n*3);
        await route.fulfill({json:{code:0,data:kind===1?{claasfy:rows}:kind===2?{list:rows,total:7}:tab===1?{list:rows}:rows}});return;
      }
      await route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><title>记录自动加载</title>
        <style>body{margin:0;font:16px sans-serif}.practice-record-page{max-width:900px;margin:auto}.resource-card{background:#f5f7fa;margin:8px;padding:12px}.list-grid{display:flex;flex-wrap:wrap}</style>
        <div id="app"></div><script>${vue}</script><script>
        window.USERID='user_fixture';window.nativeClicks=0;
        Vue.component('resource-card',{props:['item'],template:'<a class="resource-card" href="#" @click.prevent="clicked"><div class="resource-card__info"><div class="resource-card__title">{{item.name}}</div><div class="card-line">{{item.qs_count||0}}题</div></div></a>',methods:{clicked(){nativeClicks++}}});
        const names=['PracticeHistoryTab','ErrbookTab','QuestionCollectTab'];
        const components=Object.fromEntries(names.map((name,kind)=>{
          const root=['practice-history-tab','errbook-tab','question-collect-tab'][kind];
          return [name,{name,props:['initSubTab'],
            data(){return {activeSubTab:this.initSubTab,filterValue:kind===0&&this.initSubTab===1?1:0,list:[],loading:false,noMore:false,pagination:{page:1,pageSize:3}}},
            template:'<section class="'+root+'"><nav><button class="sub-tab-item active">当前分类</button></nav><div class="list-grid"><resource-card v-for="(item,i) in list" :key="i" :item="item"/></div><div v-if="loading" class="list-loading">加载中</div><div v-if="noMore" class="scroll-footer">没有更多了</div></section>',
            created(){kind===0?this.fetchData():this.fetchList()},
            mounted(){window.recordVM=this},
            methods:{
              reset(sub,filter){this.activeSubTab=sub;this.filterValue=filter;this.list=[];this.noMore=false;this.pagination.page=1;kind===0?this.fetchData():this.fetchList()},
              loadMore(){this.pagination.page++;return kind===0?this.fetchData():this.fetchList()},
              async fetchData(){this.loading=true;try{await [this.fetchPractice,this.fetchExam,this.fetchExercise,this.fetchDrillbook][this.activeSubTab]()}catch{}finally{this.loading=false}},
              async fetchPractice(){await this.fetchChunk('/evaluation_wechat/practices/owner',{page:this.pagination.page,page_size:3},'array')},
              async fetchExam(){await this.fetchChunk('/xe.exam.user.res/1.0.0',{page_index:this.pagination.page,page_size:3,commit_type:Number(this.filterValue)||1},'list')},
              async fetchExercise(){await this.fetchChunk('/evaluation_wechat/get_student_exercise_list',{pageIndex:this.pagination.page,pageSize:3,exerciseStatus:Number(this.filterValue)||0},'array')},
              async fetchDrillbook(){await this.fetchChunk('/evaluation_wechat/drill/owner',{page:this.pagination.page,page_size:3},'array')},
              async fetchList(){this.loading=true;try{if(kind===1)await this.fetchChunk('/evaluation_wechat/error_question/list_classfy',{type:this.activeSubTab+1,page_index:this.pagination.page,page_size:3},'claasfy');
                else await this.fetchChunk('/evaluation_wechat/xe.qs.coll.list/1.0.0',{resource_type:[34,27,74][this.activeSubTab],page:this.pagination.page,page_size:3},'total')}catch{}finally{this.loading=false}},
              async fetchChunk(url,body,shape){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('offline');const j=await r.json();if(j.code!==0)return;
                const rows=shape==='array'?j.data:shape==='claasfy'?j.data.claasfy:j.data.list;
                this.list=this.pagination.page===1?rows:this.list.concat(rows);
                this.noMore=shape==='total'?this.list.length>=j.data.total:rows.length<3;},
            }}];
        }));
        let parent;
        const recordsPath='${path}';
        const RecordView=Vue.extend({name:'PracticeRecord',components,
          data(){const params=new URLSearchParams(location.search);return {activeTab:Number(params.get('tab')||1),sub:Number(params.get('subTab')||0)}},
          mounted(){parent=this;window.rowsAtRecordMount=recordVM.list.length},
          render(h){return h('main',{class:'practice-record-page'},[h(names[this.activeTab],{key:this.activeTab,props:{initSubTab:this.sub}})])}});
        const shell=new Vue({el:app,data:{showRecord:location.pathname===recordsPath},
          render(h){return this.showRecord?h(RecordView):h('main',{attrs:{id:'other-view'}},'查看错题')}});
        const updateRoute=()=>{shell.showRecord=location.pathname===recordsPath};
        addEventListener('popstate',updateRoute);
        window.visit=async path=>{history.pushState({},'',path);updateRoute();await Vue.nextTick()};
        window.showView=async(kind,tab=0)=>{
          if(parent.activeTab===kind)recordVM.reset(tab,kind===0&&tab===1?1:0);
          else {parent.sub=tab;parent.activeTab=kind}
          history.replaceState({},'','${path}?tab='+kind+'&subTab='+tab);
          dispatchEvent(new PopStateEvent('popstate'));
          await Vue.nextTick();
        };
        </script>`});
    });
    const restart=async()=>{await fixture.goto(origin+path+'?tab=1&subTab=0');await fixture.bringToFront()};
    stage='initial wrong records';hold=true;await restart();
    await waitForHold();
    await fixture.waitForFunction(()=>document.querySelectorAll('.resource-card').length===3&&!recordVM.loading);
    const deadline=Date.now()+10000;
    while(!requests.some(r=>r.page===4)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
    assert(requests.some(r=>r.page===3)&&requests.some(r=>r.page===4),'Tail requests did not start in parallel');
    assert(await fixture.evaluate(()=>recordVM.pagination.page===1&&recordVM.list.length===3),'Later page jumped ahead of held page 2');
    hold=false;release();
    await fixture.waitForFunction(()=>window.recordVM?.list.length===7&&recordVM.noMore&&!recordVM.loading);
    assert(await fixture.evaluate(()=>recordVM.list.every((r,i)=>r.id.endsWith('_'+i))),'Tail rows appended out of order');
    assert(await fixture.evaluate(()=>scrollY)===0,'Auto-loading scrolled the page');
    checks.push('first page usable while tail requests run concurrently; appended in order without scrolling');
    for(const kind of [0,1,2])for(const tab of kind===2?[0,1,2]:[0,1,2,3]){
      stage='category '+kind+'/'+tab;await switchView(kind,tab);
      assert(await fixture.evaluate(()=>recordVM.list.length)===7,'Missing rows '+stage);
      if(kind===2)assert(await fixture.locator('.resource-card:visible').count()===4,'Empty collection filtering lost');
      if(kind===0&&tab===0){
        assert(await fixture.locator('.list-grid').isHidden(),'Useless old new-practice links reappeared');
        assert(await fixture.locator('.xet-history-result-link').count()===1,'Saved result missing');
      }
    }
    checks.push('all 11 subcategories auto-load; collection filtering and saved result links retained');
    stage='cached category returns';
    const beforeCache=requests.length;
    for(const [kind,tab] of [[1,0],[1,1],[2,0],[0,1],[1,0]]) {
      await fixture.evaluate(({kind,tab})=>showView(kind,tab),{kind,tab});
      assert(await fixture.evaluate(()=>recordVM.list.length===7&&recordVM.noMore&&!recordVM.loading),'Tab cache was not available in the first render');
    }
    assert(requests.length===beforeCache,'Fresh tab cache hit made network requests');
    checks.push('main-tab remounts and sub-tab resets restore complete cache without requesting page 1');
    stage='wrong-question round trip';
    const detail='/p/t_pc/pc_evaluation/errbook/detail/123?tab=1&source_id=wb_fixture';
    const beforeDetail=requests.length;
    await fixture.evaluate(path=>visit(path),detail);
    assert(await fixture.evaluate(()=>recordVM._isDestroyed&&!window.__xetRecordListLoader?.job),
      'Leaving for details did not suspend the record view');
    await fixture.goBack();
    await fixture.waitForSelector('.practice-record-page');
    assert(await fixture.evaluate(()=>rowsAtRecordMount===7&&recordVM.list.length===7),
      'Returned view did not get the cache during its initial mount');
    assert(requests.length===beforeDetail,'Returning from details fetched a cached list again');
    checks.push('browser Back from a wrong-question detail restores all cached rows before first paint');
    stage='expired cache refresh';hold=true;release=null;
    await fixture.evaluate(()=>{const now=Date.now;Date.now=()=>now()+121000});
    await fixture.evaluate(()=>showView(1,1));
    await waitForHold();
    assert(await fixture.evaluate(()=>recordVM.list.length===7&&recordVM.noMore&&!recordVM.loading),
      'Background refresh hid the expired snapshot');
    hold=false;release();
    await fixture.waitForFunction(()=>window.__xetRecordListLoader?.job?.state==='done');
    checks.push('expired cache stays visible while revalidating');
    stage='failed page';fault=true;
    await restart();
    await fixture.waitForFunction(()=>document.querySelector('.xet-history-more')?.textContent==='加载未完成，重试');
    assert(await fixture.evaluate(()=>recordVM.pagination.page===1&&recordVM.list.length===3&&!recordVM.loading),'Failed page was committed');
    const count=requests.length;await fixture.evaluate(()=>new Promise(r=>setTimeout(r,150)));
    assert(requests.length===count,'Error retry flood');fault=false;
    await fixture.locator('.xet-history-more').click();
    await fixture.waitForFunction(()=>recordVM.list.length===7&&recordVM.noMore&&!recordVM.loading);
    checks.push('failure keeps loaded rows, stops automatic retries and resumes the same failed page');
    stage='repeated page';repeat=true;await restart();
    await fixture.waitForFunction(()=>document.querySelector('.xet-history-more')?.textContent==='加载未完成，重试');
    assert(await fixture.evaluate(()=>recordVM.list.length===3&&recordVM.pagination.page===1),'Repeated page appended');repeat=false;
    stage='cancel on category change';hold=true;release=null;await restart();
    await fixture.waitForFunction(()=>!recordVM.loading&&recordVM.pagination.page===1&&recordVM.list.length===3);
    await waitForHold();
    await switchView(2,0);hold=false;release();await fixture.evaluate(()=>new Promise(r=>setTimeout(r,50)));
    assert(await fixture.evaluate(()=>recordVM.list.every(r=>r.id.startsWith('row_2_'))),'Old response polluted another category');
    const beforeResume=requests.length;
    await fixture.evaluate(()=>showView(1,0));
    assert(await fixture.evaluate(()=>recordVM.list.length>=3),'Partial cached list not restored immediately');
    await fixture.waitForFunction(()=>recordVM.noMore&&recordVM.list.length===7);
    assert(requests.slice(beforeResume).every(r=>r.page>=2),'Partial cache restarted from the first page');
    checks.push('late responses isolated; partially loaded views resume at their first missing page');
    stage='same-URL filter change';await switchView(0,1);
    await fixture.evaluate(()=>recordVM.reset(1,2));
    await fixture.waitForFunction(()=>recordVM.noMore&&!recordVM.loading&&recordVM.list.length===7);
    assert(await fixture.evaluate(()=>recordVM.list.every(r=>r.id.startsWith('row_0_1_2_'))),'Filter response isolation failed');
    const beforeFilterReturn=requests.length;
    await fixture.evaluate(()=>recordVM.reset(1,'1'));
    assert(await fixture.evaluate(()=>recordVM.list.length===7&&recordVM.list.every(r=>r.id.startsWith('row_0_1_1_'))),
      'Original filter cache was not restored synchronously');
    assert(requests.length===beforeFilterReturn,'Equivalent numeric/string filter caused a fresh request');
    checks.push('same-URL filters restart correctly and restore cached results');

    stage='partial wrong-question round trip';
    hold=true;release=null;await restart();await waitForHold();
    const preReturn=await fixture.evaluate(()=>({rows:recordVM.list.length,job:window.__xetRecordListLoader?.job?.state,
      path:location.pathname,mount:rowsAtRecordMount}));
    await fixture.evaluate(path=>visit(path),detail);
    await fixture.evaluate(()=>visit('/p/t_pc/pc_evaluation/errbook/practice/123?readonly=1'));
    await fixture.goBack();await fixture.waitForURL('**/errbook/detail/**');
    const inDetail=await fixture.evaluate(()=>({pager:!!window.__xetRecordListLoader,path:location.pathname}));
    hold=false;release();const beforePartialReturn=requests.length;
    await fixture.goBack();await fixture.waitForSelector('.practice-record-page');
    const returned=await fixture.evaluate(()=>({mount:rowsAtRecordMount,rows:recordVM.list.length,job:window.__xetRecordListLoader?.job?.state,path:location.pathname}));
    assert(returned.mount===3,'Cached prefix not available at mount '+JSON.stringify({preReturn,inDetail,returned,requests:requests.slice(beforePartialReturn)}));
    await fixture.waitForFunction(()=>recordVM.noMore&&recordVM.list.length===7);
    assert(requests.slice(beforePartialReturn).every(r=>r.page>=2),'Detail return requested page 1 again');
    checks.push('Back resumes a partially loaded record list at the first missing page');

    stage='other route clears cache';
    const beforeOtherRoute=requests.length;
    await fixture.evaluate(()=>visit('/unrelated'));
    assert(await fixture.evaluate(()=>!window.__xetRecordListLoader),'Unrelated page retained the record cache');
    await fixture.goBack();await fixture.waitForFunction(()=>recordVM.noMore&&recordVM.list.length===7);
    assert(requests.slice(beforeOtherRoute).some(r=>r.page===1),'Cache leaked across an unrelated route');

    stage='disable in flight';hold=true;release=null;await restart();
    await waitForHold();
    await worker.evaluate(origin=>chrome.storage.local.set({disabledSites:[origin]}),origin);
    await fixture.waitForFunction(()=>!document.querySelector('[data-xet-history-list]')&&!recordVM.loading);
    hold=false;release();await fixture.evaluate(()=>new Promise(r=>setTimeout(r,50)));
    assert(await fixture.evaluate(()=>recordVM.list.length===3&&recordVM.pagination.page===1),'Disabled loader appended a late response');
    checks.push('disabling restores native loading and rejects late responses');
    assert(errors.length===0,errors.join('\n'));
    return {passed:true,checks,requests:requests.length};
  }catch(error){throw Error(stage+': '+error.message+' '+errors.join(';'));}
  finally{
    hold=false;release?.();
    await worker.evaluate(async key=>{await chrome.storage.local.remove(key);await chrome.storage.local.set({disabledSites:[]})},historyKey);
    await fixture.close();
  }
}
