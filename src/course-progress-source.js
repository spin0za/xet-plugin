(() => {
  // Runs in MAIN with the native catalog and read APIs. Page type is only an
  // entry guard; the mounted catalog decides whether this adapter applies.
  function installCourseProgress(expectedPath, expectedUrl) {
    const STATE = "__xetCourseProgress", STOP = "xet:course-progress-stop";
    const ROUTE = /^\/p\/t_pc\/course_pc_detail\/(camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/([\w-]+)\/?$/;
    const COURSE = /^(?:course_|c_)[\w-]+$/;
    const match = location.pathname.match(ROUTE), url = new URL(location.href);
    let requested;
    try { requested = new URL(expectedUrl); } catch { return { ok: false, reason: "route" }; }
    if (!match || location.pathname !== expectedPath || requested.origin !== url.origin ||
        requested.pathname !== url.pathname || requested.search !== url.search) return { ok: false, reason: "route" };
    const rootElement = () => document.querySelector("#app") || document.querySelector(".camp_pro");
    const root = rootElement()?.__vue__;
    const contextKey = () => {
      const current = new URL(location.href), route = current.pathname.match(ROUTE);
      if (!route) return null;
      const family = ["video", "audio", "document", "image_text"].includes(route[1]) ? "content" : current.pathname;
      return JSON.stringify([family, ...["parent_pro_id", "pro_id", "product_id", "content_app_id", "community_id", "type", "resType", "sub_course_id"]
        .map(key => current.searchParams.get(key))]);
    };
    const context = contextKey();
    function declaredCourse() {
      const current = new URL(location.href), route = current.pathname.match(ROUTE);
      return current.searchParams.get("parent_pro_id") || current.searchParams.get("pro_id") ||
        current.searchParams.get("product_id") || (route?.[1] === "camp_pro" ? route[2] : null);
    }
    function descendants(v) {
      const result = [], queue = v ? [v] : [], seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!item || seen.has(item)) continue;
        seen.add(item); result.push(item); queue.push(...(item.$children || []));
      }
      return result;
    }
    const tree = descendants(root);
    const candidates = tree.filter(v => v.$options?.name === "CampProCatalog" && !v._isDestroyed);
    const matches = candidates.map(catalog => {
      const owner = tree.find(v => v.$refs?.CampProCatalog === catalog && typeof v.reload === "function");
      const outer = tree.find(v => v.$refs?.courseContentCatalog === owner && typeof v.onCatalogRefresh === "function");
      const info = owner?.courseInfo || outer?.courseInformation;
      if (!COURSE.test(catalog.courseId || "") || info && (info.resource_type !== 50 || info.resource_id !== catalog.courseId) ||
          declaredCourse() && declaredCourse() !== catalog.courseId || !info && !declaredCourse()) return null;
      return { catalog, owner, outer };
    }).filter(Boolean);
    if (matches.length !== 1) {
      window[STATE]?.stop();
      const otherCatalog = tree.some(v => ["MemberCatalog", "ColumnCatalog", "BigColumnCatalog", "CampCatalog"].includes(v.$options?.name) ||
        v.$options?.name === "CourseContentCatalog" && [5, 6, 8, 25].includes(v.courseInfo?.resource_type));
      return { ok: false, reason: !candidates.length && otherCatalog ? "unsupported-catalog" : "not-ready" };
    }
    const { catalog, owner, outer } = matches[0], course = catalog.courseId;
    if (catalog.isQuanzi) {
      window[STATE]?.stop();
      return { ok: false, reason: "unsupported-catalog" };
    }
    if (!catalog || !owner || !catalog.apiMap || typeof catalog.apiMap.getList !== "function" ||
        typeof catalog.apiMap.getLearnResource !== "function" || !Array.isArray(catalog.chapterList)) {
      return { ok: false, reason: "not-ready" };
    }
    const base = tree.find(v => v.$options?.name === "CourseBaseLayout");
    const permissions = () => JSON.stringify([catalog.appId, catalog.isPermission, catalog.isAvailable, catalog.isQuanzi, catalog.community_id,
      owner.isHasPermission, owner.isNeedMsgCollect, owner.courseInfo?.goods_status,
      outer?.isPermission, outer?.shouldCollect, outer?.isSubscribe, base?.userId,
      owner.courseInfo?.resource_type, owner.courseInfo?.resource_id]);
    const permissionKey = permissions();
    let state = window[STATE];
    if (state?.active && state.adapterVersion === 2 && state.patchRevision === 3 && state.owner === owner && state.catalog === catalog &&
        state.permissionKey !== permissionKey && !state.nativeReloaded) {
      // Do not bless a permission/account change merely because our poll ran.
      // First let a native reload (or the native prop watcher) revalidate it.
      return { ok: false, reason: "permissions-changed" };
    }
    if (state?.active && state.adapterVersion === 2 && state.patchRevision === 3 && state.owner === owner && state.catalog === catalog && state.root === root &&
        state.context === context && state.permissionKey === permissionKey && owner.reload === state.reload) {
      state.path = expectedPath;
      if (state.progressPending) void state.refresh("progress");
      return { ok: true };
    }
    state?.stop();
    const original = owner.reload;
    const live = () => state.active && contextKey() === context && rootElement()?.__vue__ === root && !catalog._isDestroyed &&
      catalog.courseId === course && owner.$refs?.CampProCatalog === catalog && (!declaredCourse() || declaredCourse() === course);
    const safe = () => live() && permissions() === permissionKey;
    const searching = () => Boolean(catalog.isSearchShow || outer?.isSearchActive);
    const set = (object, key, value) => {
      if (object[key] === value) return;
      if (typeof catalog.$set === "function") catalog.$set(object, key, value);
      else object[key] = value;
    };
    async function bounded(task) {
      let timer;
      try {
        return await Promise.race([task, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 15_000);
        })]);
      } finally { clearTimeout(timer); }
    }
    function data(result) {
      if (result?.code !== 0 || !result.data || typeof result.data !== "object") throw new Error("response");
      return result.data;
    }
    async function progress(signal) {
      const response = await fetch("/xe.course.business.e_course.learning_resource_progress.get/1.0.0", {
        method: "POST", credentials: "same-origin", redirect: "error", signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: catalog.appId, course_id: catalog.courseId }),
      });
      if (!response.ok) throw new Error("http");
      return data(await response.json());
    }
    function groups() {
      const result = [{ vm: catalog, rows: catalog.chapterList, pid: catalog.currentItemPid,
        size: catalog.catalogPageSize, order: catalog.order_status, sub: catalog.currentSubCourse,
        rights: Number(catalog.isOnlyShowWithRightsValue), field: "chapterList" }];
      for (const vm of descendants(catalog)) {
        if (!Array.isArray(vm.chapterChildren) || !vm.chapterChildren.length || !vm.chapterItem?.chapter_id) continue;
        result.push({ vm, rows: vm.chapterChildren, pid: vm.chapterItem.chapter_id,
          size: vm.catalogPageSize, order: vm.catalogOrder, sub: vm.subCourseId,
          rights: Number(vm.isOnlyShowWithRights), field: "chapterChildren" });
      }
      return result.filter(g => g.rows.length && Number.isInteger(g.size) && g.size > 0);
    }
    function groupLive(g) {
      const vm = g.vm;
      return !vm._isDestroyed && vm[g.field] === g.rows &&
        (vm === catalog ? vm.currentItemPid === g.pid && vm.order_status === g.order &&
          vm.currentSubCourse === g.sub && Number(vm.isOnlyShowWithRightsValue) === g.rights
          : vm.chapterItem?.chapter_id === g.pid && vm.catalogOrder === g.order &&
            vm.subCourseId === g.sub && Number(vm.isOnlyShowWithRights) === g.rights);
    }
    function refresh(reason = "visibility") {
      if (!safe()) return Promise.resolve();
      if (searching() || state.work) {
        if (reason === "progress") state.progressPending = true;
        return state.work || Promise.resolve();
      }
      state.progressPending = false;
      const epoch = state.epoch, sub = catalog.currentSubCourse, order = catalog.order_status,
        rights = catalog.isOnlyShowWithRightsValue;
      const controller = new AbortController(); state.controller = controller;
      const valid = () => safe() && !searching() && state.epoch === epoch && catalog.currentSubCourse === sub &&
        catalog.order_status === order && catalog.isOnlyShowWithRightsValue === rights;
      state.work = (async () => {
        let failures = 0;
        const jobs = [];
        for (const g of groups()) {
          const first = Number(g.vm.lastPageSize), last = Number(g.vm.nextPageSize);
          // Read only pages the user already loaded. Never crawl the course.
          if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first ||
              last - first > Math.ceil(g.rows.length / g.size)) continue;
          for (let page = first; page <= last; page++) jobs.push(async () => {
            const params = { app_id: catalog.appId, course_id: catalog.courseId, p_id: g.pid,
              page, page_size: g.size, order: g.order, sub_course_id: g.sub,
              resource_id: "", is_display_auth_sections: g.rights };
            if (catalog.community_id) params.community_id = catalog.community_id;
            const fresh = data(await bounded(catalog.apiMap.getList(params)));
            if (!Array.isArray(fresh.list)) throw new Error("list");
            if (!valid() || !groupLive(g)) return;
            const booleanField = value => typeof value === "boolean" || value === 0 || value === 1;
            if (g.vm === catalog && booleanField(fresh.available) &&
                (typeof catalog.isPermission === "boolean" && Boolean(fresh.available) !== catalog.isPermission ||
                 booleanField(fresh.subscribe) && typeof catalog.isAvailable === "boolean" &&
                 Boolean(fresh.available && fresh.subscribe) !== catalog.isAvailable)) {
              state.epoch++; state.progressPending = false; state.nativeReloaded = true;
              state.lastResult = { ok: true, failures: 0, reason: "permissions", native: true };
              // The server changed access even if the page has not noticed.
              // Reuse native catalog validation, never reload the reading pane.
              original.call(owner);
              return;
            }
            const byId = new Map(fresh.list.filter(q => typeof q?.chapter_id === "string").map(q => [q.chapter_id, q]));
            for (const row of g.rows) {
              const newer = byId.get(row.chapter_id);
              if (!newer) continue;
              for (const key of ["study_status", "learn_progress", "unlock_state"]) {
                const value = newer[key];
                if (typeof value !== "number" || !Number.isFinite(value)) continue;
                if (key === "study_status" && ![0, 1, 2].includes(value) ||
                    key === "learn_progress" && (value < 0 || value > 100) ||
                    key === "unlock_state" && ![0, 1].includes(value)) continue;
                set(row, key, value);
              }
              if (typeof newer.unlock_date === "string") set(row, "unlock_date", newer.unlock_date);
            }
          });
        }
        if (tree.some(vm => vm.$options?.name === "ContinueStudy" && vm.campProCourseInfo?.course_id === course)) jobs.push(async () => {
          const fresh = await bounded(progress(controller.signal));
          if (!valid() || typeof fresh.progress !== "number" || !Number.isFinite(fresh.progress) ||
              fresh.progress < 0 || fresh.progress > 100) return;
          for (const vm of descendants(root)) {
            if (vm.$options?.name === "ContinueStudy" && vm.campProCourseInfo?.course_id === catalog.courseId) {
              set(vm, "progerss", fresh.progress); // Native component spells it this way.
            }
          }
        });
        jobs.push(async () => {
          const fresh = data(await bounded(catalog.apiMap.getLearnResource({ app_id: catalog.appId, course_id: catalog.courseId })));
          if (!valid() || typeof fresh.resource_id !== "string") return;
          const last = {};
          const lastKeys = ["resource_id", "resource_type", "jump_url", "last_learn_course_name", "sub_course_id"];
          for (const key of lastKeys) {
            if (["string", "number"].includes(typeof fresh[key])) last[key] = fresh[key];
          }
          // A fresh but identical object would still invalidate native Vue
          // descendants on every tab return. Keep its identity when unchanged.
          const previous = catalog.lastStudyData;
          if (!previous || lastKeys.some(key => previous[key] !== last[key])) set(catalog, "lastStudyData", last);
          set(catalog, "lastStudyResourceId", fresh.resource_id);
          const row = groups().flatMap(g => g.rows).find(q => q.chapter_id === fresh.resource_id);
          if (row && typeof row.p_id === "string") set(catalog, "lastStudyPId", row.p_id);
        });
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
          while (next < jobs.length && valid()) {
            const job = jobs[next++];
            try { await job(); } catch { failures++; }
          }
        }));
        if (valid()) state.lastResult = { ok: failures === 0, failures, reason };
      })();
      const work = state.work;
      void (async () => {
        try { await work; } finally {
          controller.abort();
          if (state.work === work) { state.work = null; state.controller = null; }
          if (state.progressPending && safe() && !searching()) void refresh("progress");
        }
      })();
      return work;
    }
    function reload(...args) {
      if (safe() && state.visibilityDispatch) return state.dispatchWork || refresh();
      if (live() && permissions() !== permissionKey) state.nativeReloaded = true;
      state.epoch++;
      return original.apply(this, args);
    }
    function visible() {
      if (!safe() || document.visibilityState !== "visible") return;
      state.path = location.pathname;
      state.visibilityDispatch = true;
      clearTimeout(state.dispatchTimer);
      // Accommodate both the registered synchronous visibility handler and
      // the site's deferred variant. Progress reads start immediately.
      state.dispatchTimer = setTimeout(() => {
        state.dispatchTimer = setTimeout(() => { state.visibilityDispatch = false; state.dispatchWork = null; }, 0);
      }, 0);
      state.dispatchWork = refresh();
    }
    const restore = [];
    state = { active: true, adapterVersion: 2, patchRevision: 3, root, catalog, owner, reload, refresh, path: expectedPath, course, context, permissionKey,
      epoch: 0, work: null, visibilityDispatch: false, progressPending: false, nativeReloaded: false,
      stop() {
        state.active = false; state.epoch++; state.controller?.abort(); clearTimeout(state.dispatchTimer);
        if (owner.reload === reload) owner.reload = original;
        document.removeEventListener("visibilitychange", visible, true);
        window.removeEventListener(STOP, state.stop);
        for (const undo of restore.splice(0)) undo();
      } };
    window[STATE] = state; owner.reload = reload;
    // Native catalogRefresh changes this prop after document/image completion
    // and audio/video progress. Patch only its dedicated user watcher, not the
    // event bus, reporting methods, rendering watcher or manual catalog actions.
    // Production Vue deliberately erases watcher.expression. Identify the
    // native callback from the component's actual watch option instead.
    const option = catalog.$options?.watch?.reloadSwitch;
    const callbacks = (Array.isArray(option) ? option : [option]).map(value => {
      const handler = value && typeof value === "object" ? value.handler : value;
      return typeof handler === "string" ? catalog[handler] : handler;
    }).filter(value => typeof value === "function");
    const watchers = [...new Set([...(catalog._watchers || []), ...(catalog._scope?.effects || [])])]
      .filter(w => w.user && callbacks.includes(w.cb));
    if (watchers.length === 1) {
      const watcher = watchers[0], callback = watcher.cb;
      const quietProgress = function(...args) {
        if (safe()) return refresh("progress");
        if (live() && permissions() !== permissionKey) state.nativeReloaded = true;
        state.epoch++;
        return callback.apply(this, args);
      };
      watcher.cb = quietProgress;
      state.progressWatcherPatched = true;
      restore.push(() => { if (watcher.cb === quietProgress) watcher.cb = callback; });
    }
    if (typeof catalog.$watch === "function") restore.push(catalog.$watch(searching, active => {
      if (!active && state.progressPending && safe()) void refresh("progress");
    }));
    if (typeof catalog.$once === "function" && typeof catalog.$off === "function") {
      const detached = () => {
        if (!state.active) return;
        state.stop();
        // Wait only for Vue's current synchronous remount, not the poll's
        // five-second identity recheck, before connecting the replacement.
        void (async () => { await Promise.resolve(); window.dispatchEvent(new Event("xet:course-progress-remount")); })();
      };
      catalog.$once("hook:beforeDestroy", detached);
      restore.push(() => catalog.$off("hook:beforeDestroy", detached));
    }
    document.addEventListener("visibilitychange", visible, true);
    window.addEventListener(STOP, state.stop);
    return { ok: true };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^\/p\/t_pc\/course_pc_detail\/(camp_pro|video|audio|document|image_text|camp|member|column|big_column)\/[\w-]+\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    // MessageSender.url may retain the document's initial URL after history
    // navigation. Authorize its origin, then verify the requested live route in
    // MAIN in the exact sender document, including its course identity.
    let url;
    try { url = new URL(message.url); } catch { return { ok: false }; }
    if (!site || url.origin !== site.origin || url.pathname !== message.path || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installCourseProgress, args: [message.path, url.href] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetCourseProgressSource = Object.freeze({ installCourseProgress, resolve });
})();
