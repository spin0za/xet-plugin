const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://merchant.pc.xiaoe-tech.com';
const env = { URL, Date };
vm.runInNewContext(fs.readFileSync('src/content/practice-history-data.js', 'utf8'), env);
const data = env.__xetPlayerHelperModules.practiceHistoryData;
const plain = v => JSON.parse(JSON.stringify(v));
async function main() {
  const entries = {}, storage = { async get(key) { return key === null ? { ...entries } : { [key]: entries[key] }; },
    async set(values) { Object.assign(entries, plain(values)); } };
  const record = { resourceId:'wb_course_fixture', joinId:'join_fixture', taskId:'task_fixture', productId:'course_fixture',
    title:'完整题目标题', startedAt:'2026-10-19 10:00:00', answers:'MUST NOT STORE', created_at:'2026-01-01 00:00:00' };
  assert.equal(await data.save(storage, origin, 'user_one', record), true);
  assert.equal((await data.load(storage, origin, 'user_one')).length, 1);
  assert.equal((await data.load(storage, origin, 'user_two')).length, 0);
  assert.equal((await data.load(storage, 'https://other.pc.xiaoe-tech.com', 'user_one')).length, 0);
  assert.ok(!JSON.stringify(entries).includes('MUST NOT STORE'));
  assert.ok(!JSON.stringify(entries).includes('created_at'));
  await data.save(storage, origin, 'user_one', { ...record, startedAt:null, title:'' });
  const [saved] = await data.load(storage, origin, 'user_one');
  assert.equal(saved.startedAt, record.startedAt, 'A revisit does not change the start time');
  assert.equal(saved.title, record.title);
  const url = new URL(data.resultUrl(origin, saved));
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, '/p/t_pc/pc_evaluation/practice_result/wb_course_fixture');
  assert.equal(url.searchParams.get('join_id'), 'join_fixture');
  assert.equal(url.searchParams.get('task_id'), 'task_fixture');
  assert.equal(url.searchParams.get('product_id'), 'course_fixture');
  assert.equal(url.searchParams.has('isJustCommitted'), false, 'History is not another submission');
  for (const startedAt of [null, undefined, '', 0, true, {}, '发布时间：2026-01-01', 'invalid']) assert.equal(data.startTime(startedAt), '');
  assert.equal(data.normalize({ ...record, startedAt:null, created_at:'2026-01-01' }).startedAt, '');
  assert.equal(data.normalize({ ...record, startedAt:null, updated_at:'2026-10-19 12:00:00', answer_time_sec:180 }).startedAt, '',
    'Resource updates and elapsed durations cannot stand in for an attempt timestamp');
  const ui=fs.readFileSync('src/content/practice-history.js','utf8');
  assert.doesNotMatch(ui,/网站未提供/,'Unknown times must not have a placeholder row');
  assert.match(ui,/if \(record\.startedAt\)/);
  for (const value of [{ ...record, resourceId:42 }, { ...record, joinId:'../join' }, { ...record, taskId:'x&evil=y' }]) {
    assert.equal(data.normalize(value), null);
    assert.equal(await data.save(storage, origin, 'user_one', value), false);
  }
  assert.equal(await data.save(storage, origin, '', record), false);
  assert.equal(await data.save(storage, origin, 'user_one', { ...record, resourceId:'different' }), false);
  await data.save(storage, origin, 'user_one', { ...record, joinId:'join_second' });
  assert.equal((await data.load(storage, origin, 'user_one')).length, 2, 'Do not overwrite previous attempts');
  const path='/p/t_pc/pc_evaluation/practice_record', key=path+'?tab=0';
  const item={id:'wb_course_fixture',name:'第十讲',created_at:'2026-06-07',practice_state:1};
  const attrs={};
  const v={$options:{name:'PracticeHistoryTab'},list:[item],activeSubTab:0,loading:false,noMore:false,
    loadMore(){v.calls=(v.calls||0)+1;}};
  const root={__vue__:{$children:[v]},querySelectorAll:()=>[{__vue__:{item},setAttribute(k,value){attrs[k]=value},removeAttribute(k){delete attrs[k]}}]};
  const sourceEnv={URL,window:{USERID:'user_one'},location:{href:origin+key},document:{querySelector:()=>root}};
  sourceEnv.window.top=sourceEnv.window;
  vm.runInNewContext(fs.readFileSync('src/practice-history-source.js','utf8'),sourceEnv);
  const api=sourceEnv.XetPracticeHistorySource;
  const context=api.readContext(key);
  assert.equal(context.kind,'list');assert.equal(context.rows[0].joinId,'');
  assert.equal(context.rows[0].startedAt,null,'Resource publication date is never practice start');
  assert.equal(attrs['data-xet-history-row'],'0');
  assert.equal(api.readContext(key+'stale'),null);
  api.readContext(key,'more');assert.equal(v.calls,1);
  v.loading=true;api.readContext(key,'more');assert.equal(v.calls,1);
  v.loading=false;v.noMore=true;api.readContext(key,'more');assert.equal(v.calls,1);
  const calls=[];
  sourceEnv.chrome={scripting:{async executeScript(args){calls.push(args);return [{documentId:'doc',result:context}];}},tabs:{async query(){return[];}}};
  const sender={tab:{id:1},frameId:0,documentId:'doc',url:origin+key};
  let disabled=false;
  const deps={siteAccess:{siteInfo:()=>({origin}),isAuthorized:async()=>true},readSettings:async()=>({disabledSites:disabled?[origin]:[]})};
  assert.equal((await api.resolve({key,action:'read'},sender,deps)).ok,true);
  assert.equal(calls[0].world,'MAIN');assert.deepEqual(plain(calls[0].target),{tabId:1,documentIds:['doc']});
  disabled=true;assert.equal((await api.resolve({key,action:'read'},sender,deps)).ok,false);
  assert.equal((await api.resolve({key,action:'read'},{...sender,frameId:1},deps)).ok,false);
  assert.equal((await api.resolve({key,action:'navigate'},sender,deps)).ok,false);
  console.log('practice history scope, safe result links, dates, multi-attempt storage and read-only source smoke test passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
