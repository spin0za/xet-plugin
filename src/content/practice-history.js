(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceHistory || !modules.practiceHistoryData) return;
  const data = modules.practiceHistoryData;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/(?:practice_record\/?|(?:practice_result|practice_analysis)\/[\w-]+\/?)$/;
  const routeKey = () => PATH.test(location.pathname) ? location.pathname + location.search : "";
  function createPracticeHistoryController({ request = m => chrome.runtime.sendMessage(m),
    storage = chrome.storage.local, syncStorage = chrome.storage.sync } = {}) {
    let started = false, pending = false, dirty = false, frame = null, timer = null, observer = null;
    let context = null, key = "", generation = 0, discovered = "", more = null, list = null, status = null;
    let captured = "", synchronized = "", syncProblem = false;
    const roots = new Set(), verified = new Set();
    let cacheScope = "", cacheDirty = true, cachedRecords = [];
    async function records(account) {
      const scope = data.prefix(location.origin, account);
      if (cacheDirty || cacheScope !== scope) {
        cachedRecords = await data.loadBoth(storage, syncStorage, location.origin, account);
        cacheScope = scope; cacheDirty = false;
      }
      return cachedRecords;
    }
    function clean() {
      list?.remove(); list = null; status?.remove(); status = null;
      for (const root of roots) {
        root.removeAttribute("data-xet-history-list"); root.removeAttribute("data-xet-history-results");
      }
      roots.clear(); more?.remove(); more = null; context = null;
      for (const card of document.querySelectorAll("[data-xet-history-row]")) card.removeAttribute("data-xet-history-row");
    }
    function layout() {
      if (!started || !/^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/.test(location.pathname)) return;
      const root = document.querySelector(".practice-record-page");
      if (root) { root.setAttribute("data-xet-history-list", ""); roots.add(root); }
    }
    async function syncCloud() {
      const response = await request({ type: "xet:practice-history", key, action: "sync" });
      if (!response?.ok || response.context?.account !== context?.account) throw Error("Sync unavailable");
      syncProblem = !response.synced; cacheDirty = true;
    }
    async function render(all, current) {
      if (!started || current !== generation || routeKey() !== key || context?.kind !== "list") return;
      const active = context.tab === 0, page = document.querySelector(".practice-record-page");
      const root = page?.querySelector(".practice-history-tab");
      if (!root) return;
      page.toggleAttribute("data-xet-history-results", active);
      if (!active) { list?.remove(); list = null; status?.remove(); status = null; }
      else {
        // Attempts are independent of the site's publication-sorted, paginated
        // resources. Every visible row links to one existing submitted result.
        const sorted = [...all].sort((a, b) => b.submittedAt - a.submittedAt || a.joinId.localeCompare(b.joinId));
        const signature = JSON.stringify([context.account, sorted]);
        if (!list?.isConnected) { list = document.createElement("ul"); list.className = "xet-history-records"; root.append(list); }
        if (list.dataset.records !== signature) {
          list.dataset.records = signature; list.replaceChildren();
          for (let i = 0; i < sorted.length; i++) {
            if (!started || current !== generation || routeKey() !== key) return;
            const record = sorted[i], li = document.createElement("li"), link = document.createElement("a");
            link.href = data.resultUrl(location.origin, record);
            link.className = "xet-history-result-link";
            link.textContent = record.title || context.rows.find(r => r.resourceId === record.resourceId)?.title || record.resourceId;
            li.append(link);
            if (record.submittedAt || record.startedAt) {
              const time = document.createElement("span");
              time.textContent = record.submittedAt ? `交卷时间：${data.startTime(record.submittedAt)}（插件记录）`
                : `练习开始时间：${record.startedAt}`;
              li.append(time);
            }
            list.append(li);
            if ((i + 1) % 20 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
          }
        }
        if (!status?.isConnected) { status = document.createElement("div"); status.className = "xet-history-status";
          status.setAttribute("role", "status"); root.append(status); }
        const message = syncProblem ? "Chrome 同步暂未完成或额度已满，记录仍保存在本机。"
          : all.length ? "" : "暂无可查看结果的练习记录；以后交卷成功后会自动保存。";
        if (status.dataset.message !== message) {
          status.dataset.message = message; status.replaceChildren(document.createTextNode(message));
          if (syncProblem) {
            const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "重试同步";
            retry.addEventListener("click", async () => {
              retry.disabled = true;
              try { await syncCloud(); } catch { syncProblem = true; }
              retry.disabled = false; schedule();
            }); status.append(retry);
          }
        }
      }
      if (!active && !context.noMore) {
        if (!more?.isConnected) {
          more = document.createElement("button"); more.type = "button"; more.className = "xet-history-more";
          more.addEventListener("click", async () => {
            if (!started || more.disabled) return;
            more.disabled = true;
            try { await request({ type: "xet:practice-history", key, action: "more" }); } catch { /* Retry on wake. */ }
            schedule();
          }); root.append(more);
        }
        more.disabled = context.loading; more.textContent = context.loading ? "加载中…" : "加载更多";
      } else { more?.remove(); more = null; }
    }
    async function sync() {
      frame = null;
      if (!started) return;
      if (pending) { dirty = true; return; }
      const next = routeKey();
      if (key !== next) { generation++; clean(); key = next; synchronized = ""; }
      if (!key) return;
      layout();
      const current = generation, expected = key;
      pending = true;
      try {
        const response = await request({ type: "xet:practice-history", key: expected, action: "read" });
        if (!started || current !== generation || routeKey() !== expected || !response?.ok || response.context.key !== expected) return;
        context = response.context;
        if (context.kind === "attempt") {
          const signature = JSON.stringify([context.account, data.normalize(context)]);
          if (captured !== signature) {
            const saved = await request({ type: "xet:practice-history", key: expected, action: "capture" });
            if (saved?.ok) captured = signature;
          }
        } else if (context.kind === "list") {
          const scope = data.prefix(location.origin, context.account);
          if (cacheScope !== scope) { syncProblem = false; discovered = ""; }
          await render(await records(context.account), current);
          if (context.tab !== 0 || !scope) return;
          if (synchronized !== scope) {
            synchronized = scope;
            try { await syncCloud(); } catch { syncProblem = true; }
            if (!started || current !== generation || routeKey() !== expected) return;
            await render(await records(context.account), current);
          }
          for (const row of context.rows) {
            if (!row.joinId || verified.has(scope + row.joinId)) continue;
            const r = data.normalize(row); if (!r) continue;
            const response = await fetch("/evaluation_wechat/practices/commit_result", {
              method: "POST", credentials: "same-origin", redirect: "error", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ practice_id: r.resourceId, join_id: r.joinId, task_id: r.taskId }), signal: AbortSignal.timeout(15_000),
            });
            const result = response.ok ? await response.json() : null;
            if (!started || current !== generation || routeKey() !== expected) return;
            if (result?.code === 0 && result.data?.total_qs > 0) {
              await data.save(storage, location.origin, context.account, r); cacheDirty = true; synchronized = "";
            }
            verified.add(scope + r.joinId);
          }
          if (discovered !== scope) {
            discovered = scope;
            const found = await request({ type: "xet:practice-history", key: expected, action: "discover" });
            if (!started || current !== generation || routeKey() !== expected || found?.context?.account !== context.account) return;
            if (!found.ok) { discovered = ""; return; }
            for (const record of found.attempts || []) await data.save(storage, location.origin, context.account, record);
            cacheDirty = true; synchronized = "";
          }
          await render(await records(context.account), current);
        }
      } catch { /* Route readiness, extension reload, or storage failure: retry on wake. */ }
      finally { pending = false; if (dirty) { dirty = false; schedule(); } }
    }
    function schedule() { if (started && frame === null) frame = requestAnimationFrame(sync); }
    function click(event) {
      if (!started || !/^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/.test(location.pathname)) return;
      const card = event.target.closest?.(".practice-history-tab .resource-card");
      if (card?.closest(".practice-history-tab")?.querySelector(".sub-tab-item")?.classList.contains("active")) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }
    function changed(changes, area) {
      if (["local", "sync"].includes(area) && Object.keys(changes).some(k => k.startsWith("xetPracticeHistory:"))) {
        cacheDirty = true; schedule();
      }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      observer = new MutationObserver(records => {
        if (records.some(r => !r.target.closest?.(".xet-history-records, .xet-history-status, .xet-history-more") &&
          [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && !n.matches(".xet-history-records, .xet-history-status, .xet-history-more")))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", schedule); window.addEventListener("pageshow", schedule);
      window.navigation?.addEventListener("currententrychange", schedule);
      window.addEventListener("click", click, true); chrome.storage.onChanged.addListener(changed);
      timer = setInterval(schedule, 1000); schedule();
    }
    function stop() {
      started = false; generation++; key = ""; discovered = ""; captured = ""; synchronized = ""; dirty = false; verified.clear();
      cacheScope = ""; cachedRecords = []; cacheDirty = true;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      observer?.disconnect(); observer = null; clearInterval(timer); timer = null;
      window.removeEventListener("popstate", schedule); window.removeEventListener("pageshow", schedule);
      window.navigation?.removeEventListener("currententrychange", schedule);
      window.removeEventListener("click", click, true); chrome.storage.onChanged.removeListener(changed); clean();
    }
    return Object.freeze({ start, stop });
  }
  modules.practiceHistory = Object.freeze({ createPracticeHistoryController });
})();
