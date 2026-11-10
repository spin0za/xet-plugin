const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const origin = 'https://merchant.pc.xiaoe-tech.com', calls = [];
  const context = { URL, chrome: { scripting: { async executeScript(options) {
    calls.push(options);
    return [{ documentId: 'current', result: { ok: true } }];
  } } } };
  vm.runInNewContext(fs.readFileSync('src/site-access.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('src/course-progress-source.js', 'utf8'), context);
  let authorized = true, disabledSites = [];
  const deps = { siteAccess: { siteInfo: context.XetSiteAccess.siteInfo, isAuthorized: async () => authorized },
    readSettings: async () => ({ disabledSites }) };
  const sender = { tab: { id: 9 }, frameId: 0, documentId: 'current' };
  const resolve = (suffix, overrides = {}, path = new URL(origin + suffix).pathname) =>
    context.XetCourseProgressSource.resolve({ path, url: origin + suffix }, { ...sender, url: origin + suffix, ...overrides }, deps);
  const video = '/p/t_pc/course_pc_detail/video/v_fixture?product_id=course_fixture';
  const home = '/p/t_pc/course_pc_detail/camp_pro/course_fixture';
  for (const suffix of ['/bought', '/p/t_pc/course_pc_detail/video/v_fixture',
    '/p/t_pc/course_pc_detail/video/v_fixture?product_id=v_not_a_course',
    '/p/t_pc/course_pc_detail/camp_pro/v_not_a_course']) assert.equal((await resolve(suffix)).ok, false);
  assert.equal((await resolve(video, { frameId: 1 })).ok, false);
  assert.equal((await resolve(video, { tab: undefined })).ok, false);
  assert.equal((await resolve(video, {}, home)).ok, false);
  authorized = false;
  assert.equal((await resolve(video)).ok, false);
  authorized = true; disabledSites = [origin];
  assert.equal((await resolve(video)).ok, false);
  assert.equal(calls.length, 0);
  disabledSites = [];
  for (const suffix of [home, video]) {
    assert.equal((await resolve(suffix)).ok, true);
    const call = calls.at(-1);
    assert.equal(call.world, 'MAIN');
    assert.deepEqual(Array.from(call.args), [new URL(origin + suffix).pathname, 'course_fixture']);
    assert.deepEqual(JSON.parse(JSON.stringify(call.target)), { tabId: 9, documentIds: ['current'] });
  }
  assert.equal((await resolve(video, { documentId: 'replaced' })).ok, false);
  assert.equal((await resolve(video, { url: origin + home })).ok, true, 'SPA retains document origin, not initial path');
  assert.equal((await resolve(video, { url: 'https://unrelated.example' + home })).ok, false);
  await resolve(video, { documentId: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).target)), { tabId: 9, frameIds: [0] });
  const path = new URL(origin + video).pathname;
  context.location = { pathname: path, href: origin + video.replace('course_fixture', 'course_other') };
  assert.equal(context.XetCourseProgressSource.installCourseProgress(path, 'course_fixture').reason, 'route',
    'A late injection must not install into a different course');
  context.location.href = origin + video;
  const catalog = { $options: { name: 'CampProCatalog' }, courseId: 'course_other' };
  const reload = () => {};
  const owner = { $children: [catalog], $refs: { CampProCatalog: catalog }, reload };
  context.document = { querySelector: () => ({ __vue__: { $children: [owner] } }) };
  assert.equal(context.XetCourseProgressSource.installCourseProgress(path, 'course_fixture').reason, 'not-ready');
  assert.equal(owner.reload, reload, 'A mismatched mounted catalog must remain untouched');
  console.log('course-progress-smoke: home/video course identity, authorization, frame and document guards passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
