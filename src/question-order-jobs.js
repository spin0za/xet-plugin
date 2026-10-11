(() => {
  const PREFIX = "xetQuestionOrderJob:";
  const ID = /^[\w-]{1,160}$/;
  const TIMEOUT = 120_000;
  const validOrder = record => record?.version === 1 && Array.isArray(record.ids) &&
    record.ids.length > 0 && record.ids.length <= 2000 && record.ids.every(id => typeof id === "string" && ID.test(id)) &&
    new Set(record.ids).size === record.ids.length;

  // Runs only in the requesting, authorized merchant document. Return config
  // metadata, never answers or login data. A random paper has no fixed order.
  async function readFixedConfig(sourceId, taskId) {
    const response = await fetch(taskId ? "/xe.practice.bff/task/answer.config.get/1.0.0"
      : "/evaluation_wechat/practices/detail", {
      method: "POST", credentials: "same-origin", redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskId ? { practice_id: sourceId, task_id: taskId } : { resource_id: sourceId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    const setting = taskId ? result.data?.random_setting : result.data?.is_random;
    return result.code === 0 && (setting === 0 || setting === "0");
  }

  function create({ siteAccess, readSettings, resolveContext }) {
    // This promise only serializes concurrent handlers. All recoverable job
    // state lives in storage.session; alarms survive worker suspension.
    let tail = Promise.resolve();
    function serial(action) {
      const previous = tail;
      const result = (async () => { await previous; return action(); })();
      tail = (async () => { try { await result; } catch { /* Caller handles errors. */ } })();
      return result;
    }
    async function jobs() {
      return Object.entries(await chrome.storage.session.get(null)).filter(([key]) => key.startsWith(PREFIX));
    }
    function owns(job, tab) {
      try {
        const url = new URL(tab.url || tab.pendingUrl);
        return url.origin === job.origin && url.pathname === `/p/t_pc/pc_evaluation/practice_sheet/${job.sourceId}` &&
          (url.searchParams.get("task_id") || "") === job.taskId && url.searchParams.get("xet_order_job") === job.token;
      } catch { return false; }
    }
    async function close(key, job) {
      // Close only the inactive tab we created, never an original user tab or
      // a helper the user has since activated/navigated somewhere else.
      try {
        const tab = await chrome.tabs.get(job.tabId);
        if (!tab.active && owns(job, tab)) await chrome.tabs.remove(job.tabId);
      } catch { /* Already closed or no longer accessible. */ }
      await chrome.alarms.clear(key);
      await chrome.storage.session.remove(key);
    }
    async function start(message, sender) {
      const result = await resolveContext(message, sender, { siteAccess, readSettings });
      const context = result?.context;
      const taskId = message.taskId;
      if (!result?.ok || context?.kind !== "book" || typeof taskId !== "string" ||
          (taskId && !ID.test(taskId)) || !ID.test(context.sourceId) ||
          (taskId ? !context.questions.some(q => q.taskId === taskId)
            : !context.questions.length || context.questions.some(q => q.taskId))) return { ok: false };
      const origin = new URL(sender.url).origin;
      return serial(async () => {
        const cacheKey = `xetQuestionOrder:${origin}|${context.sourceId}|${taskId}`;
        const cached = (await chrome.storage.local.get(cacheKey))[cacheKey];
        const ids = new Set(cached?.ids || []);
        if (validOrder(cached) && context.questions.filter(q => q.taskId === taskId).every(q => ids.has(q.id))) {
          return { ok: true, status: "cached" };
        }
        for (const [key, job] of await jobs()) {
          if (job.origin !== origin || job.sourceId !== context.sourceId || job.taskId !== taskId) continue;
          if (job.deadline > Date.now()) return { ok: true, status: "pending" };
          await close(key, job);
        }
        const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
          : { tabId: sender.tab.id, frameIds: [0] };
        const [config] = await chrome.scripting.executeScript({ target, world: "MAIN",
          func: readFixedConfig, args: [context.sourceId, taskId] });
        if (config?.result !== true || (sender.documentId && config.documentId !== sender.documentId)) {
          return { ok: true, status: "unavailable" };
        }
        // Revalidate after the network await: the site can have been disabled,
        // the requester closed, or the SPA changed to another source.
        const current = await resolveContext(message, sender, { siteAccess, readSettings });
        if (!current?.ok || current.context?.sourceId !== context.sourceId || current.context?.kind !== "book") return { ok: false };
        const token = crypto.randomUUID(), key = PREFIX + token;
        const url = new URL(`/p/t_pc/pc_evaluation/practice_sheet/${context.sourceId}`, origin);
        if (taskId) url.searchParams.set("task_id", taskId);
        url.searchParams.set("xet_order_job", token);
        const job = { token, origin, sourceId: context.sourceId, taskId, tabId: null, deadline: Date.now() + TIMEOUT };
        await chrome.storage.session.set({ [key]: job });
        await chrome.alarms.create(key, { when: job.deadline });
        try {
          const tab = await chrome.tabs.create({ url: url.href, active: false, windowId: sender.tab.windowId });
          job.tabId = tab.id;
          await chrome.storage.session.set({ [key]: job });
          return { ok: true, status: "pending" };
        } catch (error) { await close(key, job); throw error; }
      });
    }
    async function finish(message, sender) {
      if (sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) return { ok: false };
      let token;
      try { token = new URL(sender.url).searchParams.get("xet_order_job"); } catch { return { ok: false }; }
      if (!/^[a-f0-9-]{36}$/.test(token || "")) return { ok: false };
      return serial(async () => {
        const key = PREFIX + token, job = (await chrome.storage.session.get(key))[key];
        if (!job || job.tabId !== sender.tab.id || !owns(job, { url: sender.url })) return { ok: false };
        const tab = await chrome.tabs.get(job.tabId);
        if (!owns(job, tab)) { await close(key, job); return { ok: false }; }
        if (message.status === "ready") {
          const cached = (await chrome.storage.local.get(`xetQuestionOrder:${job.origin}|${job.sourceId}|${job.taskId}`));
          if (!validOrder(Object.values(cached)[0])) return { ok: false };
        } else if (!["failed", "random"].includes(message.status)) return { ok: false };
        await close(key, job);
        return { ok: true };
      });
    }
    async function alarm(alarm) {
      if (!alarm.name.startsWith(PREFIX)) return;
      return serial(async () => {
        const job = (await chrome.storage.session.get(alarm.name))[alarm.name];
        if (job) {
          if (!Number.isInteger(job.tabId)) {
            // Recover the narrow create-tab/persist-ID crash window by marker.
            const tabs = await chrome.tabs.query({ url: `${job.origin}/p/t_pc/pc_evaluation/practice_sheet/*` });
            job.tabId = tabs.find(tab => owns(job, tab))?.id;
          }
          await close(alarm.name, job);
        } else await chrome.alarms.clear(alarm.name);
      });
    }
    async function removed(tabId) {
      return serial(async () => {
        for (const [key, job] of await jobs()) if (job.tabId === tabId) {
          await chrome.alarms.clear(key); await chrome.storage.session.remove(key);
        }
      });
    }
    async function settingsChanged() {
      return serial(async () => {
        const settings = await readSettings();
        for (const [key, job] of await jobs()) if (settings.disabledSites.includes(job.origin)) await close(key, job);
      });
    }
    return Object.freeze({ start, finish, alarm, removed, settingsChanged });
  }
  globalThis.XetQuestionOrderJobs = Object.freeze({ create, readFixedConfig });
})();
