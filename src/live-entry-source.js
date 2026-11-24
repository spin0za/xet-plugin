(() => {
  function installLiveEntry(expectedPath) {
    const COURSE = /^\/p\/t_pc\/course_pc_detail\/(?:camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/[\w-]+\/?$/;
    const DETAIL = /^\/detail\/(l_[\w-]+)\/4\/?$/;
    const STATE = "__xetLiveEntry", KEY = "xet:live-entry-intent", STOP = "xet:live-entry-stop";
    const here = new URL(location.href), liveId = here.pathname.match(DETAIL)?.[1];
    if (window.top !== window || here.pathname !== expectedPath || (!liveId && !COURSE.test(here.pathname))) return { ok: false };
    if (window[STATE]?.url === here.href) return { ok: true };
    window[STATE]?.stop();
    const courseId = here.searchParams.get("course_id");
    const isCourseId = id => typeof id === "string" && /^(?:course_|c_)[\w-]+$/.test(id);
    const yes = value => value === true || value === 1 || value === "1";
    const roomUrl = value => {
      try {
        const url = new URL(value, here.origin);
        const courses = url.searchParams.getAll("course_id");
        return url.origin === here.origin && !url.username && !url.password &&
          url.pathname.replace(/\/$/, "") === "/p/t_pc/live_pc/pc/" + liveId &&
          courses.length && courses.every(id => id === courseId) ? url.href : null;
      } catch { return null; }
    };
    let timer, expiryTimer, armedValue, working = false, stopped = false;
    function clearIntent() {
      clearTimeout(expiryTimer);
      try {
        if (armedValue && sessionStorage.getItem(KEY) === armedValue) sessionStorage.removeItem(KEY);
      } catch { /* Session storage may be disabled. */ }
      armedValue = null;
    }
    function stop() {
      stopped = true;
      clearInterval(timer);
      clearIntent();
      document.removeEventListener("click", markClick, true);
      document.removeEventListener("click", cancelOnClick, true);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener(STOP, stop);
      if (window[STATE]?.stop === stop) delete window[STATE];
    }
    window[STATE] = { url: here.href, stop };
    window.addEventListener(STOP, stop);
    const current = () => !stopped && location.href === here.href;
    function markClick(event) {
      if (!current() || !event.isTrusted) return;
      try {
        sessionStorage.removeItem(KEY);
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const row = event.target?.closest?.(".camp_pro_content_catalog .section_item_box");
        const vm = row?.__vue__, item = vm?.sectionItem;
        if (!vm || vm.$el !== row || typeof vm.goToContentPage !== "function" || item?.resource_type !== 4 ||
            !/^l_[\w-]+$/.test(item.chapter_id) || !isCourseId(item.course_id) || vm.isBreakJump ||
            !yes(vm.isAvailable) || vm.isNeedMsgCollect || vm.communityId || !yes(item.unlock_state)) return;
        // The site's own window.open clones this tab's sessionStorage.
        // Let the original click finish all its checks and open the detail.
        clearIntent();
        armedValue = JSON.stringify({
          source: here.origin + here.pathname + here.search,
          id: item.chapter_id, course: item.course_id, until: Date.now() + 12_000,
        });
        sessionStorage.setItem(KEY, armedValue);
        // Storage is cloned synchronously when the site's popup is created.
        // Don't leave an old marker resident in the catalog tab.
        expiryTimer = setTimeout(clearIntent, 1200);
      } catch { /* No shortcut if storage or the native row is unavailable. */ }
    }
    if (!liveId) {
      document.addEventListener("click", markClick, true);
      return { ok: true };
    }
    function readIntent() {
      try {
        const marker = JSON.parse(sessionStorage.getItem(KEY));
        sessionStorage.removeItem(KEY);
        if (!marker || !isCourseId(courseId) || marker.id !== liveId || marker.course !== courseId ||
            !Number.isFinite(marker.until) || marker.until <= Date.now() ||
            performance.getEntriesByType("navigation")[0]?.type !== "navigate") return null;
        const from = new URL(document.referrer);
        return from.origin === here.origin && COURSE.test(from.pathname) &&
          marker.source === from.origin + from.pathname + from.search ? marker : null;
      } catch { return null; }
    }
    const intent = readIntent();
    if (!intent) { stop(); return { ok: true }; }
    const until = Math.min(intent.until, Date.now() + 8_000);
    window.addEventListener("pagehide", stop);
    function cancelOnClick(event) { if (event.isTrusted) stop(); }
    document.addEventListener("click", cancelOnClick, true);
    function responseReady(path) {
      return performance.getEntriesByName(here.origin + path, "resource")
        .some(entry => entry.responseEnd > 0 && entry.responseStatus >= 200 && entry.responseStatus < 300);
    }
    function readyHeader() {
      const button = document.querySelector(".detail .detail-header__wrapper #detail-header-right-subr > button.theme-customize-bg");
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true" ||
          !button.checkVisibility({ visibilityProperty: true })) return null;
      const vm = button.closest(".detail-header__wrapper")?.__vue__, info = vm?.infos;
      if (!vm || vm._isDestroyed || vm.$el !== button.closest(".detail-header__wrapper") ||
          vm.$route?.params?.id !== liveId || String(vm.$route?.params?.type) !== "4" ||
          vm.detailInfos?.id !== liveId || !yes(info?.is_login) || !yes(info.available) ||
          yes(info.have_password) || yes(info.only_h5_play) ||
          !yes(vm.learningConditionPassed) || vm.isFreeLiveNeedBindPhone !== false ||
          vm.isElink || vm.isTrainingShop || vm.isTeacher || vm.showSafariJumpTips ||
          typeof vm.isSpecialAliveAppId !== "function" || vm.isSpecialAliveAppId() ||
          !responseReady("/_alive/api/is_in_special_menu") ||
          typeof vm.getliveRoomUrl !== "function" || typeof vm.$options?.methods?.enterLiveRoom !== "function" ||
          typeof vm.$funcTool?.jumpTargetUrl !== "function") return null;
      if (Number(info.payment_type) === 1 && yes(info.is_public) &&
          !responseReady("/_alive/bff_h5/guide_phone_config/user_info/1.0.0")) return null;
      if (![0, 1, 3, "0", "1", "3"].includes(info.alive_status)) return null;
      if (Number(info.alive_status) === 3 && (!(vm.limitTimeLookInfo?.server_time > 0) ||
          vm.$el.querySelector(".status-wrapper")?.__vue__?.playBackValid !== true)) return null;
      const target = roomUrl(vm.liveRoomUrl);
      return target ? { vm, target } : null;
    }
    async function tick() {
      if (!current() || Date.now() >= until) { stop(); return; }
      if (working || document.visibilityState !== "visible") return;
      try {
        const match = readyHeader();
        if (!match) return;
        const { vm, target } = match;
        working = true;
        let approved = false;
        // Run the original handler with a one-call navigation sink, without
        // changing the component, its global helper or any permission state.
        const receiver = Object.create(vm, {
          $funcTool: { value: { jumpTargetUrl({ url, isWindowOpen } = {}) {
            approved = isWindowOpen === true && roomUrl(url) === target;
          } } },
          openWindow: { value() { approved = false; } },
        });
        await vm.$options.methods.enterLiveRoom.call(receiver);
        const latest = current() && Date.now() < until && document.visibilityState === "visible" && readyHeader();
        stop();
        if (approved && latest?.vm === vm && latest.target === target) location.replace(target);
      } catch { stop(); /* Leave the original detail and its button usable. */ }
    }
    timer = setInterval(() => { void tick(); }, 120);
    void tick();
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^(?:\/p\/t_pc\/course_pc_detail\/(?:camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/[\w-]+|\/detail\/l_[\w-]+\/4)\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url);
    if (!site || new URL(sender.url).pathname !== message.path) return { ok: false };
    const settings = await readSettings();
    if (settings.disabledSites.includes(site.origin) || !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installLiveEntry, args: [message.path] });
    return sender.documentId && result?.documentId !== sender.documentId ? { ok: false } : result?.result || { ok: false };
  }
  globalThis.XetLiveEntrySource = Object.freeze({ installLiveEntry, resolve });
})();
