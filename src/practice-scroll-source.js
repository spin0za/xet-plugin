(() => {
  // Serialized into MAIN to reach the native Vue instance. Reuse its existing
  // page loader and answer-card routing; only change viewport positioning.
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
    const card = vm.handleSwitchQuestion, nativeScroll = vm.scrollToPracticeQuestion;
    const nativeFinish = vm.finishProgrammaticPracticeScroll;
    const canFixJump = [card, nativeScroll, nativeFinish, vm.setPracticeActiveQuestion].every(fn => typeof fn === "function");
    let switching = null, queued = null, pin = null, previousPageWork = null;

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

    function unlock(scroller) {
      if (!scroller?.isConnected || getScroller() !== scroller || vm._isDestroyed) return;
      vm.lastPracticeScrollTop = scroller.scrollTop;
      vm.isProgrammaticPracticeScroll = false;
    }

    function releasePin() {
      if (!pin) return;
      const current = pin;
      pin = null;
      current.resize.disconnect(); current.mutations.disconnect();
      clearTimeout(current.timeout);
      if (current.frame !== null) cancelAnimationFrame(current.frame);
      current.scroller.removeEventListener("scroll", current.onScroll);
      if (vm.join_id === current.attempt) unlock(current.scroller);
    }

    function stabilizeJump(scroller, index, attempt) {
      const id = `practice-question-anchor-${index + 1}`;
      // Use the same native question ID (including the parent of grouped
      // questions), never the visible text/number on either side.
      const find = () => scroller.querySelector(`#${id}`);
      let target = find();
      if (!target) return false;
      releasePin();
      const current = { scroller, attempt, frame: null, top: null, observed: new Set() };
      pin = current;
      const valid = () => pin === current && live(scroller) && vm.join_id === attempt;
      const targetTop = () => scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      function align() {
        current.frame = null;
        if (!valid() || !(target = find())) { if (pin === current) releasePin(); return; }
        current.top = targetTop();
        const top = Math.max(0, Math.min(current.top, scroller.scrollHeight - scroller.clientHeight));
        if (Math.abs(scroller.scrollTop - top) >= 1) scroller.scrollTo({ top, behavior: "instant" });
        vm.lastPracticeScrollTop = scroller.scrollTop;
      }
      function schedule() {
        if (valid() && current.frame === null) current.frame = requestAnimationFrame(align);
      }
      function watchBeforeTarget() {
        if (!valid() || !(target = find())) { if (pin === current) releasePin(); return; }
        const rows = new Set([scroller]);
        for (const row of scroller.children) {
          rows.add(row);
          if (row === target || row.contains(target)) break;
        }
        for (const row of current.observed) if (!rows.has(row)) current.resize.unobserve(row);
        for (const row of rows) if (!current.observed.has(row)) current.resize.observe(row, { box: "border-box" });
        current.observed = rows;
        schedule();
      }
      current.onScroll = () => {
        if (!valid() || !target.isConnected) return;
        // Includes scrolling forwarded by a video iframe. When only the
        // viewport moved, rather than the question layout, let it go.
        const top = targetTop();
        const bounded = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
        if (Math.abs(top - current.top) < 1 && Math.abs(scroller.scrollTop - bounded) > 2) releasePin();
      };
      current.resize = new ResizeObserver(schedule);
      current.mutations = new MutationObserver(watchBeforeTarget);
      current.mutations.observe(scroller, { childList: true });
      current.timeout = setTimeout(() => { if (pin === current) releasePin(); }, 1600);
      scroller.addEventListener("scroll", current.onScroll, { passive: true });
      align();
      if (valid()) watchBeforeTarget();
      return true;
    }

    function scrollJump(index, behavior) {
      const op = switching;
      if (this !== vm || !op || index !== op.index || (behavior !== undefined && behavior !== "smooth")) {
        return nativeScroll.apply(this, arguments);
      }
      op.handled = true;
      // Native calls scroll and finish together. Wait for the keyed list to
      // mount, and don't schedule its fixed-delay re-selection afterward.
      op.placement = (async () => {
        await vm.$nextTick();
        if (!live(op.scroller) || op.cancelled || queued || vm.join_id !== op.attempt) return;
        if (!stabilizeJump(op.scroller, index, op.attempt)) {
          op.fallback = true;
          nativeScroll.call(vm, index, "instant");
          nativeFinish.call(vm, index);
          return;
        }
        vm.setPracticeActiveQuestion(index, true);
      })();
    }

    function finishJump(index, initializing) {
      if (this === vm && !initializing && switching?.index === index && switching.handled) return;
      return nativeFinish.apply(this, arguments);
    }

    async function switchQuestion(...args) {
      const scroller = getScroller();
      const index = Array.isArray(args[0]?.weight) ? args[0].weight[0] : args[1];
      if (this !== vm || !live(scroller) || vm.isInitializingPracticePage || !Number.isInteger(index) || index < 0) {
        return card.apply(this, args);
      }
      releasePin();
      const next = { args, index, scroller, attempt: vm.join_id };
      // Native replaces the rendered window asynchronously. Don't let an
      // earlier, slower load replace a newer request's rendered questions.
      if (switching) { queued = next; return; }
      let op = next;
      let failure;
      try {
        while (op && !op.cancelled && live(op.scroller) && vm.join_id === op.attempt) {
          switching = op; queued = null;
          try {
            // The previous-page loader and the answer card share the site's
            // request lock. Let it finish without prepending before jumping.
            try { if (previousPageWork) await previousPageWork; } catch { /* An earlier preload failed. */ }
            if (!queued && !op.cancelled && live(op.scroller) && vm.join_id === op.attempt) {
              await card.apply(vm, op.args);
              await op.placement;
            }
          }
          catch (error) { failure = error; }
          finally { if (!pin && !op.fallback && vm.join_id === op.attempt) unlock(op.scroller); }
          op = queued;
        }
      } finally { switching = queued = null; }
      if (failure) throw failure;
    }

    function userScroll(event) {
      if (!event.isTrusted) return;
      const scroller = getScroller();
      if (event.type === "keydown") {
        if (!/^(?:ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(event.key) ||
            event.target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return;
      } else if (!scroller?.contains(event.target)) return;
      if (switching) switching.cancelled = true;
      queued = null;
      releasePin();
    }
    const scrollInputs = ["wheel", "touchstart", "pointerdown", "keydown"];

    async function load(...args) {
      const scroller = getScroller();
      if (!live(scroller) || this !== vm) return original.apply(this, args);
      const start = vm.practiceRenderStartIndex, size = vm.pageSize, attempt = vm.join_id;
      if (start <= 0 || vm.isLoadingPreviousPracticePage || vm.practicePageLoading || vm.isProgrammaticPracticeScroll) return;
      const sameViewport = () => live(scroller) && vm.join_id === attempt && !switching && !vm.isProgrammaticPracticeScroll;
      vm.isLoadingPreviousPracticePage = true;
      let work;
      try {
        previousPageWork = work = Promise.resolve(vm.loadPracticePageByIndex(start - 1));
        await work;
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
      } finally {
        if (previousPageWork === work) previousPageWork = null;
        vm.isLoadingPreviousPracticePage = false;
      }
    }

    const state = { owner: vm, route: expected, load, active: true,
      stop() {
        releasePin();
        if (switching && vm.join_id === switching.attempt) unlock(switching.scroller);
        state.active = false;
        if (vm.loadPreviousPracticePage === load) vm.loadPreviousPracticePage = original;
        if (vm.handleSwitchQuestion === switchQuestion) vm.handleSwitchQuestion = card;
        if (vm.scrollToPracticeQuestion === scrollJump) vm.scrollToPracticeQuestion = nativeScroll;
        if (vm.finishProgrammaticPracticeScroll === finishJump) vm.finishProgrammaticPracticeScroll = nativeFinish;
        for (const event of scrollInputs) sheet.removeEventListener(event, userScroll, true);
        window.removeEventListener(STOP, state.stop);
        if (window[STATE] === state) delete window[STATE];
      },
    };
    window[STATE] = state;
    vm.loadPreviousPracticePage = load;
    if (canFixJump) {
      vm.handleSwitchQuestion = switchQuestion;
      vm.scrollToPracticeQuestion = scrollJump;
      vm.finishProgrammaticPracticeScroll = finishJump;
      for (const event of scrollInputs) sheet.addEventListener(event, userScroll, { capture: true, passive: true });
    }
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
