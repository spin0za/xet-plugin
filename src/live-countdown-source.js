(() => {
  function installLiveCountdown(expectedPath) {
    const KEY = "__xetLiveCountdown", STOP = "xet:live-countdown-stop";
    if (location.pathname !== expectedPath || !/^\/detail\/l_[\w-]+\/4\/?$/.test(expectedPath)) return { ok: false };
    const nodes = [...document.querySelectorAll(".status-wrapper")];
    const vms = nodes.map(node => node.__vue__).filter(v => v && typeof v.getTime === "function" &&
      typeof v.formate === "function" && typeof v.$watch === "function" && "count" in v && "liveStatus" in v);
    if (!vms.length) return { ok: false, reason: "not-ready" };
    const old = window[KEY];
    if (old?.active && old.path === expectedPath && old.vms.length === vms.length &&
        old.vms.every((v, i) => v === vms[i])) { old.tick(); return { ok: true }; }
    old?.stop();
    const state = { active: true, path: expectedPath, vms, records: [], timer: null };
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
        r.deadline = now - Math.max(0, performance.now() - responseEnd) + duration;
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
    window.addEventListener(STOP, stop);
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^\/detail\/l_[\w-]+\/4\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || new URL(sender.url).pathname !== message.path || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installLiveCountdown, args: [message.path] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetLiveCountdownSource = Object.freeze({ installLiveCountdown, resolve });
})();
