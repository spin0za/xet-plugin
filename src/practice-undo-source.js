(() => {
  // Serialized into MAIN. All operations are limited to the current rote
  // practice, with fixed payloads; no arbitrary page-function/API proxy.
  async function practiceUndo(action, expectedKey, questionId) {
    const STATE = "__xetPracticeUndo";
    const READY = "xet:practice-undo-ready", STOP = "xet:practice-undo-stop";
    const url = new URL(location.href);
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/([\w-]+)\/?$/);
    const key = `${url.pathname}|${url.searchParams.get("task_id") || ""}`;
    let state = window[STATE];
    if (action === "stop") {
      if (state?.key === expectedKey) state.stop();
      return { ok: true };
    }
    const v = document.querySelector(".practice-sheet")?.__vue__;
    if (!match || key !== expectedKey || !v || v.resourceId !== match[1] ||
        String(v.taskId || "") !== (url.searchParams.get("task_id") || "") ||
        v.practiceMode !== 0 || !/^[\w-]{1,160}$/.test(v.join_id || "") ||
        !Array.isArray(v.practiceList) || v.practiceList.length > 2000) {
      state?.stop();
      return { ok: false, reason: "not-ready" };
    }
    if (state && (state.owner !== v || state.key !== key || state.joinId !== v.join_id)) {
      state.stop(); state = null;
    }
    if (!state) {
      const required = ["handleCommitQs", "reportErrorQuestion", "shouldIgnorePracticeAnswerEvent",
        "getPracticeAnswerSheetIndex", "hasPracticeQuestionDraftAnswer", "$set", "$watch", "$nextTick"];
      if (required.some(name => typeof v[name] !== "function") || !v.answerSheetArray ||
          !v.local_answers || !v.submitStateMap || !v.userAnswerState || !v.questionStatusShowMap) {
        return { ok: false, reason: "unsupported" };
      }
      const resourceId = v.resourceId, joinId = v.join_id, taskId = String(v.taskId || "");
      const notify = () => window.dispatchEvent(new Event(READY));
      const live = () => state.active && document.querySelector(".practice-sheet")?.__vue__ === v &&
        v.join_id === joinId && v.practiceMode === 0 &&
        `${location.pathname}|${new URL(location.href).searchParams.get("task_id") || ""}` === key;
      const feedback = (type, text) => { if (live()) v.$message?.[type]?.(text); };
      const commits = new Map(), reports = new Map(), journal = new Map(), busy = new Set();
      const beforeCommit = new Map();
      let baseline = null, baselineGeneration = 0;
      const originalCommit = v.handleCommitQs, originalReport = v.reportErrorQuestion;
      const originalIgnore = v.shouldIgnorePracticeAnswerEvent;
      async function post(path, body) {
        let response;
        try {
          response = await fetch(path, { method: "POST", credentials: "same-origin", redirect: "error",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000) });
        } catch { const error = new Error("请求中断，请重试撤销"); error.uncertain = true; throw error; }
        if (!response.ok) { const error = new Error("请求失败，请重试撤销"); error.uncertain = true; throw error; }
        let result;
        try { result = await response.json(); }
        catch { const error = new Error("无法确认保存结果，请重试撤销"); error.uncertain = true; throw error; }
        if (result.code !== 0) throw new Error("网站未能保存，请稍后重试");
        return result.data;
      }
      // The catalog's source_id maps a practice to its actual error-book ID.
      // An absent catalog entry means this practice has no error book yet.
      async function readBook() {
        const catalog = await post("/evaluation_wechat/error_question/list_classfy", { type: 1 });
        if (!Array.isArray(catalog?.claasfy)) throw new Error("无法确认错题本状态");
        const books = catalog.claasfy.filter(book => book.source_id === resourceId);
        if (!books.length) return { entries: new Map() };
        if (books.length !== 1 || !/^\d{1,20}$/.test(String(books[0].id))) throw new Error("无法确认错题本归属");
        const bookId = books[0].id;
        const data = await post("/evaluation_wechat/error_question/get_all_question",
          { type: 1, classfy_id: bookId, source_id: resourceId });
        if (!Array.isArray(data?.list)) throw new Error("无法确认错题本状态");
        return { bookId, entries: new Map(data.list.map(entry => [entry.id, {
          exists: true, bookId, fingerprint: entry.updated_at != null
            ? JSON.stringify([entry.updated_at, entry.task_id ?? ""]) : null,
        }])) };
      }
      async function membership(id) { return (await readBook()).entries.get(id) || { exists: false }; }
      async function refreshBaseline() {
        const generation = ++baselineGeneration;
        baseline = null;
        try {
          const book = await readBook();
          if (state.active && generation === baselineGeneration) baseline = book;
        } catch { /* Without a pre-answer snapshot, undo preserves error entries. */ }
      }
      const onVisible = () => { if (document.visibilityState === "visible" && live()) void refreshBaseline(); };
      const sameEntry = (a, b) => a?.exists && b?.exists && a.bookId === b.bookId &&
        !!a.fingerprint && a.fingerprint === b.fingerprint;
      async function trackedReport() {
        // Snapshot identity immediately: the user may switch questions while
        // the membership check is running. Never report a later currentQuestion.
        const id = v.currentQuestion?.id;
        if (!live() || !/^[\w-]{1,160}$/.test(id || "")) return originalReport.call(v);
        if (reports.has(id)) return reports.get(id);
        const work = (async () => {
          // The server may insert an error entry in commit_qs itself, before
          // the site's later error_report call. Use the pre-commit snapshot.
          let before = beforeCommit.get(id);
          if (!beforeCommit.has(id)) {
            try { before = await membership(id); } catch { /* Unknown means preserve. */ }
          }
          const previous = journal.get(id);
          const owned = before && (!before.exists || (previous?.deletable && sameEntry(before, previous.entry)));
          let saved = false;
          try {
            await post("/evaluation_wechat/practices/error_report", {
              source_id: resourceId, source_type: v.isDrillBookPractice ? 5 : 1,
              question_id: id, question_type: 1,
            });
            saved = true;
          } catch { /* Reporting was best-effort in the site's original method. */ }
          let after;
          try { if (saved && owned) after = await membership(id); } catch { /* Preserve if unverified. */ }
          journal.set(id, { deletable: !!(saved && owned && after?.exists && after.fingerprint), entry: after });
        })();
        reports.set(id, work); notify();
        try { await work; }
        finally { if (reports.get(id) === work) reports.delete(id); notify(); }
      }
      async function trackedCommit(...args) {
        if (!live()) return originalCommit.apply(v, args);
        const id = v.currentQuestion?.id;
        if (busy.has(id)) return;
        beforeCommit.set(id, baseline ? baseline.entries.get(id) || { exists: false } : undefined);
        const work = originalCommit.apply(v, args);
        commits.set(id, work); notify();
        try { return await work; }
        finally { if (commits.get(id) === work) commits.delete(id); notify(); }
      }
      function ignoreAnswerEvent(...args) { return busy.size > 0 || originalIgnore.apply(v, args); }
      // A native control changes its local answer BEFORE emitting to the parent.
      // Merely ignoring the parent's event leaves a blue, unsaved selection.
      const answerEvents = ["pointerdown", "click", "keydown", "beforeinput", "paste", "drop"];
      function blockPendingAnswer(event) {
        if (!busy.size || !live()) return;
        // Keep Tab navigation, copying and caret movement available. Actual
        // edits are guarded by beforeinput/paste/drop, activation by keydown.
        if (event.type === "keydown" && !["Enter", " ", "Spacebar"].includes(event.key)) return;
        const answer = event.target?.closest?.(".question-block__answer, .question-select, .question-judge, .question-textarea, .question-essay");
        if (answer?.closest(".practice-sheet")?.__vue__ !== v) return;
        event.preventDefault(); event.stopImmediatePropagation();
      }
      function freshQuestion(q) {
        const fresh = { ...q };
        if (Array.isArray(q.child_info)) fresh.child_info = q.child_info.map(freshQuestion);
        return fresh;
      }
      function resetQuestion(q) {
        v.$set(v.local_answers, q.id, { type: q.type, answer: [] });
        for (const [name, value] of Object.entries({ answer: [], answer_state: "", is_answer: 0,
          answerStatus: "default", stateArr: [], userAnswerState: {} })) v.$set(q, name, value);
        v.$set(v.submitStateMap, q.id, false);
        v.$set(v.userAnswerState, q.id, false);
        v.$set(v.questionStatusShowMap, q.id, true);
        for (const option of q.option || []) {
          if ([0, 1, 3, 5].includes(q.type)) v.$set(option, "click", false);
          if (q.type === 4) v.$set(option, "content", "");
        }
        for (const child of q.child_info || []) resetQuestion(child);
      }
      async function resetUI(q, index) {
        const wasHydrating = v.isHydratingPracticeQuestions;
        v.isHydratingPracticeQuestions = true;
        try {
          resetQuestion(q);
          // Reinitialize the site's own answer components, including their
          // private selection/input buffers and non-deep questionItem watchers.
          const fresh = freshQuestion(q);
          v.$set(v.practiceList, index, fresh);
          if (v.materialUserAnswerState) v.$set(v.materialUserAnswerState, q.id, {});
          v.$set(v.answerSheetArray[index], "hasAnswer", false);
          v.$set(v.answerSheetArray[index], "answerStatus", "default");
          if (v.currentQuestion?.id === q.id) {
            v.curAnswer = []; v.stateArr = []; v.questionStatusShow = true;
            v.materialUserAnswer = {}; v.questionOption = fresh.option || [];
          }
          await v.$nextTick();
        } finally { v.isHydratingPracticeQuestions = wasHydrating; }
      }
      async function undo(id) {
        const q = v.practiceList.find(q => q?.id === id);
        const index = q && v.getPracticeAnswerSheetIndex(q);
        if (!q || !v.answerSheetArray[index] || busy.has(id) || v.updataing) return { ok: false, reason: "busy" };
        if (!v.hasPracticeQuestionDraftAnswer(q) && !journal.get(id)?.deletable) return { ok: false, reason: "empty" };
        busy.add(id); notify();
        let cleared = false;
        try {
          // Wait for the original commit AND its subsequent asynchronous error
          // report, so neither can recreate the answer/entry after the undo.
          await commits.get(id);
          await reports.get(id);
          if (!live()) return { ok: false, reason: "page-changed" };
          const answer = { id, answer: [], answer_state: "", is_answer: 0 };
          if (q.type === 6) answer.child = (q.child_info || []).map(child =>
            ({ id: child.id, answer: [], answer_state: "", is_answer: 0 }));
          try {
            await post("/evaluation_wechat/practices/commit_qs", {
              practice_id: resourceId, join_id: joinId, practice_mode: 0, user_answer: answer, report_index: index,
            });
          } catch (error) {
            if (!error.uncertain) throw error;
            const data = await post("/evaluation_wechat/practices/commit_record",
              { practice_id: resourceId, join_id: joinId, task_id: taskId, filter_delete: false });
            const saved = data?.list?.find(q => q.id === id);
            const empty = q => q && Array.isArray(q.answer) && !q.answer.length &&
              q.is_answer === 0 && !q.answer_state;
            if (!empty(saved) || (q.type === 6 && (!Array.isArray(saved.child) || !saved.child.every(empty)))) throw error;
          }
          cleared = true;
          if (!live()) return { ok: false, cleared, reason: "page-changed" };
          await resetUI(q, index);
          const record = journal.get(id);
          let removed = false, changed = false, current;
          if (record?.deletable) {
            current = await membership(id);
            if (!live()) return { ok: false, cleared, reason: "page-changed" };
            if (current.exists && sameEntry(current, record.entry)) {
              await post("/evaluation_wechat/error_question/del", { classfy_id: current.bookId, question_ids: [id] });
              if ((await membership(id)).exists) throw new Error("错题本尚未移除，请重试撤销");
              removed = true;
            } else changed = current.exists;
          }
          journal.delete(id);
          beforeCommit.delete(id);
          if (removed || current?.exists === false) baseline?.entries.delete(id);
          else if (current?.exists) baseline?.entries.set(id, current);
          feedback("success", removed ? "已撤销作答，并移除本次新增错题" :
            changed ? "已撤销作答；错题记录已更新，已保留" : "已撤销作答");
          return { ok: true, cleared, removed };
        } catch {
          const error = cleared ? "已清空答案，但移除新错题失败，请重试撤销" : "撤销失败，请稍后重试";
          feedback("error", error);
          return { ok: false, cleared, error };
        } finally { busy.delete(id); notify(); }
      }
      state = { owner: v, key, joinId, active: true, undo,
        snapshot: () => ({ key, joinId, questions: v.practiceList.filter(q => q?.id).map(q => ({
          id: q.id, index: v.getPracticeAnswerSheetIndex(q),
          canUndo: v.hasPracticeQuestionDraftAnswer(q) || !!journal.get(q.id)?.deletable,
          pending: busy.has(q.id), retry: !v.hasPracticeQuestionDraftAnswer(q) && !!journal.get(q.id)?.deletable,
        })) }),
        stop() {
          if (!state.active) return;
          state.active = false; state.unwatch?.(); baselineGeneration++;
          if (v.handleCommitQs === trackedCommit) v.handleCommitQs = originalCommit;
          if (v.reportErrorQuestion === trackedReport) v.reportErrorQuestion = originalReport;
          if (v.shouldIgnorePracticeAnswerEvent === ignoreAnswerEvent) v.shouldIgnorePracticeAnswerEvent = originalIgnore;
          window.removeEventListener(STOP, state.stop);
          for (const event of answerEvents) window.removeEventListener(event, blockPendingAnswer, true);
          document.removeEventListener("visibilitychange", onVisible);
          if (window[STATE] === state) delete window[STATE];
          notify();
        },
      };
      window[STATE] = state;
      v.handleCommitQs = trackedCommit; v.reportErrorQuestion = trackedReport;
      v.shouldIgnorePracticeAnswerEvent = ignoreAnswerEvent;
      state.unwatch = v.$watch(() => [v.practiceMode, v.join_id, v.practiceList,
        v.local_answers, v.answerSheetArray, v.submitStateMap], notify, { deep: true });
      window.addEventListener(STOP, state.stop);
      for (const event of answerEvents) window.addEventListener(event, blockPendingAnswer, true);
      document.addEventListener("visibilitychange", onVisible);
      state.ready = refreshBaseline();
    }
    if (action === "undo") return state.undo(questionId);
    await state.ready;
    if (!state.active) return { ok: false, reason: "page-changed" };
    return { ok: true, context: state.snapshot() };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        typeof message.key !== "string" || message.key.length > 600 ||
        !["sync", "undo", "stop"].includes(message.action) ||
        (message.action === "undo" && !/^[\w-]{1,160}$/.test(message.questionId || ""))) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || (message.action !== "stop" && settings.disabledSites.includes(site.origin)) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: practiceUndo,
      args: [message.action, message.key, message.questionId || ""] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetPracticeUndoSource = Object.freeze({ practiceUndo, resolve });
})();
