(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.wrongAttemptCounts) return;
  const ID = /^[\w-]{1,160}$/;
  const valid = id => typeof id === "string" && ID.test(id);
  const keyOf = (id, task) => JSON.stringify([id, task]);
  const answered = new Set([true, 1, "1"]);
  const wrong = new Set([false, "false"]);
  function wrongIds(rows) {
    const ids = new Set();
    let budget = 4000;
    function check(list, depth) {
      if (!Array.isArray(list) || depth > 5) return;
      for (const item of list) {
        if (--budget < 0) return;
        if (valid(item?.id) && answered.has(item.is_answer) && wrong.has(item.answer_state)) ids.add(item.id);
        check(item?.child, depth + 1);
      }
    }
    check(rows, 0);
    return ids;
  }
  const prefix = (origin, account, source, task, join) => `xetWrongPrior:${origin}|${account}|${source}|${task}|${join}`;
  // The result page and the book use the same immutable submission identity.
  // Opening either one again cannot increment a counter.
  async function submittedIds(item, read, signal, proof) {
    const key = proof && prefix(proof.origin, proof.account, item.resourceId, item.taskId, item.joinId) + ":result";
    const saved = proof && (await proof.storage.get(key).catch(() => ({})))[key];
    if (Array.isArray(saved)) return saved;
    const result = await read("/evaluation_wechat/practices/commit_record", {
      practice_id: item.resourceId, join_id: item.joinId, task_id: item.taskId, filter_delete: true,
    }, signal);
    if (signal.aborted || !Array.isArray(result?.list)) return null;
    const ids = [...wrongIds(result.list)];
    if (proof && ids.length) await proof.storage.set({ [key]: ids }).catch(() => {});
    return ids;
  }
  async function snapshotBefore(ctx, origin, storage, read, signal, stillBlank) {
    const { account, sourceId, taskId, joinId } = ctx;
    if (!account || ctx.blankSheet !== true || signal.aborted) return;
    const key = prefix(origin, account, sourceId, taskId, joinId);
    if ((await storage.get(key))[key] !== undefined) return;
    const catalog = await read("/evaluation_wechat/error_question/list_classfy", { type: 1 }, signal);
    const books = catalog.claasfy.filter(b => b.source_id === sourceId);
    if (books.length > 1 || books.length && !/^\d{1,20}$/.test(String(books[0].id))) return;
    const rows = books.length ? (await read("/evaluation_wechat/error_question/get_all_question",
      { type: 1, classfy_id: books[0].id, source_id: sourceId }, signal)).list : [];
    if (!Array.isArray(rows)) return;
    // Some native book rows lack a task; the source and question ID are
    // still exact, and only questions actually answered in this join can count.
    const ids = [...new Set(rows.filter(q => valid(q?.id) && (!q.task_id || q.task_id === taskId)).map(q => q.id))];
    if (!signal.aborted && await stillBlank() && !signal.aborted) await storage.set({ [key]: ids });
  }
  // These are the two personal counters behind the native analysis page's
  // percentage. A rounded rate or a shop-wide total is not a denominator.
  async function analysisCounts(attempts, questions, read, signal) {
    const counts = new Map(), missing = new Map(questions.map(q => [keyOf(q.id, q.taskId || null), q.taskId]));
    const triedTasks = new Set();
    for (const item of attempts) {
      if (signal.aborted || !missing.size) break;
      if (triedTasks.has(item.taskId) || ![...missing.values()].some(task => !task || task === item.taskId)) continue;
      triedTasks.add(item.taskId); // One current paper per task, not one full download per past attempt.
      try {
        const paper = await read("/evaluation_wechat/practices/get_paper_question", {
          practice_id: item.resourceId, task_id: item.taskId, join_id: item.joinId, start: -1, end: -1, filter_delete: true,
        }, signal);
        function collect(rows, depth) {
          if (!Array.isArray(rows) || depth > 5) return;
          for (const row of rows) {
            const total = row?.stats?.user_total_count, correct = row?.stats?.user_correct_count;
            if (valid(row?.id) && Number.isSafeInteger(total) && total > 0 &&
                Number.isSafeInteger(correct) && correct >= 0 && correct <= total) {
              for (const task of [item.taskId, null]) {
                const key = keyOf(row.id, task);
                if (missing.delete(key)) counts.set(key, total - correct);
              }
            }
            collect(row?.child, depth + 1);
          }
        }
        collect(paper?.practice_list, 0);
      } catch { /* Use local submission evidence when native statistics are unavailable. */ }
    }
    return counts;
  }
  async function readCounts(records, source, read, signal, proof, questions = []) {
    const byJoin = new Map(), events = new Map();
    for (const record of records) {
      if (record.resourceId === source && record.hasAnswers !== false && valid(record.joinId) &&
          (record.taskId === "" || valid(record.taskId))) byJoin.set(record.joinId, record);
    }
    const attempts = [...byJoin.values()].sort((a, b) => b.submittedAt - a.submittedAt);
    const counts = await analysisCounts(attempts, questions, read, signal);
    const official = new Set(counts.keys());
    if (questions.length && questions.every(q => counts.has(keyOf(q.id, q.taskId || null)))) {
      return { counts, official, checked: 0, total: byJoin.size };
    }
    let next = 0, checked = 0;
    await Promise.all(Array.from({ length: Math.min(attempts.length, 3) }, async () => {
      while (next < attempts.length && !signal.aborted) {
        const item = attempts[next++];
        try {
          const base = proof && prefix(proof.origin, proof.account, source, item.taskId, item.joinId);
          const ids = await submittedIds(item, read, signal, proof);
          if (!ids || signal.aborted) continue;
          const state = proof && await proof.storage.get(base).catch(() => ({}));
          const before = Array.isArray(state?.[base]) ? new Set(state[base]) : null;
          checked++;
          for (const id of ids) {
            const event = { time: item.submittedAt || 0, prior: before?.has(id) };
            for (const scope of [item.taskId, null]) {
              const key = keyOf(id, scope);
              if (official.has(key)) continue;
              if (!events.has(key)) events.set(key, []);
              events.get(key).push(event);
            }
          }
        } catch { /* Missing attempts are omitted, never inferred as wrong. */ }
      }
    }));
    for (const [key, list] of events) {
      // Membership before an attempt proves at least one earlier error, not
      // one extra error for every snapshot. Recovered older joins overlap it.
      const prior = list.filter(e => e.prior);
      const first = prior.reduce((t, e) => e.time && e.time < t ? e.time : t, Infinity);
      counts.set(key, Math.max(list.length, prior.length + 1,
        first < Infinity ? 2 + list.filter(e => e.time > first).length : 0));
    }
    return { counts, official, checked, total: byJoin.size };
  }
  modules.wrongAttemptCounts = Object.freeze({ readCounts, submittedIds, snapshotBefore, keyOf, wrongIds });
})();
