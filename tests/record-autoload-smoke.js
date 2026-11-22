const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/practice-history-source.js','utf8');
const origin = 'https://merchant.pc.xiaoe-tech.com';
const key = '/p/t_pc/pc_evaluation/practice_record?tab=1&subTab=0';
const wait = async predicate => {
  for (let i=0;i<200;i++) { if (predicate()) return; await new Promise(r=>setTimeout(r,1)); }
  throw Error('Loader did not settle');
};
function fixture(name='ErrbookTab', tab=0) {
  const requests=[], rows=Array.from({length:5},(_,i)=>({id:'row_'+i,resource_id:'wb_'+i,source_id:'wb_'+i,qs_count:i===0?0:1}));
  let fail=false, repeat=false, hold=false, release, watch;
  const window=new EventTarget();window.top=window;window.USERID='user_fixture';window.navigation=new EventTarget();
  const component={$options:{name,methods:{}},activeSubTab:tab,filterValue:'2',pagination:{page:1,pageSize:2},
    list:rows.slice(0,2),loading:false,noMore:false,
    $watch(_getter,callback){watch=callback;return()=>{watch=null}},$once(){},$off(){},
    loadMore(){throw Error('Native infinite scroll must not race autoload')}};
  const more=component.loadMore, first=component.list[0];
  const readPage=async function() {
    const page=this.pagination.page;requests.push({page,tab:this.activeSubTab,filter:this.filterValue});
    this.loading=true;
    try {
      if(hold)await new Promise(r=>{release=r});
      if(fail)return; // Native methods swallow API/network failures without assigning list.
      const chunk=repeat?rows.slice(0,2):rows.slice((page-1)*2,page*2);
      this.list=page===1?chunk:this.list.concat(chunk);
      this.noMore=name==='QuestionCollectTab'?this.list.length>=rows.length:chunk.length<2;
    }finally{this.loading=false}
  };
  const methods=component.$options.methods;
  if(name==='PracticeHistoryTab'){
    methods.fetchData=async function(){await [this.fetchPractice,this.fetchExam,this.fetchExercise,this.fetchDrillbook][this.activeSubTab]()};
    for(const type of ['Practice','Exam','Exercise','Drillbook'])methods['fetch'+type]=readPage;
  }else methods.fetchList=readPage;
  // Vue's public methods are bound to the real component. The adapter must
  // call original methods/nested fetches using only its staged receiver.
  for(const [name,method]of Object.entries(methods))component[name]=method.bind(component);
  const env={URL,Event,window,location:{href:origin+key,pathname:new URL(origin+key).pathname,search:'?tab=1&subTab=0'},
    document:{querySelector:()=>({__vue__:{$children:[component]},querySelectorAll:()=>[]})},
    AbortController,setTimeout,clearTimeout};
  vm.runInNewContext(source,env);
  const read=action=>env.XetPracticeHistorySource.readContext(key,action||'all');
  return {window,component,requests,rows,read,first,more,env,
    fail(v){fail=v},repeat(v){repeat=v},hold(v){hold=v},release(){release?.()},changed(){watch?.()},
    status:()=>window.__xetRecordListLoader?.status,stop:()=>window.dispatchEvent(new Event('xet:practice-history-stop-all'))};
}
async function main(){
  for(const name of ['PracticeHistoryTab','ErrbookTab','QuestionCollectTab'])for(const tab of name==='QuestionCollectTab'?[0,1,2]:[0,1,2,3]){
    const f=fixture(name,tab);f.read();
    for(let i=0;i<8;i++)f.read();
    f.component.loadMore(); // Must be suppressed while automatic requests own the list.
    await wait(()=>f.status()==='done');
    assert.deepEqual(f.requests.map(r=>r.page),[2,3]);
    assert(f.requests.every(r=>r.tab===tab&&r.filter==='2'));
    assert.equal(f.component.list.length,5);assert.equal(f.component.list[0],f.first);
    assert.equal(f.component.pagination.page,3);assert.equal(f.component.noMore,true);
    assert.equal(f.component.loading,false);assert.equal(f.component.loadMore,f.more);
    f.stop();assert.equal(f.window.__xetRecordListLoader,undefined);
  }
  let f=fixture();f.component.loading=true;
  assert.equal(f.read().allPages.state,'waiting');assert.equal(f.requests.length,0);
  f.component.loading=false;f.read();await wait(()=>f.status()==='done');f.stop();
  f=fixture();f.fail(true);f.read();await wait(()=>f.status()==='error');
  assert.deepEqual(f.requests.map(r=>r.page),[2]);assert.equal(f.component.pagination.page,1);
  f.component.loadMore();assert.equal(f.component.pagination.page,1,'Native scrolling cannot skip a failed page');
  f.read();assert.equal(f.requests.length,1,'No error retry flood');
  f.fail(false);f.read('retry-all');await wait(()=>f.status()==='done');
  assert.deepEqual(f.requests.map(r=>r.page),[2,2,3],'Retry the failed page, never skip it');f.stop();
  f=fixture();f.repeat(true);f.read();await wait(()=>f.status()==='error');
  assert.equal(f.component.list.length,2);assert.equal(f.component.pagination.page,1);f.stop();
  f=fixture();f.hold(true);f.read();f.stop();
  assert.equal(f.component.loading,false,'Disable releases the native loading flag');
  assert.equal(f.component.loadMore,f.more);f.release();await new Promise(setImmediate);
  assert.equal(f.component.list.length,2,'A late canceled response cannot append');
  f=fixture();f.hold(true);f.read();f.component.activeSubTab=1;f.component.list=[];f.component.loading=true;f.changed();
  f.release();await new Promise(setImmediate);
  assert.equal(f.component.list.length,0,'Old category cannot populate the new category');
  assert.equal(f.component.loading,true,'Old cleanup cannot clear a new native request flag');
  f=fixture();f.hold(true);f.read();f.component.filterValue='other';f.changed();f.release();await new Promise(setImmediate);
  assert.equal(f.component.list.length,2,'Old filter response is discarded');
  f=fixture();f.component.list=[];f.fail(true);f.read();await wait(()=>f.status()==='error');
  assert.equal(f.requests[0].page,1,'An initially failed empty first page is retried, not skipped');f.stop();
  f=fixture();f.env.location.href=origin+'/unrelated';assert.equal(f.read(),null);assert.equal(f.requests.length,0);
  console.log('record autoload: all categories, native bound/nested fetch staging, single-flight, paging/total, retry, repeated pages and cancellation passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
