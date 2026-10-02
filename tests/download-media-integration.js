// Optional media integration test: requires ffmpeg and ffprobe on PATH.
// Fixtures are generated locally, contain only a test pattern and sine wave,
// and never read course URLs, credentials, or a user's browser profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { webcrypto, randomBytes } = require("node:crypto");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "xet-download-media-"));
  try {
    fs.writeFileSync(path.join(folder, "key.bin"), randomBytes(16));
    fs.writeFileSync(path.join(folder, "key.info"), `key.bin\n${path.join(folder, "key.bin")}\n00000000000000000000000000000001\n`);
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25",
      "-f", "lavfi", "-i", "sine=frequency=400:sample_rate=48000", "-t", "6.2", "-c:v", "libx264", "-preset", "ultrafast",
      "-g", "50", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "hls", "-hls_time", "2", "-hls_list_size", "0",
      "-hls_key_info_file", path.join(folder, "key.info"), "-hls_segment_filename", path.join(folder, "part%d.ts"), path.join(folder, "list.m3u8")]);
    const requests = new Map();
    let failOnce = true;
    const fetchFixture = async (value, options = {}) => {
      options.signal?.throwIfAborted();
      const url = new URL(value);
      const name = path.basename(url.pathname);
      requests.set(name, (requests.get(name) || 0) + 1);
      if (name === "part1.ts" && failOnce) { failOnce = false; return new Response("retry", { status: 503 }); }
      if (name === "master.m3u8") return new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlist.m3u8");
      const data = fs.readFileSync(path.join(folder, name));
      return new Response(data, { headers: { "content-length": String(data.length) } });
    };
    const context = { URL, Uint8Array, TextDecoder, AbortController, AbortSignal, Response,
      crypto: webcrypto, setTimeout, clearTimeout, console, fetch: fetchFixture };
    vm.runInNewContext(fs.readFileSync("src/content/download-stream.js", "utf8"), context);
    const api = context.__xetPlayerHelperModules.downloadStream;
    context.window = context;
    vm.runInNewContext(fs.readFileSync("src/vendor/mux-mp4.min.js", "utf8"), context);
    const mux = context.muxjs;
    const output = [], progress = [];
    const result = await api.download("https://fixture.test/master.m3u8", {
      mux, signal: new AbortController().signal,
      sink: { async write(bytes) { await new Promise(setImmediate); output.push(Buffer.from(bytes)); } },
      onProgress: state => progress.push(state),
    });
    assert.equal(requests.get("part1.ts"), 2, "failed fragment retries without duplicating output");
    assert.equal(requests.get("key.bin"), 1, "reuse standard key within this task only");
    assert.equal(progress.length, result.segments);
    assert.equal(result.segments, 4);
    assert.equal(progress.at(-1).percent, 99);
    const mp4 = path.join(folder, "output.mp4");
    fs.writeFileSync(mp4, Buffer.concat(output));
    assert.equal(fs.statSync(mp4).size, result.writtenBytes);
    const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", mp4]));
    assert.ok(probe.streams.some(stream => stream.codec_name === "h264" && stream.width === 320));
    assert.ok(probe.streams.some(stream => stream.codec_name === "aac"));
    assert.ok(Math.abs(Number(probe.format.duration) - 6.2) < 0.2, `wrong merged duration: ${probe.format.duration}`);
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", mp4, "-f", "null", "-"]);
    const abort = new AbortController();
    let writes = 0;
    await assert.rejects(api.download("https://fixture.test/list.m3u8", {
      mux, signal: abort.signal, sink: { async write() { writes++; abort.abort(); } },
    }), /abort/i);
    assert.equal(writes, 1, "cancel must stop output immediately");
    context.fetch = async (value, options) => new URL(value).pathname.endsWith("key.bin")
      ? new Response('{"not":"a standard key"}') : fetchFixture(value, options);
    await assert.rejects(api.download("https://fixture.test/list.m3u8", {
      mux, signal: new AbortController().signal, sink: { async write() { throw new Error("must not write"); } },
    }), /标准 HLS 密钥/);
    context.fetch = fetchFixture;
    const direct = [];
    await api.download("https://fixture.test/output.mp4", {
      signal: new AbortController().signal, sink: { async write(bytes) { direct.push(Buffer.from(bytes)); } },
    });
    assert.deepEqual(Buffer.concat(direct), fs.readFileSync(mp4));
    console.log(JSON.stringify({ encryptedHls: true, masterPlaylist: true, retry: true, cancellation: true,
      standardKeyOnly: true, directMp4: true, segments: result.segments, duration: probe.format.duration, codecs: probe.streams }));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
