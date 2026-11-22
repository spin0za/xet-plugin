(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.errbookScroll) return;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/errbook\/detail\/[\w-]+\/?$/;

  function createErrbookScrollController() {
    let started = false, key = "", settled = false, engaged = false, frame = null, observer = null, timer = null;
    const routeKey = () => PATH.test(location.pathname) && !location.hash ? location.pathname + location.search : "";
    function update() {
      frame = null;
      if (!started) return;
      const next = routeKey();
      if (next !== key) { key = next; settled = engaged = false; }
      if (!key || settled || !document.querySelector(".errbook-detail-page")) return;
      // Vue Router has no scrollBehavior here. A forward entry otherwise
      // inherits the old list's offset, then clamps/anchors to the new bottom.
      // Reset once after the new view mounts, not on every data/order update.
      settled = true;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    function schedule() {
      if (started && frame === null) frame = requestAnimationFrame(update);
    }
    function shown(event) {
      // A reload can restore the old offset after our first frame. Finish
      // initialization after native pageshow, never on synthetic tab wakes or
      // BFCache resumption, and never after the user has taken control.
      if (event.isTrusted && !event.persisted && key && routeKey() === key && !engaged) settled = false;
      schedule();
    }
    function interact(event) {
      if (!event.isTrusted || routeKey() !== key || !key) return;
      if (event.type === "keydown" && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      // Slow mounting must not override scrolling the user has already begun.
      settled = engaged = true;
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      observer = new MutationObserver(() => {
        if (routeKey() !== key || key && !settled) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", schedule);
      window.addEventListener("pageshow", shown);
      window.navigation?.addEventListener("currententrychange", schedule);
      window.addEventListener("wheel", interact, { capture: true, passive: true });
      window.addEventListener("touchmove", interact, { capture: true, passive: true });
      window.addEventListener("pointerdown", interact, true);
      window.addEventListener("keydown", interact, true);
      // Old Chromium: same-document route changes may have no Navigation API.
      timer = setInterval(() => { if (routeKey() !== key) schedule(); }, 1000);
      schedule();
    }
    function stop() {
      if (!started) return;
      started = false; key = ""; settled = engaged = false;
      observer.disconnect(); observer = null;
      clearInterval(timer); timer = null;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("pageshow", shown);
      window.navigation?.removeEventListener("currententrychange", schedule);
      window.removeEventListener("wheel", interact, true);
      window.removeEventListener("touchmove", interact, true);
      window.removeEventListener("pointerdown", interact, true);
      window.removeEventListener("keydown", interact, true);
    }
    return Object.freeze({ start, stop });
  }
  modules.errbookScroll = Object.freeze({ createErrbookScrollController });
})();
