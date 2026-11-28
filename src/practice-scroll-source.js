(() => {
  // Serialized into MAIN to reach the native Vue instance. Reuse its existing
  // page loader; only change the timing and geometry of the prepend adjustment.
  function installPracticeScroll(expected) {
    const STATE = "__xetPracticeScroll", STOP = "xet:practice-scroll-stop";
    const route = () => location.pathname + location.search;
    const match = location.pathname.match(/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/([\w-]+)\/?$/);
    if (!match || route() !== expected) return { ok: false };
    const sheet = document.querySelector(".practice-sheet"), vm = sheet?.__vue__;
    const getScroller = () => vm?.$refs?.practiceQuestionsContainer;
    const task = new URLSearchParams(location.search).get("task_id") || "";
    if (!vm || vm.resourceId !== match[1] || String(vm.taskId || "") !== task ||
        !getScroller()?.matches?.(".all-questions-container") || !sheet.contains(getScroller()) ||
        !["loadPreviousPracticePage", "loadPracticePageByIndex", "$nextTick"].every(name => typeof vm[name] === "function") ||
        !Number.isInteger(vm.practiceRenderStartIndex) || !Number.isInteger(vm.pageSize) || vm.pageSize < 1 ||
        typeof vm.isLoadingPreviousPracticePage !== "boolean" || typeof vm.isProgrammaticPracticeScroll !== "boolean") {
      return { ok: false };
    }
    const existing = window[STATE];
    if (existing?.owner === vm && existing.route === expected && vm.loadPreviousPracticePage === existing.load) return { ok: true };
    existing?.stop();
    const original = vm.loadPreviousPracticePage;
    const selector = ":scope > .question-wrapper[id^='practice-question-anchor-']";

    function getAnchor(scroller) {
      const rows = scroller.querySelectorAll(selector);
      const viewport = scroller.getBoundingClientRect();
      // The native sheet renders its question blocks in scroll order.
      let low = 0, high = rows.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (rows[mid].getBoundingClientRect().bottom <= viewport.top) low = mid + 1;
        else high = mid;
      }
      const row = rows[low];
      const top = row?.getBoundingClientRect().top;
      if (row && top < viewport.bottom) return { row, top: top - viewport.top };
      return null;
    }

    const live = scroller => state.active && route() === expected && sheet.isConnected &&
      !vm._isDestroyed && scroller?.isConnected && getScroller() === scroller;

    async function load(...args) {
      const scroller = getScroller();
      if (!live(scroller) || this !== vm) return original.apply(this, args);
      const start = vm.practiceRenderStartIndex, size = vm.pageSize, attempt = vm.join_id;
      if (start <= 0 || vm.isLoadingPreviousPracticePage || vm.practicePageLoading || vm.isProgrammaticPracticeScroll) return;
      const sameViewport = () => live(scroller) && vm.join_id === attempt && !vm.isProgrammaticPracticeScroll;
      vm.isLoadingPreviousPracticePage = true;
      try {
        await vm.loadPracticePageByIndex(start - 1);
        // A deliberate answer-card jump, a new attempt, or a new view wins over
        // any old request. The website may still reuse the fetched questions.
        if (!sameViewport() || vm.practiceRenderStartIndex !== start || vm.pageSize !== size) return;
        // Snapshot immediately before insertion, not before the async request.
        const anchor = getAnchor(scroller);
        const earlier = Math.max(start - size, 0);
        vm.practiceRenderStartIndex = earlier;
        await vm.$nextTick();
        if (!sameViewport() || vm.practiceRenderStartIndex !== earlier) return;
        if (anchor?.row.parentElement === scroller) {
          const displaced = anchor.row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.top;
          // Measure the remaining shift, so Chrome's own anchoring and this
          // adjustment cannot both repay the same displacement.
          if (Math.abs(displaced) >= 1) scroller.scrollTop += displaced;
        }
        vm.lastPracticeScrollTop = scroller.scrollTop;
      } finally { vm.isLoadingPreviousPracticePage = false; }
    }

    const state = { owner: vm, route: expected, load, active: true,
      stop() {
        state.active = false;
        if (vm.loadPreviousPracticePage === load) vm.loadPreviousPracticePage = original;
        window.removeEventListener(STOP, state.stop);
        if (window[STATE] === state) delete window[STATE];
      },
    };
    window[STATE] = state;
    vm.loadPreviousPracticePage = load;
    window.addEventListener(STOP, state.stop);
    return { ok: true };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    const site = siteAccess.siteInfo(sender.url);
    if (!site || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0) return { ok: false };
    const url = new URL(sender.url);
    if (!/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/[\w-]+\/?$/.test(url.pathname) ||
        message.route !== url.pathname + url.search) return { ok: false };
    const settings = await readSettings();
    if (settings.disabledSites.includes(site.origin) || !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installPracticeScroll, args: [message.route] });
    return sender.documentId && result?.documentId !== sender.documentId ? { ok: false } : result?.result || { ok: false };
  }
  globalThis.XetPracticeScrollSource = Object.freeze({ installPracticeScroll, resolve });
})();
