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
  async function readCounts(records, source, read, signal) {
    const byJoin = new Map(), counts = new Map();
    for (const record of records) {
      if (record.resourceId === source && record.hasAnswers !== false && valid(record.joinId) &&
          (record.taskId === "" || valid(record.taskId))) byJoin.set(record.joinId, record);
    }
    const attempts = [...byJoin.values()].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 100);
    let next = 0, checked = 0;
    await Promise.all(Array.from({ length: Math.min(attempts.length, 3) }, async () => {
      while (next < attempts.length && !signal.aborted) {
        const item = attempts[next++];
        try {
          const result = await read("/evaluation_wechat/practices/commit_record", {
            practice_id: source, join_id: item.joinId, task_id: item.taskId, filter_delete: true,
          }, signal);
          if (signal.aborted || !Array.isArray(result?.list)) continue;
          checked++;
          for (const id of wrongIds(result.list)) {
            for (const scope of [item.taskId, null]) {
              const key = keyOf(id, scope); counts.set(key, (counts.get(key) || 0) + 1);
            }
          }
        } catch { /* Missing attempts are omitted, never inferred as wrong. */ }
      }
    }));
    return { counts, checked, total: byJoin.size };
  }
  modules.wrongAttemptCounts = Object.freeze({ readCounts, keyOf, wrongIds });
})();
