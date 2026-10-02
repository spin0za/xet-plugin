(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.downloadStream) return;
  const MAX_SEGMENT_BYTES = 32 * 1024 * 1024;
  const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

  function mediaUrl(value, base) {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("视频源地址不受支持");
    }
    return url.href;
  }

  function attributes(line) {
    const fields = {};
    for (const match of line.matchAll(/([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g)) {
      fields[match[1]] = match[2] ?? match[3];
    }
    return fields;
  }

  function sequenceIv(sequence) {
    const iv = new Uint8Array(16);
    for (let index = 15; index >= 0; index--) {
      iv[index] = Number(sequence & 255n);
      sequence >>= 8n;
    }
    return iv;
  }

  function parsePlaylist(text, base) {
    const lines = text.trim().split(/\r?\n/).map(line => line.trim());
    if (lines[0] !== "#EXTM3U") throw new Error("视频源不是有效的 HLS 播放列表");
    const segments = [], variants = [];
    let key = null, sequence = 0n, duration = 0, variant = null, range = null, previous = null;
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("#EXT-X-KEY:")) {
        const values = attributes(line);
        if (values.METHOD === "NONE") { key = null; continue; }
        if (values.METHOD !== "AES-128" || (values.KEYFORMAT && values.KEYFORMAT !== "identity")) {
          throw new Error("不支持该视频的加密格式，不会绕过 DRM 保护");
        }
        if (!values.URI) throw new Error("播放列表缺少标准 HLS 密钥地址");
        let iv = null;
        if (values.IV) {
          if (!/^0x[0-9a-f]{1,32}$/i.test(values.IV)) throw new Error("播放列表包含无效的加密参数");
          const hex = values.IV.slice(2).padStart(32, "0");
          iv = Uint8Array.from({ length: 16 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
        }
        key = { url: mediaUrl(values.URI, base), iv };
      } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
        const value = line.slice(line.indexOf(":") + 1);
        if (!/^\d{1,38}$/.test(value)) throw new Error("播放列表包含无效的片段序号");
        sequence = BigInt(value);
      } else if (line.startsWith("#EXTINF:")) {
        duration = Number.parseFloat(line.slice(8));
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("视频片段时长无效");
      } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
        variant = attributes(line);
      } else if (line.startsWith("#EXT-X-BYTERANGE:")) {
        const match = line.match(/^#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?$/);
        if (!match) throw new Error("片段范围无效");
        range = { length: Number(match[1]), offset: match[2] === undefined ? null : Number(match[2]) };
      } else if (line === "#EXT-X-DISCONTINUITY" || line.startsWith("#EXT-X-MAP:")) {
        throw new Error("此版本暂不支持时间轴不连续或 fMP4 分段的视频");
      } else if (line.startsWith("#EXT-X-MEDIA:")) {
        const values = attributes(line);
        if (values.TYPE === "AUDIO" && values.URI) throw new Error("此版本暂不支持音视频分离的播放列表");
      } else if (!line.startsWith("#")) {
        const url = mediaUrl(line, base);
        if (variant) {
          variants.push({ url, bandwidth: Number(variant.BANDWIDTH) || 0 });
          variant = null;
          continue;
        }
        if (!duration) throw new Error("视频片段缺少时长");
        if (range) {
          const offset = range.offset ?? (previous?.url === url && previous.range ? previous.range.offset + previous.range.length : NaN);
          if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(range.length) ||
              range.length <= 0 || range.length > MAX_SEGMENT_BYTES || !Number.isSafeInteger(offset + range.length)) {
            throw new Error("片段范围无效或过大");
          }
          range = { ...range, offset };
        }
        const segment = { url, duration, range, key: key && { url: key.url, iv: key.iv || sequenceIv(sequence) } };
        segments.push(segment);
        previous = segment;
        sequence++;
        duration = 0;
        range = null;
        if (segments.length > 20000) throw new Error("视频片段数量超出支持范围");
      }
    }
    if (variants.length) return { variants };
    if (!lines.includes("#EXT-X-ENDLIST")) throw new Error("暂不支持正在进行的直播，请等待回放生成");
    if (!segments.length) throw new Error("播放列表没有视频片段");
    return { segments };
  }

  function delay(ms, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  async function readBytes(url, { signal, limit, range = null }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      try {
        const response = await fetch(url, {
          credentials: "same-origin", signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
          ...(range ? { headers: { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } } : {}),
        });
        if (!response.ok) {
          await response.body?.cancel();
          const error = new Error([401, 403].includes(response.status)
            ? "播放地址或登录状态已失效，请刷新课程后重试" : `视频请求失败（${response.status}）`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        if (range && response.status !== 206) {
          await response.body?.cancel();
          throw new Error("视频服务器不支持片段范围请求");
        }
        if (Number(response.headers.get("content-length")) > limit) {
          await response.body?.cancel();
          throw new Error("单个视频片段超出安全大小限制");
        }
        const reader = response.body.getReader();
        const chunks = [];
        let length = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > limit) { await reader.cancel(); throw new Error("视频数据超出安全大小限制"); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(length);
        let position = 0;
        for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
        if (range && bytes.length !== range.length) throw new Error("视频片段不完整，请重试");
        return bytes;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt === 2 || !(error.retryable || error.name === "TypeError" || error.name === "TimeoutError")) {
          if (error.name === "TypeError") throw new Error("无法读取视频源，可能是网络或跨域访问限制");
          throw error;
        }
        await delay(400 * (attempt + 1), signal);
      }
    }
  }

  async function yieldTask() {
    if (globalThis.scheduler?.yield) await scheduler.yield();
    else await new Promise(resolve => setTimeout(resolve, 0));
  }

  function initializeDuration(init, seconds) {
    // mux.js emits an MSE initialization segment with unknown movie duration.
    // A downloaded, complete VOD file needs finite movie/track durations so
    // browsers don't infer an incomplete duration while parsing fragments.
    const bytes = init.slice();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let movieScale = 90000;
    function writeDuration(at, scale) {
      const duration = Math.round(seconds * scale);
      if (!Number.isSafeInteger(duration) || duration > 0xfffffffe) throw new Error("视频时长超出 MP4 封装范围");
      view.setUint32(at, duration);
    }
    function visit(start, end) {
      for (let position = start; position + 8 <= end;) {
        const size = view.getUint32(position);
        const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
        if (size < 8 || position + size > end) throw new Error("MP4 初始化信息无效");
        if (["moov", "trak", "mdia", "mvex"].includes(type)) visit(position + 8, position + size);
        else if (["mvhd", "mdhd"].includes(type) && size >= 28 && bytes[position + 8] === 0) {
          const scale = view.getUint32(position + 20);
          if (type === "mvhd") movieScale = scale;
          writeDuration(position + 24, scale);
        } else if (type === "tkhd" && size >= 32 && bytes[position + 8] === 0) writeDuration(position + 28, movieScale);
        else if (type === "mehd" && size >= 16 && bytes[position + 8] === 0) writeDuration(position + 12, movieScale);
        position += size;
      }
    }
    visit(0, bytes.length);
    return bytes;
  }

  async function download(url, { sink, signal, onProgress = () => {}, mux = globalThis.muxjs }) {
    let transmuxer = null;
    const keys = new Map();
    let writtenBytes = 0, initialized = false, output = [];
    async function write(bytes) {
      signal.throwIfAborted();
      await sink.write(bytes);
      writtenBytes += bytes.length;
    }
    try {
      // Direct MP4 sources can be streamed without remuxing or retaining a file
      // in memory. Other containers are not silently renamed to .mp4.
      if (/\.mp4$/i.test(new URL(url).pathname)) {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`视频请求失败（${response.status}）`);
        if (response.headers.get("content-type")?.includes("text/html")) {
          await response.body?.cancel();
          throw new Error("服务器返回了网页而不是视频，请刷新课程后重试");
        }
        const total = Number(response.headers.get("content-length")) || 0;
        const reader = response.body.getReader();
        let verified = false, prefixLength = 0;
        const prefix = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!verified) {
              prefix.push(value); prefixLength += value.length;
              if (prefixLength < 12) continue;
              const header = new Uint8Array(12);
              let at = 0;
              for (const chunk of prefix) {
                const count = Math.min(chunk.length, 12 - at);
                header.set(chunk.subarray(0, count), at); at += count;
                if (at === 12) break;
              }
              if (String.fromCharCode(...header.subarray(4, 8)) !== "ftyp") throw new Error("视频源不是有效的 MP4 文件");
              for (const chunk of prefix) await write(chunk);
              prefix.length = 0;
              verified = true;
            } else await write(value);
            onProgress({ percent: total ? Math.min(99, writtenBytes / total * 100) : null, writtenBytes });
          }
        } finally { await reader.cancel(); reader.releaseLock(); }
        if (!verified || !writtenBytes) throw new Error("视频文件为空或不完整");
        return { writtenBytes };
      }
      let playlist;
      for (let depth = 0; depth < 4; depth++) {
        const bytes = await readBytes(mediaUrl(url), { signal, limit: MAX_PLAYLIST_BYTES });
        playlist = parsePlaylist(new TextDecoder().decode(bytes), url);
        if (!playlist.variants) break;
        url = playlist.variants.sort((a, b) => b.bandwidth - a.bandwidth)[0].url;
      }
      if (!playlist?.segments) throw new Error("播放列表层级过多");
      const Transmuxer = mux?.Transmuxer || mux?.mp4?.Transmuxer;
      if (!Transmuxer) throw new Error("视频封装模块尚未加载，请刷新后重试");
      transmuxer = new Transmuxer({ remux: true, keepOriginalTimestamps: false });
      const totalDuration = playlist.segments.reduce((sum, segment) => sum + segment.duration, 0);
      transmuxer.on("data", segment => {
        if (!initialized) { output.push(initializeDuration(segment.initSegment, totalDuration)); initialized = true; }
        output.push(segment.data);
      });
      let doneDuration = 0;
      for (let index = 0; index < playlist.segments.length; index++) {
        const segment = playlist.segments[index];
        let bytes = await readBytes(segment.url, { signal, limit: MAX_SEGMENT_BYTES, range: segment.range });
        if (segment.key) {
          let key = keys.get(segment.key.url);
          if (!key) {
            const raw = await readBytes(segment.key.url, { signal, limit: 4096 });
            try {
              if (raw.length !== 16) throw new Error("接口不是标准 HLS 密钥格式，此版本不支持下载");
              key = await crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["decrypt"]);
            } finally { raw.fill(0); }
            if (keys.size >= 8) keys.clear();
            keys.set(segment.key.url, key);
          }
          try {
            const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: segment.key.iv }, key, bytes));
            bytes.fill(0);
            bytes = plain;
          } catch { throw new Error("视频片段无法按标准 HLS 解密，此版本不支持下载"); }
        }
        if (bytes.length < 188 * 3 || bytes.length % 188 || bytes[0] !== 0x47 || bytes[188] !== 0x47 || bytes[376] !== 0x47) {
          throw new Error("视频片段不是受支持的 MPEG-TS 格式");
        }
        for (let offset = 0; offset < bytes.length; offset += 512 * 1024) {
          signal.throwIfAborted();
          transmuxer.push(bytes.subarray(offset, offset + 512 * 1024));
          await yieldTask();
        }
        transmuxer.flush();
        if (!output.length) throw new Error("视频片段没有产生可播放的 MP4 数据");
        for (const chunk of output) await write(chunk);
        output = [];
        doneDuration += segment.duration;
        onProgress({ percent: Math.min(99, doneDuration / totalDuration * 100), writtenBytes, segments: index + 1, totalSegments: playlist.segments.length });
      }
      return { writtenBytes, segments: playlist.segments.length };
    } finally { keys.clear(); transmuxer?.dispose?.(); }
  }

  function filename(title) {
    const name = String(title || "课程视频").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[.\s]+$/g, "").slice(0, 120) || "课程视频";
    return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? "_" : ""}${name}.mp4`;
  }

  modules.downloadStream = Object.freeze({ parsePlaylist, sequenceIv, mediaUrl, readBytes, download, filename });
})();
