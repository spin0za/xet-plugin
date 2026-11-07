const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
async function main() {
  const calls = [], context = { URL, chrome: { scripting: { async executeScript(options) {
    calls.push(options); return [{ documentId: "current", result: { ok: true } }];
  } } } };
  vm.runInNewContext(fs.readFileSync("src/site-access.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("src/live-chat-source.js", "utf8"), context);
  let authorized = true, disabledSites = [];
  const deps = { siteAccess: { siteInfo: context.XetSiteAccess.siteInfo, isAuthorized: async () => authorized },
    readSettings: async () => ({ disabledSites }) };
  const path = "/p/t_pc/live_pc/pc/l_fixture", origin = "https://merchant.pc.xiaoe-tech.com";
  const sender = { tab: { id: 4 }, frameId: 0, documentId: "current", url: origin + path };
  const resolve = (s = sender, p = path) => context.XetLiveChatSource.resolve({ path: p }, s, deps);
  for (const s of [{ ...sender, frameId: 1 }, { ...sender, tab: undefined }, { ...sender, url: "invalid" }]) assert.equal((await resolve(s)).ok, false);
  assert.equal((await resolve(sender, path + "_other")).ok, false);
  authorized = false; assert.equal((await resolve()).ok, false); authorized = true;
  disabledSites = [origin]; assert.equal((await resolve()).ok, false); assert.equal(calls.length, 0);
  disabledSites = []; assert.equal((await resolve()).ok, true); assert.equal(calls[0].world, "MAIN");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].target)), { tabId: 4, documentIds: ["current"] });
  assert.equal((await resolve({ ...sender, documentId: "replaced" })).ok, false);
  await resolve({ ...sender, documentId: undefined }); assert.equal(calls.at(-1).target.frameIds[0], 0);
  const source = fs.readFileSync("src/live-chat-source.js", "utf8");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|storage\.(sync|local)\.(get|set)/,
    "No raw network interception, direct uploads or persisted message content");
  assert.match(source, /const HISTORY = "\/_alive\/api\/alive\/xe\.alive\.get\.history\.msg\/1\.0\.0"/);
  assert.equal((source.match(/v\.\$axios\.post\(/g) || []).length, 1, "Only the fixed read-only history endpoint may be called");
  assert.match(source, /m\?\.comment_id === r.commentId && m.user_id === r.userId && m.alive_id === match\[1\]/);
  assert.match(source, /r.attempts >= 3/);
  assert.match(source, /Number\(v.roomInfo.alive_state\) === 3 && Number\(v.roomInfo.is_lookback\) === 1/);
  assert.match(source, /typeof m.msg_tag === "string"/);
  assert.match(source, /return original.call\(this, payload, ...args\)/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/, "Message text must never be inserted as HTML");
  console.log("live-chat-smoke: authorization, route/frame/document scope, bounded read-only history, replay flags and safe text passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
