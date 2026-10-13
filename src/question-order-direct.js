(() => {
  const PREFIX = "xetQuestionOrderDirect:", ID = /^[\w-]{1,160}$/;
  const validOrder = r => r?.version === 1 && Array.isArray(r.ids) && r.ids.length > 0 && r.ids.length <= 2000 &&
    r.ids.every(id => typeof id === "string" && ID.test(id)) && new Set(r.ids).size === r.ids.length;

  // Serialized into the already-open merchant document. Only fixed endpoints
  // and numbering metadata cross this boundary; never cookies or answers.
  async function requestStep(input) {
    const id = /^[\w-]{1,160}$/;
    const routeMatches = () => {
      const url = new URL(location.href);
      return window.top === window && url.origin === input.origin &&
        /^\/p\/t_pc\/pc_evaluation\/errbook\/detail\/[\w-]+\/?$/.test(url.pathname) &&
        url.searchParams.get("source_id") === input.sourceId && (url.searchParams.get("tab") || "1") === "1" &&
        `${url.pathname}|${url.searchParams.get("source_id") || ""}|${url.searchParams.get("task_id") || ""}|${url.searchParams.get("join_id") || ""}|${url.searchParams.get("tab") || "1"}` === input.key;
    };
    if (typeof input.sourceId !== "string" || typeof input.token !== "string" || !id.test(input.sourceId) ||
        !id.test(input.token) || !routeMatches()) return { ok: false, reason: "canceled" };
    const payload = { practice_id: input.sourceId, task_id: input.taskId };
    let path;
    if (input.phase === "info") { path = "/xe.practice.bff/info/get.practice.type/1.0.0"; delete payload.task_id; }
    else if (!id.test(input.taskId || "")) return { ok: false, reason: "unavailable" };
    else if (input.phase === "config") path = "/xe.practice.bff/task/answer.config.get/1.0.0";
    else if (input.phase === "join" && Number.isInteger(input.total) && input.total > 0 && input.total <= 2000 && typeof input.createNew === "boolean") {
      path = "/evaluation_wechat/practices/join";
      if (input.createNew) payload.gen_config = { random_setting: 0, practice_num: input.total, practice_mode: 0 };
    } else if (input.phase === "paper" && id.test(input.joinId || "")) {
      path = "/evaluation_wechat/practices/commit_record";
      payload.join_id = input.joinId; payload.filter_delete = false;
    } else return { ok: false, reason: "unavailable" };
    const controller = new AbortController();
    const changed = () => { if (!routeMatches()) controller.abort(); };
    const cancel = event => { if (event.type === "pagehide" || event.detail === input.token) controller.abort(); };
    const timer = setInterval(changed, 250);
    window.addEventListener("pagehide", cancel); window.addEventListener("popstate", changed);
    window.addEventListener("xet:question-order-direct-cancel", cancel);
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (!response.ok) return { ok: false, reason: "failed" };
      const result = await response.json();
      if (!routeMatches() || controller.signal.aborted) return { ok: false, reason: "canceled" };
      if (result.code !== 0) return { ok: false, reason: "failed" };
      const data = result.data;
      if (input.phase === "info") return typeof data?.course_task_id === "string" && id.test(data.course_task_id)
        ? { ok: true, taskId: data.course_task_id } : { ok: false, reason: "unavailable" };
      if (input.phase === "config") {
        const total = Number(data?.task_total_qs), count = Number(data?.practice_num);
        if (!["number", "string"].includes(typeof data?.task_total_qs) || !Number.isInteger(total) || total < 1 || total > 2000 || ![0, -1, "0", "-1"].includes(data?.random_setting) ||
            typeof data?.is_last_commit !== "boolean" ||
            (data.is_last_commit && !input.joinId && (!["number", "string"].includes(typeof data.practice_num) || count !== -1 && count !== total))) return { ok: false, reason: "unavailable" };
        return { ok: true, total, createNew: data.is_last_commit };
      }
      if (input.phase === "join") {
        // Never replace a user's existing random/partial attempt with a new one.
        if (typeof data?.join_id !== "string" || !id.test(data.join_id) || ![0, "0"].includes(data?.gen_config?.random_setting) ||
            !["number", "string"].includes(typeof data?.gen_config?.practice_num) ||
            Number(data?.gen_config?.practice_num) !== input.total) return { ok: false, reason: "failed" };
        return { ok: true, joinId: data.join_id };
      }
      const ids = data?.list?.map(q => q.id);
      if (!Array.isArray(ids) || ids.length !== input.total || !ids.every(q => typeof q === "string" && id.test(q)) ||
          new Set(ids).size !== ids.length) return { ok: false, reason: "failed" };
      return { ok: true, ids };
    } catch { return { ok: false, reason: controller.signal.aborted ? "canceled" : "failed" }; }
    finally {
      clearInterval(timer); window.removeEventListener("pagehide", cancel); window.removeEventListener("popstate", changed);
      window.removeEventListener("xet:question-order-direct-cancel", cancel);
    }
  }
  function abortStep(token) { window.dispatchEvent(new CustomEvent("xet:question-order-direct-cancel", { detail: token })); }

  function create({ siteAccess, readSettings, resolveContext }) {
    // Promises are transient execution handles only. Locks, mutation intent,
    // returned record IDs and recovery state are persisted in storage.session.
    const running = new Map(); let tail = Promise.resolve();
    function serial(action) {
      const previous = tail, result = (async () => { await previous; return action(); })();
      tail = (async () => { try { await result; } catch { /* Caller handles failures. */ } })();
      return result;
    }
    const entries = async () => Object.entries(await chrome.storage.session.get(null)).filter(([key]) => key.startsWith(PREFIX));
    const target = sender => sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const cacheKey = (origin, source, task) => `xetQuestionOrder:${origin}|${source}|${task}`;
    const relevant = (context, task) => context.questions.filter(q => !q.taskId || q.taskId === task);
    async function cached(context, origin, task) {
      if (!task) {
        const prefix = `xetQuestionOrder:${origin}|${context.sourceId}|`;
        const records = Object.entries(await chrome.storage.local.get(null)).filter(([name, r]) => name.startsWith(prefix) &&
          /^[\w-]{0,160}$/.test(name.slice(prefix.length)) && validOrder(r) && relevant(context, task).every(q => r.ids.includes(q.id))).map(([, r]) => r);
        return records.length > 0 && new Set(records.map(r => JSON.stringify(r.ids))).size === 1;
      }
      const r = (await chrome.storage.local.get(cacheKey(origin, context.sourceId, task)))[cacheKey(origin, context.sourceId, task)];
      return validOrder(r) && relevant(context, task).every(q => r.ids.includes(q.id));
    }
    async function inject(sender, input) {
      const [r] = await chrome.scripting.executeScript({ target: target(sender), world: "MAIN", func: requestStep, args: [input] });
      return sender.documentId && r?.documentId !== sender.documentId ? { ok: false, reason: "canceled" }
        : r?.result || { ok: false, reason: "failed" };
    }
    async function ensure(job) {
      const latest = (await chrome.storage.session.get(job.slot))[job.slot];
      if (latest?.token !== job.token || latest.status !== "pending" || latest.deadline <= Date.now()) throw new Error("canceled");
      const settings = await readSettings();
      if (settings.questionOrderStrategy === "tabs" || settings.disabledSites.includes(job.origin)) throw new Error("canceled");
      const r = await resolveContext({ key: job.key }, job.sender, { siteAccess, readSettings });
      if (!r?.ok || r.context?.kind !== "book" || r.context.sourceId !== job.sourceId) throw new Error("canceled");
      return r.context;
    }
    async function saveJob(job) {
      const latest = (await chrome.storage.session.get(job.slot))[job.slot];
      if (latest?.token !== job.token || latest.status !== "pending") throw new Error("canceled");
      await chrome.storage.session.set({ [job.slot]: job });
    }
    async function fail(job, reason) {
      await serial(async () => {
        const latest = (await chrome.storage.session.get(job.slot))[job.slot];
        if (latest?.token === job.token && latest.status === "pending") {
          await chrome.storage.session.set({ [job.slot]: { ...latest, status: reason === "unavailable" ? "unavailable" : "failed", reason } });
          await chrome.alarms.clear(job.slot);
        }
      });
    }
    async function run(job) {
      try {
        await ensure(job);
        const config = await inject(job.sender, { ...job, phase: "config" });
        if (!config.ok) throw new Error(config.reason);
        job.total = config.total;
        if (!job.joinId) {
          // A lost join response may already have created an attempt. A worker
          // restart/reload may resume it, but must never repeat new generation.
          if (config.createNew && job.joinSent) throw new Error("uncertain-join");
          await ensure(job); job.joinSent = true;
          await serial(() => saveJob(job));
          const joined = await inject(job.sender, { ...job, phase: "join", createNew: config.createNew });
          if (!joined.ok) throw new Error(joined.reason);
          job.joinId = joined.joinId; await serial(() => saveJob(job));
        }
        await ensure(job);
        const paper = await inject(job.sender, { ...job, phase: "paper" });
        if (!paper.ok) throw new Error(paper.reason);
        await serial(async () => {
          const context = await ensure(job), ids = paper.ids;
          if (!validOrder({ version: 1, ids }) || ids.length !== job.total || relevant(context, job.taskId).some(q => !ids.includes(q.id))) throw new Error("failed");
          // A concurrent manual capture may have finished first: preserve its
          // record/timestamp if it already covers the requesting questions.
          if (!await cached(context, job.origin, job.taskId)) await chrome.storage.local.set({
            [cacheKey(job.origin, job.sourceId, job.taskId)]: { version: 1, ids, savedAt: Date.now() },
          });
          await chrome.storage.session.remove(job.slot); await chrome.alarms.clear(job.slot);
        });
      } catch (error) { await fail(job, error.message); }
    }
    function launch(job) {
      const work = (async () => { try { await run(job); } finally { running.delete(job.token); } })();
      running.set(job.token, work);
      void (async () => { try { await work; } catch { /* The deadline/status path reports storage failures. */ } })();
    }
    async function start(message, sender) {
      const r = await resolveContext(message, sender, { siteAccess, readSettings }), context = r?.context;
      let taskId = message.taskId;
      if (!r?.ok || context?.kind !== "book" || !ID.test(context.sourceId) || typeof taskId !== "string" ||
          (taskId ? !ID.test(taskId) || !context.questions.some(q => q.taskId === taskId)
            : !context.questions.length || context.questions.some(q => q.taskId))) return { ok: false };
      const origin = new URL(sender.url).origin;
      return serial(async () => {
        if (await cached(context, origin, taskId)) return { ok: true, status: "cached" };
        // Do not overlap a helper left running by the previous extension version.
        const all = await chrome.storage.session.get(null);
        if (Object.entries(all).some(([key, job]) => key.startsWith("xetQuestionOrderJob:") && job.origin === origin &&
            job.sourceId === context.sourceId && (job.taskId === taskId || (job.requestedTaskId ?? job.taskId) === taskId) &&
            job.deadline > Date.now())) return { ok: true, status: "pending" };
        const shared = Object.values(all).find(j => j.slot?.startsWith(PREFIX) && j.origin === origin && j.sourceId === context.sourceId &&
          (j.taskId === taskId || j.requestedTaskId === taskId) && j.status === "pending" && running.has(j.token) && j.deadline > Date.now());
        if (shared) return { ok: true, status: "pending" };
        if (!taskId) {
          const info = await inject(sender, { origin, sourceId: context.sourceId, key: message.key, token: crypto.randomUUID(), phase: "info" });
          if (!info.ok) return { ok: true, status: info.reason === "unavailable" ? "unavailable" : "failed" };
          taskId = info.taskId;
          if (await cached(context, origin, taskId)) return { ok: true, status: "cached" };
        }
        const slot = `${PREFIX}${origin}|${context.sourceId}|${taskId}`, previous = (await chrome.storage.session.get(slot))[slot];
        if (previous?.status === "pending" && running.has(previous.token) && previous.deadline > Date.now()) return { ok: true, status: "pending" };
        const current = await resolveContext(message, sender, { siteAccess, readSettings });
        if (!current?.ok || current.context?.sourceId !== context.sourceId || current.context?.kind !== "book") return { ok: false };
        const job = { slot, token: crypto.randomUUID(), origin, sourceId: context.sourceId, taskId, requestedTaskId: message.taskId,
          key: message.key, sender: { url: sender.url, tab: { id: sender.tab.id }, frameId: 0, documentId: sender.documentId },
          status: "pending", deadline: Date.now() + 120_000, joinSent: previous?.joinSent === true, joinId: previous?.joinId || "" };
        await chrome.storage.session.set({ [slot]: job }); await chrome.alarms.create(slot, { when: job.deadline });
        launch(job); return { ok: true, status: "pending" };
      });
    }
    async function status(message, sender) {
      const r = await resolveContext(message, sender, { siteAccess, readSettings });
      if (!r?.ok || r.context?.kind !== "book" || typeof message.taskId !== "string") return { ok: false };
      const origin = new URL(sender.url).origin;
      const all = await chrome.storage.session.get(null);
      if (Object.entries(all).some(([key, j]) => key.startsWith("xetQuestionOrderJob:") && j.origin === origin &&
          j.sourceId === r.context.sourceId && (j.taskId === message.taskId || (j.requestedTaskId ?? j.taskId) === message.taskId) &&
          j.deadline > Date.now())) return { ok: true, status: "pending" };
      const match = (await entries()).find(([, j]) => j.origin === origin && j.sourceId === r.context.sourceId &&
        (j.taskId === message.taskId || j.requestedTaskId === message.taskId));
      if (!match) return { ok: true, status: await cached(r.context, origin, message.taskId) ? "cached" : "failed" };
      const job = match[1];
      if (job.status === "pending" && !running.has(job.token)) return start(message, sender);
      return { ok: true, status: job.deadline <= Date.now() && job.status === "pending" ? "failed" : job.status };
    }
    async function cancel(job, reason) {
      await serial(async () => {
        const current = (await chrome.storage.session.get(job.slot))[job.slot];
        if (current?.token !== job.token || current.status !== "pending") return;
        await chrome.storage.session.set({ [job.slot]: { ...current, status: "failed", reason } });
        await chrome.alarms.clear(job.slot);
      });
      try { await chrome.scripting.executeScript({ target: target(job.sender), world: "MAIN", func: abortStep, args: [job.token] }); }
      catch { /* The document may already have been closed or replaced. */ }
    }
    async function settingsChanged() {
      const settings = await readSettings();
      for (const [, job] of await entries()) if (settings.questionOrderStrategy === "tabs" || settings.disabledSites.includes(job.origin)) await cancel(job, "disabled");
    }
    async function removed(tabId) { for (const [, job] of await entries()) if (job.sender.tab.id === tabId) await cancel(job, "closed"); }
    async function updated(tabId, change) {
      if (!change.url) return;
      for (const [, job] of await entries()) if (job.sender.tab.id === tabId) {
        const url = new URL(change.url);
        const key = `${url.pathname}|${url.searchParams.get("source_id") || ""}|${url.searchParams.get("task_id") || ""}|${url.searchParams.get("join_id") || ""}|${url.searchParams.get("tab") || "1"}`;
        if (url.origin !== job.origin || key !== job.key) await cancel(job, "navigated");
      }
    }
    async function alarm(alarm) {
      if (!alarm.name.startsWith(PREFIX)) return;
      const job = (await chrome.storage.session.get(alarm.name))[alarm.name];
      if (job) await cancel(job, "timeout"); else await chrome.alarms.clear(alarm.name);
    }
    return Object.freeze({ start, status, settingsChanged, removed, updated, alarm });
  }
  globalThis.XetQuestionOrderDirect = Object.freeze({ create, requestStep, abortStep });
})();
