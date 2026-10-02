const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

async function main() {
  const context = { URL, Uint8Array, TextDecoder, AbortController, AbortSignal, Response,
    crypto: webcrypto, setTimeout, clearTimeout, console, fetch: async () => new Response("ok") };
  vm.runInNewContext(fs.readFileSync("src/content/download-stream.js", "utf8"), context);
  const api = context.__xetPlayerHelperModules.downloadStream;
  const base = "https://media.example/course/list.m3u8?signature=private";
  const playlist = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:258
#EXT-X-KEY:METHOD=AES-128,URI="key?a=1,b=2"
#EXTINF:2,
part0.ts
#EXT-X-KEY:METHOD=AES-128,URI="other",IV=0xabc
#EXTINF:3,
part1.ts
#EXT-X-KEY:METHOD=NONE
#EXTINF:1,
part2.ts
#EXT-X-ENDLIST`;
  const parsed = api.parsePlaylist(playlist, base);
  assert.equal(parsed.segments.length, 3);
  assert.equal(parsed.segments[0].url, "https://media.example/course/part0.ts");
  assert.equal(parsed.segments[0].key.url, "https://media.example/course/key?a=1,b=2");
  assert.equal(parsed.segments[0].key.iv[14], 1);
  assert.equal(parsed.segments[0].key.iv[15], 2);
  assert.equal(parsed.segments[1].key.iv[14], 10);
  assert.equal(parsed.segments[1].key.iv[15], 188);
  assert.equal(parsed.segments[2].key, null);
  assert.throws(() => api.parsePlaylist(playlist.replace("AES-128", "SAMPLE-AES"), base), /DRM/);
  assert.throws(() => api.parsePlaylist(playlist.replace("URI=", 'KEYFORMAT="other",URI='), base), /DRM/);
  assert.throws(() => api.parsePlaylist(playlist.replace("#EXT-X-ENDLIST", ""), base), /直播/);
  assert.throws(() => api.parsePlaylist(playlist.replace("part0.ts", "javascript:bad"), base), /地址/);
  assert.throws(() => api.parsePlaylist(playlist.replace("#EXTINF:2,", "#EXT-X-DISCONTINUITY\n#EXTINF:2,"), base), /不连续/);
  assert.throws(() => api.parsePlaylist(playlist.replace("#EXTINF:2,", '#EXT-X-MAP:URI="init"\n#EXTINF:2,'), base), /fMP4/);
  assert.throws(() => api.parsePlaylist(playlist.replace("#EXTINF:2,", '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio"\n#EXTINF:2,'), base), /音视频分离/);
  const ranged = api.parsePlaylist("#EXTM3U\n#EXTINF:1,\n#EXT-X-BYTERANGE:188@0\nall.ts\n#EXTINF:1,\n#EXT-X-BYTERANGE:188\nall.ts\n#EXT-X-ENDLIST", base);
  assert.equal(ranged.segments[1].range.offset, 188);
  assert.throws(() => api.parsePlaylist("#EXTM3U\n#EXTINF:1,\n#EXT-X-BYTERANGE:188\nall.ts\n#EXT-X-ENDLIST", base), /范围/);
  const master = api.parsePlaylist("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=200\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900\nb.m3u8", base);
  assert.equal(master.variants.length, 2);
  assert.equal(api.filename('CON'), "_CON.mp4");
  assert.equal(api.filename('a/b:c*. '), "a_b_c_.mp4");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.readBytes(base, { signal: controller.signal, limit: 10 }), /abort/i);
  context.fetch = async () => new Response("too big", { headers: { "content-length": "500" } });
  await assert.rejects(api.readBytes(base, { signal: new AbortController().signal, limit: 5 }), /大小/);
  context.fetch = async () => new Response("auth", { status: 403 });
  await assert.rejects(api.readBytes(base, { signal: new AbortController().signal, limit: 10 }), /已失效/);

  const injections = [];
  const sourceContext = { URL, chrome: { scripting: { executeScript: async injection => {
    injections.push(injection);
    return [{ result: { url: base }, documentId: "doc" }];
  } } } };
  vm.runInNewContext(fs.readFileSync("src/download-source.js", "utf8"), sourceContext);
  const dependencies = {
    siteAccess: { siteInfo: value => { try { return { origin: new URL(value).origin }; } catch { return null; } }, isAuthorized: async () => true },
    readSettings: async () => ({ disabledSites: [] }),
  };
  const sender = { tab: { id: 4, url: "https://merchant.example/lesson" }, frameId: 2, documentId: "doc", url: "https://player.example/video" };
  const request = { token: "12345678-abcd-1234-abcd-123456789abc" };
  assert.equal((await sourceContext.XetDownloadSource.resolve(request, sender, dependencies)).ok, true);
  assert.equal(injections[0].world, "MAIN");
  assert.deepEqual(Array.from(injections[0].target.frameIds), [2]);
  assert.equal(injections[1].world, "ISOLATED");
  assert.equal(injections[1].files[0], "src/vendor/mux-mp4.min.js");
  const before = injections.length;
  assert.equal((await sourceContext.XetDownloadSource.resolve({ token: 'bad"]' }, sender, dependencies)).ok, false);
  assert.equal((await sourceContext.XetDownloadSource.resolve(request, { ...sender, tab: undefined }, dependencies)).ok, false);
  dependencies.readSettings = async () => ({ disabledSites: ["https://merchant.example"] });
  assert.equal((await sourceContext.XetDownloadSource.resolve(request, sender, dependencies)).ok, false);
  dependencies.readSettings = async () => ({ disabledSites: [] });
  dependencies.siteAccess.isAuthorized = async () => false;
  assert.equal((await sourceContext.XetDownloadSource.resolve(request, sender, dependencies)).ok, false);
  assert.equal(injections.length, before);
  dependencies.siteAccess.isAuthorized = async () => true;
  assert.equal((await sourceContext.XetDownloadSource.resolve(request, { ...sender, documentId: "new-document" }, dependencies)).ok, false);
  console.log("download parser, limits, authorization, and source bridge smoke tests passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
