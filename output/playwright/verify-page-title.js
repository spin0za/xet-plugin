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
    if (errors.length) throw new Error(errors.join("; "));
    return { domExtraction: true, delayedHeading: true, noHardcoding: true,
      siteTitleReset: true, routeCleanup: true, backgroundSafe: true, disableRestore: true };
  } finally {
    await toggle(false);
    await fixture.close();
  }
}
