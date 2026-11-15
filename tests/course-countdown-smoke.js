const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const oldTZ = process.env.TZ; process.env.TZ = 'America/Los_Angeles';
  try {
    const origin = 'https://merchant.pc.xiaoe-tech.com';
    const path = '/p/t_pc/course_pc_detail/video/v_fixture', href = origin + path + '?product_id=course_fixture';
    let now = Date.parse('2026-11-15T06:30:00Z'), seq = 0, reads = 0, reloads = 0;
    const timers = new Map(), watch = [];
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const window = new EventTarget(), document = new EventTarget();
    document.visibilityState = 'visible';
    const row = { chapter_id: 'l_fixture', resource_type: 4, alive_status: 0, alive_start_time: '2026-11-15 15:00:00' };
    function section(item) {
      const v = { sectionItem: item, $children: [], $options: {}, renders: 0 };
      v.getTimeDifference = function(from, until) {
        const left = Math.max(0, new Clock(until).getTime() - new Clock(from).getTime());
        return { days: Math.floor(left / 86400000), hours: Math.floor(left % 86400000 / 3600000), mins: Math.floor(left % 3600000 / 60000) };
      };
      const native = v.getTimeDifference;
      const computed = () => {
        if (item.alive_status !== 0) return ['scheduled', '直播中', '已结束', '支持回放'][item.alive_status];
        const t = v.getTimeDifference(new Clock(), item.alive_start_time);
        return item.alive_start_time + '开播' + (t.days < 7 && (t.days || t.hours || t.mins) ?
          '|' + (t.days ? t.days + '天' : t.hours ? t.hours + '小时' : t.mins + '分钟') + '后开始' : '');
      };
      const watcher = { lazy: true, dirty: true, value: '', update() { this.dirty = true; } };
      Object.defineProperty(v, 'descText', { get() { if (watcher.dirty) { watcher.value = computed(); watcher.dirty = false; } return watcher.value; } });
      v._computedWatchers = { descText: watcher };
      v.$forceUpdate = () => { v.renders++; };
      v.native = native;
      return v;
    }
    const label = section(row), rows = [row];
    let fresh = { ...row };
    const catalog = { $options: { name: 'CampProCatalog' }, $children: [label], courseId: 'course_fixture', appId: 'fixture',
      chapterList: rows, currentItemPid: 0, catalogPageSize: 50, lastPageSize: 1, nextPageSize: 1,
      order_status: 'asc', currentSubCourse: '', isOnlyShowWithRightsValue: false,
      apiMap: { async getList() { reads++; return { code: 0, data: { list: [fresh] } }; }, async getLearnResource() { reads++; return { code: 0, data: { resource_id: '' } }; } },
      $watch(getter, callback) { const r = { getter, callback }; watch.push(r); return () => watch.splice(watch.indexOf(r), 1); },
      $set(object, key, value) { object[key] = value; for (const v of this.$children) if (v.sectionItem === object) v._computedWatchers.descText.update(); },
    };
    const originalReload = () => reloads++;
    const owner = { $children: [catalog], $refs: { CampProCatalog: catalog }, reload: originalReload,
      courseInfo: { resource_type: 50, resource_id: 'course_fixture' } };
    const root = { $children: [owner] }, el = { __vue__: root };
    document.querySelector = () => el;
    const location = { pathname: path, href };
    const context = { window, document, location, URL, Date: Clock, AbortController, Event, setTimeout: (fn, delay) => { const id = ++seq; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) };
    vm.runInNewContext(fs.readFileSync('src/course-progress-source.js', 'utf8'), context);
    const install = () => context.XetCourseProgressSource.installCourseProgress(location.pathname, location.href);
    assert.match(label.descText, /16小时后开始/, 'Fixture must reproduce native PST/CST bug');
    assert.equal(install().ok, true);
    const state = window.__xetCourseProgress;
    assert.match(label.descText, /30分钟后开始/);
    assert.equal(reads, 0, 'Initial time correction must not fetch');
    assert.equal(catalog.chapterList, rows); assert.equal(rows[0], row);
    const renders = label.renders;
    state.tickCountdowns(); assert.equal(label.renders, renders, 'Unchanged label must not rerender');
    now += 65_000;
    timers.get(state.countdownTimer).fn();
    assert.match(label.descText, /28分钟后开始/, 'Minute tick must use actual clock, not tick counts');
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(timers.has(state.countdownTimer), false, 'Hidden page must not keep countdown timer');
    now += 18 * 60_000;
    document.visibilityState = 'visible'; window.dispatchEvent(new Event('focus'));
    assert.match(label.descText, /10分钟后开始/, 'Wake/focus must correct synchronously');
    assert.equal(reads, 0, 'Clock/focus correction must not query server');
    now += 16 * 3600_000;
    document.dispatchEvent(new Event('resume'));
    assert.doesNotMatch(label.descText, /后开始|直播中/, 'Expired schedule must not invent live status');
    assert.equal(row.alive_status, 0);
    now = Date.parse('2026-11-15T06:30:00Z');
    fresh = { ...row, alive_start_time: '2026-11-15 16:00:00', alive_status: 0 };
    await state.refresh(); state.tickCountdowns();
    assert.match(label.descText, /1小时后开始/, 'Reschedule from API must update in place');
    assert.equal(catalog.chapterList, rows); assert.equal(rows[0], row); assert.equal(reloads, 0);
    fresh = { ...row, alive_status: 1 }; await state.refresh(); state.tickCountdowns();
    assert.equal(label.descText, '直播中', 'Only API may advance actual live status');
    fresh = { ...row, alive_status: 99, alive_start_time: 'invalid' }; await state.refresh();
    assert.equal(row.alive_status, 1); assert.equal(row.alive_start_time, '2026-11-15 16:00:00');
    const newRow = { ...row, chapter_id: 'l_new', alive_status: 0, alive_start_time: '2026-11-15T07:00:00Z' };
    const added = section(newRow); catalog.$children.push(added); rows.push(newRow);
    assert.equal(install().ok, true); assert.match(added.descText, /30分钟后开始/, 'Newly loaded rows must be corrected');
    newRow.alive_start_time = '2026-11-15T15:00:00+08:00';
    window.dispatchEvent(new Event('pageshow')); assert.match(added.descText, /30分钟后开始/);
    now = Date.parse('2026-07-01T06:30:00Z'); newRow.alive_start_time = '2026-07-01 15:00:00';
    state.tickCountdowns(); assert.match(added.descText, /30分钟后开始/, 'Viewer daylight-saving time must not shift Beijing time');
    const otherUntil = '2026-07-01T08:30:00Z';
    assert.equal(added.getTimeDifference(new Clock(), otherUntil).hours, 2, 'Other native formatter calls must be unchanged');
    catalog.$children.splice(1); state.tickCountdowns(); assert.equal(added.getTimeDifference, added.native);
    state.stop(); assert.equal(label.getTimeDifference, label.native); assert.equal(owner.reload, originalReload);
    assert.equal(watch.length, 0); assert.equal(timers.size, 0);
    const after = label.renders; window.dispatchEvent(new Event('focus')); assert.equal(label.renders, after);
    console.log('course-countdown-smoke: CST/PST/DST, cached Vue labels, real-time ticks, sleep/visibility, API status/rescheduling, identity/no-fetch and cleanup passed');
  } finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
