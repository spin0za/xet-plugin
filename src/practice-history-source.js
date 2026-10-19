(() => {
  // Serialized into MAIN. Read only record identities/metadata, never answers
  // or authentication credentials. The stable user ID partitions local records.
  function readContext(expectedKey, action = "read") {
    const url = new URL(location.href), id = /^[\w-]{1,160}$/;
    if (window.top !== window || `${url.pathname}${url.search}` !== expectedKey) return null;
    const account = typeof window.USERID === "string" && id.test(window.USERID) &&
      !window.USERID.includes("anonymous") ? window.USERID : "";
    const clean = value => typeof value === "string" && id.test(value) ? value : "";
    const text = value => typeof value === "string" ? value.slice(0, 1000) : "";
    const sheet = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/([\w-]+)\/?$/);
    if (sheet && action === "capture") {
      const v = document.querySelector(".practice-sheet")?.__vue__, state = window.__xetPracticeMarks;
      const saved = state?.recovery;
      if (!account || !v || !state?.active || state.owner !== v || state.joinId !== v.join_id ||
          v.resourceId !== sheet[1] || !clean(v.join_id) || !saved?.reported || !saved.submittedAt) return null;
      return { kind: "attempt", key: expectedKey, account, resourceId: sheet[1], joinId: v.join_id,
        taskId: clean(v.taskId), productId: clean(v.course_id || url.searchParams.get("product_id")),
        title: text(v.practiceTitle || v.practice_title || document.title), submittedAt: saved.submittedAt };
    }
    if (/^\/p\/t_pc\/pc_evaluation\/practice_record\/?$/.test(url.pathname)) {
      const page = document.querySelector(".practice-record-page");
      const stack = [page?.__vue__]; let v, count = 0;
      while (stack.length && ++count < 500) {
        const current = stack.pop();
        if (!current || current._isDestroyed) continue;
        if (current.$options?.name === "PracticeHistoryTab") { v = current; break; }
        stack.push(...(current.$children || []));
      }
      if (!v || !Array.isArray(v.list) || v.list.length > 5000) return null;
      if (action === "more") {
        if (!v.loading && !v.noMore && typeof v.loadMore === "function") v.loadMore();
        return { kind: "loading" };
      }
      if (!["read", "sync"].includes(action)) return null;
      const cards = [...page.querySelectorAll(".resource-card")];
      for (const card of cards) {
        card.removeAttribute("data-xet-history-row");
        const item = card.__vue__?.item;
        const index = v.list.indexOf(item);
        if (index >= 0) card.setAttribute("data-xet-history-row", String(index));
      }
      return { kind: "list", account, key: expectedKey, tab: v.activeSubTab,
        loading: Boolean(v.loading), noMore: Boolean(v.noMore),
        rows: v.list.map(item => ({ resourceId: clean(item.practice_id || item.id),
          title: text(item.name || item.title), productId: clean(item.resource_id || item.product_id),
          taskId: clean(item.task_id), joinId: clean(item.join_id),
          startedAt: ["string", "number"].includes(typeof (item.join_time || item.start_time))
            ? item.join_time || item.start_time : null })) };
    }
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/(practice_result|practice_analysis)\/([\w-]+)\/?$/);
    const joinId = clean(url.searchParams.get("join_id"));
    if (!match || !account || !joinId || !["read", "capture"].includes(action)) return null;
    const root = document.querySelector(match[1] === "practice_analysis" ? ".practice-analysis" : ".practice-result");
    let node = root, v;
    while (node && !v) { v = node.__vue__; node = node.parentElement; }
    if (!v || (v.resourceId || v.practice_id) !== match[2] || v.join_id !== joinId ||
        (match[1] === "practice_analysis" ? !v.practiceList?.length : !(v.resultPageData?.totalNum > 0))) return null;
    return { kind: "attempt", key: expectedKey, account, resourceId: match[2], joinId,
      productId: clean(url.searchParams.get("product_id") || v.course_id),
      taskId: clean(url.searchParams.get("task_id") || v.taskId),
      title: text(v.practice_title || v.practiceTitle || document.title), startedAt: null };
  }

  // This is only an in-flight write lock; records themselves live in storage.
  let writes = Promise.resolve();
  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        !["read", "more", "discover", "capture", "sync"].includes(message.action) || typeof message.key !== "string" || message.key.length > 1000) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || settings.disabledSites.includes(site.origin) || !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: readContext,
      args: [message.key, message.action === "discover" ? "read" : message.action] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    const context = result?.result;
    if (!context) return { ok: false, reason: "not-ready" };
    if (["capture", "sync"].includes(message.action)) {
      if (!context.account || (message.action === "capture" ? context.kind !== "attempt" : context.kind !== "list")) return { ok: false };
      const previous = writes;
      const work = (async () => {
        try { await previous; } catch { /* One failed write must not poison later submissions. */ }
        const data = globalThis.__xetPlayerHelperModules.practiceHistoryData;
        if (message.action === "capture" && !await data.save(chrome.storage.local, site.origin, context.account, context)) return { ok: false };
        const status = await data.synchronize(chrome.storage.local, chrome.storage.sync, site.origin, context.account);
        return { ok: true, ...status, context };
      })();
      writes = work;
      return await work;
    }
    if (message.action !== "discover") return { ok: true, context };
    if (context.kind !== "list" || !context.account) return { ok: false };
    // Recover links from already-open result/analysis pages; never open tabs,
    // join a practice, or use another account's stale page as a record source.
    const pages = await chrome.tabs.query({ url: [
      `${site.origin}/p/t_pc/pc_evaluation/practice_result/*`,
      `${site.origin}/p/t_pc/pc_evaluation/practice_analysis/*`,
    ] });
    const attempts = [];
    for (const page of pages) {
      try {
        const url = new URL(page.url);
        if (url.origin !== site.origin) continue;
        const [r] = await chrome.scripting.executeScript({ target: { tabId: page.id, frameIds: [0] },
          world: "MAIN", func: readContext, args: [`${url.pathname}${url.search}`, "read"] });
        if (r?.result?.kind === "attempt" && r.result.account === context.account) attempts.push(r.result);
      } catch { /* A page may close or navigate during discovery. */ }
    }
    return { ok: true, context, attempts };
  }
  globalThis.XetPracticeHistorySource = Object.freeze({ readContext, resolve });
})();
