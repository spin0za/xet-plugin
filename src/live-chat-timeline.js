(() => {
  if (globalThis.XetReplayTimeline) return;
  function parsePlaylist(text) {
    if (typeof text !== "string" || text.length > 4_000_000 || !text.startsWith("#EXTM3U") || !text.includes("#EXT-X-ENDLIST")) return null;
    const segments = [];
    let media = 0, wall = null, duration = null, discontinuity = false, previous = -Infinity;
    for (const line of text.split(/\r?\n/).map(l => l.trim())) {
      if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
        const stamp = line.slice(25);
        if (!/(?:Z|[+-]\d\d:\d\d)$/i.test(stamp)) return null;
        wall = Date.parse(stamp) / 1000;
        if (!Number.isFinite(wall)) return null;
        discontinuity = false;
      } else if (line === "#EXT-X-DISCONTINUITY") { discontinuity = true; wall = null; }
      else if (line.startsWith("#EXTINF:")) duration = Number.parseFloat(line.slice(8));
      else if (line && !line.startsWith("#") && duration !== null) {
        if (!Number.isFinite(wall) || discontinuity || !(duration > 0) || duration > 120 || wall < previous) return null;
        segments.push({ media, wall, duration }); previous = wall;
        media += duration; wall += duration; duration = null;
      }
    }
    if (!segments.length) return null;
    return { segments, duration: media, start: segments[0].wall,
      end: segments.reduce((end, s) => Math.max(end, s.wall + s.duration), -Infinity) };
  }
  function wallTime(timeline, time) {
    if (!timeline || !Number.isFinite(time) || time < 0 || time > timeline.duration + 1) return null;
    const a = timeline.segments;
    let lo = 0, hi = a.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid].media <= time) lo = mid + 1; else hi = mid; }
    const s = a[Math.max(0, lo - 1)];
    return s.wall + Math.min(s.duration, Math.max(0, time - s.media));
  }
  function mediaTime(timeline, epoch) {
    if (!timeline || !Number.isFinite(epoch)) return null;
    const a = timeline.segments;
    let lo = 0, hi = a.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid].wall <= epoch) lo = mid + 1; else hi = mid; }
    // Overlapping, second-resolution PDT anchors are allowed. Prefer the
    // earliest covering segment so a message is not repeated at a boundary.
    let found = null;
    for (let i = lo - 1; i >= 0 && epoch - a[i].wall <= 120; i--) {
      const s = a[i];
      if (epoch < s.wall + s.duration) found = s.media + epoch - s.wall;
    }
    return found;
  }
  function timestamp(message) {
    const n = Number(message?.created_timestamp);
    return Number.isFinite(n) && n > 1_000_000_000 ? (n > 1e12 ? n / 1000 : n) : null;
  }
  function indexMessages(messages, timeline) {
    const during = [], after = [];
    for (const msg of messages) {
      const epoch = timestamp(msg);
      if (epoch === null) continue;
      const time = mediaTime(timeline, epoch);
      if (time !== null) during.push({ msg, time });
      else if (epoch >= timeline.end) after.push({ msg, time: epoch });
    }
    const sort = (a, b) => a.time - b.time || String(a.msg.comment_id).localeCompare(String(b.msg.comment_id));
    during.sort(sort); after.sort(sort);
    return { during, after };
  }
  globalThis.XetReplayTimeline = Object.freeze({ parsePlaylist, wallTime, mediaTime, timestamp, indexMessages });
})();
