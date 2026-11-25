(() => {
  // Only identities and rendering positions cross the isolated-world boundary.
  // Only the account ID needed to scope history statistics accompanies wrong
  // questions. Never read answers or cookies, or mutate the site's Vue state.
  function readQuestionOrderContext(expectedKey) {
    const url = new URL(location.href);
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/(practice|practice_sheet|practice_analysis|errbook\/(?:detail|practice))\/([\w-]+)\/?$/);
    const id = /^[\w-]{1,160}$/;
    if (!match) return null;
    const review = match[1] === "errbook/practice", book = match[1].startsWith("errbook/");
    const sourceId = book ? url.searchParams.get("source_id") || "" : match[2];
    const taskId = url.searchParams.get("task_id") || "";
    const questionId = url.searchParams.get("question_id") || "";
    const key = `${url.pathname}|${sourceId}|${taskId}|${url.searchParams.get("join_id") || ""}|${url.searchParams.get("tab") || "1"}` +
      (review ? `|${questionId}|${url.searchParams.get("readonly") || ""}` : "");
    if (key !== expectedKey || !id.test(sourceId) || (taskId && !id.test(taskId))) return null;
    if (review && (url.searchParams.get("readonly") !== "1" || (questionId && !id.test(questionId)))) return null;
    const page = document.querySelector(review ? ".errbook-practice" : book ? ".errbook-detail-page" :
      match[1] === "practice_analysis" ? ".practice-analysis" : ".practice-sheet");
    const instance = page?.__vue__;
    if (!instance || instance._isDestroyed) return null;
    // A loading flag or join ID can become ready without adding a DOM node.
    // Observe identities/readiness only; never change the site's Vue state.
    const property = "__xetQuestionOrderReadiness";
    if (window[property]?.instance !== instance) window[property]?.stop();
    if (!window[property] && typeof instance.$watch === "function") {
      const state = { instance, unwatch: null };
      state.stop = () => {
        state.unwatch?.();
        window.removeEventListener("xet:question-order-stop-watch", state.stop);
        instance.$off?.("hook:beforeDestroy", state.stop);
        if (window[property] === state) delete window[property];
      };
      state.unwatch = instance.$watch(() => [instance.loading, instance.questionList,
        instance.join_id, instance.resourceId, instance.sourceId, instance.taskId,
        instance.classifyId, instance.currentTab, instance.pageLoading, instance.tab,
        instance.questionId, instance.isReadonly, instance.answerSheetArray], () => {
        instance.$nextTick(() => {
          if (!instance._isDestroyed && window[property] === state) {
            window.dispatchEvent(new Event("xet:question-order-ready"));
          }
        });
      });
      window[property] = state;
      window.addEventListener("xet:question-order-stop-watch", state.stop);
      instance.$once?.("hook:beforeDestroy", state.stop);
    }
    const account = typeof window.USERID === "string" && id.test(window.USERID) &&
      !window.USERID.includes("anonymous") ? window.USERID : undefined;
    if (!book) {
      const sheetTask = instance.taskId || "";
      if (instance.resourceId !== sourceId || !id.test(instance.join_id || "") ||
          sheetTask && !id.test(sheetTask) || (match[1] !== "practice" || taskId) && sheetTask !== taskId) return null;
      const cards = instance.answerSheetArray;
      const blankSheet = Array.isArray(cards) && cards.length > 0 && cards.length === instance.totalPracticeNum &&
        cards.every(q => typeof q?.hasAnswer === "boolean") ? cards.every(q => !q.hasAnswer) : null;
      return { key, kind: "practice", sourceId, taskId: sheetTask, joinId: instance.join_id,
        ...(account && match[1] !== "practice_analysis" ? { account, blankSheet } : {}) };
    }
    // Vue Router keeps numeric API IDs on in-site navigation; a direct URL
    // supplies strings. Normalize safe scalar IDs without weakening identity
    // checks or accepting precision-lost numbers/object coercion.
    const classifyId = typeof instance.classifyId === "string" ? instance.classifyId
      : Number.isSafeInteger(instance.classifyId) && instance.classifyId >= 0 ? String(instance.classifyId) : null;
    if (instance.sourceId !== sourceId || classifyId !== match[2] ||
        Number(review ? instance.tab : instance.currentTab) !== 1 || (review ? instance.pageLoading : instance.loading) ||
        !Array.isArray(instance.questionList) || instance.questionList.length > 2000) return null;
    if (review && (instance.isReadonly !== true || instance.isCollect !== false ||
        (instance.questionId || "") !== questionId ||
        questionId && (instance.questionList.length !== 1 || instance.questionList[0]?.id !== questionId) ||
        !Array.isArray(instance.answerSheetArray) || instance.answerSheetArray.length !== instance.questionList.length)) return null;
    const questions = instance.questionList.map(question => ({ id: question.id, taskId: question.task_id || "" }));
    if (questions.some(q => typeof q.id !== "string" || !id.test(q.id) || (q.taskId && !id.test(q.taskId))) ||
        new Set(questions.map(q => q.id)).size !== questions.length) return null;
    // Vue keys identify cards even after our DOM-only reordering. Reading the
    // array index or matching stems would associate the wrong question on refresh.
    const identities = new Map();
    const known = new Set(questions.map(q => q.id));
    const stack = [instance._vnode];
    let visited = 0;
    while (stack.length && ++visited <= 12000) {
      const node = stack.pop();
      if (!node) continue;
      if (known.has(node.key) && node.elm?.matches?.(review ? ".question-wrapper" : ".question-card")) identities.set(node.elm, node.key);
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    const cards = [...page.querySelectorAll(review ? ".all-questions-container > .question-wrapper" : ".question-list > .question-card")];
    if (cards.length !== questions.length || cards.some(card => !identities.has(card))) return null;
    if (review && cards.some((card, index) => identities.get(card) !== questions[index].id)) return null;
    for (const card of cards) card.setAttribute("data-xet-question-order-id", identities.get(card));
    return { key, kind: review ? "review" : "book", sourceId, ...(account ? { account } : {}),
      questions, cardIds: cards.map(card => identities.get(card)) };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        typeof message.key !== "string" || message.key.length > 800) return { ok: false };
    const site = siteAccess.siteInfo(sender.url);
    const settings = await readSettings();
    if (!site || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) return { ok: false };
    const target = sender.documentId ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({
      target, world: "MAIN", func: readQuestionOrderContext, args: [message.key],
    });
    if (sender.documentId && result?.documentId !== sender.documentId) return { ok: false };
    return result?.result ? { ok: true, context: result.result } : { ok: false };
  }
  globalThis.XetQuestionOrderSource = Object.freeze({ readQuestionOrderContext, resolve });
})();
