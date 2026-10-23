(() => {
  // Runs in MAIN so the site's Vue objects and authenticated read APIs stay
  // together. Only visibility-triggered reloads are replaced, not user actions.
  function installCourseProgress(expectedPath) {
    const STATE = "__xetCourseProgress", STOP = "xet:course-progress-stop";
    const match = location.pathname.match(/^\/p\/t_pc\/course_pc_detail\/camp_pro\/([\w-]+)\/?$/);
    if (!match || location.pathname !== expectedPath) return { ok: false, reason: "route" };
    const root = document.querySelector(".camp_pro")?.__vue__;
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
    const catalog = tree.find(v => v.$options?.name === "CampProCatalog" && v.courseId === match[1]);
    const owner = tree.find(v => v.$refs?.CampProCatalog === catalog && typeof v.reload === "function");
    if (!catalog || !owner || !catalog.apiMap || typeof catalog.apiMap.getList !== "function" ||
        typeof catalog.apiMap.getLearnResource !== "function" || !Array.isArray(catalog.chapterList)) {
      return { ok: false, reason: "not-ready" };
    }
    let state = window[STATE];
    if (state?.active && state.owner === owner && state.catalog === catalog && state.root === root &&
        state.path === expectedPath && owner.reload === state.reload) return { ok: true };
    state?.stop();
    const original = owner.reload;
    const live = () => state.active && location.pathname === expectedPath &&
      document.querySelector(".camp_pro")?.__vue__ === root && !catalog._isDestroyed &&
      catalog.courseId === match[1] && owner.$refs?.CampProCatalog === catalog;
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
    function refresh() {
      if (!live()) return Promise.resolve();
      if (state.work) return state.work;
      const epoch = state.epoch, sub = catalog.currentSubCourse, order = catalog.order_status,
        rights = catalog.isOnlyShowWithRightsValue;
      const controller = new AbortController(); state.controller = controller;
      const valid = () => live() && state.epoch === epoch && catalog.currentSubCourse === sub &&
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
            const fresh = data(await bounded(catalog.apiMap.getList(params)));
            if (!Array.isArray(fresh.list)) throw new Error("list");
            if (!valid() || !groupLive(g)) return;
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
        jobs.push(async () => {
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
          for (const key of ["resource_id", "resource_type", "jump_url", "last_learn_course_name", "sub_course_id"]) {
            if (["string", "number"].includes(typeof fresh[key])) last[key] = fresh[key];
          }
          set(catalog, "lastStudyData", last);
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
        if (valid()) state.lastResult = { ok: failures === 0, failures };
      })();
      const work = state.work;
      void (async () => {
        try { await work; } finally {
          controller.abort();
          if (state.work === work) { state.work = null; state.controller = null; }
        }
      })();
      return work;
    }
    function reload(...args) {
      if (live() && state.visibilityDispatch) return refresh();
      state.epoch++;
      return original.apply(this, args);
    }
    function visible() {
      if (!live() || document.visibilityState !== "visible") return;
      state.visibilityDispatch = true;
      clearTimeout(state.dispatchTimer);
      // A task, not a microtask: browsers may flush microtasks between native
      // event listeners. The flag must cover the site's document listener.
      state.dispatchTimer = setTimeout(() => { state.visibilityDispatch = false; }, 0);
      void refresh();
    }
    state = { active: true, root, catalog, owner, reload, path: expectedPath, epoch: 0, work: null, visibilityDispatch: false,
      stop() {
        state.active = false; state.epoch++; state.controller?.abort(); clearTimeout(state.dispatchTimer);
        if (owner.reload === reload) owner.reload = original;
        document.removeEventListener("visibilitychange", visible, true);
        window.removeEventListener(STOP, state.stop);
      } };
    window[STATE] = state; owner.reload = reload;
    document.addEventListener("visibilitychange", visible, true);
    window.addEventListener(STOP, state.stop);
    return { ok: true };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || typeof message.path !== "string" ||
        !/^\/p\/t_pc\/course_pc_detail\/camp_pro\/[\w-]+\/?$/.test(message.path)) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || new URL(sender.url).pathname !== message.path || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installCourseProgress, args: [message.path] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetCourseProgressSource = Object.freeze({ installCourseProgress, resolve });
})();
