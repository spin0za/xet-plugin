(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.frameCoordinator) return;

  const FRAME_MESSAGE = "xet:frame-web";
  const TOKEN_LIFETIME = 2_000;

  function createFrameCoordinator({ fullscreen, isEnabled }) {
    const armed = new Map();
    let activeFrame = null;
    let started = false;
    let observer = null;
    let desiredMode = false;
    let publishedToken = "";
    let publication = Promise.resolve();

    function relay(message) {
      if (window.parent !== window) window.parent.postMessage(message, "*");
    }

    function restore() {
      if (!activeFrame) return;
      const previous = activeFrame;
      activeFrame = null;
      fullscreen.setFrameFullscreen(previous.frame, false);
      relay({ type: FRAME_MESSAGE, token: previous.token, active: false });
    }

    function handleMessage(event) {
      const message = event.data;
      if (message?.type === "xet:exit-frame-web" && window.parent !== window &&
          event.source === window.parent && message.token &&
          (message.token === publishedToken || message.token === activeFrame?.token)) {
        if (activeFrame) requestExit();
        else {
          const root = document.querySelector('[data-xet-web-fullscreen="true"]');
          if (root) fullscreen.exitWebFullscreen(root);
        }
        return;
      }
      if (message?.type !== FRAME_MESSAGE || typeof message.active !== "boolean") return;
      const authorization = armed.get(message.token);
      const previous = activeFrame;
      const restoring = !message.active && previous?.token === message.token &&
        previous.frame.contentWindow === event.source;
      if (!restoring && (!authorization || authorization.expires < Date.now() ||
          authorization.active !== message.active)) return;
      const frame = Array.from(document.querySelectorAll("iframe")).find(
        (node) => node.contentWindow === event.source,
      );
      if (!frame) return;
      armed.delete(message.token);
      if (message.active) {
        if (!started || !isEnabled()) return;
        restore();
        activeFrame = { frame, token: message.token };
        fullscreen.setFrameFullscreen(frame, true);
      } else if (previous?.frame === frame) {
        activeFrame = null;
        fullscreen.setFrameFullscreen(frame, false);
      } else return;
      relay(message);
    }

    function handleRuntimeMessage(message, _sender, sendResponse) {
      if (message?.type !== "xet:arm-frame-web") return false;
      if (started) {
        const now = Date.now();
        for (const [token, entry] of armed) {
          if (entry.expires < now) armed.delete(token);
        }
        armed.set(message.token, { active: message.active, expires: now + TOKEN_LIFETIME });
      }
      sendResponse({ armed: started });
      return false;
    }
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    function publish(active) {
      desiredMode = active;
      if (window.parent === window) return;
      publication = publication.then(async () => {
        // A rapid T/F transition must not elevate an obsolete web mode after
        // the native fullscreen request has already taken effect.
        if (active && (!started || !desiredMode)) return;
        const token = crypto.randomUUID();
        const response = await chrome.runtime.sendMessage({
          type: "xet:authorize-frame-web", token, active,
        });
        if (response?.ok && (!active || (started && desiredMode))) {
          publishedToken = active ? token : "";
          relay({ type: FRAME_MESSAGE, token, active });
        }
      }).catch((error) => console.warn("[Xet] Frame fullscreen coordination failed", error.message));
    }

    function requestExit() {
      activeFrame?.frame.contentWindow?.postMessage({
        type: "xet:exit-frame-web", token: activeFrame.token,
      }, "*");
    }

    function handleKey(event) {
      if (!activeFrame || event.ctrlKey || event.altKey || event.metaKey ||
          !["Escape", "t", "T"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) requestExit();
    }

    function checkDetached() {
      if (activeFrame && !activeFrame.frame.isConnected) restore();
    }

    function handleLoad(event) {
      if (activeFrame?.frame === event.target) restore();
    }

    function start() {
      if (started) return;
      started = true;
      window.addEventListener("message", handleMessage);
      window.addEventListener("keydown", handleKey, true);
      window.addEventListener("load", handleLoad, true);
      observer = new MutationObserver(checkDetached);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function stop() {
      started = false;
      desiredMode = false;
      publishedToken = "";
      restore();
      armed.clear();
      observer?.disconnect();
      observer = null;
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("load", handleLoad, true);
    }

    return Object.freeze({ start, stop, publish });
  }

  modules.frameCoordinator = Object.freeze({ createFrameCoordinator });
})();
