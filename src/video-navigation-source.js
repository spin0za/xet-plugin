(() => {
  // Serialized into MAIN. Reuse the site's authenticated actions, components
  // and reporting lifecycle; never construct a player from a bare media URL.
  function installVideoNavigation() {
    const STATE = "__xetVideoNavigation", STOP = "xet:video-navigation-stop";
    const VIDEO = /^\/p\/t_pc\/course_pc_detail\/video\/([\w-]+)\/?$/;
    const current = new URL(location.href), course = current.searchParams.get("product_id");
    if (!VIDEO.test(current.pathname) || !course?.startsWith("course_")) return { ok: false };
    function tree(root) {
      const out = [], queue = root ? [root] : [], seen = new Set();
      for (let i = 0; i < queue.length; i++) {
        const vm = queue[i]; if (!vm || seen.has(vm)) continue;
        seen.add(vm); out.push(vm); queue.push(...(vm.$children || []));
      }
      return out;
    }
    const root = document.querySelector("#app")?.__vue__;
    const base = tree(root).find(vm => vm.$options?.name === "CourseBaseLayout");
    const router = base?.$router, tabs = tree(base).find(vm => vm.$options?.name === "ContentSwitchTab");
    const players = () => tree(base).filter(vm => ["BasicVideoPlayer", "OldVideoPlayer"].includes(vm.$options?.name));
    if (!base || !tabs || !router?.beforeEach || !router.afterEach || !base.$options.render ||
        !["initCourseCoreData", "initGoodsInfo", "initMsgCollectData", "initIsPermission"].every(k => typeof base[k] === "function") ||
        !players().some(vm => vm.player && typeof vm.player.destroy === "function")) return { ok: false, reason: "not-ready" };
    let state = window[STATE];
    if (state?.active && state.base === base) return { ok: true };
    state?.stop();
    const originals = [], rowPatches = new Map(), constructors = new Set(), eventConstructors = new Set(), disposed = new WeakSet(), watchedPlayers = new WeakSet();
    const live = () => state.active && !state.failed && !base._isDestroyed && document.querySelector("#app")?.__vue__ === root;
    const nameOf = vm => vm?.$options?.name || vm?.$options?._componentTag;
    const tick = () => base.$nextTick();
    function replace(object, key, value) {
      const previous = object[key]; object[key] = value;
      originals.push(() => { if (object[key] === value) object[key] = previous; });
      return previous;
    }
    function routeUrl(route) { return new URL(route.fullPath, location.origin); }
    function eligible(to, from) {
      const a = routeUrl(to), b = routeUrl(from);
      return VIDEO.test(a.pathname) && VIDEO.test(b.pathname) &&
        a.searchParams.get("product_id") === course && b.searchParams.get("product_id") === course &&
        ["community_id", "content_app_id", "parent_pro_id", "pro_id", "sub_course_id"]
          .every(key => a.searchParams.get(key) === b.searchParams.get(key));
    }
    function invalidate() {
      for (const vm of tree(base)) {
        for (const watcher of Object.values(vm._computedWatchers || {})) watcher.dirty = true;
        vm.$forceUpdate();
      }
      for (const watcher of Object.values(base.$parent?._computedWatchers || {})) watcher.dirty = true;
    }
    function rememberScroll() {
      return { x: scrollX, y: scrollY, elements: [...base.$el.querySelectorAll("*")]
        .filter(el => el.scrollTop || el.scrollLeft).map(el => ({ el, x: el.scrollLeft, y: el.scrollTop })) };
    }
    function restoreScroll(saved) {
      if (!saved) return;
      for (const { el, x, y } of saved.elements) if (el.isConnected) { el.scrollLeft = x; el.scrollTop = y; }
      window.scrollTo(saved.x, saved.y);
    }
    function cleanPlayer(vm) {
      if (disposed.has(vm)) return;
      disposed.add(vm);
      const player = vm.player;
      try { player?.pause(); } catch { /* An already failed player can still be disposed. */ }
      // Freeze the old record before URL/store updates. Use only naturally
      // watched progress, via the native reporting method.
      const duration = Number(player?.duration), time = Number(vm.playTime || player?.currentTime || 0);
      if (!vm.isVideoTry && duration > 0 && Number.isFinite(duration) && time > 0) {
        try { vm.handleVideoStudyReport?.(Math.min(100, Math.floor(time / duration * 100))); } catch { /* Native retry policy. */ }
      }
      try { vm.dotReport?.destroy?.(); } catch { /* SDK may already have detached. */ }
      vm.$once("hook:destroyed", () => { try { player?.destroy(); } catch { /* Already disposed. */ } });
      // The site's initial anonymous visibility handler cannot be removed by
      // reference. Prevent it from reporting after its Vue owner is gone.
      for (const key of ["handleVideoStudyReport", "handleResourceFinish", "initLoop", "initVideo"]) {
        const original = vm[key];
        if (typeof original === "function") vm[key] = function(...args) {
          if (!disposed.has(this) && !this._isDestroyed) return original.apply(this, args);
        };
      }
    }
    function trackListeners(vm, original, args, kind) {
      const records = [];
      const target = kind === "document" ? document : vm.$options._base.prototype;
      const key = kind === "document" ? "addEventListener" : "$on", previous = target[key];
      target[key] = function(...items) { records.push({ owner: this, items }); return previous.apply(this, items); };
      try { return original.apply(vm, args); }
      finally {
        target[key] = previous;
        vm.$once("hook:beforeDestroy", () => {
          for (const r of records) {
            if (kind === "document") r.owner.removeEventListener(...r.items);
            else r.owner.$off(...r.items);
          }
        });
      }
    }
    function prepareEvents(ctor) {
      const methods = ctor?.options?.methods, original = methods?.onEventBus;
      if (eventConstructors.has(ctor) || typeof original !== "function") return;
      eventConstructors.add(ctor);
      replace(methods, "onEventBus", function(...args) {
        if (!this._isDestroyed) return trackListeners(this, original, args, "bus");
      });
    }
    function preparePlayer(vm) {
      if (!vm) return;
      if (!watchedPlayers.has(vm)) {
        watchedPlayers.add(vm);
        vm.$once("hook:beforeDestroy", () => cleanPlayer(vm));
      }
      if (constructors.has(vm.constructor)) return;
      constructors.add(vm.constructor);
      prepareEvents(vm.constructor);
      const options = vm.constructor.options, methods = options.methods;
      for (const key of ["addVisibilityChangeEvent"]) {
        const original = methods?.[key]; if (typeof original !== "function") continue;
        replace(methods, key, function(...args) {
          if (this._isDestroyed) return;
          return trackListeners(this, original, args, "document");
        });
      }
      const hooks = options.beforeDestroy;
      replace(options, "beforeDestroy", [...(Array.isArray(hooks) ? hooks : hooks ? [hooks] : []), function() { cleanPlayer(this); }]);
      const init = methods.initVideo;
      replace(methods, "initVideo", function(...args) { if (!this._isDestroyed && !disposed.has(this)) return init.apply(this, args); });
    }
    for (const vm of players()) preparePlayer(vm);
    // Keep the native catalog pane alive. Other panes are keyed per resource so
    // comments, description and classroom interactions cannot retain old IDs.
    function patchTabs(vnode) {
      if (!vnode) return;
      const options = vnode.componentOptions;
      // Vue strips keys from abstract keep-alive components during creation.
      // Identify the native pane by its name prop instead of that lost key.
      if (options?.Ctor?.options?.name === "keep-alive") {
        const pane = options.children?.find(node => node.componentOptions);
        const name = pane?.componentOptions?.propsData?.name || pane?.data?.attrs?.name;
        if (name === "content_catelog") {
          vnode.key = "xet-video:catalog";
          return;
        }
        if (["content_detail", "course_comments", "class_interaction"].includes(name)) {
          vnode.key = `xet-video:${state.id}:${name}`;
          if (state.hidden) pane.componentOptions.children = [];
          return;
        }
      }
      for (const child of vnode.children || []) patchTabs(child);
      for (const child of options?.children || []) patchTabs(child);
    }
    const tabsRender = tabs.$options.render;
    replace(tabs.$options, "render", function(...args) {
      const vnode = tabsRender.apply(this, args); patchTabs(vnode); return vnode;
    });
    const resourceComponents = new Set(["CourseWares", "CourseInteraction", "CourseCertificate", "RelatedChannel",
      "GoodsRecommend", "InformationCollectionPc", "TaskPcConfirm"]);
    function patchResources(vnode) {
      if (!vnode) return vnode;
      const options = vnode.componentOptions, name = options?.tag || options?.Ctor?.options?.name;
      prepareEvents(options?.Ctor);
      if (resourceComponents.has(name)) {
        if (state.hidden) return base._e();
        vnode.key = `xet-video:${state.id}:${name}`;
      }
      if (vnode.children) vnode.children = vnode.children.map(patchResources);
      return vnode;
    }
    const render = base.$options.render;
    replace(base.$options, "render", function(...args) {
      const slot = this.$scopedSlots.contentHeader;
      this.$scopedSlots.contentHeader = (...values) => {
        if (state.hidden) return [];
        const nodes = slot(...values);
        for (const node of nodes || []) { prepareEvents(node.componentOptions?.Ctor); node.key = `xet-video:${state.id}:player`; }
        return nodes;
      };
      try { return patchResources(render.apply(this, args)); }
      finally { this.$scopedSlots.contentHeader = slot; }
    });
    function fallback(url) {
      state.failed = true;
      location.replace(url.href);
    }
    async function load(to) {
      const url = routeUrl(to), id = url.pathname.match(VIDEO)[1];
      let timeout;
      try {
        invalidate();
        base.currentUrl = url.href;
        await Promise.race([(async () => {
          await base.initCourseCoreData();
          await Promise.all([
            base.initGoodsInfo({ resource_id: id }),
            base.initMsgCollectData({ resource_id: id, resource_type: 3, user_id: base.userId }),
            base.initIsPermission({ resource_id: course, content_app_id: url.searchParams.get("content_app_id") || "", courseData: base.campProCourseData }),
          ]);
        })(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("timeout")), 25000); })]);
        if (!live()) return;
        if (base.videoInfo?.video_info?.resource_id !== id || base.isShowCommonHeader || base.isShowLoading) throw new Error("unsupported-response");
        // Finish in-flight native reads before taking the latest queued click,
        // but do not start an intermediate video the user has already skipped.
        if (state.pending && state.pending.pathname !== url.pathname) return;
        state.id = id; state.hidden = false;
        invalidate(); await tick();
        document.title = base.videoInfo.video_info.title || document.title;
        for (const vm of tree(base)) if (nameOf(vm) === "CampProCatalog") vm.lastStudyResourceId = id;
        for (const vm of players()) preparePlayer(vm);
        restoreScroll(state.scroll);
        requestAnimationFrame(() => { if (live()) restoreScroll(state.scroll); });
        state.lastResult = { ok: true, id };
      } catch { if (live()) fallback(state.pending || url); }
      finally { clearTimeout(timeout); }
    }
    const removeBefore = router.beforeEach(async (to, from, next) => {
      if (!live() || !eligible(to, from) || to.params.id === from.params.id) { next(); return; }
      try {
        if (state.loading) await state.loading;
        if (!live()) { next(); return; }
        if (!state.hidden) state.scroll = rememberScroll();
        const container = base.$el.querySelector(".content_header");
        if (container && !state.spacer) {
          state.spacer = { el: container, value: container.style.minHeight };
          container.style.minHeight = `${container.getBoundingClientRect().height}px`;
        }
        state.hidden = true; base.$forceUpdate(); tabs.$forceUpdate();
        await tick();
        if (!live()) { next(false); return; }
        state.prepared = true; next();
      } catch { next(false); if (live()) fallback(routeUrl(to)); }
    });
    const removeAfter = router.afterEach((to, from) => {
      if (!state.prepared || !live()) return;
      state.prepared = false;
      if (!eligible(to, from)) { fallback(routeUrl(to)); return; }
      const work = load(to); state.loading = work;
      void (async () => { try { await work; } finally {
        if (state.loading === work) state.loading = null;
        if (state.spacer && !state.hidden) { state.spacer.el.style.minHeight = state.spacer.value; state.spacer = null; }
      } })();
    });
    async function request(url) {
      state.pending = url;
      if (state.draining) return;
      state.draining = true;
      try {
        while (state.pending && live()) {
          const target = state.pending; state.pending = null;
          if (target.pathname === location.pathname && target.search === location.search) continue;
          await router.push(target.pathname + target.search + target.hash);
          if (state.loading) await state.loading;
        }
      } catch (error) {
        if (live() && !error?._isRouter) fallback(url);
      } finally { state.draining = false; }
    }
    function patchRows() {
      if (!live()) return;
      for (const vm of tree(base)) {
        if (typeof vm.openCatalogTarget !== "function" || !vm.sectionItem || rowPatches.has(vm)) continue;
        const original = vm.openCatalogTarget;
        const wrapped = function(value) {
          const url = new URL(value, location.origin);
          if (!live() || state.modifiedClick || Number(this.sectionItem.resource_type) !== 3 ||
              url.origin !== location.origin || !eligible({ fullPath: url.pathname + url.search }, router.currentRoute)) {
            return original.apply(this, arguments);
          }
          void request(url);
        };
        vm.openCatalogTarget = wrapped; rowPatches.set(vm, { original, wrapped });
      }
      for (const [vm] of rowPatches) if (vm._isDestroyed) rowPatches.delete(vm);
    }
    function click(event) {
      state.modifiedClick = event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
      clearTimeout(state.clickTimer); state.clickTimer = setTimeout(() => { state.modifiedClick = false; }, 0);
      patchRows();
    }
    state = { active: true, base, id: current.pathname.match(VIDEO)[1], hidden: false, loading: null,
      stop() {
        state.active = false; state.pending = null;
        removeBefore(); removeAfter(); clearTimeout(state.clickTimer); clearInterval(state.timer);
        document.removeEventListener("click", click, true); window.removeEventListener(STOP, state.stop);
        for (const [vm, { original, wrapped }] of rowPatches) if (vm.openCatalogTarget === wrapped) vm.openCatalogTarget = original;
        for (const restore of originals.reverse()) restore();
        if (state.spacer) state.spacer.el.style.minHeight = state.spacer.value;
        if (state.hidden && !base._isDestroyed) fallback(new URL(location.href));
      } };
    // Seed the mounted tree too, so an unkeyed catalog is not matched to a
    // different unkeyed keep-alive when its siblings receive explicit keys.
    patchTabs(tabs._vnode);
    window[STATE] = state;
    document.addEventListener("click", click, true); window.addEventListener(STOP, state.stop);
    state.timer = setInterval(patchRows, 1000); patchRows();
    return { ok: true };
  }
  async function resolve(message, sender, { siteAccess, readSettings }) {
    const site = siteAccess.siteInfo(sender.url);
    if (!site || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        !/^\/p\/t_pc\/course_pc_detail\/video\/[\w-]+\/?$/.test(new URL(sender.url).pathname)) return { ok: false };
    const settings = await readSettings();
    if (settings.disabledSites.includes(site.origin) || !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] } : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: installVideoNavigation });
    return sender.documentId && result?.documentId !== sender.documentId ? { ok: false } : result?.result || { ok: false };
  }
  globalThis.XetVideoNavigationSource = Object.freeze({ installVideoNavigation, resolve });
})();
