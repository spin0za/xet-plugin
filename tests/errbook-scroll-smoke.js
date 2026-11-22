const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture({ navigation = true, top = true } = {}) {
  const listeners = new Map(), frames = new Map(), timers = new Set(), moves = [];
  const location = { pathname: '/p/t_pc/pc_evaluation/practice_record', search: '?tab=1', hash: '' };
  let mounted = false, observer;
  const add = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
  const remove = (name, fn) => listeners.get(name)?.delete(fn);
  const window = { addEventListener: add, removeEventListener: remove, scrollTo: value => moves.push(value) };
  window.top = top ? window : {};
  if (navigation) window.navigation = { addEventListener: add, removeEventListener: remove };
  const env = { location, window,
    document: { documentElement: {}, querySelector: () => mounted ? {} : null },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
    requestAnimationFrame(fn) { frames.set(fn, fn); return fn; }, cancelAnimationFrame: fn => frames.delete(fn),
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) };
  vm.runInNewContext(fs.readFileSync('src/content/errbook-scroll.js', 'utf8'), env);
  const controller = env.__xetPlayerHelperModules.errbookScroll.createErrbookScrollController();
  const emit = (name, properties = {}) => { for (const fn of listeners.get(name) || []) fn({ type: name, ...properties }); };
  const flush = () => { for (const fn of [...frames.values()]) { frames.delete(fn); fn(); } };
  return { controller, moves, location, frames, timers, listeners, emit, flush,
    mount(value = true) { mounted = value; observer?.([]); },
    enter(id = '123', search = '?tab=1&source_id=wb_course_fixture') {
      location.pathname = '/p/t_pc/pc_evaluation/errbook/detail/' + id;
      location.search = search; emit('currententrychange'); emit('popstate'); flush();
    } };
}
const f = fixture();
f.controller.start(); f.controller.start(); f.flush();
assert.equal(f.moves.length, 0, 'Unrelated overview is untouched');
f.enter(); assert.equal(f.moves.length, 0, 'Wait for detail mount');
f.mount(); f.flush();
assert.equal(f.moves.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(f.moves[0])), { top: 0, left: 0, behavior: 'instant' });
for (let i = 0; i < 4; i++) { f.mount(); f.emit('pageshow'); f.flush(); }
assert.equal(f.moves.length, 1, 'Data/order updates and tab wakes cannot pull the reader back');
f.enter('456', '?tab=2'); f.mount(); f.flush();
assert.equal(f.moves.length, 2, 'A different error book starts at top too');
f.enter('456', '?tab=3&from=drillbook_exam');
assert.equal(f.moves.length, 3, 'Another category is an independent entry');
f.location.pathname = '/p/t_pc/pc_evaluation/practice_record';
f.emit('popstate'); f.flush();
assert.equal(f.moves.length, 3, 'Returning to overview keeps its native history restoration');
f.enter(); assert.equal(f.moves.length, 4, 'Reentering the detail initializes once again');
f.mount(false); f.enter('789');
f.emit('wheel', { isTrusted: true }); f.mount(); f.flush();
assert.equal(f.moves.length, 4, 'Late mount must respect a real user scroll');
f.mount(false); f.enter('790');
f.emit('keydown', { isTrusted: true, key: 'PageDown' }); f.mount(); f.flush();
assert.equal(f.moves.length, 4);
f.mount(false); f.enter('790b');
f.emit('pointerdown', { isTrusted: true }); f.mount(); f.flush();
assert.equal(f.moves.length, 4, 'Dragging a scrollbar/clicking after entry cancels a late jump');
f.mount(false); f.enter('791');
f.emit('wheel', { isTrusted: false }); f.emit('keydown', { isTrusted: true, key: 'a' });
f.mount(); f.flush(); assert.equal(f.moves.length, 5, 'Synthetic events and typing do not cancel initialization');
f.location.hash = '#specific-question'; f.enter('792');
assert.equal(f.moves.length, 5, 'Explicit deep-link anchors remain native');
f.location.hash = ''; f.enter('793');
assert.equal(f.moves.length, 6);
f.controller.stop();
assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
assert([...f.listeners.values()].every(s => s.size === 0), 'Stop removes all owned listeners');
f.emit('popstate'); f.flush(); assert.equal(f.moves.length, 6);
const fallback = fixture({ navigation: false }); fallback.controller.start(); fallback.flush(); fallback.mount();
fallback.location.pathname = '/p/t_pc/pc_evaluation/errbook/detail/123';
for (const fn of fallback.timers) fn(); fallback.flush();
assert.equal(fallback.moves.length, 1, 'Old Chromium route fallback works'); fallback.controller.stop();
const frame = fixture({ top: false }); frame.controller.start(); frame.mount(); frame.enter();
assert.equal(frame.moves.length, 0); assert.equal(frame.timers.size, 0, 'Never scroll a media iframe');
const reload = fixture(); reload.controller.start(); reload.flush(); reload.mount(); reload.enter();
assert.equal(reload.moves.length, 1);
reload.emit('pageshow', { isTrusted: true, persisted: false }); reload.flush();
assert.equal(reload.moves.length, 2, 'Finish initialization after native reload restoration');
reload.emit('pageshow', { isTrusted: true, persisted: true }); reload.flush();
assert.equal(reload.moves.length, 2, 'BFCache resumption preserves reading position');
reload.emit('wheel', { isTrusted: true });
reload.emit('pageshow', { isTrusted: true, persisted: false }); reload.flush();
assert.equal(reload.moves.length, 2, 'Late pageshow must not override user scrolling'); reload.controller.stop();
console.log('error-book entry scroll: one-shot, delayed mount, all categories, user intent, history/hash scope and cleanup passed');
