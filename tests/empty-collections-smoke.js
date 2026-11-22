const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://merchant.pc.xiaoe-tech.com';
const key = '/p/t_pc/pc_evaluation/practice_record?tab=2';
const values = [0, '0', '00', 1, '2', undefined, null, '', false, 'unknown', -1, Infinity, 0.5];
const items = values.map((qs_count, i) => ({ resource_id: 'wb_course_' + i, qs_count }));
const cards = items.map(item => ({ __vue__: { item }, attrs: {},
  setAttribute(k, value) { this.attrs[k] = value; }, removeAttribute(k) { delete this.attrs[k]; } }));
const component = { $options: { name: 'QuestionCollectTab' }, list: items,
  activeSubTab: 0, loading: false, noMore: false, page: 1,
  loadMore() { this.page++; this.noMore = true; } };
const page = { __vue__: { $children: [component] }, querySelectorAll: () => cards };
const env = { URL, window: { USERID: 'user_fixture' }, location: { href: origin + key },
  document: { querySelector: () => page } };
env.window.top = env.window;
const source = fs.readFileSync('src/practice-history-source.js', 'utf8');
vm.runInNewContext(source, env);
const { readContext } = env.XetPracticeHistorySource;
for (const tab of [0, 1, 2]) {
  component.activeSubTab = tab;
  const result = readContext(key);
  assert.equal(result.kind, 'collections');
  assert.equal(result.tab, tab);
  assert.equal(result.rows.length, items.length, 'Raw server count is preserved for native pagination');
  for (let i = 0; i < items.length; i++) {
    assert.equal('data-xet-empty-collection' in cards[i].attrs, i < 3, `count ${String(values[i])}`);
    assert.equal(result.rows[i].questionCount, i < 3 ? 0 : i === 3 ? 1 : i === 4 ? 2 : null);
  }
}
assert.equal(component.list, items, 'Do not replace the native list');
assert.equal(component.list.length, 13);
items[0].qs_count = 3;
readContext(key);
assert(!('data-xet-empty-collection' in cards[0].attrs), 'Collecting again restores the same group');
readContext(key, 'more'); assert.equal(component.page, 2);
readContext(key, 'more'); assert.equal(component.page, 2, 'Stop after the raw server total is reached');
component.loading = true; component.noMore = false;
readContext(key, 'more'); assert.equal(component.page, 2, 'No concurrent pagination');
assert.equal(readContext(key + '&stale=1'), null);
assert.equal(readContext(key, 'delete'), null, 'Never invent a group deletion API');
component.$options.name = 'PracticeHistoryTab';
readContext(key);
assert(cards.every(c => !('data-xet-empty-collection' in c.attrs)), 'Only collections are filtered');
// MAIN functions must remain self-contained when serialized by scripting.
const serialized = vm.runInNewContext('(' + readContext.toString() + ')', env);
component.$options.name = 'QuestionCollectTab';
assert.equal(serialized(key).kind, 'collections');
const ui = fs.readFileSync('src/content/practice-history.js', 'utf8');
assert.match(ui, /row\.questionCount === 0/);
assert.match(ui, /renderMore\(root, true\)/, 'Filtered empty pages still have explicit continuation');
assert.doesNotMatch(source, /list\s*=\s*.*filter\(/, 'Filtering raw list would break the site total comparison');
console.log('empty collections: exact counts, unknown safety, all categories, native paging, recollection and serialization passed');
