(() => {
  // Serialized into the authorized top document's extension world. Do not
  // weaken the iframe's Permissions Policy or expose image data to page JS.
  async function writePng(base64, width, height, origin) {
    if (location.origin !== origin || !navigator.clipboard?.write || !globalThis.ClipboardItem) return { ok: false };
    try {
      const binary = atob(base64), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      const view = new DataView(bytes.buffer);
      if (bytes.length < 33 || signature.some((v, i) => bytes[i] !== v) ||
          view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
          view.getUint32(16) !== width || view.getUint32(20) !== height) return { ok: false };
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
      return { ok: true };
    } catch { return { ok: false }; }
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) || !(sender.frameId > 0) ||
        !Number.isInteger(message.width) || !Number.isInteger(message.height) ||
        message.width <= 0 || message.height <= 0 || message.width * message.height > 64_000_000 ||
        typeof message.png !== "string" || message.png.length < 44 || message.png.length > 44_739_244 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(message.png)) return { ok: false };
    const top = siteAccess.siteInfo(sender.tab.url), own = siteAccess.siteInfo(sender.url) || siteAccess.siteInfo(sender.origin);
    const settings = await readSettings();
    if (!top || !own || settings.disabledSites.includes(top.origin) || settings.disabledSites.includes(own.origin) ||
        !await siteAccess.isAuthorized(top.origin) || !await siteAccess.isAuthorized(own.origin)) return { ok: false };
    const [result] = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [0] },
      world: "ISOLATED", func: writePng, args: [message.png, message.width, message.height, top.origin] });
    return { ok: result?.result?.ok === true };
  }
  globalThis.XetScreenshotSource = Object.freeze({ writePng, resolve });
})();
