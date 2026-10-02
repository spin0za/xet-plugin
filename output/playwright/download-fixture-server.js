// Local-only synthetic media fixture for verify-download.js; requires FFmpeg.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const http = require("node:http"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "xet-download-browser-"));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result.stdout;
}
fs.writeFileSync(path.join(folder, "key.bin"), crypto.randomBytes(16));
fs.writeFileSync(path.join(folder, "key.info"), `key.bin\n${path.join(folder, "key.bin")}\n00000000000000000000000000000001\n`);
run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25",
  "-f", "lavfi", "-i", "sine=frequency=400:sample_rate=48000", "-t", "6.2", "-c:v", "libx264", "-preset", "ultrafast",
  "-g", "50", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "hls", "-hls_time", "2", "-hls_list_size", "0",
  "-hls_key_info_file", path.join(folder, "key.info"), "-hls_segment_filename", path.join(folder, "part%d.ts"), path.join(folder, "list.m3u8")]);
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/health") { response.end("ready"); return; }
    if (request.url === "/output.mp4" && request.method === "POST") {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 4 * 1024 * 1024) throw new Error("Fixture upload too large");
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      fs.writeFileSync(path.join(folder, "output.mp4"), Buffer.concat(data.chunks.map(chunk => Buffer.from(chunk))));
      const probe = run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "json", path.join(folder, "output.mp4")]);
      run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(folder, "output.mp4"), "-f", "null", "-"]);
      response.setHeader("Content-Type", "application/json"); response.end(probe); return;
    }
    if (!/^\/(?:list\.m3u8|key\.bin|part\d\.ts|output\.mp4)$/.test(request.url) || request.method !== "GET") {
      response.writeHead(404); response.end(); return;
    }
    const file = path.join(folder, request.url.slice(1));
    if (!fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", request.url.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "application/octet-stream");
    response.end(fs.readFileSync(file));
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
server.listen(4181, "127.0.0.1", () => console.log(`Synthetic media fixture ready; PID ${process.pid}`));
function shutdown() { server.close(); fs.rmSync(folder, { recursive: true, force: true }); process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
