(() => {
  // Serialized into MAIN. Only the user's existing handUpReport action submits
  // anything. Snapshot/restore question flags, never read or rewrite answers.
  function protectPracticeMarks(action, expectedKey) {
    const STATE = "__xetPracticeMarks", STOP = "xet:practice-marks-stop";
    const id = /^[\w-]{1,160}$/;
    let state = window[STATE];
    if (action === "stop") {
      if (state?.key === expectedKey) state.stop();
      return { ok: true };
    }
    const url = new URL(location.href);
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/practice_sheet\/([\w-]+)\/?$/);
    const task = url.searchParams.get("task_id") || "";
    const key = `${url.pathname}|${task}`;
    const v = document.querySelector(".practice-sheet")?.__vue__;
    if (action !== "start" || !match || expectedKey !== key || !v || v.resourceId !== match[1] ||
        String(v.taskId || "") !== task || !id.test(v.join_id || "") || task && !id.test(task) ||
        ![0, 1].includes(v.practiceMode) || ["handUpReport", "updateQuestionMarkStatus", "handleDeleteLocalStorage"]
          .some(name => typeof v[name] !== "function") || typeof v.$router?.replace !== "function") {
      return { ok: false, reason: "not-ready" };
    }
    if (state && (state.owner !== v || state.joinId !== v.join_id || state.key !== key)) {
      state.stop(); state = null;
    }
    if (state?.active) return { ok: true };
    const resourceId = v.resourceId, joinId = v.join_id;
    const originalReport = v.handUpReport, originalMark = v.updateQuestionMarkStatus;
    const pending = new Set();
    const live = () => state.active && document.querySelector(".practice-sheet")?.__vue__ === v &&
      v.join_id === joinId && `${location.pathname}|${new URL(location.href).searchParams.get("task_id") || ""}` === key;
    const feedback = message => { if (live()) v.$message?.error?.(message); };
    async function post(path, payload) {
      const r = await fetch(path, { method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error("请求失败");
      const result = await r.json();
      if (result.code !== 0) {
        const error = new Error("网站拒绝请求"); error.rejected = true; throw error;
      }
      return result.data;
    }
    function trackedMark(...args) {
      if (!live()) return originalMark.apply(this, args);
      if (state.work || state.recovery) return Promise.reject(new Error("正在交卷，请稍候"));
      const work = (async () => originalMark.apply(this, args))();
      pending.add(work);
      void (async () => { try { await work; } catch { /* Native UI rolls back failed marks. */ }
        finally { pending.delete(work); } })();
      return work;
    }
    async function restore(saved) {
      // The server clears is_marked during report. Successful requests restore
      // these flags on exactly the same attempt, so other devices see them too.
      for (let start = 0; start < saved.marks.length; start += 4) {
        await Promise.all(saved.marks.slice(start, start + 4).map(async questionId => {
          if (saved.restored.has(questionId)) return;
          await post("/xe.practice.bff/common/question.mark/1.0.0", {
            source_type: resourceId.startsWith("wb_drill") ? 4 : 1,
            source_id: resourceId, join_id: joinId, question_id: questionId, is_mark: 1,
          });
          saved.restored.add(questionId);
        }));
      }
    }
    function protectedReport(...args) {
      if (!live()) return originalReport.apply(this, args);
      if (state.work) return state.work;
      const work = (async () => {
        try {
          if (!state.recovery) {
            await Promise.allSettled([...pending]);
            if (!live()) return;
            const record = await post("/evaluation_wechat/practices/commit_record", {
              practice_id: resourceId, join_id: joinId, task_id: task,
            });
            if (!live()) return;
            if (!Array.isArray(record?.list) || !record.list.length || record.list.length > 2000 ||
                record.list.some(q => !id.test(q.id || "") || ![0, 1, false, true, "0", "1"].includes(q.is_marked)) ||
                new Set(record.list.map(q => q.id)).size !== record.list.length) throw new Error("无法确认标记");
            const saved = { marks: record.list.filter(q => [1, true, "1"].includes(q.is_marked)).map(q => q.id),
              reported: false, uncertain: true, restored: new Set(), data: null };
            state.recovery = saved;
            try {
              saved.data = await post("/evaluation_wechat/practices/report", {
                practice_id: resourceId, join_id: joinId, task_id: task, practice_mode: v.practiceMode,
              });
              saved.reported = true; saved.uncertain = false;
              v.hasPracticeSubmit = true;
            } catch (error) {
              // A rejected write is safe to retry. A lost response is not:
              // restore the flags but never risk submitting the attempt twice.
              if (error.rejected) { state.recovery = null; throw error; }
            }
          }
          const saved = state.recovery;
          await restore(saved);
          if (!saved.reported) {
            feedback("交卷结果暂无法确认，标记已恢复，请先查看练习记录"); return;
          }
          if (!live()) return;
          v.handleDeleteLocalStorage();
          if (typeof args[0] === "function") args[0](saved.data);
          if (!live()) return;
          await v.$router.replace({ name: "practiceResult", query: {
            join_id: joinId, product_id: v.course_id, isJustCommitted: 1, task_id: task,
          } });
        } catch {
          const saved = state.recovery;
          feedback(saved?.reported && saved.restored.size === saved.marks.length
            ? "已交卷且标记已恢复，请到练习记录查看结果"
            : saved ? "交卷已处理，但标记尚未恢复完成，请再次点击交卷重试恢复"
              : "无法读取标记或完成交卷，请稍后重试");
        }
      })();
      state.work = work;
      void (async () => { try { await work; } finally { if (state.work === work) state.work = null; } })();
      return work;
    }
    // Once report has begun, don't allow an answer/undo click to modify the
    // already-submitted attempt while flags are being restored or retried.
    function blockAnswers(event) {
      if (!state.recovery || !live()) return;
      if (event.type === "keydown" && !["Enter", " ", "Spacebar"].includes(event.key)) return;
      if (!event.target?.closest?.(".practice-sheet .question-block__answer, .practice-sheet .xet-practice-undo")) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }
    const events = ["pointerdown", "click", "keydown", "beforeinput", "paste", "drop"];
    state = { key, owner: v, joinId, active: true, work: null, recovery: null, stop() {
      state.active = false;
      if (v.handUpReport === protectedReport) v.handUpReport = originalReport;
      if (v.updateQuestionMarkStatus === trackedMark) v.updateQuestionMarkStatus = originalMark;
      for (const name of events) window.removeEventListener(name, blockAnswers, true);
      window.removeEventListener(STOP, state.stop);
      if (window[STATE] === state) delete window[STATE];
      // Finish only an already-started restore. Never submit after leaving.
    } };
    window[STATE] = state;
    v.handUpReport = protectedReport; v.updateQuestionMarkStatus = trackedMark;
    for (const name of events) window.addEventListener(name, blockAnswers, true);
    window.addEventListener(STOP, state.stop);
    return { ok: true };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        !["start", "stop"].includes(message.action) || typeof message.key !== "string" || message.key.length > 600) return { ok: false };
    const site = siteAccess.siteInfo(sender.url), settings = await readSettings();
    if (!site || settings.disabledSites.includes(site.origin) || !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({ target, world: "MAIN", func: protectPracticeMarks,
      args: [message.action, message.key] });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result || { ok: false };
  }
  globalThis.XetPracticeMarksSource = Object.freeze({ protectPracticeMarks, resolve });
})();
