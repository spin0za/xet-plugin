(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.duplicateFavorites) return;
  const ID = /^[\w-]{1,160}$/, ROOT = "/evaluation_wechat/";
  const valid = value => typeof value === "string" && ID.test(value);
  const task = value => value == null || value === "" ? "" : valid(value) ? value : null;
  const numeric = value => (typeof value === "string" && /^\d{1,20}$/.test(value)) ||
    (Number.isSafeInteger(value) && value > 0);
  const listEndpoint = "xe.qs.coll.list/1.0.0";
  const writeEndpoint = "xe.qs.coll.question.collect/1.0.0";
  async function post(endpoint, body, signal) {
    const response = await fetch(ROOT + endpoint, { method: "POST", credentials: "same-origin",
      redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw Error("收藏请求失败");
    const result = await response.json();
    if (result.code !== 0) throw Error("网站未确认操作");
    return result.data;
  }
  function matched(wrong, favorite, sourceId) {
    if (!Array.isArray(wrong?.list) || !Array.isArray(favorite?.practice_list) ||
        favorite.source_id && favorite.source_id !== sourceId) throw Error("题目来源无法核实");
    const wrongIds = new Set(wrong.list.flatMap(q => {
      const t = task(q?.task_id);
      return valid(q?.id) && t !== null ? [JSON.stringify([q.id, t])] : [];
    }));
    const targets = new Map();
    for (const q of favorite.practice_list) {
      const t = task(q?.task_id || favorite.task_id), key = JSON.stringify([q?.id, t]);
      if (valid(q?.id) && t !== null && [true, 1, "1"].includes(q.is_collected) && wrongIds.has(key)) {
        targets.set(key, { resource_type: 34, resource_id: sourceId, task_id: t, question_id: q.id, is_collect: false });
      }
    }
    return [...targets.values()];
  }
  async function prepare(rows, signal, read = post) {
    const books = new Map(), ambiguous = new Set(), groups = new Set();
    for (const row of rows) {
      if (!valid(row.sourceId) || !numeric(row.bookId)) continue;
      if (books.has(row.sourceId) && String(books.get(row.sourceId)) !== String(row.bookId)) ambiguous.add(row.sourceId);
      books.set(row.sourceId, row.bookId);
    }
    if (!books.size) return { targets: [], skipped: 0 };
    let seen = 0, total;
    for (let page = 1; page <= 500; page++) {
      const result = await read(listEndpoint, { resource_type: 34, page, page_size: 10 }, signal);
      if (!Array.isArray(result?.list) || !Number.isSafeInteger(result.total) || result.total < 0 ||
          result.total > 5000 || total !== undefined && total !== result.total ||
          result.list.length > 10 || seen + result.list.length > result.total) throw Error("收藏分页未能核实");
      total = result.total; seen += result.list.length;
      for (const group of result.list) {
        if (books.has(group?.resource_id) && !ambiguous.has(group.resource_id) &&
            Number(group.resource_type) === 34 && Number(group.qs_count) > 0) groups.add(group.resource_id);
      }
      if (seen === total) break;
      if (result.list.length !== 10 || page === 500) throw Error("收藏分页未读完");
    }
    const targets = [], sources = [...groups];
    let skipped = ambiguous.size, next = 0;
    await Promise.all(Array.from({ length: Math.min(sources.length, 3) }, async () => {
      while (next < sources.length && !signal.aborted) {
        const sourceId = sources[next++];
        try {
          const wrong = await read("error_question/get_all_question",
            { type: 1, classfy_id: books.get(sourceId), source_id: sourceId }, signal);
          const favorite = await read("xe.qs.coll.question.list.practice/1.0.0", { resource_id: sourceId, task_id: "" }, signal);
          targets.push(...matched(wrong, favorite, sourceId));
        } catch { skipped++; }
      }
    }));
    return { targets, skipped };
  }
  function mount(root, { context, verify, onChanged }) {
    const node = document.createElement("div"); node.className = "xet-duplicate-favorites";
    const button = document.createElement("button");
    button.type = "button"; button.className = "xet-duplicate-favorites-button"; button.textContent = "检查重复收藏";
    const status = document.createElement("span"); status.setAttribute("role", "status");
    node.append(button, status); root.prepend(node);
    let abort = null;
    async function run() {
      if (abort || button.disabled) return;
      const before = context(), controller = new AbortController(), signal = controller.signal;
      if (!before?.account || !before.noMore) return;
      const live = () => !signal.aborted && node.isConnected && context()?.account === before.account && context()?.tab === 0;
      abort = controller; button.disabled = true; status.textContent = "正在核对收藏和错题…";
      try {
        const { targets, skipped } = await prepare(before.rows, signal);
        if (!live()) return;
        if (!targets.length) {
          status.textContent = skipped ? "未发现可确认的重复收藏；部分分组无法核对。" : "没有重复收藏。";
          return;
        }
        const note = skipped ? `另有 ${skipped} 个分组无法核对，保持不变。` : "";
        status.textContent = `找到 ${targets.length} 道重复收藏。`;
        if (!window.confirm(`取消这 ${targets.length} 道与错题重复的收藏？错题记录会保留，可在解析页重新收藏。${note}`)) {
          status.textContent = "已取消，本次未更改收藏。"; return;
        }
        if (!await verify(before) || !live()) { status.textContent = "页面或账号已变化，未更改收藏。"; return; }
        let removed = 0, failed = false;
        try {
          while (removed < targets.length && live()) {
            await post(writeEndpoint, targets[removed], signal);
            removed++;
            if (live()) status.textContent = `已取消 ${removed}/${targets.length} 道重复收藏…`;
          }
        } catch { failed = true; }
        finally { onChanged(); } // A lost response can follow a successful write.
        if (live()) status.textContent = failed ? `已确认取消 ${removed} 道；其余未确认，请重新检查。`
          : `已取消 ${removed} 道重复收藏。错题记录未改动。${note}`;
      } catch { if (live()) status.textContent = "未能核对重复收藏，未更改任何记录。"; }
      finally {
        if (abort === controller) { abort = null; update(); }
      }
    }
    function update() {
      const view = context();
      button.disabled = Boolean(abort || !view?.account || !view.noMore || !view.rows.length);
    }
    button.addEventListener("click", event => { if (event.isTrusted) void run(); }); update();
    return { node, update, stop() { abort?.abort(); abort = null; node.remove(); } };
  }
  modules.duplicateFavorites = Object.freeze({ mount, matched, prepare });
})();
