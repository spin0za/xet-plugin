const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
async function main() {
  const context = { URL, Date, calls: [], chrome: { scripting: { async executeScript(options) {
    context.calls.push(options); return [{ documentId: "doc", result: { ok: true } }];
  } } } };
  vm.runInNewContext(fs.readFileSync("src/site-access.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("src/live-chat-timeline.js", "utf8"), context);
  vm.runInNewContext(fs.readFileSync("src/live-chat-replay-source.js", "utf8"), context);
  const t = context.XetReplayTimeline;
  const playlist = `#EXTM3U
#EXT-X-PROGRAM-DATE-TIME:2026-10-03T14:01:23+08:00
#EXTINF:5,
one.ts
#EXTINF:5,
two.ts
#EXT-X-DISCONTINUITY
#EXT-X-PROGRAM-DATE-TIME:2026-10-03T14:02:23+08:00
#EXTINF:5,
three.ts
#EXT-X-ENDLIST`;
  const map = t.parsePlaylist(playlist), start = Date.parse("2026-10-03T14:01:23+08:00") / 1000;
  assert.equal(map.duration, 15); assert.equal(map.start, start);
  assert.equal(t.wallTime(map, 11), start + 61, "Discontinuity must not be treated as uninterrupted wall time");
  assert.equal(t.mediaTime(map, start + 61), 11);
  assert.equal(t.mediaTime(map, start + 30), null, "Deleted/non-recorded intervals must not be invented");
  assert.equal(t.wallTime(map, -1), null);
  assert.equal(t.parsePlaylist(playlist.replace(/#EXT-X-PROGRAM-DATE-TIME:[^\n]+/g, "")), null);
  assert.equal(t.parsePlaylist(playlist.replace("#EXT-X-ENDLIST", "")), null, "Live manifests cannot be used as a VOD time map");
  assert.equal(t.parsePlaylist(playlist.replace("2026-10-03T14:02:23+08:00", "invalid")), null);
  assert.equal(t.parsePlaylist(playlist.replaceAll("+08:00", "")), null, "Do not interpret a timezone-less anchor using the viewer's timezone");
  assert.equal(t.parsePlaylist(playlist.replace("2026-10-03T14:02:23+08:00", "2026-10-03T13:00:00+08:00")), null);
  const indexed = t.indexMessages([
    { comment_id: "late", created_timestamp: start + 500 },
    { comment_id: "second", created_timestamp: (start + 61) * 1000 },
    { comment_id: "first", created_timestamp: start + 1 },
    { comment_id: "gap", created_timestamp: start + 30 },
    { comment_id: "missing" }
  ], map);
  assert.equal(indexed.during.map(x => x.msg.comment_id).join(","), "first,second");
  assert.equal(indexed.after.map(x => x.msg.comment_id).join(","), "late");
  let authorized = true, disabledSites = [];
  const origin = "https://merchant.pc.xiaoe-tech.com", path = "/p/t_pc/live_pc/pc/l_fixture";
  const deps = { siteAccess: { siteInfo: context.XetSiteAccess.siteInfo, isAuthorized: async () => authorized }, readSettings: async () => ({ disabledSites }) };
  const sender = { frameId: 0, tab: { id: 1 }, documentId: "doc", url: origin + path };
  const resolve = (s = sender, p = path) => context.XetReplayChatSource.resolve({ path: p }, s, deps);
  assert.equal((await resolve({ ...sender, frameId: 1 })).ok, false);
  assert.equal((await resolve({ ...sender, url: "https://example.com/" })).ok, false);
  assert.equal((await resolve(sender, path + "_other")).ok, false);
  authorized = false; assert.equal((await resolve()).ok, false); authorized = true;
  disabledSites = [origin]; assert.equal((await resolve()).ok, false); disabledSites = [];
  assert.equal(context.calls.length, 0);
  assert.equal((await resolve()).ok, true); assert.equal(context.calls.length, 2);
  assert.equal(context.calls[0].files[0], "src/live-chat-timeline.js");
  for (const call of context.calls) { assert.equal(call.world, "MAIN"); assert.equal(call.target.documentIds[0], "doc"); }
  assert.equal((await resolve({ ...sender, documentId: "stale" })).ok, false);
  const source = fs.readFileSync("src/live-chat-replay-source.js", "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|storage\.(local|sync)|\.innerHTML\s*=|\.currentTime\s*=|\.play\(|\.pause\(/);
  assert.match(source, /const HISTORY = "\/_alive\/api\/alive\/xe\.alive\.get\.history\.msg\/1\.0\.0"/);
  assert.match(source, /saveMsgReadHistory\(\) \{\}/, "Replay rendering must not rewrite native reading position");
  console.log("live-chat-replay-smoke: PDT mapping, gaps, post-live notes, identity and read-only scope passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
