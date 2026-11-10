const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const origin = 'https://merchant.pc.xiaoe-tech.com', calls = [];
  const context = { URL, window: {}, chrome: { scripting: { async executeScript(options) {
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
  for (const suffix of ['/bought', '/p/t_pc/course_pc_detail/no_permission/v_fixture/3',
    '/p/t_pc/course_pc_detail/middle_page/v_fixture', '/p/t_pc/live_pc/pc/live_fixture',
    '/p/t_pc/pc_evaluation/practice_record']) assert.equal((await resolve(suffix)).ok, false);
  assert.equal((await resolve(video, { frameId: 1 })).ok, false);
  assert.equal((await resolve(video, { tab: undefined })).ok, false);
  assert.equal((await resolve(video, {}, home)).ok, false);
  authorized = false;
  assert.equal((await resolve(video)).ok, false);
  authorized = true; disabledSites = [origin];
  assert.equal((await resolve(video)).ok, false);
  assert.equal(calls.length, 0);
  disabledSites = [];
  for (const suffix of [home, video, '/p/t_pc/course_pc_detail/audio/a_fixture?pro_id=course_fixture',
    '/p/t_pc/course_pc_detail/document/d_fixture', '/p/t_pc/course_pc_detail/image_text/i_fixture?parent_pro_id=c_fixture',
    '/p/t_pc/course_pc_detail/member/m_fixture', '/p/t_pc/course_pc_detail/column/p_fixture',
    '/p/t_pc/course_pc_detail/big_column/b_fixture', '/p/t_pc/course_pc_detail/camp/term_fixture']) {
    assert.equal((await resolve(suffix)).ok, true);
    const call = calls.at(-1);
    assert.equal(call.world, 'MAIN');
    assert.deepEqual(Array.from(call.args), [new URL(origin + suffix).pathname, origin + suffix]);
    assert.deepEqual(JSON.parse(JSON.stringify(call.target)), { tabId: 9, documentIds: ['current'] });
  }
  assert.equal((await resolve(video, { documentId: 'replaced' })).ok, false);
  assert.equal((await resolve(video, { url: origin + home })).ok, true, 'SPA retains document origin, not initial path');
  assert.equal((await resolve(video, { url: 'https://unrelated.example' + home })).ok, false);
  await resolve(video, { documentId: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).target)), { tabId: 9, frameIds: [0] });
  const path = new URL(origin + video).pathname;
  context.location = { pathname: path, href: origin + video.replace('course_fixture', 'course_other') };
  assert.equal(context.XetCourseProgressSource.installCourseProgress(path, origin + video).reason, 'route',
    'A late injection must not install into a different course');
  context.location.href = origin + video;
  const catalog = { $options: { name: 'CampProCatalog' }, courseId: 'course_other' };
  const reload = () => {};
  const owner = { $children: [catalog], $refs: { CampProCatalog: catalog }, reload };
  context.document = { querySelector: () => ({ __vue__: { $children: [owner] } }) };
  assert.equal(context.XetCourseProgressSource.installCourseProgress(path, origin + video).reason, 'not-ready');
  assert.equal(owner.reload, reload, 'A mismatched mounted catalog must remain untouched');
  context.location = { pathname: '/p/t_pc/course_pc_detail/member/m_fixture', href: origin + '/p/t_pc/course_pc_detail/member/m_fixture' };
  context.window = {};
  context.document = { querySelector: () => ({ __vue__: { $children: [{ $options: { name: 'MemberCatalog' } }] } }) };
  assert.equal(context.XetCourseProgressSource.installCourseProgress(context.location.pathname, context.location.href).reason, 'unsupported-catalog');
  console.log('course-progress-smoke: all course entries, mounted catalog type, authorization, frame and document guards passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
