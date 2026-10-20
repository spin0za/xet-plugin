const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/content/analysis-scroll.js','utf8');

function setup({embedded=false, innerOffset=0, ready=true}={}) {
  const frames=new Map(),listeners=new Map(),navigation=new Map(),resizes=[],scrolls=[];
  let count=0,observer,scrollHeight=480;
  class Element {
    constructor(){this.attrs=new Set();this.style={values:new Map(),setProperty:(n,v)=>this.style.values.set(n,v),removeProperty:n=>this.style.values.delete(n)};}
    setAttribute(n){this.attrs.add(n)} removeAttribute(n){this.attrs.delete(n)}
    toggleAttribute(n,on){on?this.attrs.add(n):this.attrs.delete(n)}
  }
  const root=new Element(),card=new Element(),header=new Element(),target=new Element(),cell=new Element();
  card.getBoundingClientRect=()=>({height:scrollHeight});header.getBoundingClientRect=()=>({bottom:80});
  target.getClientRects=()=>[{}];target.scrollIntoView=options=>scrolls.push(options);
  target.getBoundingClientRect=()=>({top:root.attrs.has('data-xet-analysis-scroll')?500:0,bottom:600});
  root.contains=el=>[cell,target].includes(el);
  root.querySelector=sel=>sel==='.analysis-card'?card:sel==='.analysis-base-layout__header'?header:null;
  cell.querySelector=()=>({textContent:'20'});cell.closest=()=>cell;
  const list={scrollTop:innerOffset,children:[target],closest:()=>root,getBoundingClientRect:()=>({top:100})};
  const document={documentElement:{classList:{contains:()=>false}},fullscreenElement:null,
    querySelector:()=>ready?list:null,getElementById:id=>id==='analysis-20'?target:null,
    addEventListener:(n,f)=>listeners.set('doc:'+n,f),removeEventListener:n=>listeners.delete('doc:'+n)};
  const window={innerHeight:900,navigation:{addEventListener:(n,f)=>navigation.set(n,f),removeEventListener:n=>navigation.delete(n)},
    addEventListener:(n,f)=>listeners.set('win:'+n,f),removeEventListener:n=>listeners.delete('win:'+n),scrollBy:(...args)=>scrolls.push(args)};
  window.top=embedded?{}:window;
  const env={document,window,Element,location:{pathname:'/p/t_pc/pc_evaluation/practice_analysis/fixture'},
    requestAnimationFrame(f){frames.set(++count,f);return count},cancelAnimationFrame:id=>frames.delete(id),
    setInterval(){throw Error('Do not poll when Navigation API is available')},clearInterval(){},
    MutationObserver:class{constructor(f){observer=f}observe(){}disconnect(){this.disconnected=true}},
    ResizeObserver:class{constructor(f){resizes.push(this);this.callback=f;this.targets=[]}observe(el){this.targets.push(el)}disconnect(){this.targets=[]}}};
  vm.runInNewContext(source,env);
  const controller=env.__xetPlayerHelperModules.analysisScroll.createAnalysisScrollController();
  function flush(){const jobs=[...frames.values()];frames.clear();jobs.forEach(f=>f())}
  return {env,controller,root,card,cell,list,target,listeners,navigation,frames,resizes,scrolls,flush,
    mutate:()=>observer?.([]),setReady:v=>{ready=v},setCardHeight:v=>{scrollHeight=v}};
}
{
  const f=setup();f.controller.start();f.controller.start();
  assert.ok(f.root.attrs.has('data-xet-analysis-scroll'));
  assert.ok(f.card.attrs.has('data-xet-analysis-sticky-card'));
  assert.equal(f.resizes.length,1,'start is idempotent');
  assert.equal(f.root.style.values.get('--xet-analysis-scroll-offset'),'96px');
  assert.ok(!f.listeners.has('doc:keydown'),'PageUp/PageDown remain native browser actions');
  f.listeners.get('doc:click')({target:{}});assert.equal(f.frames.size,0,'Non-element events are harmless');
  f.listeners.get('doc:click')({target:f.cell});f.flush();assert.equal(f.scrolls.length,1);
  assert.equal(f.scrolls[0].block,'start');
  f.env.document.fullscreenElement=f.target;
  f.listeners.get('doc:click')({target:f.cell});assert.equal(f.frames.size,0,'No scrolling in fullscreen');
  f.env.document.fullscreenElement=null;
  f.setCardHeight(950);f.listeners.get('win:resize')();f.flush();assert.ok(!f.card.attrs.has('data-xet-analysis-sticky-card'));
  f.listeners.get('doc:click')({target:f.cell});
  f.env.location.pathname='/other';f.navigation.get('currententrychange')();f.flush();
  assert.ok(!f.root.attrs.has('data-xet-analysis-scroll'));assert.equal(f.scrolls.length,1,'Queued click cannot scroll another route');
  f.env.location.pathname='/p/t_pc/pc_evaluation/practice_analysis/fixture';f.mutate();f.flush();
  assert.ok(f.root.attrs.has('data-xet-analysis-scroll'));
  f.controller.stop();f.flush();assert.equal(f.frames.size,0);assert.equal(f.listeners.size,0);assert.equal(f.navigation.size,0);
  assert.equal(f.root.style.values.size,0);assert.equal(f.root.attrs.size,0);assert.equal(f.card.attrs.size,0);
}
{
  const f=setup({innerOffset:500});f.controller.start();
  assert.equal(f.list.scrollTop,0);assert.deepEqual(f.scrolls,[[0,500]],'Migrate the old visible question to document scrolling');
  f.controller.stop();
}
{
  const f=setup({ready:false});f.controller.start();assert.equal(f.root.attrs.size,0);
  f.setReady(true);f.mutate();f.mutate();assert.equal(f.frames.size,1,'Coalesce async mount updates');f.flush();
  assert.ok(f.root.attrs.has('data-xet-analysis-scroll'));f.controller.stop();
}
{
  const f=setup({embedded:true});f.controller.start();assert.equal(f.root.attrs.size,0);assert.equal(f.listeners.size,0);f.controller.stop();
}
console.log('analysis single-scroll lifecycle, native jump alignment, viewport, route and cleanup passed');
