async (page) => {
  // Real extension in an independent MV3 profile; all page content is a fixture.
  const context = page.context(), origin = "https://merchant.pc.xiaoe-tech.com";
  const worker = context.serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in a fresh isolated MV3 profile");
  const fixture = await context.newPage(), errors = [];
  fixture.on("pageerror", error => errors.push(error.message));
  const toggle = disabled => worker.evaluate(({ origin, disabled }) => chrome.storage.local.set({
    disabledSites: disabled ? [origin] : [], keepAliveEnabled: false,
  }), { origin, disabled });
  const expectTitle = async title => fixture.waitForFunction(title => document.title === title, title, { timeout: 5000 });
  const setHeader = async text => fixture.evaluate(text => {
    document.querySelector(".back-btn span").textContent = text;
  }, text);
  try {
    await toggle(false);
    await fixture.route(`${origin}/**`, route => route.fulfill({ contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html><head><title></title></head><body><div id="app"></div></body></html>' }));
    await fixture.goto(`${origin}/p/t_pc/pc_evaluation/errbook/detail/42?tab=1`);
    if (await fixture.title() !== "") throw new Error("No guessed title before the heading exists");
    await fixture.evaluate(() => {
      document.querySelector("#app").innerHTML = '<div class="errbook-detail-page"><div class="page-header"><div class="back-btn"><i class="sense-icon-left"></i><span> 我的错题 </span></div></div><p>题目内容不是标题</p></div>';
    });
    await expectTitle("我的错题");
    await setHeader("收藏的题目"); await expectTitle("收藏的题目");
    await fixture.evaluate(() => { document.title = ""; }); await expectTitle("收藏的题目");

    // Leave the target route without removing its DOM first. Navigation API
    // events must remove our title even when the site has not rendered yet.
    await fixture.evaluate(() => history.pushState({}, "", "/p/t_pc/course_pc_detail/video/id"));
    await expectTitle("");
    await fixture.evaluate(() => { document.title = "网站课程标题"; });
    await setHeader("旧页面留下的文字"); await expectTitle("网站课程标题");
    await fixture.evaluate(() => {
      history.pushState({}, "", "/p/t_pc/pc_evaluation/errbook/detail/42?tab=1");
      document.querySelector(".back-btn span").textContent = "新的错题列表";
    });
    await expectTitle("新的错题列表");

    // A single tiny metadata update must also run without animation frames.
    await fixture.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await setHeader("后台标签页的标题"); await expectTitle("后台标签页的标题");

    await toggle(true); await expectTitle("网站课程标题");
    await setHeader("停用时不接管"); await expectTitle("网站课程标题");
    await toggle(false); await expectTitle("停用时不接管");
    await setHeader(" \n "); await expectTitle("网站课程标题");

    // The record overview uses the requested page name, not its inner tabs.
    await fixture.evaluate(() => {
      history.pushState({}, "", "/p/t_pc/pc_evaluation/practice_record");
      document.querySelector("#app").innerHTML = "";
    });
    await expectTitle("网站课程标题");
    await fixture.evaluate(() => {
      document.querySelector("#app").innerHTML = '<div class="practice-record-page"><div class="tab-header"><div class="main-tab-item active"><span>练习历史</span></div><div class="main-tab-item"><span>我的错题</span></div><div class="main-tab-item"><span>题目收藏</span></div></div><div class="resource-card__title">不要使用这个课程标题</div></div>';
    });
    await expectTitle("练习记录");
    await fixture.evaluate(() => {
      history.replaceState({}, "", "/p/t_pc/pc_evaluation/practice_record?tab=2&subTab=1");
      document.querySelector(".main-tab-item.active").classList.remove("active");
      document.querySelectorAll(".main-tab-item")[2].classList.add("active");
      document.title = "";
    });
    await expectTitle("练习记录");
    await toggle(true); await expectTitle("");
    await toggle(false); await expectTitle("练习记录");
    await fixture.evaluate(() => {
      history.pushState({}, "", "/p/t_pc/course_pc_detail/video/id");
      document.title = "另一门课程";
    });
    await expectTitle("另一门课程");
    if (errors.length) throw new Error(errors.join("; "));
    return { domExtraction: true, delayedHeading: true, errorBookNoHardcoding: true,
      practiceRecordTitle: true, recordTabChanges: true, recordDisableRestore: true,
      siteTitleReset: true, routeCleanup: true, backgroundSafe: true, disableRestore: true };
  } finally {
    await toggle(false);
    await fixture.close();
  }
}
