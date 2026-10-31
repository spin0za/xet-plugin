(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.screenshot) return;

  function framePng(video) {
    const width = video.videoWidth, height = video.videoHeight;
    if (video.mediaKeys) throw Error("受保护的视频无法截帧");
    if (video.readyState < 2 || !width || !height) throw Error("视频帧尚未加载，请稍后重试");
    const canvas = document.createElement("canvas");
    // Intrinsic decoded frame size, never CSS size, viewport size or DPR.
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("无法创建视频帧画布");
    context.drawImage(video, 0, 0, width, height);
    const png = new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => {
          canvas.width = canvas.height = 0;
          if (blob?.size) resolve(blob);
          else reject(Error("视频帧编码失败，未复制截图"));
        }, "image/png");
      } catch (error) { canvas.width = canvas.height = 0; reject(error); }
    });
    return { width, height, png };
  }

  async function copyFrame(video, { clipboard = navigator.clipboard, Item = globalThis.ClipboardItem, fallback, preferRelay = false } = {}) {
    if (!clipboard?.write || !Item) throw Error("当前页面无法写入图片剪贴板，请使用 HTTPS 页面并检查扩展权限");
    const { width, height, png } = framePng(video);
    if (preferRelay && fallback) {
      await fallback(await png, { width, height });
      return { width, height };
    }
    // Freeze pixels synchronously at the gesture, and start clipboard.write
    // before awaiting PNG encoding so the original user activation is retained.
    try {
      const writing = clipboard.write([new Item({ "image/png": png })]);
      await Promise.all([png, writing]);
      return { width, height };
    } catch (error) {
      void png.catch(() => {});
      if (error.name !== "NotAllowedError" || !fallback) throw error;
      await fallback(await png, { width, height });
      return { width, height };
    }
  }

  function createScreenshotController({ playerDom }) {
    const records = new Map(), shadows = new Map();
    const pending = new Set();
    let observer = null, frame = null, busy = false, keyHandled = false;
    const { findPlayerRoot, findPlayerVideo, findActivePlayer, isEditableTarget, deepElements } = playerDom;

    function owner(host) {
      return findPlayerRoot(host) || (host.previousElementSibling?.tagName === "VIDEO" ? host.previousElementSibling : null);
    }
    function release(host, record) {
      clearTimeout(record.timer); record.resize.disconnect();
      record.control.remove(); record.status.remove();
      host.removeAttribute("data-xet-screenshot");
      host.style.removeProperty("--xet-screenshot-gap");
      records.delete(host);
    }
    function spacing(host) {
      const style = getComputedStyle(host);
      const gap = (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
      const value = `${Math.max(0, gap)}px`;
      if (host.style.getPropertyValue("--xet-screenshot-gap") !== value) host.style.setProperty("--xet-screenshot-gap", value);
    }
    function report(record, message) {
      if (!observer || !record.control.isConnected) return;
      clearTimeout(record.timer); record.status.textContent = message; record.status.hidden = false;
      record.control.dataset.feedback = "true";
      record.timer = setTimeout(() => { record.status.hidden = true; delete record.control.dataset.feedback; }, 4000);
    }
    async function relay(blob, size) {
      const png = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.slice("data:image/png;base64,".length));
        reader.onerror = () => reject(Error("无法读取视频帧图片"));
        reader.readAsDataURL(blob);
      });
      if (!observer) throw Error("截帧已取消");
      const result = await chrome.runtime.sendMessage({ type: "xet:screenshot-copy", png, ...size });
      if (!result?.ok) { const error = Error("无法写入剪贴板"); error.name = "NotAllowedError"; throw error; }
    }
    async function capture(record) {
      if (!observer || busy) return;
      const video = findPlayerVideo(record.root);
      if (!video) { report(record, "未找到可截取的视频帧"); return; }
      // A disabled focused button blurs inside fullscreen iframes. Preserve
      // keyboard focus so subsequent Alt+A / F / T stay in this player.
      busy = true; record.button.setAttribute("aria-busy", "true"); record.button.setAttribute("aria-disabled", "true");
      try {
        const embedded = window.top !== window, policy = document.permissionsPolicy || document.featurePolicy;
        const preferRelay = embedded && policy?.allowsFeature?.("clipboard-write") === false;
        const { width, height } = await copyFrame(video, { fallback: embedded ? relay : undefined, preferRelay });
        report(record, `已复制视频帧（${width} × ${height}）`);
      } catch (error) {
        report(record, error.name === "SecurityError" ? "视频跨域限制阻止截帧，未复制截图"
          : error.name === "NotAllowedError" ? "无法写入剪贴板，请确认当前窗口已激活并允许扩展写入剪贴板"
            : error.message || "截帧失败，未复制截图");
      } finally { busy = false; record.button.removeAttribute("aria-busy"); record.button.removeAttribute("aria-disabled"); }
    }
    function add(host) {
      const root = owner(host);
      if (!root || !findPlayerVideo(root)) return; // Audio has no video frame.
      const old = records.get(host);
      if (old) {
        old.root = root;
        const parent = root.tagName === "VIDEO" ? host : root;
        if (old.status.parentElement !== parent) parent.append(old.status);
        spacing(host); return;
      }
      const control = document.createElement("span"); control.className = "xet-screenshot-control";
      const button = document.createElement("button"); button.type = "button";
      button.className = "xet-screenshot-button"; button.setAttribute("aria-label", "截取视频帧并复制（Alt+A）");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 28 28"); icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", "M3 7h5l3-4h6l3 4h5v17H3z");
      const circle = document.createElementNS(icon.namespaceURI, "circle");
      circle.setAttribute("cx", "14"); circle.setAttribute("cy", "15"); circle.setAttribute("r", "5");
      icon.append(path, circle); button.append(icon);
      const tooltip = document.createElement("span"); tooltip.className = "xet-screenshot-tooltip";
      tooltip.textContent = "截屏（Alt+A）";
      const status = document.createElement("span"); status.className = "xet-screenshot-status";
      status.hidden = true; status.setAttribute("role", "status");
      control.append(button, tooltip);
      const resize = new ResizeObserver(() => spacing(host));
      const record = { root, control, button, status, resize, timer: null };
      records.set(host, record); host.setAttribute("data-xet-screenshot", "true");
      host.append(control); (root.tagName === "VIDEO" ? host : root).append(status);
      spacing(host); resize.observe(host);
      button.addEventListener("click", event => {
        if (!event.isTrusted) return;
        event.preventDefault(); event.stopImmediatePropagation(); void capture(record);
      });
    }
    function discover(scope) {
      const nodes = deepElements(scope);
      if (scope instanceof Element) nodes.push(scope);
      for (const node of nodes) {
        if (node.shadowRoot && !shadows.has(node.shadowRoot)) {
          const watcher = new MutationObserver(schedule);
          watcher.observe(node.shadowRoot, { childList: true, subtree: true }); shadows.set(node.shadowRoot, watcher);
        }
        if (node.matches(".xet-download-control")) add(node);
      }
    }
    function refresh() {
      frame = null;
      if (!observer) return;
      for (const [host, record] of records) if (!host.isConnected || !owner(host) || !findPlayerVideo(owner(host))) release(host, record);
      for (const node of pending) if (node.isConnected) discover(node);
      pending.clear();
      for (const [root, watcher] of shadows) if (!root.host.isConnected) { watcher.disconnect(); shadows.delete(root); }
    }
    function schedule(changes) {
      if (!observer) return;
      let removed = false;
      for (const change of changes) {
        if (change.target.closest?.(".xet-screenshot-control, .xet-screenshot-status")) continue;
        if (change.removedNodes.length) removed = true;
        for (const node of change.addedNodes) if (node instanceof Element &&
            !node.matches(".xet-screenshot-control, .xet-screenshot-status")) pending.add(node);
      }
      if (frame === null && (pending.size || removed)) frame = requestAnimationFrame(refresh);
    }
    function shortcut(event) {
      return (event.code === "KeyA" || event.key?.toLowerCase() === "a") && event.altKey &&
        !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing && !isEditableTarget(event.target);
    }
    function keydown(event) {
      if (!event.isTrusted || event.defaultPrevented || !shortcut(event)) return;
      const root = findActivePlayer(), record = [...records.values()].find(r => r.root === root);
      if (!record) return;
      event.preventDefault(); event.stopImmediatePropagation(); keyHandled = true;
      if (!event.repeat) void capture(record);
    }
    function keyup(event) {
      if (!keyHandled || !(event.code === "KeyA" || event.key?.toLowerCase() === "a")) return;
      keyHandled = false; event.preventDefault(); event.stopImmediatePropagation();
    }
    function start() {
      if (observer) return;
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("keydown", keydown, true); window.addEventListener("keyup", keyup, true);
      discover(document);
    }
    function stop() {
      observer?.disconnect(); observer = null; cancelAnimationFrame(frame); frame = null; pending.clear(); keyHandled = false;
      window.removeEventListener("keydown", keydown, true); window.removeEventListener("keyup", keyup, true);
      for (const [host, record] of records) release(host, record);
      for (const watcher of shadows.values()) watcher.disconnect(); shadows.clear();
    }
    return Object.freeze({ start, stop });
  }
  modules.screenshot = Object.freeze({ framePng, copyFrame, createScreenshotController });
})();
