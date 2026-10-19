(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceHistory || !modules.practiceHistoryData) return;
  const data = modules.practiceHistoryData;
  const PATH = /^\/p\/t_pc\/pc_evaluation\/(?:practice_record\/?|(?:practice_result|practice_analysis)\/[\w-]+\/?)$/;
  const routeKey = () => PATH.test(location.pathname) ? location.pathname + location.search : "";
  function createPracticeHistoryController({ request = m => chrome.runtime.sendMessage(m),
    storage = chrome.storage.local } = {}) {
    let started = false, pending = false, dirty = false, frame = null, timer = null, observer = null;
    let context = null, key = "", generation = 0, discovered = "", more = null;
    let captured = "";
    const mounts = new Map(), roots = new Set();
    const verified = new Set();
    let cacheScope = "", cacheDirty = true, cachedRecords = [];
    async function records(account) {
      const scope = data.prefix(location.origin, account);
      if (cacheDirty || cacheScope !== scope) {
        cachedRecords = await data.load(storage, location.origin, account);
        cacheScope = scope; cacheDirty = false;
      }
      return cachedRecords;
    }
    function clean() {
      for (const [card, node] of mounts) { node.remove(); card.removeAttribute("data-xet-history-practice"); }
      mounts.clear();
      for (const root of roots) root.removeAttribute("data-xet-history-list");
      roots.clear(); more?.remove(); more = null; context = null;
      for (const card of document.querySelectorAll("[data-xet-history-row]")) card.removeAttribute("data-xet-history-row");
    }
    function layout() {
      if (!started || !/^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/.test(location.pathname)) return;
      const root = document.querySelector(".practice-record-page");
      if (root) { root.setAttribute("data-xet-history-list", ""); roots.add(root); }
    }
    async function render(records, current) {
      if (!started || current !== generation || routeKey() !== key || context?.kind !== "list") return;
      const active = context.tab === 0;
      const cards = [...document.querySelectorAll(".practice-history-tab .resource-card")];
      for (const [card, node] of mounts) {
        if (!active || !card.isConnected || !cards.includes(card)) {
          node.remove(); card.removeAttribute("data-xet-history-practice"); mounts.delete(card);
        }
      }
      for (let i = 0; active && i < cards.length; i++) {
        if (!started || current !== generation || routeKey() !== key) return;
        const card = cards[i], ordinal = card.getAttribute("data-xet-history-row");
        const row = /^\d+$/.test(ordinal || "") ? context.rows[Number(ordinal)] : null;
        if (!row || card.querySelector(".resource-card__title")?.textContent.trim() !== row.title.trim()) {
          mounts.get(card)?.remove(); mounts.delete(card); card.removeAttribute("data-xet-history-practice"); continue;
        }
        const attempts = records.filter(r => r.resourceId === row.resourceId && (!row.taskId || r.taskId === row.taskId));
        const signature = JSON.stringify([row.title, attempts]);
        let node = mounts.get(card);
        if (node?.dataset.records === signature && node.isConnected) continue;
        if (!node?.isConnected) {
          node = document.createElement("div"); node.className = "xet-history-details";
          card.querySelector(".resource-card__info")?.append(node); mounts.set(card, node);
        }
        node.dataset.records = signature;
        node.replaceChildren(); card.setAttribute("data-xet-history-practice", attempts.length ? "ready" : "missing");
        if (!attempts.length) {
          node.textContent = "尚未取得已提交的答题记录";
        } else {
          const list = document.createElement("ul"); list.className = "xet-history-attempts";
          attempts.forEach((record, index) => {
            const li = document.createElement("li"), link = document.createElement("a");
            if (record.startedAt) {
              const time = document.createElement("span");
              time.textContent = `练习开始时间：${record.startedAt}`;
              li.append(time);
            }
            link.href = data.resultUrl(location.origin, record);
            link.textContent = attempts.length > 1 ? `查看结果（记录 ${index + 1}）` : "查看结果";
            link.setAttribute("aria-label", `${row.title}，${link.textContent}`);
            li.append(link); list.append(li);
          });
          node.append(list);
        }
        if ((i+1) % 20 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
      }
      const root = document.querySelector(".practice-history-tab");
      if (root && !context.noMore) {
        if (!more?.isConnected) {
          more = document.createElement("button"); more.type = "button"; more.className = "xet-history-more";
          more.addEventListener("click", async () => {
            if (!started || more.disabled) return;
            more.disabled = true;
            try { await request({ type: "xet:practice-history", key, action: "more" }); }
            catch { /* The next readiness check restores retry. */ }
            schedule();
          });
          root.append(more);
        }
        more.disabled = context.loading; more.textContent = context.loading ? "加载中…" : "加载更多";
      } else { more?.remove(); more = null; }
    }
    async function sync() {
      frame = null;
      if (!started) return;
      if (pending) { dirty = true; return; }
      const next = routeKey();
      if (key !== next) { generation++; clean(); key = next; }
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
          if (captured !== signature && await data.save(storage, location.origin, context.account, context)) captured = signature;
        } else if (context.kind === "list") {
          const scope = data.prefix(location.origin, context.account);
          // Cache is applied before discovery. Existing open pages can recover
          // old result links without a new tab, practice join or submission.
          await render(await records(context.account), current);
          for (const row of context.rows) {
            if (!row.joinId || context.tab !== 0 || !scope || verified.has(scope + row.joinId)) continue;
            const r = data.normalize(row);
            if (!r) continue;
            const response = await fetch("/evaluation_wechat/practices/commit_result", {
              method: "POST", credentials: "same-origin", redirect: "error",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ practice_id: r.resourceId, join_id: r.joinId, task_id: r.taskId }),
              signal: AbortSignal.timeout(15_000),
            });
            const result = response.ok ? await response.json() : null;
            if (!started || current !== generation || routeKey() !== expected) return;
            if (result?.code === 0 && result.data?.total_qs > 0) {
              await data.save(storage, location.origin, context.account, r);
              cacheDirty = true;
            }
            verified.add(scope + r.joinId);
          }
          await render(await records(context.account), current);
          if (scope && discovered !== scope) {
            discovered = scope;
            const found = await request({ type: "xet:practice-history", key: expected, action: "discover" });
            if (!started || current !== generation || routeKey() !== expected || found?.context?.account !== context.account) return;
            if (!found.ok) { discovered = ""; return; }
            for (const record of found.attempts || []) await data.save(storage, location.origin, context.account, record);
            cacheDirty = true;
            await render(await records(context.account), current);
          }
        }
      } catch { /* Route readiness, extension reload, or storage failure: retry on wake. */ }
      finally { pending = false; if (dirty) { dirty = false; schedule(); } }
    }
    function schedule() {
      if (started && frame === null) frame = requestAnimationFrame(sync);
    }
    function click(event) {
      if (!started || !/^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/.test(location.pathname)) return;
      const card = event.target.closest?.(".practice-history-tab .resource-card");
      const tabs = [...(card?.closest(".practice-history-tab")?.querySelectorAll(".sub-tab-item") || [])];
      if (!card || !tabs[0]?.classList.contains("active")) return;
      // Native cards open PracticeInfo/new practice. Never allow that fallback.
      event.stopImmediatePropagation();
      const own = mounts.get(card), anchor = event.target.closest(".xet-history-attempts a");
      if (anchor && context?.kind === "list" && routeKey() === key && own?.contains(anchor)) return;
      event.preventDefault();
      const link = context?.kind === "list" && routeKey() === key ? own?.querySelector("a") : null;
      if (link) location.assign(link.href);
    }
    function changed(changes, area) {
      if (area === "local" && Object.keys(changes).some(k => k.startsWith("xetPracticeHistory:"))) {
        cacheDirty = true; schedule();
      }
    }
    function start() {
      if (started || window.top !== window) return;
      started = true;
      observer = new MutationObserver(records => {
        if (records.some(r => !r.target.closest?.(".xet-history-details, .xet-history-more") &&
          [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && !n.matches(".xet-history-details, .xet-history-more")))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", schedule); window.addEventListener("pageshow", schedule);
      window.navigation?.addEventListener("currententrychange", schedule);
      window.addEventListener("click", click, true);
      chrome.storage.onChanged.addListener(changed);
      timer = setInterval(schedule, 1000);
      schedule();
    }
    function stop() {
      started = false; generation++; key = ""; discovered = ""; captured = ""; dirty = false; verified.clear();
      cacheScope = ""; cachedRecords = []; cacheDirty = true;
      if (frame !== null) cancelAnimationFrame(frame); frame = null;
      observer?.disconnect(); observer = null; clearInterval(timer); timer = null;
      window.removeEventListener("popstate", schedule); window.removeEventListener("pageshow", schedule);
      window.navigation?.removeEventListener("currententrychange", schedule);
      window.removeEventListener("click", click, true); chrome.storage.onChanged.removeListener(changed);
      clean();
    }
    return Object.freeze({ start, stop });
  }
  modules.practiceHistory = Object.freeze({ createPracticeHistoryController });
})();
