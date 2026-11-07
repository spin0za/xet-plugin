(() => {
  function installReplayChat(expectedPath) {
    const KEY = "__xetReplayChat", STOP = "xet:live-chat-replay-stop";
    const HISTORY = "/_alive/api/alive/xe.alive.get.history.msg/1.0.0";
    const root = document.querySelector(".input-container"), v = root?.__vue__, tools = globalThis.XetReplayTimeline;
    const match = location.pathname.match(/^\/p\/t_pc\/live_pc\/pc\/(l_[\w-]+)\/?$/);
    const previous = window[KEY];
    if (!match || location.pathname !== expectedPath || v?.$options?.name !== "Inputer" ||
        v.roomInfo?.alive_id !== match[1] || Number(v.roomInfo.alive_state) !== 3 ||
        Number(v.roomInfo.is_lookback) !== 1 || !tools || typeof v.$axios?.post !== "function") {
      previous?.stop(); return { ok: false, reason: "not-replay" };
    }
    if (previous?.active && previous.vm === v && previous.path === expectedPath) return { ok: true };
    previous?.stop();
    const identity = { user: v.roomInfo.user_id, room: v.roomInfo.room_id };
    const state = { active: true, vm: v, path: expectedPath, timeline: null, video: null, panes: [], requests: new Set(), generation: 0 };
    const events = ["timeupdate", "seeked", "loadedmetadata", "durationchange", "play", "pause", "ratechange"];
    let timer = null, offTab = null, offSend = null, preparing = false, source = null, failed = false;
    const valid = () => state.active && root.isConnected && root.__vue__ === v && !v._isDestroyed &&
      location.pathname === expectedPath && v.roomInfo.alive_id === match[1] && v.roomInfo.user_id === identity.user &&
      v.roomInfo.room_id === identity.room && Number(v.roomInfo.alive_state) === 3;
    const activePane = () => ["teacherMsg", "discuss"].includes(v.currentTab) ?
      state.panes.find(p => p.area.$options.name === (v.currentTab === "teacherMsg" ? "teacherArea" : "discussArea")) : null;
    const areas = (v.$parent?.$children || []).filter(a => ["teacherArea", "discussArea"].includes(a.$options?.name));
    const Vue = v.$root?.constructor;
    if (areas.length !== 2 || typeof Vue?.extend !== "function" || areas.some(a =>
      a.skipHistoryLoad || !a.$refs?.messageWrapper?.constructor?.extend || !a.$el?.isConnected)) return { ok: false, reason: "unsupported-layout" };
    function element(tag, className, text) {
      const el = document.createElement(tag); el.className = className;
      if (text) el.textContent = text; return el;
    }
    async function request(task) {
      const controller = new AbortController(); state.requests.add(controller);
      let timeout;
      try {
        return await Promise.race([task(controller.signal), new Promise((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, 12000);
          controller.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
        })]);
      } finally { clearTimeout(timeout); state.requests.delete(controller); }
    }
    const playlistUrl = () => {
      const data = v.$store?.state?.PlayerModule?.lookBackPlayData, o = data?.lineOptions;
      const value = data?.lines?.[o?.lineIndex || 0]?.line_sharpness?.[o?.resolutionIndex || 0]?.url;
      try { const u = new URL(value, location.href); return u.protocol === "https:" && /\.m3u8$/i.test(u.pathname) ? u.href : null; }
      catch { return null; }
    };
    if (!playlistUrl() || !document.querySelector("video")) return { ok: false, reason: "player-not-ready" };
    function status(p, text) { p.status.textContent = text; }
    function showNative(p, reason = "") {
      p.mode = "native"; p.area.$el.dataset.xetReplayMode = "native";
      p.viewport.hidden = true; p.resume.hidden = true;
      if (reason) status(p, reason);
      updateButtons(p);
    }
    function updateButtons(p) {
      for (const [mode, button] of Object.entries(p.buttons)) button.setAttribute("aria-pressed", String(p.mode === mode));
      p.resume.hidden = p.mode !== "follow" || p.following;
      if (p.retry) p.retry.hidden = Boolean(state.timeline && !p.error);
    }
    function render(p, force = false) {
      if (!valid() || p.mode === "native" || !state.timeline || !state.video) return;
      if (p.mode === "follow" && !p.following && !force) return;
      const time = p.mode === "follow" && !p.following ? p.freezeTime : state.video.currentTime;
      const indexed = p.index || { during: [], after: [] };
      const available = p.mode === "after" ? indexed.after : indexed.during.filter(m => m.time <= time);
      const rows = available.slice(-p.windowSize).map(m => m.msg);
      const key = `${p.mode}:${rows.length}:${rows[0]?.comment_id}:${rows.at(-1)?.comment_id}`;
      if (key !== p.renderKey) {
        const oldHeight = p.viewport.scrollHeight, oldTop = p.viewport.scrollTop;
        p.renderKey = key; p.view.rows = rows;
        p.view.$nextTick(() => {
          if (!valid()) return;
          if (p.mode === "follow" && p.following) p.viewport.scrollTop = p.viewport.scrollHeight;
          else if (!p.following) p.viewport.scrollTop = oldTop + p.viewport.scrollHeight - oldHeight;
          window.dispatchEvent(new Event("xet:live-chat-reflow"));
        });
      }
      if (!p.loading && !p.error) status(p, p.mode === "after" ? "录像结束后的留言，不对应视频进度" :
        rows.length ? (p.following ? "正在跟随回放" : "已暂停跟随") : "当前进度暂无消息");
      updateButtons(p);
    }
    async function load(p) {
      if (!valid() || activePane() !== p || p.loading || p.mode === "native" || !state.timeline || !state.video || (p.mode === "follow" && !p.following)) return;
      p.loading = true; p.error = false;
      try {
        while (valid() && activePane() === p && p.mode !== "native" && !p.finished) {
          const target = tools.wallTime(state.timeline, state.video.currentTime);
          if (p.mode === "follow" && (!p.following || (p.started && target !== null && p.loadedUntil >= target + 30))) break;
          status(p, `正在读取聊天记录（${p.messages.size} 条）…`);
          const response = await request(signal => v.$axios.post(HISTORY, { loadOrder: p.started ? 1 : 0,
            infoType: p.area.infoType, comment_id: p.cursor || "", loadHistory: 0, size: 50,
            alive_id: match[1], room_id: identity.room }, { noLoading: true, timeout: 12000, signal }));
          if (!valid()) return;
          if (response?.code !== 0 || !Array.isArray(response.data?.msgs)) throw new Error("history");
          const rows = response.data.msgs;
          if (rows.some(m => m?.alive_id !== match[1])) throw new Error("wrong-room");
          const next = rows.at(-1)?.comment_id;
          if (rows.length && (!next || next === p.cursor || p.cursors.has(next))) throw new Error("cursor");
          for (const msg of rows) {
            if (msg?.alive_id !== match[1] || !msg.comment_id) continue;
            p.messages.set(msg.comment_id, msg);
            const ts = tools.timestamp(msg); if (ts !== null) p.loadedUntil = Math.max(p.loadedUntil, ts);
          }
          p.started = true; p.finished = Boolean(response.data.finish) || rows.length === 0;
          p.cursor = next; if (next) p.cursors.add(next);
          p.index = tools.indexMessages(p.messages.values(), state.timeline); render(p);
          // Yield without relying on background-tab animation frames.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch {
        if (valid()) { p.error = true; status(p, "聊天读取失败，可重试或查看原始列表"); }
      } finally { p.loading = false; if (valid()) render(p); }
    }
    function choose(p, mode) {
      if (!valid()) return;
      p.desiredMode = mode;
      if (mode === "native") { showNative(p, "网站原始消息列表"); window.dispatchEvent(new Event("xet:live-chat-reflow")); return; }
      if (!state.timeline) { status(p, "缺少可靠录制时间，暂不能对齐；保留原始列表"); return; }
      p.mode = mode; p.following = true; p.windowSize = 200; p.renderKey = null; p.error = false;
      // Re-entering notes checks only the cached tail for new post-live notes.
      if (mode === "after") p.finished = false;
      p.area.$el.dataset.xetReplayMode = mode; p.viewport.hidden = false;
      render(p, true); void load(p); window.dispatchEvent(new Event("xet:live-chat-reflow"));
    }
    try {
      for (const area of areas) {
        const original = [...area.$el.children];
        for (const el of original) el.setAttribute("data-xet-replay-original", "true");
        area.$el.setAttribute("data-xet-replay-area", "true");
        const host = element("div", "xet-replay-pane"), bar = element("div", "xet-replay-toolbar");
        const viewport = element("div", "xet-replay-viewport"); viewport.tabIndex = 0; viewport.setAttribute("aria-label", "回放聊天记录");
        const info = element("div", "xet-replay-status", "正在读取录像时间…"); info.setAttribute("role", "status");
        const mount = element("div", "xet-replay-messages"); viewport.append(mount);
        const Ctor = area.$refs.messageWrapper.constructor.extend({ methods: { saveMsgReadHistory() {} } });
        const view = new Vue({ parent: area, data: { rows: [] }, render(h) {
          return h(Ctor, { props: { msgArr: this.rows, partitionName: `xet-replay-${area.infoType}`, partitionIndex: area.infoType, topLoadStatus: 2 } });
        } });
        const p = { area, original, host, viewport, view, status: info, mode: "native", following: true,
          desiredMode: "follow", windowSize: 200, messages: new Map(), cursors: new Set(), loadedUntil: -Infinity, buttons: {} };
        for (const [mode, label] of [["follow", "跟随回放"], ["after", "课后留言"], ["native", "原始列表"]]) {
          const button = element("button", "xet-replay-mode", label); button.type = "button";
          button.addEventListener("click", event => { if (event.isTrusted) choose(p, mode); }); p.buttons[mode] = button; bar.append(button);
        }
        p.resume = element("button", "xet-replay-resume", "返回当前进度"); p.resume.type = "button";
        p.resume.addEventListener("click", event => { if (event.isTrusted) choose(p, "follow"); });
        const retry = element("button", "xet-replay-retry", "重试"); retry.type = "button";
        p.retry = retry;
        retry.addEventListener("click", event => { if (event.isTrusted) { if (!state.timeline) void prepare(); else { p.error = false; void load(p); } } });
        const footer = element("div", "xet-replay-footer"); footer.append(info, retry, p.resume);
        const outbox = element("div", "xet-replay-outbox");
        host.append(bar, viewport, outbox, footer); area.$el.append(host); state.panes.push(p); view.$mount(mount);
        const pause = event => {
          if (!event.isTrusted || p.mode !== "follow") return;
          if (p.following) p.freezeTime = state.video?.currentTime;
          p.following = false; status(p, "已暂停跟随"); updateButtons(p);
        };
        viewport.addEventListener("wheel", pause, { passive: true }); viewport.addEventListener("touchstart", pause, { passive: true });
        viewport.addEventListener("pointerdown", pause);
        viewport.addEventListener("keydown", event => { if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(event.key)) pause(event); });
        viewport.addEventListener("scroll", () => {
          if (p.mode === "follow" && !p.following && viewport.scrollTop < 30) { p.windowSize += 100; render(p, true); }
        }, { passive: true });
        showNative(p);
      }
    } catch { stop(); return { ok: false, reason: "unsupported-renderer" }; }
    function update() {
      if (!valid()) { stop(); return; }
      const p = activePane(); if (!p || !state.timeline) return;
      if (Number.isFinite(state.video?.duration) && Math.abs(state.video.duration - state.timeline.duration) > 2) {
        failed = true; state.timeline = null;
        for (const pane of state.panes) showNative(pane, "录像时长与时间表不符；保留原始列表");
        return;
      }
      render(p); if (!p.error) void load(p);
    }
    function bindVideo() {
      const video = document.querySelector("video");
      if (video === state.video) return;
      for (const event of events) state.video?.removeEventListener(event, update);
      state.video = video;
      for (const event of events) video?.addEventListener(event, update);
    }
    async function prepare() {
      if (!valid() || preparing) return;
      const url = playlistUrl(); if (!url) return;
      preparing = true; failed = false; const generation = ++state.generation;
      try {
        const text = await request(async signal => {
          const res = await fetch(url, { signal, credentials: "same-origin" });
          if (!res.ok) throw new Error("playlist"); return res.text();
        });
        const timeline = tools.parsePlaylist(text);
        if (!valid() || generation !== state.generation) return;
        if (!timeline || state.video?.duration && Math.abs(state.video.duration - timeline.duration) > 2) throw new Error("timeline");
        source = url; state.timeline = timeline;
        for (const p of state.panes) { p.index = tools.indexMessages(p.messages.values(), timeline); choose(p, p.desiredMode); }
        update();
      } catch {
        if (valid()) { failed = true; state.timeline = null; for (const p of state.panes) showNative(p, "无法可靠对齐录像时间；使用原始列表或重试"); }
      } finally { preparing = false; }
    }
    offTab = v.$watch(() => v.currentTab, () => { bindVideo(); update(); });
    offSend = v.$watch("input_state", value => {
      if (value !== 1 || !valid()) return;
      // The original sender may have added a new post-live comment. Resume
      // from the cached tail only when that notes pane is being viewed.
      for (const p of state.panes) p.finished = false;
      const p = activePane(); if (p?.mode === "after") void load(p);
    });
    timer = setInterval(() => {
      if (!valid()) { stop(); return; }
      bindVideo();
      // A different playlist must be verified before using the old time map.
      if (source && playlistUrl() !== source) { state.timeline = null; source = null; for (const p of state.panes) showNative(p, "正在核对新的录像时间…"); void prepare(); }
      else if (!source && !state.timeline && !failed) void prepare();
    }, 1000);
    function stop() {
      if (!state.active) return; state.active = false; state.generation++;
      clearInterval(timer); offTab?.(); offSend?.();
      for (const event of events) state.video?.removeEventListener(event, update);
      for (const controller of state.requests) controller.abort(); state.requests.clear();
      for (const p of state.panes) {
        p.view.$destroy(); p.area.$el.removeAttribute("data-xet-replay-area"); p.area.$el.removeAttribute("data-xet-replay-mode");
        for (const el of p.original) el.removeAttribute("data-xet-replay-original");
        window.dispatchEvent(new Event("xet:live-chat-reflow")); p.host.remove();
      }
      window.removeEventListener(STOP, stop);
    }
    state.stop = stop; window[KEY] = state;
    window.addEventListener(STOP, stop); bindVideo(); void prepare();
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^\/p\/t_pc\/live_pc\/pc\/l_[\w-]+\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || new URL(sender.url).pathname !== message.path || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] } : { tabId: sender.tab.id, frameIds: [0] };
    const [tools] = await chrome.scripting.executeScript({ target, world: "MAIN", files: ["src/live-chat-timeline.js"] });
    if (sender.documentId && tools?.documentId !== sender.documentId) return { ok: false };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installReplayChat, args: [message.path] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetReplayChatSource = Object.freeze({ installReplayChat, resolve });
})();
