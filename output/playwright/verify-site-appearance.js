async (page) => {
  const ctx = page.context();
  const worker = ctx.serviceWorkers().find(entry => entry.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in a fresh persistent Chromium profile");
  const origin = "https://night-fixture.pc.xiaoe-tech.com";
  const embed = "https://night-video.xiaoeknow.com";
  const evalPath = "/p/t_pc/pc_evaluation/";
  const test = await ctx.newPage();
  const popup = await ctx.newPage();
  test.setDefaultTimeout(7000);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const makePlayer = (root = "xgplayer") => `
    <div class="${root}" style="background:#000;color:#fff">
      <video id="picture" width="200" height="110" muted playsinline></video>
      <div id="captions">Player caption</div><button id="controls" type="button">Play</button>
    </div>`;
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
    #picture{display:block} .xgplayer,.pc-live-player{width:400px}</style>
    ${body}${videoScript}`;
  const settings = (values) => worker.evaluate(values => chrome.storage.local.set(values), values);
  const pageMode = (expected) => test.waitForFunction(value =>
    document.documentElement.hasAttribute("data-xet-night-page") === value, expected);
  const brightness = (target, expected) => target.waitForFunction(value =>
    getComputedStyle(document.querySelector("#picture")).filter === value, expected);
  const color = (locator, property = "backgroundColor") =>
    locator.evaluate((el, name) => getComputedStyle(el)[name], property);

  try {
    await test.route(`${origin}/**`, async route => {
      if (route.request().method() !== "GET") return route.fulfill({ json: { code: 0, data: {} } });
      const path = new URL(route.request().url()).pathname;
      let body = '<div id="untouched">Original page</div>';
      if (path.includes("/practice_record")) body = `
        <div class="base-layout"><header class="base-layout__header">Records</header>
          <section class="practice-record-page">
            <button class="sub-tab-item active">Practice</button>
            <article class="resource-card"><div class="resource-card__title">Practice record</div></article>
          </section>
        </div>`;
      else if (path.includes("/errbook/detail/")) body = `
        <main class="errbook-detail-page"><div class="action-bar"><input class="ss-input-inner"></div>
          <div class="question-card"><span class="xet-wrong-count">1 wrong</span>Question</div>
        </main>`;
      else if (/\/question_collect\/[^/]+$/.test(path)) body = '<main class="collect-catalog-page"><section class="collect-catalog-card">Favorites</section></main>';
      else if (path.includes("/practice_result/")) body = '<div class="practice-result">Result</div>';
      else if (path.includes("/practice_analysis/")) body = question + makePlayer() + `
        <img id="illustration" alt="Illustration" width="48" height="30"
             src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='30'%3E%3Crect width='48' height='30' fill='white'/%3E%3C/svg%3E">
        <div class="xgplayer"><video id="native" controls></video>
          <video id="with-track"><track kind="subtitles" srclang="ja"></video></div>
        <iframe class="xiaoe-iframe-video" src="${embed}/player"></iframe>
        <iframe id="unrelated" src="${embed}/unrelated"></iframe>`;
      else if (path.startsWith(evalPath)) body = question;
      else if (path.includes("/course_pc_detail/video/")) body = makePlayer();
      else if (path.includes("/live_pc/pc/")) body = makePlayer("pc-live-player");
      return route.fulfill({ contentType: "text/html", body: documentFor(body) });
    });
    await test.route(`${embed}/**`, route =>
      route.fulfill({ contentType: "text/html", body: documentFor(makePlayer()) }));
    await settings({ siteAppearance: "system", nightVideoBrightness: "soft", disabledSites: [], keepAliveEnabled: false });
    await test.emulateMedia({ colorScheme: "light" });
    await test.goto(origin + evalPath + "practice_record?tab=1");
    await test.bringToFront();
    const popupUrl = new URL("/popup/popup.html", worker.url()).href;
    await popup.goto(popupUrl);
    const theme = popup.locator("#site-appearance");
    const dim = popup.locator("#night-video-brightness");
    await theme.selectOption("dark");
    await pageMode(true);
    assert(await color(test.locator(".resource-card")) === "rgb(36, 42, 52)", "Record card was not recolored");
    assert(await color(test.locator(".resource-card__title"), "color") === "rgb(232, 237, 244)", "Record title contrast");
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
    }
    await test.goto(origin + evalPath + "practice_analysis/fixture");
    await test.bringToFront();
    await brightness(test, "brightness(0.85)");
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

    const media = test.frames().find(frame => frame.url() === embed + "/player");
    const unrelated = test.frames().find(frame => frame.url() === embed + "/unrelated");
    await brightness(media, "brightness(0.85)");
    assert(await color(unrelated.locator("#picture"), "filter") === "none", "Unrelated frame was filtered");
    for (const id of ["controls", "captions", "native", "with-track", "illustration"]) {
      assert(await color(test.locator("#" + id), "filter") === "none", `Unintended filter on ${id}`);
    }
    await test.evaluate(() => window.startPicture());
    const renderedPixel = async () => {
      const png = (await test.locator("#picture").screenshot()).toString("base64");
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
    await dim.selectOption("extra");
    await brightness(test, "brightness(0.7)");
    await brightness(media, "brightness(0.7)");
    const extraPixel = await renderedPixel();
    assert(extraPixel.slice(0, 3).every(value => Math.abs(value - 179) <= 2), "On-screen white was not dimmed to 70%");
    await dim.selectOption("off");
    await brightness(test, "none");
    await brightness(media, "none");
    await dim.selectOption("soft");
    await brightness(test, "brightness(0.85)");
    await theme.selectOption("light");
    await pageMode(false);
    await brightness(test, "none");
    assert(await test.evaluate(() => controlsClicked) === 1, "Changing appearance reloaded the document");
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
    await pageMode(false);
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
    for (const route of ["/p/t_pc/course_pc_detail/video/fixture", "/p/t_pc/live_pc/pc/fixture"]) {
      await test.goto(origin + route);
      await brightness(test, "brightness(0.85)");
      assert(await color(test.locator("body")) === "rgb(255, 255, 255)", "Player brightness must not recolor unrelated page chrome");
    }
    await popup.reload();
    assert(await theme.inputValue() === "dark" && await dim.inputValue() === "soft", "Settings did not persist");
    return { recordTabs: true, errbookAndCollection: true, practiceAndAnalysis: true, cardGeometry,
      originalFrame: pixel, onScreenPixels: { soft: softPixel, extra: extraPixel },
      crossOriginEmbed: true, liveAndCourseVideo: true,
      untouchedMediaAndControls: true, forcedColors: true, systemChanges: true, spaCleanup: true,
      sitePolicy: true, persistedPopup: true };
  } catch (error) {
    throw new Error(`Appearance regression at ${test.url()}: ${error.message}`);
  } finally {
    await settings({ siteAppearance: "system", nightVideoBrightness: "soft", disabledSites: [] });
    await popup.close();
    await test.close();
  }
}
