const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const calls = [], origin = "https://merchant.pc.xiaoe-tech.com";
  const context = { URL, chrome: { scripting: { async executeScript(options) {
    calls.push(options);
    return [{ documentId: "document-current", result: { ok: true } }];
  } } } };
  vm.runInNewContext(fs.readFileSync("src/site-access.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("src/video-navigation-source.js", "utf8"), context);
  let authorized = true, disabledSites = [];
  const deps = { siteAccess: { siteInfo: context.XetSiteAccess.siteInfo, isAuthorized: async () => authorized },
    readSettings: async () => ({ disabledSites }) };
  const sender = { tab: { id: 7 }, frameId: 0, documentId: "document-current",
    url: `${origin}/p/t_pc/course_pc_detail/video/v_fixture?product_id=course_fixture` };
  const resolve = sender => context.XetVideoNavigationSource.resolve({}, sender, deps);
  for (const invalid of [{ ...sender, url: "invalid" }, { ...sender, url: `${origin}/bought` },
    { ...sender, frameId: 1 }, { ...sender, tab: undefined }]) {
    assert.equal((await resolve(invalid)).ok, false);
  }
  authorized = false;
  assert.equal((await resolve(sender)).ok, false);
  authorized = true; disabledSites = [origin];
  assert.equal((await resolve(sender)).ok, false);
  assert.equal(calls.length, 0, "No MAIN injection into unauthorized, disabled, unrelated or child documents");
  disabledSites = [];
  assert.equal((await resolve(sender)).ok, true);
  assert.equal(calls[0].world, "MAIN");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].target)), { tabId: 7, documentIds: ["document-current"] });
  assert.equal((await resolve({ ...sender, documentId: "document-replaced" })).ok, false,
    "Do not accept an install result from another document");
  await resolve({ ...sender, documentId: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).target)), { tabId: 7, frameIds: [0] });
  console.log("video-navigation-smoke: authorization, frame/route scope and document identity passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
