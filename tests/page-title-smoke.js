const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ title = "", header = null, embedded = false } = {}) {
  const listeners = new Map(), navigationListeners = new Map();
  let observer, interval, disconnected = false;
  const document = { title, documentElement: {},
    querySelector(selector) {
      assert.equal(selector, ".errbook-detail-page .page-header .back-btn span");
      return header === null ? null : { textContent: header };
    } };
  const location = { pathname: "/p/t_pc/pc_evaluation/errbook/detail/42", search: "?tab=1" };
  const window = { addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    navigation: { addEventListener: (name, callback) => navigationListeners.set(name, callback),
      removeEventListener: name => navigationListeners.delete(name) } };
  window.top = embedded ? {} : window;
  const context = { document, location, window, queueMicrotask,
    MutationObserver: class {
      constructor(callback) { observer = callback; }
      observe() {} disconnect() { disconnected = true; }
    },
    setInterval(callback) { interval = callback; return 1; }, clearInterval() { interval = null; },
  };
  vm.runInNewContext(fs.readFileSync("src/content/page-title.js", "utf8"), context);
  const controller = context.__xetPlayerHelperModules.pageTitle.createPageTitleController();
  const mutate = () => observer?.([{ target: { closest: () => true }, addedNodes: [], removedNodes: [] }]);
  return { controller, document, location, listeners, navigationListeners,
    setHeader(text) { header = text; mutate(); }, mutate, tick: () => interval?.(),
    disconnected: () => disconnected };
}
const flush = () => new Promise(setImmediate);
async function main() {
  const source = fs.readFileSync("src/content/page-title.js", "utf8");
  assert.ok(!source.includes("我的错题"), "Page labels must come from the DOM");
  // Initial, delayed and edited headers are extracted, including other labels.
  { const f = fixture(); f.controller.start(); assert.equal(f.document.title, "");
    f.setHeader("  我的错题 \n "); await flush(); assert.equal(f.document.title, "我的错题");
    f.setHeader("收藏的题目"); await flush(); assert.equal(f.document.title, "收藏的题目");
    f.controller.stop(); assert.equal(f.document.title, "");
    assert.equal(f.disconnected(), true); assert.equal(f.listeners.size, 0);
    assert.equal(f.navigationListeners.size, 0); }
  // Site title resets cannot blank the tab; restore the latest site-owned value.
  { const f = fixture({ title: "merchant.example", header: "动态页面标题" });
    f.controller.start(); assert.equal(f.document.title, "动态页面标题");
    f.document.title = "网站的新标题"; f.mutate(); await flush();
    assert.equal(f.document.title, "动态页面标题"); f.controller.stop();
    assert.equal(f.document.title, "网站的新标题"); }
  // Navigation must not carry the error-book heading into another page.
  { const f = fixture({ title: "原始标题", header: "错题列表" }); f.controller.start();
    f.location.pathname = "/p/t_pc/course_pc_detail/video/id";
    f.navigationListeners.get("currententrychange")(); await flush();
    assert.equal(f.document.title, "原始标题");
    f.document.title = "课程标题"; f.mutate(); await flush(); assert.equal(f.document.title, "课程标题");
    f.location.pathname = "/p/t_pc/pc_evaluation/errbook/detail/42";
    f.listeners.get("popstate")(); await flush(); assert.equal(f.document.title, "错题列表");
    f.controller.stop(); assert.equal(f.document.title, "课程标题"); }
  // New titles already set by the site during navigation/disable are preserved.
  { const f = fixture({ header: "题目列表" }); f.controller.start();
    f.document.title = "下一页"; f.controller.stop(); assert.equal(f.document.title, "下一页"); }
  // Missing/removed headings have no hardcoded fallback; restart works.
  { const f = fixture({ title: "原始标题", header: "错题" }); f.controller.start();
    f.setHeader(" \n "); await flush(); assert.equal(f.document.title, "原始标题");
    f.setHeader("另一个标题"); f.controller.stop(); await flush(); assert.equal(f.document.title, "原始标题");
    f.controller.start(); assert.equal(f.document.title, "另一个标题"); f.controller.stop(); }
  // Fallback for older hosts without the Navigation API; only top-level tabs.
  { const f = fixture({ header: "错题" }); f.controller.start();
    f.location.pathname = "/other"; f.tick(); await flush(); assert.equal(f.document.title, ""); f.controller.stop(); }
  { const f = fixture({ embedded: true, header: "嵌入页面" }); f.controller.start();
    assert.equal(f.document.title, ""); assert.equal(f.listeners.size, 0); }
  console.log("page title DOM extraction, delayed loading, navigation, site resets and cleanup smoke test passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
