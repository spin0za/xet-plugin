const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://merchant.pc.xiaoe-tech.com';
const path = '/p/t_pc/pc_evaluation/errbook/practice/123';
const search = '?tab=1&source_id=wb_fixture&readonly=1&question_id=qs_19';
const key = path + '|wb_fixture|||1|qs_19|1';
const wrapper = { matches: s => s === '.question-wrapper', setAttribute() {} };
const question = { id: 'qs_19', task_id: '', answer: 'never-export' };
const sheet = [{ answerIndex: 1, text: '1' }];
const instance = { classifyId: '123', sourceId: 'wb_fixture', tab: 1, isReadonly: true, isCollect: false,
  questionId: 'qs_19', pageLoading: false, questionList: [question], answerSheetArray: sheet,
  _vnode: { children: [{ key: 'qs_19', elm: wrapper }] } };
const page = { __vue__: instance, querySelectorAll: () => [wrapper] };
const window = new EventTarget(); window.top = window;
const env = { URL, URLSearchParams, Event, window, location: { href: origin + path + search, pathname: path, search },
  document: { querySelector: s => { assert.equal(s, '.errbook-practice'); return page; } } };
vm.runInNewContext(fs.readFileSync('src/question-order-source.js', 'utf8'), env);
vm.runInNewContext(fs.readFileSync('src/content/question-order.js', 'utf8'), env);
const read = env.XetQuestionOrderSource.readQuestionOrderContext;
const routeKey = env.__xetPlayerHelperModules.questionOrder.routeKey;
assert.equal(routeKey(), key);
const result = read(key);
assert.equal(result.kind, 'review');
assert.deepEqual(JSON.parse(JSON.stringify(result.questions)), [{ id: 'qs_19', taskId: '' }]);
assert(!JSON.stringify(result).includes('never-export'));
assert.equal(instance.answerSheetArray, sheet);
assert.deepEqual(sheet, [{ answerIndex: 1, text: '1' }], 'Never change Vue indexing');
instance.classifyId = 123; assert.equal(read(key).kind, 'review'); instance.classifyId = '123';
for (const [name, bad] of [['classifyId','124'], ['sourceId','wb_other'], ['tab',2], ['isReadonly',false],
  ['isCollect',true], ['questionId','qs_other'], ['pageLoading',true], ['answerSheetArray',[]], ['_vnode',null]]) {
  const before = instance[name]; instance[name] = bad;
  assert.equal(read(key), null, `Reject stale/ineligible ${name}`); instance[name] = before;
}
question.id = 'qs_other'; assert.equal(read(key), null); question.id = 'qs_19';
assert.equal(read(key + 'stale'), null);
const before = routeKey(); env.location.search = search.replace('qs_19', 'qs_20');
assert.notEqual(routeKey(), before, 'Same book, different question is a different generation');
env.location.search = search.replace('readonly=1', 'readonly=0'); assert.equal(routeKey(), '');
env.location.search = search.replace('tab=1', 'tab=2'); assert.equal(routeKey(), '');
env.location.search = search; env.location.href = origin + path + search;
const serialized = vm.runInNewContext('(' + read.toString() + ')', env);
assert.equal(serialized(key).kind, 'review', 'MAIN function stays self-contained');
const code = fs.readFileSync('src/content/question-order.js', 'utf8');
const reviewBody = code.slice(code.indexOf('async function renderReview('), code.indexOf('async function refresh('));
assert.doesNotMatch(reviewBody, /autoLoad\(|fetch\(|request\(/, 'Readonly review must not create an attempt or a helper tab');
assert.match(reviewBody, /is-material-wrapper/, 'Leave material child numbering alone');
assert.match(reviewBody, /numbers\[i\] \|\| "\?"/, 'Unknown is not the fake original number 1');
console.log('readonly original numbering: source/book/question identity, scope, native indexes, no answers/network and serialization passed');
