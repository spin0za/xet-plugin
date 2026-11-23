const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const env = {};
for (const name of ['duplicate-favorites', 'wrong-attempt-counts']) {
  vm.runInNewContext(fs.readFileSync(`src/content/${name}.js`, 'utf8'), env);
}
const { duplicateFavorites: dedup, wrongAttemptCounts: stats } = env.__xetPlayerHelperModules;
const wrong = (id, task_id) => ({ id, task_id });
const favorite = (id, task_id, is_collected = true) => ({ id, task_id, is_collected });

async function main() {
  const signal = new AbortController().signal;
  const book = { list: [wrong('qs_match', 'pt_x'), wrong('qs_unclear'), wrong('qs_keep', 'pt_x')] };
  const collection = { source_id: 'wb_a', task_id: 'pt_y',
    practice_list: [favorite('qs_match', 'pt_x'), favorite('qs_match', 'pt_x'), favorite('qs_unclear'),
      favorite('qs_keep', 'pt_x', false), favorite('qs_foreign', 'pt_x')] };
  const expected = [{ resource_type: 34, resource_id: 'wb_a', task_id: 'pt_x', question_id: 'qs_match', is_collect: false }];
  assert.deepEqual(JSON.parse(JSON.stringify(dedup.matched(book, collection, 'wb_a'))), expected);
  assert.throws(() => dedup.matched(book, collection, 'wb_b'), /来源/);

  const requests = [], lists = [
    Array.from({length:10}, (_,i) => ({resource_id:`wb_other_${i}`,resource_type:34,qs_count:1})),
    [{ resource_id: 'wb_a', resource_type: 34, qs_count: 1 }, { resource_id: 'wb_ambiguous', resource_type: 34, qs_count: 2 }],
  ];
  const scan = await dedup.prepare([{ sourceId: 'wb_a', bookId: 12 }, { sourceId: 'wb_ambiguous', bookId: 13 },
    { sourceId: 'wb_ambiguous', bookId: 14 }], signal, async (endpoint, data) => {
    requests.push([endpoint, data]);
    if (endpoint === 'xe.qs.coll.list/1.0.0') return { list: lists[data.page - 1], total: 12 };
    if (endpoint === 'error_question/get_all_question') return book;
    if (endpoint === 'xe.qs.coll.question.list.practice/1.0.0') return collection;
    throw Error('Preview must not write');
  });
  assert.equal(scan.skipped, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(scan.targets)), expected);
  assert.equal(requests.length, 4);
  assert.equal(requests[2][1].classfy_id, 12);
  assert.equal(requests[3][1].resource_id, 'wb_a');

  const attempts = [
    { resourceId: 'wb_a', taskId: 'pt_x', joinId: 'uwb_1' },
    { resourceId: 'wb_a', taskId: 'pt_x', joinId: 'uwb_1' },
    { resourceId: 'wb_a', taskId: 'pt_x', joinId: 'uwb_2' },
    { resourceId: 'wb_a', taskId: 'pt_y', joinId: 'uwb_3' },
    { resourceId: 'wb_a', taskId: 'pt_x', joinId: 'uwb_failed' },
    { resourceId: 'wb_a', taskId: 'pt_x', joinId: 'uwb_blank', hasAnswers: false },
    { resourceId: 'wb_b', taskId: 'pt_x', joinId: 'uwb_other' },
  ];
  const reads = [];
  const result = await stats.readCounts(attempts, 'wb_a', async (url, payload) => {
    assert.equal(url, '/evaluation_wechat/practices/commit_record');
    reads.push(payload.join_id);
    if (payload.join_id === 'uwb_failed') throw Error('unavailable');
    return { list: [
      { id: 'qs_match', is_answer: 1, answer_state: 'false' },
      { id: 'qs_match', is_answer: true, answer_state: false },
      { id: 'qs_blank', is_answer: 0, answer_state: 'false' },
      { id: 'qs_pending', is_answer: 1, answer_state: '' },
      { id: 'qs_right', is_answer: '1', answer_state: 'true' },
    ] };
  }, signal);
  assert.equal(result.checked, 3); assert.equal(result.total, 4);
  assert.equal(result.counts.get(stats.keyOf('qs_match', 'pt_x')), 2);
  assert.equal(result.counts.get(stats.keyOf('qs_match', null)), 3);
  assert.equal(result.counts.get(stats.keyOf('qs_blank', null)), undefined);
  assert.equal(result.counts.get(stats.keyOf('qs_pending', null)), undefined);
  assert.equal(result.counts.get(stats.keyOf('qs_right', null)), undefined);
  assert.deepEqual(reads.sort(), ['uwb_1', 'uwb_2', 'uwb_3', 'uwb_failed'].sort());
  console.log('wrong record tools: exact ID/task intersections, read-only preview, subtype and ambiguity guards, verified wrong counts and attempt deduplication passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
