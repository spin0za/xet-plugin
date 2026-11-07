(() => {
  // All message text stays in this page's memory/DOM. Nothing is returned to
  // the extension worker, persisted, or sent outside the original site flow.
  function installLiveChat(expectedPath) {
    const KEY = "__xetLiveChat", STOP = "xet:live-chat-stop", VERSION = 2;
    const HISTORY = "/_alive/api/alive/xe.alive.get.history.msg/1.0.0";
    const match = location.pathname.match(/^\/p\/t_pc\/live_pc\/pc\/(l_[\w-]+)\/?$/);
    if (!match || location.pathname !== expectedPath) return { ok: false };
    const root = document.querySelector(".input-container"), v = root?.__vue__, input = v?.$refs?.inputer;
    const button = root?.querySelector("button.send");
    if (v?.$options?.name !== "Inputer" || typeof v.sendMsg !== "function" || typeof v.$watch !== "function" ||
        !input || input.tagName !== "TEXTAREA" || !button || v.roomInfo?.alive_id !== match[1] ||
        !v.roomInfo.user_id || !v.roomInfo.room_id || typeof v.$axios?.post !== "function") {
      window[KEY]?.stop(); return { ok: false, reason: "not-ready" };
    }
    const previous = window[KEY];
    if (previous?.active && previous.version === VERSION && previous.vm === v && previous.path === expectedPath && v.sendMsg === previous.sendMsg) return { ok: true };
    previous?.stop();
    const original = v.sendMsg;
    const state = { active: true, version: VERSION, vm: v, path: expectedPath, current: null, records: new Set(), hidden: new Set() };
    const live = () => state.active && location.pathname === expectedPath && root.isConnected &&
      root.__vue__ === v && !v._isDestroyed && v.roomInfo?.alive_id === match[1];
    const areas = () => (v.$parent?.$children || []).filter(c => ["teacherArea", "discussArea"].includes(c.$options?.name));
    const isReplay = () => Number(v.roomInfo.alive_state) === 3 && Number(v.roomInfo.is_lookback) === 1;
    const afterRender = task => v.$nextTick(task);
    function nativeMessage(r) {
      return r.commentId && areas().flatMap(a => a.msgArr || []).find(m => m?.comment_id === r.commentId &&
        m.user_id === r.userId && (r.saved || typeof m.msg_tag === "string" && m.msg_tag.length > 0));
    }
    function text(r, message) { r.status.textContent = message; }
    function remove(r, confirmed = true) {
      clearTimeout(r.timer); clearTimeout(r.verifyTimer); r.verifyAbort?.abort();
      r.node.remove(); state.records.delete(r);
      if (confirmed) for (const el of r.hidden) { el.removeAttribute("data-xet-chat-unconfirmed"); state.hidden.delete(el); }
    }
    const canVerify = r => live() && state.records.has(r) && !r.saved && r.commentId &&
      v.roomInfo.user_id === r.userId && v.roomInfo.room_id === r.roomId;
    async function verifySaved(r) {
      if (!canVerify(r) || r.verifying || r.attempts >= 3 || typeof v.$axios?.post !== "function") return;
      r.verifying = true; r.attempts += 1;
      const abort = new AbortController(); r.verifyAbort = abort;
      let timeout;
      try {
        // Only read recent discussion history. Never repeat a send/save call,
        // and do not replace the native list or change its paging/scroll state.
        const response = await Promise.race([
          v.$axios.post(HISTORY, { loadOrder: 1, infoType: 2, comment_id: "", loadHistory: 0, size: 20,
            alive_id: match[1], room_id: r.roomId }, { noLoading: true, timeout: 8000, signal: abort.signal }),
          new Promise((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error("history-timeout")); }, 8000); })
        ]);
        if (!canVerify(r)) return;
        const saved = response?.code === 0 && Array.isArray(response.data?.msgs) && response.data.msgs.some(m =>
          m?.comment_id === r.commentId && m.user_id === r.userId && m.alive_id === match[1] && m.content_type === 0);
        if (saved) {
          r.saved = true; r.edit.hidden = true;
          // A native fake/local echo is safe to reveal only after the server
          // independently confirms the same user's same message in this room.
          if (nativeMessage(r)) { remove(r); return; }
          r.node.dataset.state = "saved";
          text(r, r.replay ? "已保存到回放讨论" : "已保存到消息记录");
          r.dismiss.hidden = false;
          return;
        }
      } catch { /* Failure to read history is not evidence that sending failed. */ }
      finally { clearTimeout(timeout); r.verifying = false; if (r.verifyAbort === abort) r.verifyAbort = null; }
      if (!canVerify(r)) return;
      if (r.attempts < 3) r.verifyTimer = setTimeout(() => { void verifySaved(r); }, r.attempts * 1000);
      else {
        r.node.dataset.state = "unconfirmed";
        text(r, "未确认是否保存，请先检查消息记录，勿重复发送"); r.edit.hidden = false;
      }
    }
    function reconcile() {
      if (!live()) return;
      for (const r of state.records) {
        if (r.finished && nativeMessage(r)) { remove(r); continue; }
        const active = areas().find(a => a.$options.name === (v.currentTab === "teacherMsg" ? "teacherArea" : "discussArea"));
        const host = active?.$refs?.messageWrapper?.$el;
        if (["teacherMsg", "discuss"].includes(v.currentTab) && host?.isConnected && r.node.parentNode !== host) host.append(r.node);
        // The native save-error fallback inserts a fake message with no
        // msg_tag. Keep our explicit unconfirmed state instead of duplicating
        // that fallback as an apparently delivered message.
        if (!r.finished || !r.commentId || r.saved) continue;
        for (const a of areas()) for (const c of a.$refs?.messageWrapper?.$children || []) {
          if (c.msg?.comment_id !== r.commentId || c.msg?.msg_tag || !c.$el?.setAttribute) continue;
          c.$el.setAttribute("data-xet-chat-unconfirmed", "true"); r.hidden.add(c.$el); state.hidden.add(c.$el);
        }
      }
    }
    function restoreEditor(r, stopping = false) {
      if (!r.editor) return;
      const draft = r.editor.value, focused = document.activeElement === r.editor;
      r.editor.remove(); r.editor = null;
      input.removeAttribute("data-xet-chat-original");
      if (input.isConnected && !v._isDestroyed && location.pathname === expectedPath &&
          v.roomInfo?.alive_id === match[1] && root.__vue__ === v) {
        // The real textarea still contained the original submitted value so
        // the native asynchronous callbacks could run unchanged. Only now
        // transfer the independent next-message draft back into Vue.
        if (!stopping || draft) v.content = draft;
        if (focused) input.focus({ preventScroll: true });
      }
      button.removeAttribute("data-xet-chat-busy"); button.removeAttribute("aria-busy");
      if (r.buttonDisabled) button.setAttribute("disabled", ""); else button.removeAttribute("disabled");
      if (r.buttonLabel === null) button.removeAttribute("aria-label"); else button.setAttribute("aria-label", r.buttonLabel);
      // Disabling the feature must not expose a newer draft to a still-running
      // old callback that will clear content. This one-shot tail only protects
      // the native editor; it cannot send, retry or create UI.
      if (stopping && draft && v.input_state === 0 && !v._isDestroyed) {
        let latest = draft, off;
        const changed = () => { latest = input.value; };
        const cleanup = () => { off?.(); input.removeEventListener("input", changed); v.$off?.("hook:beforeDestroy", cleanup); };
        input.addEventListener("input", changed);
        off = v.$watch("input_state", value => {
          if (value !== 1) return;
          afterRender(() => {
            if (!v._isDestroyed && input.isConnected && location.pathname === expectedPath &&
                v.roomInfo?.alive_id === match[1] && root.__vue__ === v &&
                (!v.content || v.content === r.message)) v.content = latest;
            cleanup();
          });
        }, { sync: true });
        v.$once?.("hook:beforeDestroy", cleanup);
      }
    }
    function finish(r) {
      if (!live() || r.finished || state.current !== r) return;
      r.finished = true; clearTimeout(r.timer); state.current = null;
      restoreEditor(r);
      if (nativeMessage(r)) { remove(r); return; }
      r.node.dataset.state = r.commentId ? "checking" : "unconfirmed";
      text(r, r.commentId ? "正在核对是否已保存，请勿重复发送…" : "未发送，请查看网站提示");
      r.edit.hidden = Boolean(r.commentId);
      r.dismiss.hidden = false;
      reconcile();
      if (r.commentId) void verifySaved(r);
    }
    function begin() {
      // Native isOnReplay means "replying to a message", NOT video replay.
      // Replies/recordings stay native; ordinary replay discussion is supported.
      if (!live() || state.current || v.inRecordMode || v.isOnReplay || v.isReplyDiscuss || v.isForbidTalk ||
          typeof v.content !== "string" || !v.content.trim()) return;
      const r = { message: v.content, uid: crypto.randomUUID().replaceAll("-", ""), commentId: null,
        finished: false, saved: false, attempts: 0, userId: v.roomInfo.user_id, roomId: v.roomInfo.room_id, replay: isReplay(),
        hidden: new Set(), buttonDisabled: button.hasAttribute("disabled"), buttonLabel: button.getAttribute("aria-label") };
      const node = document.createElement("div"); node.className = "xet-chat-pending"; node.dataset.state = "pending";
      const author = document.createElement("div"); author.className = "xet-chat-author"; author.textContent = "我";
      const bubble = document.createElement("div"); bubble.className = "xet-chat-bubble"; bubble.textContent = r.message;
      const footer = document.createElement("div"); footer.className = "xet-chat-footer";
      const status = document.createElement("span"); status.className = "xet-chat-status"; status.id = `xet-chat-${r.uid}`;
      status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "恢复编辑"; edit.hidden = true;
      edit.addEventListener("click", event => {
        if (!event.isTrusted || !live() || state.current || !r.finished) return;
        if (v.content?.trim() && v.content !== r.message) { text(r, "输入框已有草稿，请先处理；此消息仍保留在这里"); return; }
        v.content = r.message; input.focus({ preventScroll: true });
        text(r, "已恢复到输入框；请确认是否需要重新发送");
      });
      const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.textContent = "移除提示";
      dismiss.title = "仅移除本地提示，不撤回消息"; dismiss.hidden = true;
      dismiss.addEventListener("click", event => { if (event.isTrusted && live() && r.finished) remove(r, r.saved); });
      footer.append(status, edit, dismiss); node.append(author, bubble, footer);
      Object.assign(r, { node, status, edit, dismiss });
      const a = areas().find(c => c.$options.name === (v.currentTab === "teacherMsg" ? "teacherArea" : "discussArea"));
      const host = a?.$refs?.messageWrapper?.$el;
      if (!host?.isConnected) return; // Keep unsupported layouts completely native.
      host.append(node); state.records.add(r); state.current = r; text(r, "发送中…");
      // A separate, native-styled draft editor avoids modifying content while
      // the site's send/validation callbacks are still using it.
      r.editor = input.cloneNode(false); r.editor.value = "";
      r.editor.removeAttribute("id"); r.editor.removeAttribute("disabled"); r.editor.classList.add("xet-chat-draft");
      r.editor.placeholder = "上一条发送中，可继续输入…";
      r.editor.setAttribute("aria-label", "下一条消息草稿"); r.editor.setAttribute("aria-describedby", status.id);
      r.editor.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
        if (event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey) {
          event.preventDefault(); r.editor.setRangeText("\n", r.editor.selectionStart, r.editor.selectionEnd, "end"); return;
        }
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault(); event.stopPropagation(); text(r, "上一条仍在发送，当前草稿已保留");
      });
      const focus = document.activeElement === input || document.activeElement === button;
      input.setAttribute("data-xet-chat-original", "true"); input.after(r.editor);
      button.setAttribute("data-xet-chat-busy", "true"); button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-label", "发送中"); button.setAttribute("disabled", "");
      if (focus) r.editor.focus({ preventScroll: true });
      a.$refs.scrollWrapper?.scrollToBottom?.();
      r.timer = setTimeout(() => { if (live() && !r.finished) text(r, "仍在等待确认，请勿重复发送；草稿会保留"); }, 15000);
    }
    function sendMsg(payload, ...args) {
      const r = state.current;
      if (live() && r && !r.finished && payload?.content_type === 0 && payload.content === r.message) {
        // Native getSendMsgObj explicitly accepts an existing comment_id and
        // uses it unchanged for persistence, IM, echo dedupe and error fallback.
        if (!payload.comment_id) payload.comment_id = r.uid;
        r.commentId = payload.comment_id;
      }
      return original.call(this, payload, ...args);
    }
    const offPhase = v.$watch("input_state", value => {
      if (!live()) return;
      if (value === 0) begin();
      else if (value === 1 && state.current) { const r = state.current; afterRender(() => finish(r)); }
    }, { sync: true });
    const offMessages = v.$watch(() => areas().map(a => (a.msgArr || []).filter(m => m.user_id === v.roomInfo.user_id)
      .map(m => `${m.comment_id}:${m.msg_tag || ""}`).join(",")).join("|"), () => afterRender(reconcile));
    const offTab = v.$watch(() => v.currentTab, () => afterRender(reconcile));
    const offMode = v.$watch(() => Boolean(v.isForbidTalk || v.inRecordMode), value => {
      if (state.current?.editor) state.current.editor.disabled = value;
    });
    function stop() {
      if (!state.active) return;
      state.active = false; offPhase(); offMessages(); offMode(); offTab();
      if (v.sendMsg === sendMsg) v.sendMsg = original;
      if (state.current) restoreEditor(state.current, true);
      for (const r of state.records) { clearTimeout(r.timer); clearTimeout(r.verifyTimer); r.verifyAbort?.abort(); r.node.remove(); }
      state.records.clear(); state.current = null;
      for (const el of state.hidden) el.removeAttribute("data-xet-chat-unconfirmed");
      state.hidden.clear(); window.removeEventListener(STOP, stop);
    }
    state.sendMsg = sendMsg; state.stop = stop; window[KEY] = state; v.sendMsg = sendMsg;
    window.addEventListener(STOP, stop);
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^\/p\/t_pc\/live_pc\/pc\/l_[\w-]+\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || new URL(sender.url).pathname !== message.path || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] } : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installLiveChat, args: [message.path] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetLiveChatSource = Object.freeze({ installLiveChat, resolve });
})();
