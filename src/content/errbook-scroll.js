(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.errbookScroll) return;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/errbook\/detail\/[\w-]+\/?$/;
  const REVIEW = /^\/p\/t_pc\/pc_evaluation\/errbook\/practice\/[\w-]+\/?$/;
  const MARK = "xet.errbook.return-position";
  const CARD = ".errbook-detail-page .question-list > .question-card";

  function createErrbookScrollController() {
    let started = false, key = null, settled = false, engaged = false, frame = null, observer = null, timer = null;
    let memory = null, restoring = null;
    const routeKey = () => (PATH.test(location.pathname) || REVIEW.test(location.pathname)) && !location.hash
      ? location.pathname + location.search : "";
    function scope() {
      const query = new URLSearchParams(location.search);
      return JSON.stringify([location.pathname.split("/").filter(Boolean).pop(), query.get("tab") || "1", query.get("source_id") || ""]);
    }
    function save(mark) {
      memory = mark;
      try {
        if (mark) sessionStorage.setItem(MARK, JSON.stringify(mark)); else sessionStorage.removeItem(MARK);
      } catch { /* Same-document navigation still works with storage blocked. */ }
    }
    function read() {
      try { return JSON.parse(sessionStorage.getItem(MARK)); } catch { return memory; }
    }
    function clicked(event) {
      if (!event.isTrusted || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          !PATH.test(location.pathname) || location.hash) return;
      const card = event.target.closest?.(CARD);
      if (card) save({ scope: scope(), id: card.getAttribute("data-xet-question-order-id"),
        y: window.scrollY, offset: card.getBoundingClientRect().top, reviewed: false });
    }
    function enter(next) {
      key = next; restoring = null; settled = engaged = false;
      const mark = read();
      if (!mark) return;
      if (next && mark.scope === scope() && Number.isFinite(mark.y) && Number.isFinite(mark.offset)) {
        const query = new URLSearchParams(location.search), id = query.get("question_id");
        if (REVIEW.test(location.pathname) && query.get("readonly") === "1" && /^[\w-]{1,160}$/.test(id || "") &&
            (!mark.id || mark.id === id)) {
          save({ ...mark, id, reviewed: true }); return;
        }
        if (PATH.test(location.pathname) && mark.reviewed) restoring = mark;
      }
      save(null);
    }
    function update() {
      frame = null;
      if (!started) return;
      const next = routeKey();
      if (next !== key) enter(next);
      if (!key || !PATH.test(location.pathname) || settled || !document.querySelector(".errbook-detail-page")) return;
      if (restoring) {
        const cards = document.querySelectorAll(CARD);
        if (!cards.length) return; // Native loading placeholder has no useful scroll range.
        const card = Array.from(cards).find(el => el.getAttribute("data-xet-question-order-id") === restoring.id);
        const top = card ? window.scrollY + card.getBoundingClientRect().top - restoring.offset : restoring.y;
        if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior: "instant" });
        settled = true;
        return;
      }
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
      if (event.persisted && read()?.reviewed && PATH.test(location.pathname)) key = null;
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
      settled = engaged = true; restoring = null;
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      observer = new MutationObserver(records => {
        // The native rows may mount before the extension reapplies original question order.
        if (restoring && records.some(r => r.type === "attributes" || r.target.matches?.(".question-list") ||
            [...r.addedNodes].some(n => n.matches?.(".errbook-detail-page, .question-list") || n.querySelector?.(".question-list")))) settled = false;
        if (routeKey() !== key || key && !settled) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true,
        attributes: true, attributeFilter: ["data-xet-question-order-id"] });
      window.addEventListener("click", clicked, true);
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
      started = false; key = null; settled = engaged = false; restoring = null; save(null);
      observer.disconnect(); observer = null;
      clearInterval(timer); timer = null;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      window.removeEventListener("click", clicked, true);
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
