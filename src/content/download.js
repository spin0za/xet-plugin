(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.download) return;

  function createDownloadController({ playerDom }) {
    const records = new Map(), shadows = new Map();
    let observer = null, scheduled = null, job = null;
    const pending = new Set();

    function report(record, text) {
      clearTimeout(record.timer);
      record.status.textContent = text;
      record.status.hidden = !text;
      if (!job && text) record.timer = setTimeout(() => { record.status.hidden = true; }, 7000);
    }

    async function memorySink(record, filename) {
      const chunks = [];
      let length = 0;
      report(record, "当前页面无法直接写入文件，使用小文件下载模式（上限 256 MB）");
      return {
        async write(bytes) {
          length += bytes.length;
          if (length > 256 * 1024 * 1024) throw new Error("视频超过 256 MB，请在顶层课程页面使用流式下载");
          chunks.push(bytes.slice());
        },
        async close() {
          const url = URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
          chunks.length = 0;
          const link = document.createElement("a");
          link.href = url; link.download = filename; link.hidden = true;
          document.documentElement.append(link);
          link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        },
        async abort() { chunks.length = 0; },
      };
    }

    async function activate(record, event) {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (job) {
        if (job.record === record && !job.closing) job.controller.abort();
        else if (job.record !== record) report(record, "已有视频正在下载，请先完成或取消");
        return;
      }
      const video = playerDom.findPlayerVideo(record.root);
      if (!video || video.mediaKeys) { report(record, "没有可下载的视频，或该视频受 DRM 保护"); return; }
      const task = { record, controller: new AbortController(), closing: false };
      job = task;
      window.addEventListener("beforeunload", warnBeforeLeave);
      record.button.dataset.active = "true";
      record.label.textContent = "准备中";
      record.button.setAttribute("aria-label", "取消视频下载");
      const token = crypto.randomUUID();
      video.dataset.xetDownloadToken = token;
      const name = modules.downloadStream.filename(document.title);
      let sink;
      try {
        // This must happen before any await: Chrome requires the original
        // trusted click for the save picker. No blanket downloads permission.
        const picker = typeof window.showSaveFilePicker === "function" && window.top === window
          ? window.showSaveFilePicker({ suggestedName: name, types: [{ description: "MP4 视频", accept: { "video/mp4": [".mp4"] } }] })
          : null;
        const sourceRequest = chrome.runtime.sendMessage({ type: "xet:download-source", token })
          .catch(() => ({ ok: false, error: "无法获取视频源，请刷新课程后重试" }));
        const handle = picker ? await picker : null;
        const source = await sourceRequest;
        task.controller.signal.throwIfAborted();
        if (!source?.ok) throw new Error(source?.error || "无法获取当前视频源，请刷新后重试");
        sink = handle ? await handle.createWritable() : await memorySink(record, name);
        report(record, "开始下载；再次点击下载按钮可取消。下载完成前请勿刷新或关闭页面");
        const result = await modules.downloadStream.download(source.url, {
          sink, signal: task.controller.signal,
          onProgress({ percent, writtenBytes }) {
            record.label.textContent = percent === null ? `${Math.round(writtenBytes / 1024 / 1024)} MB` : `${Math.floor(percent)}%`;
            record.button.setAttribute("aria-label", `取消视频下载，已下载 ${record.label.textContent}`);
          },
        });
        task.controller.signal.throwIfAborted();
        task.closing = true;
        record.button.disabled = true;
        record.label.textContent = "保存中";
        await sink.close();
        sink = null;
        report(record, `视频已保存（${(result.writtenBytes / 1024 / 1024).toFixed(1)} MB）`);
      } catch (error) {
        try { await sink?.abort(); } catch { /* Already closed or detached. */ }
        report(record, task.controller.signal.aborted || error.name === "AbortError" ? "已取消下载" :
          String(error.message || "下载失败，请刷新后重试").replace(/https?:\/\/\S+/g, "[视频地址]"));
      } finally {
        if (video.dataset.xetDownloadToken === token) delete video.dataset.xetDownloadToken;
        job = null;
        window.removeEventListener("beforeunload", warnBeforeLeave);
        record.button.disabled = false;
        delete record.button.dataset.active;
        record.label.textContent = "";
        record.button.setAttribute("aria-label", "下载当前画质的视频");
        if (record.status.textContent) record.timer = setTimeout(() => { record.status.hidden = true; }, 7000);
      }
    }

    function add(root) {
      if (records.has(root)) {
        const record = records.get(root);
        if (!record.container.isConnected) attach(record);
        return;
      }
      const container = document.createElement("span");
      container.className = "xet-download-control";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "xet-download-button";
      button.setAttribute("aria-label", "下载当前画质的视频");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5");
      icon.append(path);
      const label = document.createElement("span");
      label.className = "xet-download-label";
      button.append(icon, label);
      const status = document.createElement("span");
      status.className = "xet-download-status";
      status.setAttribute("role", "status");
      status.hidden = true;
      const tooltip = document.createElement("span");
      tooltip.className = "xet-download-tooltip";
      tooltip.textContent = "下载视频 / 再次点击取消";
      container.append(button, tooltip, status);
      const record = { root, container, button, label, status, timer: null };
      button.addEventListener("click", event => { void activate(record, event); });
      records.set(root, record);
      attach(record);
    }

    function attach(record) {
      const controls = record.root.querySelector(".xgplayer-controls, xg-controls");
      if (controls) {
        const grid = controls.querySelector(".xg-right-grid");
        (grid || controls).append(record.container);
      } else if (record.root.tagName === "VIDEO") {
        record.container.classList.add("xet-download-native");
        record.root.after(record.container);
      }
    }

    function discover(scope = document) {
      const nodes = playerDom.deepElements(scope);
      if (scope instanceof Element) nodes.push(scope);
      for (const node of nodes) {
        if (node.shadowRoot && !shadows.has(node.shadowRoot)) {
          const watcher = new MutationObserver(changed);
          watcher.observe(node.shadowRoot, { subtree: true, childList: true });
          shadows.set(node.shadowRoot, watcher);
        }
        if (node.tagName === "VIDEO") add(playerDom.findPlayerRoot(node) || node);
        else if (node.matches(".xgplayer-controls, xg-controls")) {
          const root = playerDom.findPlayerRoot(node);
          if (root && playerDom.findPlayerVideo(root)) add(root);
        }
      }
    }

    function changed(changes) {
      for (const [root, record] of records) {
        if (root.isConnected) continue;
        if (job?.record === record) job.controller.abort();
        clearTimeout(record.timer);
        record.container.remove();
        records.delete(root);
      }
      for (const [root, watcher] of shadows) {
        if (!root.host.isConnected) { watcher.disconnect(); shadows.delete(root); }
      }
      for (const change of changes) for (const node of change.addedNodes) {
        if (node instanceof Element && !node.closest(".xet-download-control")) pending.add(node);
      }
      if (scheduled !== null || !pending.size) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = null;
        for (const node of pending) if (node.isConnected) discover(node);
        pending.clear();
      });
    }

    function cancelOnLeave() { job?.controller.abort(); }
    function warnBeforeLeave(event) {
      if (!job) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function start() {
      if (observer) return;
      observer = new MutationObserver(changed);
      observer.observe(document.documentElement, { subtree: true, childList: true });
      window.addEventListener("pagehide", cancelOnLeave);
      discover();
    }
    function stop() {
      observer?.disconnect(); observer = null;
      cancelAnimationFrame(scheduled); scheduled = null; pending.clear();
      job?.controller.abort();
      for (const record of records.values()) { clearTimeout(record.timer); record.container.remove(); }
      records.clear();
      for (const watcher of shadows.values()) watcher.disconnect();
      shadows.clear();
      window.removeEventListener("pagehide", cancelOnLeave);
      window.removeEventListener("beforeunload", warnBeforeLeave);
    }
    return Object.freeze({ start, stop });
  }

  modules.download = Object.freeze({ createDownloadController });
})();
