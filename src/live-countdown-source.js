(() => {
  function installLiveCountdown(expectedPath) {
    const KEY = "__xetLiveCountdown", STOP = "xet:live-countdown-stop", VERSION = 2;
    if (location.pathname !== expectedPath || !/^\/detail\/l_[\w-]+\/4\/?$/.test(expectedPath)) return { ok: false };
    const nodes = [...document.querySelectorAll(".status-wrapper")];
    const vms = nodes.map(node => node.__vue__).filter(v => v && typeof v.getTime === "function" &&
      typeof v.formate === "function" && typeof v.$watch === "function" && "count" in v && "liveStatus" in v);
    if (!vms.length) return { ok: false, reason: "not-ready" };
    const old = window[KEY];
    if (old?.active && old.version === VERSION && old.path === expectedPath && old.vms.length === vms.length &&
        old.vms.every((v, i) => v === vms[i])) { old.tick(); return { ok: true }; }
    old?.stop();
    const state = { active: true, version: VERSION, path: expectedPath, vms, records: [], timer: null };
    const live = () => state.active && location.pathname === expectedPath &&
      vms.every(v => !v._isDestroyed && nodes.some(node => node.isConnected && node.__vue__ === v));
    function tick() {
      if (!live()) { stop(); return; }
      for (const r of state.records) {
        const v = r.vm;
        if (Number(v.status) !== 0 || v.liveStatus !== 0 || r.deadline === null) continue;
        const left = Math.max(0, r.deadline - Date.now());
        // Reuse the site's formatter and Vue render. Its formatter subtracts a
        // second from count; overwrite that decrement with actual time left.
        v.getTime(left); v.count = left;
        if (left === 0) v.liveStatus = 1; // Same native "broadcasting" transition; no navigation.
      }
    }
    function reset(r, initial = false) {
      const v = r.vm;
      clearInterval(v.timer); v.timer = null;
      r.deadline = null;
      const duration = Number(v.time);
      if (Number(v.status) !== 0 || !Number.isFinite(duration) || duration <= 0) {
        r.previousDeadline = null; return;
      }
      const now = Date.now();
      // time is the server-provided remaining MILLISECONDS, not an absolute
      // date. Anchor it to the response that supplied it, so late installation
      // cannot restart the original duration. Never parse the localized label.
      const response = performance.getEntriesByType("resource").filter(entry => {
        try { const url = new URL(entry.name); return url.origin === location.origin &&
          url.pathname === "/api/xe.goods.detail.get/2.0.0" && entry.responseEnd > 0; }
        catch { return false; }
      }).at(-1);
      const responseEnd = response?.responseEnd;
      const fresh = !initial && (v.time !== r.previousTime || responseEnd > r.lastResponse);
      if (v.liveStatus !== 0 && !fresh) { r.previousDeadline = null; return; }
      if (fresh) v.liveStatus = 0;
      if (!initial && r.previousTime === v.time && r.previousInfo === v.$parent?.infos &&
          r.previousDeadline !== null && (!Number.isFinite(responseEnd) || responseEnd <= r.lastResponse)) {
        r.deadline = r.previousDeadline;
      } else if (Number.isFinite(responseEnd) && (initial || responseEnd > r.lastResponse)) {
        // timeOrigin stays anchored to navigation wall time even when the
        // performance clock pauses during OS sleep. Do not rebase an old
        // response onto Date.now() after waking.
        const responseEpoch = !initial ? now : Number.isFinite(performance.timeOrigin) ? performance.timeOrigin + responseEnd :
          now - Math.max(0, performance.now() - responseEnd);
        r.deadline = responseEpoch + duration;
        r.lastResponse = responseEnd;
      } else {
        // If resource timing was cleared, initial count is the native next
        // tick's value. New prop deliveries are fresh server durations.
        const left = initial && Number.isFinite(Number(v.count)) ? Number(v.count) + 1000 : duration;
        r.deadline = now + Math.max(0, Math.min(duration, left));
      }
      r.previousTime = v.time; r.previousInfo = v.$parent?.infos; r.previousDeadline = r.deadline;
      tick();
    }
    function stop() {
      if (!state.active) return;
      state.active = false; clearInterval(state.timer);
      document.removeEventListener("visibilitychange", visible, true);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
      document.removeEventListener("resume", tick);
      window.removeEventListener(STOP, stop);
      for (const r of state.records) {
        r.unwatch.forEach(off => off());
        const v = r.vm;
        if (v._isDestroyed || !v.$el?.isConnected || Number(v.status) !== 0 || v.liveStatus !== 0) continue;
        // Hand control back to the native watcher on disable or route exit.
        const remaining = r.deadline === null ? Number(v.count) : Math.max(0, r.deadline - Date.now());
        clearInterval(v.timer); v.timer = null;
        const handler = v.$options?.watch?.time?.handler;
        if (remaining > 0 && typeof handler === "function") handler.call(v, remaining, undefined);
        else if (remaining <= 0) { v.getTime(0); v.count = 0; v.liveStatus = 1; }
      }
    }
    function visible() { if (document.visibilityState === "visible") tick(); }
    state.tick = tick; state.stop = stop; window[KEY] = state;
    for (const v of vms) {
      const r = { vm: v, deadline: null, lastResponse: -1, unwatch: [] };
      state.records.push(r);
      r.unwatch.push(v.$watch(() => v.time, () => reset(r)),
        v.$watch(() => v.status, () => reset(r)),
        v.$watch(() => v.$parent?.infos, () => reset(r)));
      reset(r, true);
    }
    state.timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", visible, true);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    document.addEventListener("resume", tick);
    window.addEventListener(STOP, stop);
    return { ok: true };
  }
  function installLiveRoomCountdown(expectedPath) {
    const KEY = "__xetLiveCountdown", STOP = "xet:live-countdown-stop", VERSION = 2;
    const match = expectedPath.match(/^\/p\/t_pc\/live_pc\/pc\/(l_[\w-]+)\/?$/);
    if (!match || location.pathname !== expectedPath) return { ok: false };
    const nodes = [...document.querySelectorAll(".count-down, .count-down-for-warm-up-vedio")];
    const vms = [...new Set(nodes.map(n => n.__vue__).filter(v =>
      ["countDwon", "countDownForWarmUpVedio"].includes(v?.$options?.name) &&
      typeof v.timeConvert === "function" && typeof v.addZero === "function" && typeof v.$watch === "function" &&
      v.roomInfo?.alive_id === match[1]))];
    if (!vms.length) return { ok: false, reason: "not-ready" };
    const previous = window[KEY];
    if (previous?.active && previous.version === VERSION && previous.kind === "room" && previous.path === expectedPath &&
        previous.vms.length === vms.length && previous.vms.every((v, i) => v === vms[i])) { previous.tick(); return { ok: true }; }
    previous?.stop();
    const state = { active: true, version: VERSION, kind: "room", path: expectedPath, vms, records: [], timer: null };
    const valid = () => state.active && location.pathname === expectedPath && vms.every(v =>
      !v._isDestroyed && v.roomInfo?.alive_id === match[1] && nodes.some(n => n.isConnected && n.__vue__ === v));
    function scheduledTime(value) {
      if (typeof value !== "string") return null;
      // This is the raw server field, explicitly parsed as CST like native;
      // never parse a translated date label or the viewer's local timezone.
      const stamp = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(" ", "T") + "+08:00" :
        /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : "";
      const result = stamp ? Date.parse(stamp) : NaN;
      return Number.isFinite(result) ? result : null;
    }
    function reset(r, initial = false) {
      const room = r.vm.roomInfo, start = scheduledTime(room.pushzb_start_at), enter = Number(room.enter_time) * 1000;
      if (start === null) { r.deadline = null; return; }
      if (r.enter !== enter || r.offset === null) {
        const response = performance.getEntriesByType("resource").filter(e => {
          try { const u = new URL(e.name); return u.origin === location.origin &&
            u.pathname === "/_alive/api/alive/xe.alive.page.get/1.0.0" && e.responseEnd > 0; }
          catch { return false; }
        }).at(-1);
        if (initial && Number.isFinite(enter) && enter > 0 && Number.isFinite(performance.timeOrigin) && response) {
          r.offset = performance.timeOrigin + response.responseEnd - enter;
          r.responseEnd = response.responseEnd;
        } else {
          // A fresh prop delivery can be anchored now; an old enter_time on
          // late installation cannot. Without timing use the absolute date.
          r.offset = !initial && Number.isFinite(enter) && enter > 0 ? Date.now() - enter : 0;
        }
        r.enter = enter;
      }
      r.deadline = start + r.offset; tick();
    }
    function seconds(r) {
      return valid() && Number(r.vm.roomInfo.alive_state) === 0 && r.deadline !== null ?
        Math.max(0, Math.floor((r.deadline - Date.now()) / 1000)) : null;
    }
    function tick() {
      if (!valid()) { stop(); return; }
      for (const r of state.records) { const left = seconds(r); if (left !== null) r.original.call(r.vm, left); }
    }
    function visible() { if (document.visibilityState === "visible") tick(); }
    function stop() {
      if (!state.active) return;
      state.active = false; clearInterval(state.timer);
      document.removeEventListener("visibilitychange", visible, true);
      document.removeEventListener("resume", tick);
      window.removeEventListener("focus", tick); window.removeEventListener("pageshow", tick);
      window.removeEventListener(STOP, stop);
      for (const r of state.records) {
        r.unwatch.forEach(off => off());
        if (r.vm.timeConvert === r.format) r.vm.timeConvert = r.original;
      }
    }
    state.tick = tick; state.stop = stop; window[KEY] = state;
    for (const v of vms) {
      const r = { vm: v, original: v.timeConvert, deadline: null, offset: null, enter: null, responseEnd: -1, unwatch: [] };
      r.format = function(value) { const left = seconds(r); return r.original.call(this, left === null ? value : left); };
      v.timeConvert = r.format; state.records.push(r);
      // Keep the native mounted/subscription logic and its eventual
      // countDownDone event intact. Only replace the stale value it formats.
      r.unwatch.push(v.$watch(() => v.roomInfo.pushzb_start_at, () => reset(r)),
        v.$watch(() => v.roomInfo.enter_time, () => reset(r)),
        v.$watch(() => v.roomInfo.alive_state, tick));
      reset(r, true);
    }
    state.timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", visible, true); document.addEventListener("resume", tick);
    window.addEventListener("focus", tick); window.addEventListener("pageshow", tick);
    window.addEventListener(STOP, stop);
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^(?:\/detail\/l_[\w-]+\/4|\/p\/t_pc\/live_pc\/pc\/l_[\w-]+)\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || new URL(sender.url).pathname !== message.path || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const room = message.path.startsWith("/p/t_pc/live_pc/pc/");
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: room ? installLiveRoomCountdown : installLiveCountdown, args: [message.path] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetLiveCountdownSource = Object.freeze({ installLiveCountdown, installLiveRoomCountdown, resolve });
})();
