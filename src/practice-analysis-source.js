(() => {
  // Serialized into MAIN. Return only question identities and flags, never
  // answers, account state, cookies, or arbitrary page variables.
  function readAnalysisContext(expectedKey) {
    const url = new URL(location.href);
    const match = url.pathname.match(/^\/p\/t_pc\/pc_evaluation\/practice_analysis\/([\w-]+)\/?$/);
    const joinId = url.searchParams.get("join_id") || "";
    const taskId = url.searchParams.get("task_id") || "";
    const key = `${url.pathname}|${joinId}|${taskId}`;
    const idPattern = /^[\w-]{1,160}$/;
    if (!match || key !== expectedKey || !idPattern.test(joinId) ||
        (taskId && !idPattern.test(taskId))) return null;
    const page = document.querySelector(".practice-analysis");
    const instance = page?.__vue__;
    if (!instance || instance.resourceId !== match[1] || instance.join_id !== joinId ||
        !Array.isArray(instance.practiceList) || !instance.practiceList.length ||
        instance.practiceList.length > 2000) return null;
    const questions = instance.practiceList.map((question, index) => ({
      id: question.id, index, collected: question.is_collected === true,
    }));
    if (questions.some(question => typeof question.id !== "string" || !idPattern.test(question.id)) ||
        new Set(questions.map(question => question.id)).size !== questions.length) return null;
    return { key, resourceId: match[1], joinId, taskId, questions };
  }

  async function resolve(message, sender, { siteAccess, readSettings }) {
    if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0 ||
        typeof message.key !== "string" || message.key.length > 600) {
      return { ok: false, error: "无法确认解析页面" };
    }
    const site = siteAccess.siteInfo(sender.url);
    const settings = await readSettings();
    if (!site || settings.disabledSites.includes(site.origin) ||
        !(await siteAccess.isAuthorized(site.origin))) {
      return { ok: false, error: "当前网站未启用插件" };
    }
    const target = sender.documentId
      ? { tabId: sender.tab.id, documentIds: [sender.documentId] }
      : { tabId: sender.tab.id, frameIds: [0] };
    const [result] = await chrome.scripting.executeScript({
      target, world: "MAIN", func: readAnalysisContext, args: [message.key],
    });
    if (sender.documentId && result?.documentId !== sender.documentId) {
      return { ok: false, error: "页面已切换" };
    }
    return result?.result ? { ok: true, context: result.result } : { ok: false, reason: "not-ready" };
  }

  globalThis.XetPracticeAnalysisSource = Object.freeze({ readAnalysisContext, resolve });
})();
