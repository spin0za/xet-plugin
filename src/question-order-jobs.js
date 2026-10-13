(() => {
  const PREFIX = "xetQuestionOrderJob:";
  const ID = /^[\w-]{1,160}$/;
  const TIMEOUT = 120_000;
  const validOrder = record => record?.version === 1 && Array.isArray(record.ids) &&
    record.ids.length > 0 && record.ids.length <= 2000 && record.ids.every(id => typeof id === "string" && ID.test(id)) &&
    new Set(record.ids).size === record.ids.length;

  // The site's PracticeInfo uses this read-only endpoint before routing a
  // course workbook into PracticeSheet. Error-book cards can omit task_id.
  async function readTaskId(sourceId) {
    const response = await fetch("/xe.practice.bff/info/get.practice.type/1.0.0", {
      method: "POST", credentials: "same-origin", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practice_id: sourceId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const result = await response.json(), data = result.data;
    if (result.code !== 0 || !data) return null;
    if (typeof data.course_task_id === "string" && /^[\w-]{1,160}$/.test(data.course_task_id)) return data.course_task_id;
    // Missing course metadata is not permission to create a taskless attempt.
    return [0, 1, 2].includes(data.create_from) ? "" : null;
  }

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
    // PracticeConfig defaults random_setting=-1 to 0, and PracticeSheet only
    // treats is_random=1 as random. Unknown/missing flags still fail closed.
    return result.code === 0 && (setting === 0 || setting === "0" ||
      setting === -1 || setting === "-1");
  }

  // Only injected into the inactive tab created for a persisted job. The site
  // can redirect submitted course papers to configuration and drop our marker.
  async function prepareHelper(sourceId, taskId, token, startConfig) {
    const sheet = `/p/t_pc/pc_evaluation/practice_sheet/${sourceId}`;
    const config = `/p/t_pc/pc_evaluation/practiceConfig/${sourceId}`;
    const matches = () => [sheet, config].includes(location.pathname) &&
      (new URL(location.href).searchParams.get("task_id") || "") === taskId;
    if (!matches()) return "failed";
    const url = new URL(location.href);
    if (url.searchParams.has("xet_order_job") && url.searchParams.get("xet_order_job") !== token) return "failed";
    url.searchParams.set("xet_order_job", token);
    history.replaceState(history.state, "", url.href);
    window.dispatchEvent(new Event("xet:question-order-ready"));
    if (location.pathname === sheet || !startConfig) return "marked";
    return new Promise(resolve => {
      let attempts = 0;
      const deadline = Date.now() + 15_000;
      const timer = setInterval(() => {
        const finish = status => { clearInterval(timer); resolve(status); };
        if (!matches() || document.visibilityState === "visible") return finish("failed");
        if (location.pathname === sheet) return finish("marked");
        const v = document.querySelector(".practice-config")?.__vue__;
        if (!v?.taskInfo?.task_total_qs) { if (++attempts >= 150 || Date.now() >= deadline) finish("failed"); return; }
        const total = Number(v.taskInfo.task_total_qs), count = Number(v.taskInfo.practice_num);
        if (v.practiceId !== sourceId || v.taskId !== taskId || !Number.isInteger(total) || total < 1 || total > 2000 ||
            ![0, -1, "0", "-1"].includes(v.taskInfo.random_setting) || v.questionMode !== 0 ||
            (count !== -1 && count !== total) || v.answerNumMode !== 0 || typeof v.toPractice !== "function") return finish("failed");
        // Use the existing site's fixed/full-paper action, never answer or
        // submit a question and never operate a user-created practice tab.
        clearInterval(timer);
        try { const action = v.toPractice(); action?.catch?.(() => {}); resolve("started"); }
        catch { resolve("failed"); }
      }, 100);
    });
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
        const marker = url.searchParams.get("xet_order_job");
        return url.origin === job.origin && ["practice_sheet", "practiceConfig"].some(route =>
          url.pathname === `/p/t_pc/pc_evaluation/${route}/${job.sourceId}`) &&
          (url.searchParams.get("task_id") || "") === job.taskId &&
          (marker === job.token || (!marker && job.allowSiteRedirects === true && job.tabId === tab.id));
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
      const requestedTaskId = message.taskId;
      let taskId = requestedTaskId;
      if (!result?.ok || context?.kind !== "book" || typeof taskId !== "string" ||
          (taskId && !ID.test(taskId)) || !ID.test(context.sourceId) ||
          (taskId ? !context.questions.some(q => q.taskId === taskId)
            : !context.questions.length || context.questions.some(q => q.taskId))) return { ok: false };
      const origin = new URL(sender.url).origin;
      return serial(async () => {
        let cacheKey = `xetQuestionOrder:${origin}|${context.sourceId}|${taskId}`;
        const cached = (await chrome.storage.local.get(cacheKey))[cacheKey];
        const ids = new Set(cached?.ids || []);
        if (validOrder(cached) && context.questions.filter(q => q.taskId === taskId).every(q => ids.has(q.id))) {
          return { ok: true, status: "cached" };
        }
        for (const [key, job] of await jobs()) {
          if (job.origin !== origin || job.sourceId !== context.sourceId ||
              job.taskId !== taskId && (job.requestedTaskId ?? job.taskId) !== requestedTaskId) continue;
          if (job.deadline > Date.now()) return { ok: true, status: "pending" };
          await close(key, job);
        }
        const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
          : { tabId: sender.tab.id, frameIds: [0] };
        if (!taskId) {
          const [resolved] = await chrome.scripting.executeScript({ target, world: "MAIN", func: readTaskId, args: [context.sourceId] });
          if (typeof resolved?.result !== "string" || (resolved.result && !ID.test(resolved.result)) ||
              (sender.documentId && resolved.documentId !== sender.documentId)) return { ok: true, status: "unavailable" };
          taskId = resolved.result;
          for (const [key, job] of await jobs()) {
            if (job.origin !== origin || job.sourceId !== context.sourceId || job.taskId !== taskId) continue;
            if (job.deadline > Date.now()) return { ok: true, status: "pending" };
            await close(key, job);
          }
          cacheKey = `xetQuestionOrder:${origin}|${context.sourceId}|${taskId}`;
          const completed = (await chrome.storage.local.get(cacheKey))[cacheKey];
          const completedIds = new Set(completed?.ids || []);
          if (validOrder(completed) && context.questions.every(q => completedIds.has(q.id))) return { ok: true, status: "cached" };
        }
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
        const job = { token, origin, sourceId: context.sourceId, requestedTaskId, taskId,
          allowSiteRedirects: true, configurationStarted: false, tabId: null, deadline: Date.now() + TIMEOUT };
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
      try {
        const marker = new URL(sender.url).searchParams.get("xet_order_job");
        if (marker && message.token && marker !== message.token) return { ok: false };
        token = marker || message.token;
      } catch { return { ok: false }; }
      if (!/^[a-f0-9-]{36}$/.test(token || "")) return { ok: false };
      return serial(async () => {
        const key = PREFIX + token, job = (await chrome.storage.session.get(key))[key];
        if (!job || job.tabId !== sender.tab.id || !owns(job, { id: sender.tab.id, url: sender.url })) return { ok: false };
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
            const tabs = await chrome.tabs.query({ url: [`${job.origin}/p/t_pc/pc_evaluation/practice_sheet/*`,
              `${job.origin}/p/t_pc/pc_evaluation/practiceConfig/*`] });
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
    async function updated(tabId, change) {
      if (change.status !== "complete" && !change.url) return;
      return serial(async () => {
        for (const [key, job] of await jobs()) {
          if (job.tabId !== tabId) continue;
          const tab = await chrome.tabs.get(tabId);
          if (tab.active || !owns(job, tab)) return;
          if ((await readSettings()).disabledSites.includes(job.origin) || !(await siteAccess.isAuthorized(job.origin))) {
            await close(key, job); return;
          }
          const configPage = new URL(tab.url).pathname.includes("/practiceConfig/");
          const startConfig = configPage && !job.configurationStarted;
          if (startConfig) { job.configurationStarted = true; await chrome.storage.session.set({ [key]: job }); }
          try {
            const [result] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: "MAIN",
              func: prepareHelper, args: [job.sourceId, job.taskId, job.token, startConfig] });
            if (result?.result === "failed") await close(key, job);
          } catch { /* A normal native redirect may destroy this document; the next tab event resumes it. */ }
        }
      });
    }
    async function status(message, sender) {
      const result = await resolveContext(message, sender, { siteAccess, readSettings });
      if (!result?.ok || result.context?.kind !== "book" || typeof message.taskId !== "string") return { ok: false };
      const origin = new URL(sender.url).origin;
      const pending = (await jobs()).some(([, job]) => job.origin === origin && job.sourceId === result.context.sourceId &&
        (job.taskId === message.taskId || (job.requestedTaskId ?? job.taskId) === message.taskId) && job.deadline > Date.now());
      return { ok: true, status: pending ? "pending" : "failed" };
    }
    return Object.freeze({ start, finish, alarm, removed, settingsChanged, updated, status });
  }
  globalThis.XetQuestionOrderJobs = Object.freeze({ create, readFixedConfig, readTaskId, prepareHelper });
})();
