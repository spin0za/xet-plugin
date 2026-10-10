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

  // Use the site's own Sense UI message component, including its font, icon,
  // stacking, 40px top offset, 300ms animation and three-second duration.
  // Only fixed practice feedback is allowed; this is not an arbitrary UI proxy.
  function showAnalysisFeedback(expectedKey, feedback) {
    const messages = {
      mark: ["success", "标记成功"], unmark: ["success", "取消标记成功"],
      collect: ["success", "收藏成功"], uncollect: ["success", "取消收藏成功"],
      "mark-error": ["error", "标记操作失败，请稍后重试"],
      "collect-error": ["error", "收藏操作失败，请稍后重试"],
      "load-error": ["error", "无法读取标记和收藏，请确认登录及网络状态"],
    };
    if (!Object.hasOwn(messages, feedback)) return false;
    const url = new URL(location.href);
    if (!/^\/p\/t_pc\/pc_evaluation\/practice_analysis\/[\w-]+\/?$/.test(url.pathname) ||
        `${url.pathname}|${url.searchParams.get("join_id") || ""}|${url.searchParams.get("task_id") || ""}` !== expectedKey) return false;
    const instance = document.querySelector(".practice-analysis")?.__vue__;
    const [type, message] = messages[feedback];
    if (typeof instance?.$message?.[type] !== "function") return false;
    instance.$message[type](message);
    return true;
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
    const feedback = message.type === "xet:analysis-feedback";
    if (feedback && !["mark", "unmark", "collect", "uncollect", "mark-error", "collect-error", "load-error"].includes(message.feedback)) {
      return { ok: false, error: "未知题目提示" };
    }
    const [result] = await chrome.scripting.executeScript({
      target, world: "MAIN", func: feedback ? showAnalysisFeedback : readAnalysisContext,
      args: feedback ? [message.key, message.feedback] : [message.key],
    });
    if (sender.documentId && result?.documentId !== sender.documentId) {
      return { ok: false, error: "页面已切换" };
    }
    return result?.result ? (feedback ? { ok: true } : { ok: true, context: result.result }) : { ok: false, reason: "not-ready" };
  }

  globalThis.XetPracticeAnalysisSource = Object.freeze({ readAnalysisContext, showAnalysisFeedback, resolve });
})();
