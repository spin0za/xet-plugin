(() => {
  const COURSE = /^\/p\/t_pc\/course_pc_detail\/(?:camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/[\w-]+\/?$/;
  function installLiveEntry(expectedPath) {
    // This function is serialized into the site's MAIN world, without closures.
    const courseRoute = /^\/p\/t_pc\/course_pc_detail\/(?:camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/[\w-]+\/?$/;
    const STATE = "__xetLiveEntry", STOP = "xet:live-entry-stop";
    const here = new URL(location.href);
    if (window.top !== window || here.pathname !== expectedPath || !courseRoute.test(here.pathname)) return { ok: false };
    if (window[STATE]?.url === here.href) return { ok: true };
    window[STATE]?.stop();
    const yes = value => value === true || value === 1 || value === "1";
    const no = value => value === false || value === 0 || value === "0";
    let active = true, pending = null;

    async function allowed({ id, course, app, user }, signal) {
      // These are the original detail page's same-shop permission/metadata
      // requests. Don't open that document, follow API redirects or load media.
      async function read(path, body, query) {
        const url = new URL(path, here.origin);
        url.searchParams.set("app_id", app);
        for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
        const headers = { "App-Id": app };
        if (body) headers["Content-Type"] = "application/json";
        const response = await fetch(url, {
          method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
          credentials: "same-origin", mode: "same-origin", redirect: "error", signal,
        });
        if (!response.ok) throw new Error("Native permission request failed");
        const json = await response.json();
        // The detail UI treats code 1 from this form lookup as no form.
        // This is the response on ordinary lessons on the target store;
        // don't extend the exception to permission endpoints or other codes.
        if (path === "/information_form/get_information_formv3" && json?.code === 1) {
          return { purchase_data: { switch: false } };
        }
        if (json?.code !== 0 || !Object.hasOwn(json, "data")) throw new Error("No native permission result");
        return json.data;
      }
      const resource = { resource_id: id, resource_type: 4 };
      const info = await read("/api/xe.goods.detail.get/2.0.0", { goods_id: id, goods_type: 4, course_id: course });
      if (info?.resource_id !== id || !yes(info.available) || !yes(info.is_login) ||
          yes(info.have_password) || yes(info.only_h5_play) || yes(info.sale_status) ||
          ![0, 1, 3, "0", "1", "3"].includes(info.alive_status)) return false;
      const [room, gray, learning, form, replay, phone] = await Promise.all([
        read("/auth/get-live-url", null, { id }),
        read("/_alive/api/is_in_special_menu", { jump_live_pc_client: app }),
        read("/xe.learning_condition.api/get_learning_condition_state_api/1.0.0", resource),
        read("/information_form/get_information_formv3", { bizData: { resource_id: id, user_id: user } }, { user_id: user }),
        Number(info.alive_status) === 3 ? read("/_alive/api/get_lookback_expire", { app_id: app, buz_data: { alive_id: id } }) : null,
        Number(info.payment_type) === 1 && yes(info.is_public)
          ? read("/_alive/bff_h5/guide_phone_config/user_info/1.0.0", { app_id: app, user_id: user, alive_id: id }) : null,
      ]);
      // In the native mapper only an empty result or a non-teacher object
      // resolves to the ordinary desktop room; never follow supplied URLs.
      if (!(room === null || room === "" || no(room) ||
          room && typeof room === "object" && !Array.isArray(room) && !room.link && (room.is_teacher == null || no(room.is_teacher))) ||
          !gray || gray.jump_live_pc_client?.[app] || !form?.purchase_data || !learning) return false;
      if (form.purchase_data.switch && (!form.append_condition ||
          form.append_condition.value && (!form.user_data || form.user_data.need_collect))) return false;
      if (yes(learning.is_enable)) {
        const check = await read("/xe.learning_condition.api/get_user_learning_condition_passed_api/1.0.0", resource);
        if (!yes(check?.is_passed)) return false;
      } else if (learning.is_enable != null && !no(learning.is_enable)) return false;
      if (Number(info.payment_type) === 1 && yes(info.is_public)) {
        if (!phone || !Object.hasOwn(phone, "bind_pohone")) return false;
        const flags = phone.bind_config;
        if (!phone.alive_role && !phone.bind_pohone && flags?.phone_bind_switch && flags.phone_bind_terminal?.pc &&
            flags.phone_bind_config?.free_live) return false;
      }
      if (Number(info.alive_status) === 3) {
        const slot = replay?.lookback_time;
        const now = Number(replay?.server_time), expire = Number(slot?.expire), type = Number(slot?.expire_type);
        if (!(now > 0) || ![1, 2, 3].includes(type) ||
            type !== 1 && expire !== -1 && (!(expire > now) || (slot.start && !(now >= Number(slot.start))))) return false;
      }
      return true;
    }

    function fromRow(target) {
      const row = target?.closest?.(".camp_pro_content_catalog .section_item_box");
      const vm = row?.__vue__, item = vm?.sectionItem;
      if (!vm || vm.$el !== row || typeof vm.goToContentPage !== "function" || item?.resource_type !== 4 ||
          !yes(vm.isAvailable) || !yes(item.unlock_state) || vm.isNeedMsgCollect || vm.isBreakJump ||
          vm.communityId || vm.isQuanzi || !/^l_[\w-]+$/.test(item.chapter_id) ||
          !/^(?:course_|c_)[\w-]+$/.test(item.course_id)) return null;
      let catalog = vm.$parent;
      for (let hops = 0; catalog && catalog.$options?.name !== "CampProCatalog" && hops < 16; hops++) catalog = catalog.$parent;
      if (catalog?.$options?.name !== "CampProCatalog" || catalog.isQuanzi ||
          vm.$store?.getters?.isTrainingShop || vm.$store?.state?.isElink || !/^[\w-]{1,80}$/.test(vm.appId || "") ||
          catalog.appId !== vm.appId || ![catalog.courseId, vm.courseId, vm.subCourseId].includes(item.course_id) ||
          !/^[\w-]{1,128}$/.test(catalog.userId || "")) return null;
      return { row, vm, catalog, id: item.chapter_id, course: item.course_id, app: vm.appId, user: catalog.userId };
    }

    function cancel() {
      if (!pending) return;
      pending.abort.abort();
      pending.row.removeAttribute("data-xet-live-entry-pending");
      pending = null;
    }
    function click(event) {
      if (!active || location.href !== here.href || !event.isTrusted) return;
      let entry;
      try {
        if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey &&
            !event.shiftKey && !event.altKey) entry = fromRow(event.target);
      } catch { /* Preserve the catalog if its component shape changes. */ }
      if (!entry) { cancel(); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (pending?.row === entry.row) return;
      cancel();
      const job = { ...entry, abort: new AbortController() };
      pending = job;
      job.row.setAttribute("data-xet-live-entry-pending", "");
      void enter(job);
    }

    async function enter(job) {
      const timeout = setTimeout(() => job.abort.abort(), 4500);
      let direct = false;
      try { direct = await allowed(job, job.abort.signal); }
      catch { /* Unclear eligibility: let the unmodified detail flow decide. */ }
      finally { clearTimeout(timeout); }
      if (pending !== job) return;
      pending = null;
      job.row.removeAttribute("data-xet-live-entry-pending");
      if (!active || location.href !== here.href) return;
      let eligible = false;
      try {
        const latest = job.row.isConnected && fromRow(job.row);
        eligible = latest?.vm === job.vm && latest.id === job.id && latest.course === job.course && latest.user === job.user;
      } catch { /* Never act on a remounted or reauthorized catalog. */ }
      if (!eligible) return;
      const path = direct ? "/p/t_pc/live_pc/pc/" + job.id : "/detail/" + job.id + "/4";
      const target = new URL(path, here.origin);
      target.searchParams.set("course_id", job.course);
      location.assign(target.href);
    }

    function stop() {
      active = false;
      cancel();
      document.removeEventListener("click", click, true);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener(STOP, stop);
      if (window[STATE]?.stop === stop) delete window[STATE];
    }
    window[STATE] = { url: here.href, stop };
    document.addEventListener("click", click, true);
    window.addEventListener("pagehide", cancel);
    window.addEventListener(STOP, stop);
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !COURSE.test(message.path)) return { ok: false };
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
