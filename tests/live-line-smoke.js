const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const observers = [], intervals = new Set();
  let preference = 2, clicks = [], player = null;
  class Element {
    constructor(line = 0, active = false, disabled = false) {
      Object.assign(this, { line, textContent: ` 线路${line} `, active, disabled, isConnected: true });
      this.classList = { contains: name => name === 'active' && this.active };
    }
    matches(selector) { return selector.includes('.menu-item') && this.line > 0; }
    closest(selector) {
      if (selector === '.pc-live-player') return player;
      if (selector.includes('disabled')) return this.disabled ? this : null;
      if (selector === '.line-switch-btn') return this.line ? this : null;
      return null;
    }
    querySelector() { return null; }
    querySelectorAll() { return this.options || []; }
    getAttribute(name) { return name === 'aria-selected' && this.active ? 'true' : null; }
    click() { clicks.push(this.line); for (const item of player.options) item.active = item === this; }
  }
  const document = new EventTarget(), window = new EventTarget(), capture = new Map();
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  document.addEventListener = (type, fn, options) => { if (options === true) capture.set(type, fn); add(type, fn, options); };
  document.removeEventListener = (type, fn, options) => { if (capture.get(type) === fn) capture.delete(type); remove(type, fn, options); };
  document.documentElement = {};
  document.querySelector = selector => selector === '.pc-live-player' ? player : null;
  const location = { pathname: '/p/t_pc/live_pc/pc/l_fixture' };
  const context = { document, window, location, Element, setTimeout, clearTimeout, Event, console,
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn),
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() { this.active = true; } disconnect() { this.active = false; } } };
  vm.runInNewContext(fs.readFileSync('src/content/live-line.js', 'utf8'), context);
  const module = context.__xetPlayerHelperModules.liveLine;
  for (const v of [undefined, null, -1, 4, '2', {}, NaN]) assert.equal(module.normalize(v), 0);
  for (const v of [0, 1, 2, 3]) assert.equal(module.normalize(v), v);
  const controller = module.createLiveLineController({ getPreference: () => preference });
  const flush = () => new Promise(resolve => setTimeout(resolve, 5));
  const mount = (lines = [1, 2, 3], active = 1) => { player = new Element(); player.options = lines.map(n => new Element(n, n === active)); };
  const mutate = () => observers.at(-1)?.callback([{ target: player?.options[0], addedNodes: [] }]);
  const input = (line, overrides = {}) => capture.get(overrides.type || 'pointerdown')?.({ isTrusted: true, type: 'pointerdown', button: 0, composedPath: () => [player.options.find(n => n.line === line)], ...overrides });
  controller.start(); controller.start(); await flush(); assert.equal(intervals.size, 1);
  mount(); mutate(); await flush();
  assert.deepEqual(clicks, [2], 'Late hidden native menu must select exact line 2 once');
  player.options[0].click(); controller.wake(); document.dispatchEvent(new Event('loadedmetadata')); await flush();
  assert.deepEqual(clicks, [2, 1], 'Native failover must not be forced back');
  controller.stop(); controller.start(); await flush(); assert.deepEqual(clicks, [2, 1], 'Restart must preserve per-room ownership');
  location.pathname = '/p/t_pc/live_pc/pc/l_next'; mount([1, 3]); controller.wake(); await flush();
  assert.deepEqual(clicks, [2, 1], 'Missing preferred line must preserve native default');
  player.options.push(new Element(2, false, true)); mutate(); await flush(); assert.equal(clicks.length, 2);
  player.options.at(-1).disabled = false; mutate(); await flush(); assert.equal(clicks.at(-1), 2);
  location.pathname = '/p/t_pc/live_pc/pc/l_manual'; mount(); controller.wake();
  input(3); player.options[2].click(); await flush(); assert.equal(clicks.at(-1), 3);
  const before = clicks.length; controller.wake(); await flush(); assert.equal(clicks.length, before, 'Trusted manual intent must win queued initialization');
  location.pathname = '/p/t_pc/live_pc/pc/l_keyboard'; mount(); controller.wake();
  input(3, { type: 'keydown', key: 'Enter' }); player.options[2].click(); await flush(); assert.equal(clicks.length, before + 1);
  preference = 1; controller.wake(); await flush(); assert.equal(clicks.at(-1), 1, 'Explicit setting change may initialize chosen line');
  preference = 0; mount(); controller.wake(); await flush(); assert.equal(clicks.length, before + 2, 'Follow website is a no-op');
  preference = 2; location.pathname = '/p/t_pc/live_pc/pc/l_already'; mount([1, 2, 3], 2); controller.wake(); await flush();
  assert.equal(clicks.length, before + 2, 'Already-selected preferred line must not reload playback');
  location.pathname = '/p/t_pc/live_pc/pc/l_untrusted'; mount(); controller.wake();
  input(3, { isTrusted: false }); await flush(); assert.equal(clicks.at(-1), 2, 'Synthetic events must not pretend to be manual intent');
  location.pathname = '/p/t_pc/live_pc/pc/l_poll'; mount(); for (const fn of intervals) fn(); await flush(); assert.equal(clicks.at(-1), 2);
  const last = clicks.length;
  for (const path of ['/bought', '/p/t_pc/course_pc_detail/video/v_fixture', '/detail/l_fixture/4', '/p/t_pc/pc_evaluation/practice_analysis/wb_fixture']) {
    location.pathname = path; mount(); controller.wake(); await flush(); assert.equal(clicks.length, last, 'Non-live routes must not be changed');
  }
  location.pathname = '/p/t_pc/live_pc/pc/l_cancel'; mount(); controller.wake(); controller.stop(); await flush();
  assert.equal(clicks.length, last, 'Stop must cancel queued selection');
  assert.equal(intervals.size, 0); assert.equal(capture.size, 0); assert(observers.every(o => !o.active));
  assert.doesNotMatch(fs.readFileSync('src/content/live-line.js', 'utf8'), /fetch\(|\.src\s*=|\.play\(|\.pause\(|\.currentTime\s*=/, 'Use only native line selection; never rewrite media or start playback');
  console.log('live-line-smoke: defaults, exact/absent/disabled/late lines, manual intent races, one-shot/failover, route/setting changes and cleanup passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
