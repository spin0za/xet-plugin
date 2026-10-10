(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.analysisFeedback) return;
  const MESSAGES = Object.freeze({
    mark: "标记成功", unmark: "取消标记成功",
    collect: "收藏成功", uncollect: "取消收藏成功",
    "mark-error": "标记操作失败，请稍后重试",
    "collect-error": "收藏操作失败，请稍后重试",
    "load-error": "无法读取标记和收藏，请确认登录及网络状态",
  });

  function createFeedbackController({ request, getKey, isEnabled }) {
    const notices = new Map();
    let generation = 0;

    function reposition() {
      let top = 40;
      for (const notice of notices.keys()) {
        notice.style.top = `${top}px`;
        top += notice.offsetHeight + 8;
      }
    }

    function remove(notice) {
      clearTimeout(notices.get(notice));
      notices.delete(notice);
      notice.remove();
      reposition();
    }

    function fallback(feedback) {
      // Only used when the site message service is unavailable. Match Sense UI's
      // dimensions and timing; never substitute the player's bottom-right toast.
      const notice = document.createElement("div");
      notice.className = "xet-analysis-feedback";
      notice.setAttribute("popover", "manual");
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.setAttribute("aria-atomic", "true");
      const message = document.createElement("div");
      message.className = "xet-analysis-message";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 18 18");
      icon.setAttribute("aria-hidden", "true");
      const circle = document.createElementNS(icon.namespaceURI, "circle");
      circle.setAttribute("cx", "9"); circle.setAttribute("cy", "9"); circle.setAttribute("r", "9");
      circle.setAttribute("fill", feedback.endsWith("-error") ? "#ff4747" : "#11d611");
      const check = document.createElementNS(icon.namespaceURI, "path");
      check.setAttribute("d", feedback.endsWith("-error") ? "M6 6l6 6M12 6l-6 6" : "M5.5 9l2.3 2.4L12.5 6.5");
      check.setAttribute("fill", "none"); check.setAttribute("stroke", "white");
      check.setAttribute("stroke-width", "1.4"); check.setAttribute("stroke-linecap", "round");
      check.setAttribute("stroke-linejoin", "round");
      icon.append(circle, check);
      const text = document.createElement("span");
      text.textContent = MESSAGES[feedback];
      message.append(icon, text);
      notice.append(message);
      document.body.append(notice);
      if (typeof notice.showPopover === "function") notice.showPopover();
      notices.set(notice, setTimeout(() => {
        notice.classList.add("xet-analysis-feedback-closing");
        notices.set(notice, setTimeout(() => remove(notice), 300));
      }, 3000));
      reposition();
    }

    async function show(feedback) {
      if (!Object.hasOwn(MESSAGES, feedback) || !isEnabled()) return;
      const key = getKey(), current = generation;
      let shown = false;
      try { shown = (await request({ type: "xet:analysis-feedback", key, feedback }))?.ok === true; }
      catch { /* A missing site component must not discard save feedback. */ }
      if (!shown && isEnabled() && getKey() === key && current === generation) fallback(feedback);
    }

    function clear() {
      generation++;
      for (const notice of [...notices.keys()]) remove(notice);
    }

    return Object.freeze({ show, clear });
  }

  modules.analysisFeedback = Object.freeze({ createFeedbackController });
})();
