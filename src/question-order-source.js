(() => {
  // Only identities and rendering positions cross the isolated-world boundary.
  // Never read answers, account variables or cookies, or mutate Vue state.
  function readQuestionOrderContext(expectedKey) {
    const url = new URL(location.href);
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/(practice_sheet|practice_analysis|errbook\/detail)\/([\w-]+)\/?$/);
    const id = /^[\w-]{1,160}$/;
    if (!match) return null;
    const book = match[1] === "errbook/detail";
    const sourceId = book ? url.searchParams.get("source_id") || "" : match[2];
    const taskId = url.searchParams.get("task_id") || "";
    const key = `${url.pathname}|${sourceId}|${taskId}|${url.searchParams.get("join_id") || ""}|${url.searchParams.get("tab") || "1"}`;
    if (key !== expectedKey || !id.test(sourceId) || (taskId && !id.test(taskId))) return null;
    const page = document.querySelector(book ? ".errbook-detail-page" :
      match[1] === "practice_sheet" ? ".practice-sheet" : ".practice-analysis");
    const instance = page?.__vue__;
    if (!instance || instance._isDestroyed) return null;
    if (!book) {
      if (instance.resourceId !== sourceId || !id.test(instance.join_id || "") ||
          (instance.taskId || "") !== taskId) return null;
      return { key, kind: "practice", sourceId, taskId, joinId: instance.join_id };
    }
    if (instance.sourceId !== sourceId || instance.classifyId !== match[2] ||
        Number(instance.currentTab) !== 1 || instance.loading ||
        !Array.isArray(instance.questionList) || instance.questionList.length > 2000) return null;
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
      if (known.has(node.key) && node.elm?.matches?.(".question-card")) identities.set(node.elm, node.key);
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    const cards = [...page.querySelectorAll(".question-list > .question-card")];
    if (cards.length !== questions.length || cards.some(card => !identities.has(card))) return null;
    for (const card of cards) card.setAttribute("data-xet-question-order-id", identities.get(card));
    return { key, kind: "book", sourceId, questions, cardIds: cards.map(card => identities.get(card)) };
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
