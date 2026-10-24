(() => {
  // This function is serialized into MAIN, so it must not capture worker state.
  function readPlayerSource(token) {
    const scopes = [document];
    let video;
    for (let index = 0; index < scopes.length && !video; index++) {
      const scope = scopes[index];
      video = scope.querySelector(`video[data-xet-download-token="${token}"], audio[data-xet-download-token="${token}"]`);
      for (const element of scope.querySelectorAll("*")) {
        if (element.shadowRoot) scopes.push(element.shadowRoot);
      }
    }
    if (!video?.isConnected || video.mediaKeys) return null;
    let source = video.tagName === "AUDIO" ? video.src || video.currentSrc : video.currentSrc || video.src;
    if (!source || source.startsWith("blob:")) {
      let element = video;
      while (element) {
        const vm = element.__vue__, player = vm?.player;
        if (video.tagName === "AUDIO" && typeof vm?.audio_url === "string") { source = vm.audio_url; break; }
        if (player) {
          source = player.curDefinition?.url || player.config?.url;
          if (typeof source === "string") break;
        }
        element = element.parentElement || element.getRootNode()?.host;
      }
    }
    if (typeof source !== "string" || source.length > 16384) return null;
    try {
      const url = new URL(source, location.href);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
      return { url: url.href, kind: video.tagName === "AUDIO" ? "audio" : "video" };
    } catch { return null; }
  }

  async function authorized(sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) || sender.frameId < 0) return false;
    const top = siteAccess.siteInfo(sender.tab.url);
    const own = siteAccess.siteInfo(sender.url) || siteAccess.siteInfo(sender.origin);
    const settings = await readSettings();
    return !(!top || !own || settings.disabledSites.includes(top.origin) ||
        settings.disabledSites.includes(own.origin) ||
        !(await siteAccess.isAuthorized(top.origin)) || !(await siteAccess.isAuthorized(own.origin)));
  }
  async function ensureStyles(message, sender, dependencies) {
    if (!(await authorized(sender, dependencies))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] } : { tabId: sender.tab.id, frameIds: [sender.frameId] };
    await chrome.scripting.insertCSS({ target, files: ["src/content/download.css"] });
    return { ok: true };
  }
  async function resolve(message, sender, dependencies) {
    if (typeof message.token !== "string" || !/^[a-f0-9-]{36}$/.test(message.token)) return { ok: false, error: "无法确认当前播放器" };
    if (!(await authorized(sender, dependencies))) return { ok: false, error: "当前网站未启用插件" };
    const target = { tabId: sender.tab.id, frameIds: [sender.frameId] };
    const [result] = await chrome.scripting.executeScript({
      target, world: "MAIN", func: readPlayerSource, args: [message.token],
    });
    if (sender.documentId && result?.documentId !== sender.documentId) {
      return { ok: false, error: "页面已切换，请重新下载" };
    }
    if (!result?.result?.url) return { ok: false, error: "没有找到可下载的媒体源，或该内容受 DRM 保护" };
    // Package the dependency locally and load it only when requested. The page
    // cannot access this isolated-world library or extension messaging APIs.
    if (result.result.kind !== "audio" || /\.m3u8$/i.test(new URL(result.result.url).pathname)) {
      await chrome.scripting.executeScript({ target, world: "ISOLATED", files: ["src/vendor/mux-mp4.min.js"] });
    }
    return { ok: true, ...result.result };
  }

  globalThis.XetDownloadSource = Object.freeze({ readPlayerSource, resolve, ensureStyles });
})();
