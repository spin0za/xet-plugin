const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");

async function main() {
  const context = { URL, Uint8Array, TextDecoder, Response, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync("src/content/download-stream.js", "utf8"), context);
  const api = context.__xetPlayerHelperModules.downloadStream;
  const samples = {
    mp3: Buffer.concat([Buffer.from("ID3"), Buffer.alloc(32)]),
    m4a: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypM4A "), Buffer.alloc(24)]),
    aac: Buffer.concat([Buffer.from([255, 241]), Buffer.alloc(32)]),
    wav: Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(24)]),
    ogg: Buffer.concat([Buffer.from("OggS"), Buffer.alloc(32)]),
    flac: Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(32)]),
  };
  for (const [ext, bytes] of Object.entries(samples)) {
    const chunks = [], progress = [];
    context.fetch = async () => new Response(new ReadableStream({ start(controller) {
      // The signature can straddle network chunks.
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(new Uint8Array(bytes.subarray(i, i + 3)));
      controller.close();
    } }), { headers: { "content-length": String(bytes.length) } });
    const result = await api.downloadAudio(`https://media.test/lesson.${ext}?signed=1`, {
      signal: new AbortController().signal, sink: { async write(b) { chunks.push(Buffer.from(b)); } }, onProgress: p => progress.push(p),
    });
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.equal(result.writtenBytes, bytes.length);
    assert.equal(progress.at(-1).percent, 99);
    assert.equal(api.filename("CON", ext), `_CON.${ext}`);
  }
  assert.equal(api.audioFormat("https://media.test/list.m3u8").extension, "m4a");
  assert.equal(api.audioFormat("blob:https://media.test/id"), null);
  assert.equal(api.audioFormat("https://media.test/file.exe"), null);
  const options = () => ({ signal: new AbortController().signal, sink: { async write() { throw Error("must not write invalid bytes"); } } });
  context.fetch = async () => new Response("<html>expired login</html>", { headers: { "content-type": "text/html" } });
  await assert.rejects(api.downloadAudio("https://media.test/a.mp3", options()), /不是音频/);
  context.fetch = async () => new Response("<html>invalid content</html>", { headers: { "content-type": "application/octet-stream" } });
  await assert.rejects(api.downloadAudio("https://media.test/a.mp3", options()), /格式不符/);
  context.fetch = async () => new Response(samples.mp3, { headers: { "content-length": "999" } });
  await assert.rejects(api.downloadAudio("https://media.test/a.mp3", { ...options(), sink: { async write() {} } }), /不完整/);
  context.fetch = async () => new Response(samples.mp3);
  const abort = new AbortController();
  await assert.rejects(api.downloadAudio("https://media.test/a.mp3", { signal: abort.signal, sink: { async write() { abort.abort(); } } }), /abort/i);
  const calls = [], source = { URL, chrome: { scripting: { async executeScript(i) { calls.push(i); return [{ documentId: "doc", result: { kind: "audio", url: "https://media.test/a.mp3" } }]; } } } };
  vm.runInNewContext(fs.readFileSync("src/download-source.js", "utf8"), source);
  assert.equal((await source.XetDownloadSource.resolve({ token: "12345678-abcd-1234-abcd-123456789abc" }, {
    tab: { id: 1, url: "https://merchant.test/audio" }, frameId: 0, url: "https://merchant.test/audio", documentId: "doc",
  }, { siteAccess: { siteInfo: value => ({ origin: new URL(value).origin }), isAuthorized: async () => true }, readSettings: async () => ({ disabledSites: [] }) })).ok, true);
  assert.equal(calls.length, 1, "Direct audio does not load the video transmuxer");
  console.log("audio download: original formats, chunked signatures, invalid/truncated content, cancellation and source bridge passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
