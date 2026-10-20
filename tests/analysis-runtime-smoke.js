const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('src/content/analysis-actions.js','utf8');
function setup() {
  let now = 100000, count = 0;
  const frames = new Map(), timeouts = new Map(), intervals = new Map();
  const listeners = new Map(), calls = [], notices = [];
  const flags = { network:false, bridge:false, bridgeResponse:false, invalidated:false };
  const document = { visibilityState:'visible', querySelectorAll:()=>[],
    addEventListener(n,f){listeners.set('doc:'+n,f)}, removeEventListener(n){listeners.delete('doc:'+n)} };
  const window = { addEventListener(n,f){listeners.set('win:'+n,f)},removeEventListener(n){listeners.delete('win:'+n)} };
  window.top=window;
  const env={window,document,URLSearchParams,AbortController,AbortSignal,Date:{now:()=>now},
    chrome:{runtime:{id:'extension_fixture'}},location:{pathname:'/p/t_pc/pc_evaluation/practice_analysis/wb_fixture',search:'?join_id=join_fixture'},
    requestAnimationFrame(f){const id=++count;frames.set(id,f);return id},cancelAnimationFrame(id){frames.delete(id)},
    setTimeout(f){const id=++count;timeouts.set(id,f);return id},clearTimeout(id){timeouts.delete(id)},
    setInterval(f){const id=++count;intervals.set(id,f);return id},clearInterval(id){intervals.delete(id)},
    MutationObserver:class {observe(){}disconnect(){this.disconnected=true}},
    async fetch(path,options){calls.push({path,priority:options.priority});if(flags.network)throw TypeError('Failed to fetch');
      return{ok:true,async json(){return{code:0,data:path.endsWith('commit_record')?{list:[{id:'qs_one',is_marked:true}]}:
        {practice_list:[{id:'qs_one',is_collected:false}]}}}}},
    __xetPlayerHelperModules:{analysisIcons:{},analysisFeedback:{createFeedbackController(){return{
      show:async reason=>notices.push(reason),showUnavailable:()=>notices.push('extension-unavailable'),clear(){}}}}}};
  vm.runInNewContext(script,env);
  const controller=env.__xetPlayerHelperModules.analysisActions.createAnalysisActionsController({async request(){
    calls.push({path:'bridge'});
    if(flags.invalidated)throw Error('Extension context invalidated.');
    if(flags.bridge)throw Error('Could not establish connection. Receiving end does not exist.');
    if(flags.bridgeResponse)return{ok:false,error:'Cannot access contents of the page'};
    return{ok:true,context:{key:env.location.pathname+'|join_fixture|',resourceId:'wb_fixture',joinId:'join_fixture',taskId:'',questions:[{id:'qs_one',index:0}]}};
  }});
  async function flush(){for(let i=0;i<12;i++){const jobs=[...frames.values()];frames.clear();jobs.forEach(f=>f());await new Promise(setImmediate)}}
  async function focus(){listeners.get('win:focus')?.();const jobs=[...timeouts.values()];timeouts.clear();jobs.forEach(f=>f());await flush()}
  async function tick(ms){now+=ms;[...intervals.values()].forEach(f=>f());await flush()}
  return{env,controller,flags,calls,notices,intervals,listeners,flush,focus,tick};
}
async function main(){
  {
    const t=setup();t.controller.start();await t.flush();assert.equal(t.calls.length,3);
    t.env.chrome.runtime=undefined;await t.focus();
    assert.deepEqual(t.notices,['extension-unavailable']);assert.equal(t.calls.length,3,'Missing runtime must not try the bridge or HTTP');
    assert.equal(t.intervals.size,0);assert.equal(t.listeners.size,0,'Orphaned listeners must be detached');
    await t.focus();await t.tick(60000);assert.equal(t.notices.length,1);assert.equal(t.calls.length,3);t.controller.stop();
  }
  {
    const t=setup();t.flags.invalidated=true;t.controller.start();await t.flush();
    assert.deepEqual(t.notices,['extension-unavailable']);assert.equal(t.calls.length,1,'An invalidated context never reaches HTTP');
    await t.tick(60000);assert.equal(t.calls.length,1);t.controller.stop();
  }
  {
    const t=setup();t.controller.start();await t.flush();t.flags.network=true;await t.focus();
    assert.equal(t.notices.length,0,'Background HTTP revalidation must not show a disruptive error');
    assert.equal(t.calls.filter(c=>c.priority==='low').length,2);
    const before=t.calls.length;await t.focus();assert.equal(t.calls.length,before,'Focus must respect failure backoff');
    await t.tick(11000);assert.equal(t.notices.length,0);t.flags.network=false;await t.tick(11000);
    assert.ok(t.calls.length>before,'Transient HTTP failures can recover');t.controller.stop();
  }
  for(const kind of ['network','bridge']){
    const t=setup();t.flags[kind]=true;t.controller.start();await t.flush();
    assert.deepEqual(t.notices,[kind==='bridge'?'bridge-error':'load-error']);
    await t.tick(11000);assert.equal(t.notices.length,1,'Do not repeatedly toast the same initial failure');
    t.flags[kind]=false;await t.tick(11000);assert.equal(t.calls.filter(c=>c.path.endsWith('commit_record')).length,kind==='bridge'?1:3);
    t.controller.stop();
  }
  {
    const t=setup();t.flags.bridgeResponse=true;t.controller.start();await t.flush();
    assert.deepEqual(t.notices,['bridge-error']);
    await t.tick(6000);assert.equal(t.notices.length,1);t.controller.stop();
  }
  const feedback=fs.readFileSync('src/content/analysis-feedback.js','utf8');
  assert.doesNotMatch(feedback,/请确认登录及网络状态/,'Do not infer a login failure from an arbitrary exception');
  assert.match(feedback,/showUnavailable/);
  console.log('analysis runtime invalidation, bridge/network classification, quiet revalidation and retry cleanup passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
