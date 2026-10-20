(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.analysisScroll) return;
  const PATH = /\/pc_evaluation\/practice_analysis\//;
  const MARKER = "data-xet-analysis-scroll";
  const STICKY = "data-xet-analysis-sticky-card";

  function createAnalysisScrollController() {
    let running = false, root = null, card = null, observer = null, resize = null;
    let pending = null, jump = null, timer = null;

    function fullscreen() {
      return document.fullscreenElement || document.documentElement.classList.contains("xet-web-fullscreen-active");
    }

    function release() {
      resize?.disconnect();
      card?.removeAttribute(STICKY);
      root?.removeAttribute(MARKER);
      root?.style.removeProperty("--xet-analysis-scroll-offset");
      root?.style.removeProperty("--xet-analysis-card-height");
      root = card = null;
      if (jump !== null) cancelAnimationFrame(jump);
      jump = null;
    }

    function update() {
      const list = PATH.test(location.pathname) ? document.querySelector(".practice-analysis .analysis-only-content") : null;
      const next = list?.closest(".practice-analysis") || null;
      if (next !== root) {
        release();
        root = next;
        if (root) {
          // If enabled on an already-scrolled analysis, keep the visible question
          // in place while migrating its inner scroll offset to the document.
          const anchor = list.scrollTop > 0 ? [...list.children].find(node =>
            node.getBoundingClientRect().bottom > list.getBoundingClientRect().top) : null;
          const top = anchor?.getBoundingClientRect().top;
          list.scrollTop = 0;
          root.setAttribute(MARKER, "");
          if (anchor && !fullscreen()) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
        }
      }
      if (!root) return;
      const nextCard = root.querySelector(".analysis-card");
      if (nextCard !== card) {
        resize.disconnect();
        card?.removeAttribute(STICKY);
        card = nextCard;
        if (card) resize.observe(card);
        const header = root.querySelector(".analysis-base-layout__header");
        if (header) resize.observe(header);
      }
      const header = root.querySelector(".analysis-base-layout__header");
      const offset = Math.max(0, header?.getBoundingClientRect().bottom || 0) + 16;
      root.style.setProperty("--xet-analysis-scroll-offset", `${offset}px`);
      const cardHeight = card?.getBoundingClientRect().height || 0;
      root.style.setProperty("--xet-analysis-card-height", `${cardHeight}px`);
      const filterHeight = root.querySelector(".analysis-only-error")?.getBoundingClientRect().height || 0;
      // A long answer card must also flow with the document, not introduce a
      // second scrollbar or leave its last rows inaccessible below the viewport.
      card?.toggleAttribute(STICKY, cardHeight + (filterHeight ? filterHeight + 16 : 0) <= window.innerHeight - offset - 16);
    }

    function schedule() {
      if (!running || pending !== null) return;
      pending = requestAnimationFrame(() => { pending = null; update(); });
    }

    function handleClick(event) {
      const cell = event.target instanceof Element ? event.target.closest(".answer-card__content__card__item") : null;
      if (!root?.contains(cell) || fullscreen()) return;
      const number = cell.querySelector("span")?.textContent.trim();
      if (!/^[1-9]\d*$/.test(number || "")) return;
      const current = root;
      if (jump !== null) cancelAnimationFrame(jump);
      // Preserve the site's click handler (selection and "only errors" filter).
      // Its nextTick scrollIntoView is followed by window.scrollTo(0, 0), which
      // would undo a document-level jump. Re-align after that native update.
      jump = requestAnimationFrame(() => {
        jump = null;
        if (!running || root !== current || !PATH.test(location.pathname) || fullscreen()) return;
        const target = document.getElementById(`analysis-${number}`);
        if (root.contains(target) && target.getClientRects().length) {
          target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
        }
      });
    }

    function start() {
      if (running || window.top !== window) return;
      running = true;
      resize = new ResizeObserver(schedule);
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener("click", handleClick, { capture: true, passive: true });
      window.addEventListener("resize", schedule);
      window.addEventListener("popstate", schedule);
      window.addEventListener("hashchange", schedule);
      if (window.navigation) window.navigation.addEventListener("currententrychange", schedule);
      else timer = setInterval(schedule, 1_000);
      update();
    }

    function stop() {
      if (!running) return;
      running = false;
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("hashchange", schedule);
      window.navigation?.removeEventListener("currententrychange", schedule);
      clearInterval(timer);
      timer = null;
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null;
      release();
    }

    return Object.freeze({ start, stop });
  }

  modules.analysisScroll = Object.freeze({ createAnalysisScrollController });
})();
