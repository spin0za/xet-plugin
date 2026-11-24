async (page) => {
  const ctx = page.context();
  const worker = ctx.serviceWorkers().find(entry => entry.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in a fresh persistent Chromium profile");
  const origin = "https://night-fixture.pc.xiaoe-tech.com";
  const embed = "https://night-video.xiaoeknow.com";
  const nativeEmbed = "https://iframe.xiaoeknow.com";
  const evalPath = "/p/t_pc/pc_evaluation/";
  const test = await ctx.newPage();
  const popup = await ctx.newPage();
  test.setDefaultTimeout(7000);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const makePlayer = (root = "xgplayer") => `
    <div class="${root}" style="background:#000;color:#fff">
      <video id="picture" width="200" height="110" muted playsinline></video>
      <xg-poster id="poster" class="xgplayer-poster" style="background:white;display:block;width:80px;height:40px"></xg-poster>
      <div id="captions">Player caption</div><button id="controls" type="button">Play</button>
    </div>`;
  const answerLoader = '<div class="practice-answer-page no-theme"><div class="ss-loading-mask" style="background-color:#fff"><div class="ss-loading-spinner">•••</div></div></div>';
  const card = `
    <aside class="all-questions-card analysis-card">
      <div class="collapsible-card">
        <div class="collapsible-card__header">Answer card</div>
        <div class="answer-card__content__card">
          <button class="answer-card__content__card__item success">8</button>
          <button class="answer-card__content__card__item current error">9</button>
          <button class="answer-card__content__card__item unanswered">10</button>
        </div>
        <div class="answer-card__content__info"><div class="info-item"><i class="info-item__block success"></i>Correct</div></div>
      </div>
    </aside>`;
  const question = `
    <main class="practice-sheet practice-analysis">
      <header class="exam-top-bar">
        <button class="exam-top-bar__back">${icon("back")}</button>
        <div class="exam-top-bar__status-box">${icon("timer")} 00:00:00</div>
        <button class="exam-top-bar__font-trigger">${icon("font")}</button>
      </header>
      <header class="analysis-base-layout__header">Course navigation</header>
      <section class="analysis-base-layout__content">${card}
        <div class="analysis-only-content">
          <h2 class="question-header">9. Question</h2>
          <div class="question-option-item is-correct"><b class="question-option-item__marker">C</b>
            <span class="question-option-item__content">Correct option</span></div>
          <div class="question-option-item is-wrong"><b class="question-option-item__marker">D</b>
            <span class="question-option-item__content">Wrong option</span></div>
          <div class="question-analysis"><p class="answer-status__error">Wrong answer</p>
            <div class="answer-analysis">Explanation</div></div>
        </div>
      </section>
    </main>`;
  function icon(type) {
    return `<img class="exam-top-bar__${type}-icon" width="13" height="13" alt="${type}"
      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13'%3E%3Crect width='13' height='13' fill='%23333333'/%3E%3C/svg%3E">`;
  }
  const cover = '<img class="brand-art" alt="Cover or avatar" width="32" height="24" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'24\'%3E%3Crect width=\'32\' height=\'24\' fill=\'%23ac7bea\'/%3E%3C/svg%3E">';
  const wordmark = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="40"><circle cx="15" cy="20" r="13" fill="#ac7bea"/><text x="33" y="24" fill="#000">Shop</text></svg>')}`;
  const merchantWordmark = "https://wechatapppro-1252524126.cdn.xiaoeknow.com/app5qnhc4gj6683/image/b_u_ctbq1iq3g3b370c2nrl0/lqdwwom4sim5pa.png";
  const nav = `<nav class="navbar-wrapper"><div class="nav-main__wrapper">
    <div class="navbar-logo-common" style="background-image:url('${wordmark}')"></div>
    <div class="navbar-left">${cover}<div class="nav-item know-nav"><a class="active" href="/">Home</a></div></div>
    <div class="navbar-right"><div class="search-wrapper opretor"><i class="iconfont">⌕</i><div>Search</div></div>
      <div class="icon-wrapper leaning-icon opretor"><div>Study history</div></div></div>
  </div></nav>`;
  const app = (contents) => `<div id="common_template_mounted_el_container"><div id="app">${contents}</div></div>`;
  const course = `
    <div class="course_base_layout">
      ${nav}
      <div class="content_header"><div class="camp_pro_content_header">${cover}<div class="course_intro_right">
        <div class="phone-watch"><div class="phone-text">Watch on phone</div></div>
        <div class="complaint-enter">Feedback</div>
      </div></div></div>
      <div class="main_content"><div class="main_content_box">
        <div class="content_left">
          <div class="tab-files-wrapper"><div class="content_switch_tab">
          <div class="tabs"><div class="tabs-item__wrapper">
            <button class="tabs-item">Details</button><button class="tabs-item current-tabs">Catalog</button>
          </div></div>
          <div class="camp_pro_content_catalog">
            <div class="catalog_search_bar"><span class="search_title">Course catalog</span><input class="el-input__inner" placeholder="Course search"></div>
            <div class="catalog_box">
              <button class="el-collapse-item__header" aria-expanded="false"
                onclick="this.setAttribute('aria-expanded','true'); this.nextElementSibling.hidden=false"><span class="chapter_title">Chapter 1</span></button>
              <div class="el-collapse-item__wrap" hidden>
                <div class="section_item_box last_study_bg"><span class="sections_title_info scroll_height_light">Current lesson</span></div>
              </div>
            </div>
          </div>
          </div></div>
          <div class="document_container"><div class="document_header">PDF</div>
            <iframe class="document-frame" title="Fixture viewer" src="${embed}/document"></iframe></div>
        </div>
        <div class="content_right"><div class="shop_msg"><div class="shop-information">
          ${cover}<div class="shop-name">Shop</div><div class="into-shop-btn">Visit shop</div>
        </div></div></div>
      </div></div>
      <footer class="layout_footer"><a href="/bought">Footer</a></footer>
    </div>`;
  const store = `${nav}
    <main class="mygoods-wrapper"><div class="has-goods"><table class="goods-table"><tbody><tr class="table-header">
      <th>My courses</th></tr><tr><td class="table-content">Lesson</td></tr></tbody></table></div></main>`;
  const studyHistory = `${nav}<main class="record-cover" style="background-color:#f5f6f9">
    <h1 class="record-header">Study history</h1><div class="record-list"><div class="record-item">
      <div class="record-item" style="background:#fff">${cover}
        <div class="course-info"><span class="course-title" style="color:#353535">Lesson</span>
          <div class="progress-stick"><div class="done-stick" style="width:66%"></div></div>
          <span class="progress-info">66%</span><button class="item-button keep-button" style="background:#fff">Continue</button>
        </div></div></div></div><nav class="pagination-wrap"><input class="ss-input-inner" style="background:#fff"></nav></main>`;
  const playerSurround = `<div class="course-player-box"><div class="video-content-header" style="background:#333">
    <div class="video-player">${makePlayer()}</div><div class="video-title__font">Lesson</div>
  </div></div>`;
  const videoScript = `<script>
    window.controlsClicked = 0;
    document.querySelector('#controls')?.addEventListener('click', () => window.controlsClicked++);
    window.startPicture = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 110;
      const cx = canvas.getContext('2d');
      cx.fillStyle = 'white'; cx.fillRect(0, 0, 200, 110);
      const video = document.querySelector('#picture');
      const stream = canvas.captureStream(0);
      video.srcObject = stream;
      const q = video.play();
      stream.getVideoTracks()[0].requestFrame();
      cx.fillRect(0, 0, 200, 110);
      await q;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
  </script>`;
  const documentFor = (body) => `<!doctype html>
    <style>body{background:white;color:#333;margin:16px;font:16px system-ui}
    .base-layout,.resource-card,.practice-sheet,.practice-analysis{background:#f5f7fa}
    .base-layout__header,.practice-record-page,.analysis-card,.collapsible-card,
    .analysis-only-content,.answer-analysis,.all-questions-card,.question-card,.action-bar,
    .collect-catalog-card,.practice-result{background:white;color:#333}
    .resource-card__title,.question-header,.question-option-item__content{color:#333}
    .question-analysis{background:#f5f7fa}
    .question-option-item__marker{border:1px solid #e5e5e5;background:white}
    .course_base_layout .main_content .main_content_box,.course_base_layout .main_content .main_content_box .content_left{background:#f0f3f8}
    .course_base_layout .main_content .main_content_box .content_right div,.camp_pro_content_catalog,.catalog_box,.el-collapse-item__wrap,
    .document_container,.navbar-wrapper,.goods-table .table-content{background:#fff;color:#333}
    .camp_pro_content_catalog .el-collapse-item__header{background:#f5f5f5}
    .catalog_box .chapter_title,.catalog_search_bar .search_title{color:#333}
    .section_item_box.last_study_bg{background:#f5f9ff}
    .navbar-wrapper .navbar-left a.active{color:#105cfb!important}
    #common_template_mounted_el_container > #app{background:#f2f5f9}
    #app .base-layout .navbar-wrapper{background:#fff!important}
    .navbar-wrapper .nav-main__wrapper{background:#f5f5f5}
    .nav-main__wrapper .know-nav{color:#333}
    .nav-main__wrapper .navbar-right,.nav-main__wrapper .navbar-right .opretor{color:#666}
    .nav-main__wrapper .navbar-logo-common{width:140px;height:40px;background-repeat:no-repeat}
    .nav-main__wrapper .navbar-right .search-wrapper > div{color:#666}
    .know-navbar-search input{background:#fff;color:#333;border:1px solid #ccc}
    .know-navbar-search input::placeholder{color:#666}
    .course_intro_right .phone-watch,.course_intro_right .phone-text,.course_intro_right .complaint-enter{color:#666}
    .tab-files-wrapper .content_switch_tab,.shop_msg .shop-information{background:#fff}
    .shop-information .shop-name,.shop-information .into-shop-btn{color:#353535}
    .shop-information .into-shop-btn{background:#eee}
    .tabs-item{background:transparent;border:0;color:#333}
    #picture{display:block} .xgplayer,.pc-live-player{width:400px}</style>
    ${body}${videoScript}`;
  const settings = (values) => worker.evaluate(values => chrome.storage.local.set(values), values);
  const pageMode = (expected) => test.waitForFunction(value =>
    document.documentElement.hasAttribute("data-xet-night-page") === value, expected);
  const pageKind = (expected) => test.waitForFunction(value =>
    document.documentElement.getAttribute("data-xet-night-page") === value, expected);
  const brightness = async (target, expected, id = "picture") => {
    try {
      await target.waitForFunction(({ expected, id }) =>
        getComputedStyle(document.getElementById(id)).filter === expected, { expected, id }, { polling: 50 });
    } catch (error) {
      const actual = await target.locator("#" + id).evaluate(el => getComputedStyle(el).filter);
      throw new Error(`${target.url()} #${id} expected ${expected}, got ${actual}: ${error.message}`);
    }
  };
  const color = (locator, property = "backgroundColor") =>
    locator.evaluate((el, name) => getComputedStyle(el)[name], property);

  const gates = new Map();
  const holdParser = (name) => {
    let finish;
    const waiting = new Promise(resolve => { finish = resolve; });
    gates.set(`/parser-gate-${name}.js`, { waiting, finish });
    return `<script src="/parser-gate-${name}.js"></script>`;
  };
  const answerGate = holdParser("answer");
  const courseGate = holdParser("course");
  const storeGate = holdParser("store");
  const videoGate = holdParser("embed");
  const studioGif = "/l00v4o2p0xx4.gif";
  const courseGif = "/lods3xen0exo.gif";
  const loadGraphic = `<img class="fixture-spinner" src="${studioGif}" width="64" height="32" alt="">`;
  try {
    await test.route(merchantWordmark, route => route.fulfill({ contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="40"><circle cx="23" cy="20" r="13" fill="#ac7bea"/><rect x="51" y="14" width="70" height="12" fill="#000"/></svg>',
    }));
    await test.route(`${origin}/**`, async route => {
      if (route.request().method() !== "GET") return route.fulfill({ json: { code: 0, data: {} } });
      const path = new URL(route.request().url()).pathname;
      if (gates.has(path)) {
        await gates.get(path).waiting;
        return route.fulfill({ contentType: "application/javascript", body: "" });
      }
      if (path === studioGif || path === courseGif) return route.fulfill({ contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect width="64" height="32" fill="white"/><circle cx="32" cy="16" r="4" fill="#1472ff"/></svg>',
      });
      let body = '<div id="untouched">Original page</div>';
      if (path === "/store-loading") body = `
        <div class="global-widget-loading full-loading" style="background:white">${loadGraphic}</div>
        <div class="global-widget-loading part-loading" style="background:white"></div>
        <div class="el-loading-mask" style="background:white"></div>
        <div id="unrelated-background" style="background:white">Site content outside the load overlay</div>${storeGate}`;
      else if (path.includes("/practice_record")) body = `
        <div class="base-layout"><header class="base-layout__header">Records</header>
          <section class="practice-record-page">
            <button class="sub-tab-item active">Practice</button>
            <article class="resource-card"><div class="resource-card__title">Practice record</div></article>
          </section>
        </div>`;
      else if (path.includes("/errbook/detail/")) body = app(`
        <div class="base-layout">${nav.replace(wordmark, merchantWordmark).replace(
          '<div class="nav-item know-nav"><a class="active" href="/">Home</a></div>',
          '<div class="know-navbar-search"><div><input type="text" placeholder="请输入" aria-label="Site search"><i class="search-input">⌕</i></div></div>')}
        <main class="errbook-detail-page"><div class="action-bar"><input class="ss-input-inner"></div>
          <div class="question-card"><span class="xet-wrong-count">1 wrong</span>Question</div>
        </main></div>`);
      else if (/\/question_collect\/[^/]+$/.test(path)) body = '<main class="collect-catalog-page"><section class="collect-catalog-card">Favorites</section></main>';
      else if (path.endsWith("/errbook/practice/embed-startup")) body = app(question + `
        <iframe id="waiting-video" class="xiaoe-iframe-video" src="${nativeEmbed}/page/?type=3"></iframe>
        <iframe id="waiting-audio" src="${nativeEmbed}/page/?type=2"></iframe>`);
      else if (path.includes("/errbook/practice/")) body = app(answerLoader + question + makePlayer() +
        (path.endsWith("/slow") ? answerGate : ""));
      else if (path.includes("/practice_result/")) body = '<div class="practice-result">Result</div>';
      else if (path.includes("/practice_analysis/")) body = question + makePlayer() + `
        <img id="illustration" alt="Illustration" width="48" height="30"
             src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='30'%3E%3Crect width='48' height='30' fill='white'/%3E%3C/svg%3E">
        <div class="xgplayer"><video id="native" controls></video>
          <video id="with-track"><track kind="subtitles" srclang="ja"></video></div>
        <iframe class="xiaoe-iframe-video" src="${embed}/player"></iframe>
        <iframe id="unrelated" src="${embed}/unrelated"></iframe>`;
      else if (path.startsWith(evalPath)) body = question;
      else if (path === "/p/t_pc/course_pc_detail/camp_pro/slow") body = app(course.replace('<div class="catalog_box">', `
        <div class="catalog_box"><div class="ss-loading-mask s391" style="background:white">
          <div class="ss-loading-spinner s391">${loadGraphic}</div></div>`)) +
        `<style>.ss-loading-spinner img.fixture-spinner{content:url('${courseGif}')}</style>${courseGate}`;
      else if (path.includes("/course_pc_detail/")) body = app(course + (path.includes("/video/") ? playerSurround : ""));
      else if (path.includes("/live_pc/pc/")) body = makePlayer("pc-live-player");
      else if (path === "/record") body = app(studyHistory);
      else if (["/", "/bought", "/search"].includes(path)) body = store;
      return route.fulfill({ contentType: "text/html", body: documentFor(body) });
    });
    await test.route(`${embed}/**`, route => route.fulfill({ contentType: "text/html",
      body: documentFor(route.request().url().endsWith("/document") ? '<p id="pdf-page" style="background:white;color:black">Fixture document</p>' : makePlayer()),
    }));
    await test.route(`${nativeEmbed}/**`, async route => {
      const url = new URL(route.request().url());
      if (gates.has(url.pathname)) {
        await gates.get(url.pathname).waiting;
        return route.fulfill({ contentType: "application/javascript", body: "" });
      }
      return route.fulfill({ contentType: "text/html", body: documentFor(
        url.searchParams.get("type") === "3" ? `<div class="xiaoe-iframe">Loading player</div>${videoGate}` : '<p>Audio widget</p>',
      ) });
    });
    await settings({ siteAppearance: "system", disabledSites: [], keepAliveEnabled: false });
    await worker.evaluate(() => chrome.storage.local.remove("nightVideoBrightness"));
    await test.emulateMedia({ colorScheme: "light" });
    await test.goto(origin + evalPath + "practice_record?tab=1");
    await test.bringToFront();
    const popupUrl = new URL("/popup/popup.html", worker.url()).href;
    await popup.goto(popupUrl);
    const theme = popup.locator("#site-appearance");
    const dim = popup.locator("#night-video-brightness");
    await theme.selectOption("dark");
    assert(await dim.inputValue() === "extra", "Default popup brightness is not 70%");
    await pageMode(true);
    assert(await color(test.locator(".resource-card")) === "rgb(36, 42, 52)", "Record card was not recolored");
    assert(await color(test.locator(".resource-card__title"), "color") === "rgb(232, 237, 244)", "Record title contrast");
    await test.goto(origin + evalPath + "errbook/practice/slow?readonly=1", { waitUntil: "commit" });
    await test.bringToFront();
    await pageKind("evaluation");
    const loadingMask = test.locator(".ss-loading-mask");
    const maskColor = () => color(loadingMask);
    assert(await test.evaluate(() => document.readyState) === "loading", "Parser gate did not delay document_idle");
    assert(await maskColor() === "rgb(20, 23, 28)" && await color(test.locator("html")) === "rgb(20, 23, 28)", "Initial errbook loader flashed white");
    await brightness(test, "brightness(0.7)", "poster");
    await settings({ disabledSites: [origin] });
    await pageMode(false);
    assert(await maskColor() === "rgb(255, 255, 255)", "Early theme ignored site disable");
    await settings({ disabledSites: [], siteAppearance: "light" });
    await test.emulateMedia({ colorScheme: "dark" });
    assert(await maskColor() === "rgb(255, 255, 255)", "Early theme ignored explicit light");
    await settings({ siteAppearance: "dark" });
    await pageMode(true);
    gates.get("/parser-gate-answer.js").finish();
    await test.waitForLoadState("load");
    assert(await maskColor() === "rgb(20, 23, 28)", "Theme handoff cleared the loader color");
    for (const { name, path, kind, selector, surface } of [
      { name: "course", path: "/p/t_pc/course_pc_detail/camp_pro/slow", kind: "course", selector: ".catalog_box .ss-loading-mask", surface: "rgb(28, 33, 41)" },
      { name: "store", path: "/store-loading", kind: "site", selector: ".global-widget-loading.full-loading", surface: "rgb(20, 23, 28)" },
    ]) {
      await test.goto(origin + path, { waitUntil: "commit" });
      await pageKind(kind);
      const mask = test.locator(selector), graphic = mask.locator(".fixture-spinner");
      assert(await test.evaluate(() => document.readyState) === "loading", `Parser gate inactive for ${name}`);
      assert(await color(mask) === surface && await color(graphic, "mixBlendMode") === "screen", `${name} overlay or GIF still has a white background`);
      if (name === "store") {
        assert(await color(test.locator(".global-widget-loading.part-loading")) === "rgb(28, 33, 41)", "Inline shared loader is not dark");
        assert(await color(test.locator(".el-loading-mask")) !== "rgb(255, 255, 255)", "Element loading mask is not dark");
        assert(await color(test.locator("#unrelated-background")) === "rgb(255, 255, 255)", "Unrelated content was recolored");
      }
      await settings({ siteAppearance: "light" });
      await pageMode(false);
      assert(await color(mask) === "rgb(255, 255, 255)" && await color(graphic, "filter") === "none", "Light loading appearance was not preserved");
      await settings({ siteAppearance: "dark" });
      await pageMode(true);
      gates.get(`/parser-gate-${name}.js`).finish();
      await test.waitForLoadState("load");
      assert(await color(mask) === surface, `Theme handoff changed the ${name} loader`);
    }
    await test.goto(origin + evalPath + "errbook/practice/embed-startup?readonly=1", { waitUntil: "domcontentloaded" });
    await pageKind("evaluation");
    const waitingVideo = test.frameLocator("#waiting-video");
    const waitingAudio = test.frameLocator("#waiting-audio");
    const waitingBody = waitingVideo.locator("body");
    await waitingVideo.locator("html[data-xet-night-embed-surface]").waitFor({ state: "attached" });
    assert(await waitingBody.evaluate(() => document.readyState) === "loading", "Player was not held before document_idle");
    assert(await color(waitingBody) === "rgb(20, 23, 28)" &&
      await color(test.locator("#waiting-video")) === "rgb(20, 23, 28)", "Video startup still has a pale viewport");
    assert(await color(waitingAudio.locator("body")) === "rgb(255, 255, 255)", "Non-video embed was recolored");
    await settings({ nightVideoBrightness: "off" });
    await waitingVideo.locator("html:not([data-xet-night-video])").waitFor({ state: "attached" });
    assert(await color(waitingBody) === "rgb(20, 23, 28)", "Off brightness disabled the loading canvas");
    await settings({ disabledSites: [origin] });
    await waitingVideo.locator("html:not([data-xet-night-embed-surface])").waitFor({ state: "attached" });
    assert(await color(waitingBody) === "rgb(255, 255, 255)", "Early video theme ignored the outer-site policy");
    await settings({ disabledSites: [], nightVideoBrightness: "extra" });
    await waitingVideo.locator("html[data-xet-night-embed-surface]").waitFor({ state: "attached" });
    gates.get("/parser-gate-embed.js").finish();
    await test.waitForLoadState("load");
    assert(await color(waitingBody) === "rgb(20, 23, 28)", "Video handoff restored the white canvas");
    for (const [path, selector] of [
      ["practice_record?tab=0", ".practice-record-page"],
      ["practice_record?tab=2&subTab=1", ".practice-record-page"],
      ["errbook/detail/1?tab=1", ".question-card"],
      ["question_collect/1", ".collect-catalog-card"],
      ["question_collect/answer/1", ".all-questions-card"],
      ["practice_sheet/fixture", ".all-questions-card"],
      ["errbook/practice/1?readonly=1", ".all-questions-card"],
      ["practice_result/fixture", ".practice-result"],
    ]) {
      await test.goto(origin + evalPath + path);
      await pageMode(true);
      assert(await color(test.locator(selector)) === "rgb(28, 33, 41)", `Wrong surface for ${path}`);
      if (path.startsWith("errbook/detail")) {
        assert(await color(test.locator(".navbar-wrapper")) === "rgb(25, 30, 37)", "Errbook outer header remains white");
        assert(await color(test.locator(".nav-main__wrapper")) === "rgb(25, 30, 37)", "Errbook inner header remains white");
        assert(await color(test.locator(".navbar-right .search-wrapper > div"), "color") === "rgb(174, 185, 201)", "Actual search label not readable");
        const logo = test.locator(".navbar-logo-common");
        const readLogo = () => logo.evaluate(el => {
          const base = getComputedStyle(el);
          return { background: base.backgroundImage, backdrop: base.backgroundColor,
            avatar: getComputedStyle(el, "::before").filter,
            letters: getComputedStyle(el, "::after").filter,
            source: getComputedStyle(el, "::after").backgroundImage,
            hitTarget: getComputedStyle(el, "::after").pointerEvents };
        });
        const darkLogo = await readLogo();
        assert(darkLogo.background === "none" && darkLogo.backdrop === "rgba(0, 0, 0, 0)" &&
          darkLogo.avatar === "none" && darkLogo.letters === "brightness(0) invert(0.92)" &&
          darkLogo.source.includes(merchantWordmark) && darkLogo.hitTarget === "none", "Merchant wordmark did not switch only the letters");
        const search = test.locator(".know-navbar-search input");
        await search.fill("preview");
        assert(await color(search) === "rgb(36, 42, 52)" &&
          await color(search, "color") === "rgb(232, 237, 244)" &&
          await color(search, "borderColor") === "rgb(145, 197, 255)" &&
          await search.evaluate(el => getComputedStyle(el, "::placeholder").color) === "rgb(174, 185, 201)", "Expanded navbar search not fully themed");
        await theme.selectOption("light");
        await pageMode(false);
        const lightLogo = await readLogo();
        assert(lightLogo.background.includes(merchantWordmark) && lightLogo.letters === "none" &&
          await color(search) === "rgb(255, 255, 255)" && await search.inputValue() === "preview", "Light mode did not restore original search and wordmark");
        await theme.selectOption("dark");
        await pageMode(true);
      }
    }
    await test.goto(origin + evalPath + "practice_analysis/fixture");
    await test.bringToFront();
    await brightness(test, "brightness(0.7)");
    await test.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-layout"));
    const answer = test.locator(".answer-card__content__card__item.current");
    const cardGeometry = await answer.evaluate(el => ({
      width: el.offsetWidth, height: el.offsetHeight, outline: getComputedStyle(el).outlineWidth,
      gap: getComputedStyle(el.parentElement).gap,
      mark: getComputedStyle(el, "::after").backgroundColor,
    }));
    assert(cardGeometry.width === 32 && cardGeometry.height === 44 && cardGeometry.outline === "4px"
      && cardGeometry.gap === "12px" && cardGeometry.mark === "rgb(255, 192, 151)", "V2 answer card changed");
    assert(await color(test.locator(".is-correct .question-option-item__marker")) === "rgb(37, 58, 81)", "Correct option color");
    assert(await color(test.locator(".is-wrong .question-option-item__marker")) === "rgb(71, 47, 36)", "Wrong option color");
    const toolbarIcons = test.locator(".exam-top-bar img");
    assert(await toolbarIcons.count() === 3 && (await toolbarIcons.evaluateAll(nodes =>
      nodes.every(el => getComputedStyle(el).filter === "brightness(0) invert(0.88)"))), "Native toolbar icons remain dark");
    const legend = await test.locator(".answer-card__content__info").evaluate(el => {
      const style = getComputedStyle(el, "::after");
      return [style.content, style.color];
    });
    assert(legend[0].includes("未答") && legend[1] === "rgb(174, 185, 201)", "Fallback unanswered legend remains dark");

    const media = test.frames().find(frame => frame.url() === embed + "/player");
    const unrelated = test.frames().find(frame => frame.url() === embed + "/unrelated");
    await brightness(media, "brightness(0.7)");
    await brightness(media, "brightness(0.7)", "poster");
    assert(await color(unrelated.locator("#picture"), "filter") === "none", "Unrelated frame was filtered");
    assert(await color(unrelated.locator("#poster"), "filter") === "none", "Unrelated poster was filtered");
    for (const id of ["controls", "captions", "native", "with-track", "illustration"]) {
      assert(await color(test.locator("#" + id), "filter") === "none", `Unintended filter on ${id}`);
    }
    const renderedPixel = async (id = "picture") => {
      const png = (await test.locator("#" + id).screenshot()).toString("base64");
      return test.evaluate(async data => {
        const raster = await createImageBitmap(await (await fetch("data:image/png;base64," + data)).blob());
        const canvas = document.createElement("canvas");
        canvas.width = raster.width;
        canvas.height = raster.height;
        const context = canvas.getContext("2d");
        context.drawImage(raster, 0, 0);
        return Array.from(context.getImageData(raster.width >> 1, raster.height >> 1, 1, 1).data);
      }, png);
    };
    const posterPixel = await renderedPixel("poster");
    assert(posterPixel.slice(0, 3).every(value => Math.abs(value - 179) <= 2), "The paused poster was not dimmed to 70%");
    await test.evaluate(() => window.startPicture());
    const extraPixel = await renderedPixel();
    assert(extraPixel.slice(0, 3).every(value => Math.abs(value - 179) <= 2), "Default on-screen white was not dimmed to 70%");
    await dim.selectOption("soft");
    await brightness(test, "brightness(0.85)");
    await brightness(media, "brightness(0.85)");
    await brightness(media, "brightness(0.85)", "poster");
    const softPixel = await renderedPixel();
    assert(softPixel.slice(0, 3).every(value => Math.abs(value - 217) <= 2), "On-screen white was not softened to 85%");
    const pixel = await test.locator("#picture").evaluate(video => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const canvasCtx = canvas.getContext("2d");
      canvasCtx.drawImage(video, 0, 0, 1, 1);
      return Array.from(canvasCtx.getImageData(0, 0, 1, 1).data);
    });
    assert(pixel.every(value => value >= 250), "CSS brightness must not affect original frame screenshots");
    await test.locator("#controls").click();
    assert(await test.evaluate(() => controlsClicked) === 1, "Playback controls stopped working");
    await dim.selectOption("off");
    await brightness(test, "none");
    await brightness(media, "none");
    await brightness(media, "none", "poster");
    await dim.selectOption("soft");
    await brightness(test, "brightness(0.85)");
    await theme.selectOption("light");
    await pageMode(false);
    await brightness(test, "none");
    await brightness(test, "none", "poster");
    assert(await test.evaluate(() => controlsClicked) === 1, "Changing appearance reloaded the document");
    assert((await toolbarIcons.evaluateAll(nodes => nodes.every(el => getComputedStyle(el).filter === "none"))), "Light mode still brightens native toolbar icons");
    await test.emulateMedia({ colorScheme: "dark" });
    assert(await color(test.locator(".analysis-only-content")) === "rgb(255, 255, 255)", "Explicit light did not override system");
    await theme.selectOption("system");
    await pageMode(true);
    await test.emulateMedia({ colorScheme: "light" });
    await pageMode(false);
    await test.emulateMedia({ colorScheme: "dark" });
    await pageMode(true);
    await test.emulateMedia({ forcedColors: "active" });
    await brightness(test, "none");
    await test.emulateMedia({ forcedColors: "none" });
    await brightness(test, "brightness(0.85)");

    await test.evaluate(() => history.pushState({}, "", "/bought"));
    await pageKind("site");
    await brightness(test, "none");
    await brightness(media, "none");
    await test.goBack();
    await pageMode(true);
    await brightness(test, "brightness(0.85)");
    await settings({ disabledSites: [origin] });
    await pageMode(false);
    await brightness(test, "none");
    await brightness(media, "none");
    await settings({ disabledSites: [] });
    await pageMode(true);
    await brightness(media, "brightness(0.85)");

    await theme.selectOption("dark");
    await test.goto(origin + "/record");
    await pageKind("site");
    const studyCard = test.locator(".record-item > .record-item");
    assert(await color(test.locator(".record-cover")) === "rgb(20, 23, 28)" &&
      await color(studyCard) === "rgb(28, 33, 41)" && await color(studyCard.locator(".course-title"), "color") === "rgb(232, 237, 244)" &&
      await color(studyCard.locator(".item-button")) === "rgb(36, 42, 52)" &&
      await color(studyCard.locator(".progress-info"), "color") === "rgb(145, 197, 255)" &&
      await color(studyCard.locator(".brand-art"), "filter") === "none", "Study-history surfaces or artwork mismatch");
    await theme.selectOption("light");
    await pageMode(false);
    assert(await color(studyCard) === "rgb(255, 255, 255)", "Study history did not restore light colors");
    await theme.selectOption("dark");
    for (const route of ["/", "/bought", "/search?q=course"]) {
      await test.goto(origin + route);
      await pageKind("site");
      assert(await color(test.locator(".navbar-wrapper")) === "rgb(25, 30, 37)", "Store navigation not dark");
      assert(await color(test.locator(".navbar-left a"), "color") === "rgb(145, 197, 255)", "Active navigation has insufficient contrast");
      assert(await color(test.locator(".goods-table .table-content")) === "rgb(28, 33, 41)", "Store table not dark");
    }
    for (const entry of ["camp_pro", "audio", "document", "image_text", "column", "member"]) {
      await test.goto(origin + "/p/t_pc/course_pc_detail/" + entry + "/fixture");
      await pageKind("course");
      assert(await color(test.locator(".catalog_box")) === "rgb(28, 33, 41)", "Course catalog not dark: " + entry);
      assert(await color(test.locator(".el-collapse-item__header")) === "rgb(36, 42, 52)", "Chapter header not dark: " + entry);
      assert(await color(test.locator(".chapter_title"), "color") === "rgb(232, 237, 244)", "Chapter title not readable: " + entry);
      assert(await color(test.locator(".shop_msg")) === "rgb(28, 33, 41)", "Course sidebar not dark: " + entry);
      assert(await color(test.locator(".nav-main__wrapper")) === "rgb(25, 30, 37)", "Course inner navigation is still pale");
      assert(await color(test.locator(".navbar-right .search-wrapper > div"), "color") === "rgb(174, 185, 201)", "Course search label is still dark");
      const foreignLogo = test.locator(".navbar-logo-common");
      assert(await color(foreignLogo) === "rgb(112, 128, 149)" && (await color(foreignLogo, "backgroundImage")).includes(wordmark), "Unknown logo was modified");
      assert(await color(test.locator("#app")) === "rgb(20, 23, 28)", "Pale background remains below course summary");
      assert(await color(test.locator(".content_switch_tab")) === "rgb(28, 33, 41)", "White strip remains under tabs");
      assert(await color(test.locator(".current-tabs"), "color") === "rgb(145, 197, 255)", "Active course tab not readable");
      assert(await color(test.locator(".shop-information")) === "rgb(28, 33, 41)", "Inner shop card remains white");
      assert(await color(test.locator(".into-shop-btn")) === "rgb(36, 42, 52)", "Visit Shop control remains white");
      assert(await color(test.locator(".course_intro_right .phone-text"), "color") === "rgb(174, 185, 201)" &&
        await color(test.locator(".course_intro_right .complaint-enter"), "color") === "rgb(174, 185, 201)", "Course header actions too dim");
      assert(await test.locator(".brand-art").evaluateAll(images => images.every(img => getComputedStyle(img).filter === "none")), "Theme filtered brand artwork");
      const documentFrame = test.frameLocator(".document-frame");
      assert(await color(documentFrame.locator("#pdf-page")) === "rgb(255, 255, 255)", "Embedded document was restyled");
    }
    const chapter = test.locator(".el-collapse-item__header");
    await chapter.click();
    assert(await color(test.locator(".section_item_box")) === "rgb(37, 58, 81)", "Current lesson lost highlight");
    await theme.selectOption("light");
    await pageMode(false);
    assert(await chapter.getAttribute("aria-expanded") === "true", "Switching theme changed course navigation state");
    assert(await color(test.locator(".catalog_box")) === "rgb(255, 255, 255)", "Catalog did not restore light mode");
    assert(await color(test.locator("#app")) === "rgb(242, 245, 249)" &&
      await color(test.locator(".nav-main__wrapper")) === "rgb(245, 245, 245)" &&
      await color(test.locator(".shop-information")) === "rgb(255, 255, 255)", "Light mode surfaces were not restored");
    const logo = test.locator(".navbar-logo-common");
    assert(await color(logo) === "rgba(0, 0, 0, 0)" && (await color(logo, "backgroundImage")).includes(wordmark)
      && await color(test.locator(".search-wrapper > div"), "color") === "rgb(102, 102, 102)", "Light navigation was not restored");
    await theme.selectOption("dark");
    for (const route of ["/p/t_pc/course_pc_detail/video/fixture", "/p/t_pc/live_pc/pc/fixture"]) {
      await test.goto(origin + route);
      await brightness(test, "brightness(0.85)");
      assert(await color(test.locator("body")) === "rgb(20, 23, 28)", "Player page did not follow site-wide appearance");
      assert(await color(test.locator("#picture").locator("..")) === "rgb(0, 0, 0)", "Player wrapper color was altered");
      if (route.includes("/video/")) {
        const surround = test.locator(".video-content-header");
        assert(await color(surround) === "rgb(20, 23, 28)", "Course video surround did not match the page");
        await theme.selectOption("light");
        await pageMode(false);
        assert(await color(surround) === "rgb(51, 51, 51)", "Original light player surround was not restored");
        await theme.selectOption("dark");
      }
    }
    await popup.reload();
    assert(await theme.inputValue() === "dark" && await dim.inputValue() === "soft", "Settings did not persist");
    return { recordTabs: true, errbookAndCollection: true, practiceAndAnalysis: true, cardGeometry,
      originalFrame: pixel, onScreenPixels: { soft: softPixel, extra: extraPixel, poster: posterPixel }, earlyErrbookLoader: true, sharedAndCatalogLoaders: true,
      crossOriginEmbed: true, liveAndCourseVideo: true,
      untouchedMediaAndControls: true, forcedColors: true, systemChanges: true, spaCleanup: true,
      sitePolicy: true, persistedPopup: true, defaultBrightness: "70%", toolbarAndLegendContrast: true,
      siteShellAndCatalog: true, navigationStatePreserved: true, studyHistory: true, earlyVideoCanvas: true, courseVideoSurround: true };
  } catch (error) {
    throw new Error(`Appearance regression at ${test.url()}: ${error.message}`);
  } finally {
    for (const gate of gates.values()) gate.finish();
    await settings({ siteAppearance: "system", disabledSites: [] });
    await worker.evaluate(() => chrome.storage.local.remove("nightVideoBrightness"));
    await popup.close();
    await test.close();
  }
}
