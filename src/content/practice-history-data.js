(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.practiceHistoryData) return;
  const ID = /^[\w-]{1,160}$/;
  function startTime(value) {
    if (typeof value === "string" && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/.test(value)) {
      const time = Date.parse(value);
      return Number.isFinite(time) && time > 946684800000 && time < 4102444800000 ? value.replace("T", " ") : "";
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
    const time = value < 1e12 ? value * 1000 : value;
    if (time <= 946684800000 || time >= 4102444800000) return "";
    const date = new Date(time), pad = v => String(v).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  function normalize(value) {
    if (!value || value.version !== undefined && value.version !== 1 || typeof value.resourceId !== "string" || !ID.test(value.resourceId) ||
        typeof value.joinId !== "string" || !ID.test(value.joinId) ||
        value.taskId && (typeof value.taskId !== "string" || !ID.test(value.taskId)) ||
        value.productId && (typeof value.productId !== "string" || !ID.test(value.productId))) return null;
    return { version: 1, resourceId: value.resourceId, joinId: value.joinId,
      taskId: value.taskId || "", productId: value.productId || "",
      title: typeof value.title === "string" ? value.title.slice(0, 1000) : "",
      startedAt: startTime(value.startedAt),
      submittedAt: typeof value.submittedAt === "number" && value.submittedAt > 946684800000 &&
        value.submittedAt < 4102444800000 ? value.submittedAt : 0 };
  }
  function prefix(origin, account) {
    try {
      const url = new URL(origin);
      return url.origin === origin && /^https?:$/.test(url.protocol) && typeof account === "string" && ID.test(account)
        ? `xetPracticeHistory:${origin}|${account}|` : "";
    } catch { return ""; }
  }
  function resultUrl(origin, record) {
    const r = normalize(record);
    if (!r) return "";
    const u = new URL(`/p/t_pc/pc_evaluation/practice_result/${r.resourceId}`, origin);
    u.searchParams.set("join_id", r.joinId);
    if (r.productId) u.searchParams.set("product_id", r.productId);
    if (r.taskId) u.searchParams.set("task_id", r.taskId);
    // isJustCommitted belongs only to a fresh submission, not a history visit.
    return u.href;
  }
  async function save(storage, origin, account, value) {
    const record = normalize(value), scope = prefix(origin, account);
    if (!scope || !record) return false;
    const key = `${scope}${record.joinId}`;
    const old = normalize((await storage.get(key))[key]);
    if (old && (old.resourceId !== record.resourceId || old.taskId && record.taskId && old.taskId !== record.taskId)) return false;
    const merged = { ...record, title: record.title || old?.title || "",
      productId: record.productId || old?.productId || "", taskId: record.taskId || old?.taskId || "",
      startedAt: old?.startedAt || record.startedAt,
      submittedAt: old?.submittedAt && record.submittedAt ? Math.min(old.submittedAt, record.submittedAt)
        : old?.submittedAt || record.submittedAt };
    if (JSON.stringify(old) !== JSON.stringify(merged)) await storage.set({ [key]: merged });
    return true;
  }
  async function load(storage, origin, account) {
    const scope = prefix(origin, account);
    if (!scope) return [];
    return Object.entries(await storage.get(null)).filter(([key]) => key.startsWith(scope))
      .map(([key, value]) => { const r = normalize(value); return r && key === `${scope}${r.joinId}` ? r : null; }).filter(Boolean);
  }
  async function loadBoth(local, sync, origin, account) {
    const records = await load(local, origin, account);
    try {
      for (const remote of await load(sync, origin, account)) {
        const index = records.findIndex(r => r.joinId === remote.joinId);
        if (index < 0) records.push(remote);
        else {
          const old = records[index];
          if (old.resourceId !== remote.resourceId || old.taskId && remote.taskId && old.taskId !== remote.taskId) continue;
          records[index] = { ...remote, title: old.title || remote.title, taskId: old.taskId || remote.taskId,
            productId: old.productId || remote.productId, startedAt: old.startedAt || remote.startedAt,
            submittedAt: old.submittedAt && remote.submittedAt ? Math.min(old.submittedAt, remote.submittedAt)
              : old.submittedAt || remote.submittedAt };
        }
      }
    } catch { /* Local records stay usable when Chrome Sync is unavailable. */ }
    return records;
  }
  async function synchronize(local, sync, origin, account) {
    const records = await loadBoth(local, sync, origin, account), scope = prefix(origin, account);
    if (!scope) return { synced: false };
    const values = Object.fromEntries(records.map(r => [scope + r.joinId, r]));
    // Mirror remote records locally before attempting an upload. Never evict
    // history to meet the sync quota, and never claim a failed upload succeeded.
    const existing = await local.get(null);
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(existing[k]) !== JSON.stringify(v)));
    if (Object.keys(changed).length) await local.set(changed);
    try {
      const remote = await sync.get(null);
      const updates = Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(remote[k]) !== JSON.stringify(v)));
      if (Object.keys(updates).length) await sync.set(updates);
      return { synced: true };
    } catch { return { synced: false }; }
  }
  modules.practiceHistoryData = Object.freeze({ startTime, normalize, prefix, resultUrl, save, load, loadBoth, synchronize });
})();
