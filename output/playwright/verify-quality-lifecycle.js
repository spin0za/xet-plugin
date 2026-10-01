async (page) => {
  const fixture = await page.context().newPage();
  try {
    await fixture.setContent(`<main>${Array.from({ length: 1500 }, (_, i) =>
      `<div><span>题目${i}</span><span>普通内容</span><button>查看解析</button></div>`).join("")}</main>`);
    for (const path of ["src/content/player-dom.js", "src/content/quality.js"]) {
      await fixture.addScriptTag({ path });
    }
    await fixture.evaluate(() => {
      const modules = __xetPlayerHelperModules;
      window.audit = { fullScans: 0, visibilityReads: 0 };
      const dom = modules.playerDom;
      const instrumented = { ...dom,
        deepElements(scope = document) {
          if (scope === document) audit.fullScans++;
          return dom.deepElements(scope);
        },
        isVisible(node) { audit.visibilityReads++; return dom.isVisible(node); },
      };
      window.controller = modules.quality.createQualityController({
        isEnabled: () => true, notify() {}, playerDom: instrumented,
      });
      controller.start();
    });
    await fixture.waitForTimeout(2600);
    const idle = await fixture.evaluate(() => { controller.stop(); return audit; });
    if (idle.fullScans !== 1 || idle.visibilityReads !== 0) {
      throw new Error(`Idle page still scanned: ${JSON.stringify(idle)}`);
    }

    await fixture.setContent(`<div class="xgplayer"><video></video>
      <button id=current>高清</button><div id=options hidden><button id=target>超清</button></div></div>`);
    // setContent preserves the isolated controller modules in this fixture.
    await fixture.evaluate(() => {
      window.enabled = true;
      window.clicks = 0;
      window.openings = 0;
      document.querySelector("#current").addEventListener("click", () => {
        openings++;
        document.querySelector("#options").hidden = false;
        setTimeout(() => { enabled = false; controller.stop(); }, 40);
      });
      document.querySelector("#target").addEventListener("click", () => {
        clicks++;
        document.querySelector("#current").textContent = "超清";
        document.querySelector("#options").hidden = true;
      });
      controller = __xetPlayerHelperModules.quality.createQualityController({
        isEnabled: () => enabled, notify() {}, playerDom: __xetPlayerHelperModules.playerDom,
      });
      controller.start();
    });
    await fixture.waitForTimeout(350);
    const canceled = await fixture.evaluate(() => ({ clicks, openings }));
    if (canceled.openings !== 1 || canceled.clicks !== 0) {
      throw new Error(`Canceled menu task clicked: ${JSON.stringify(canceled)}`);
    }
    await fixture.evaluate(() => { enabled = true; controller.start(); });
    await fixture.waitForTimeout(300);
    const restarted = await fixture.evaluate(() => { controller.stop(); return clicks; });
    if (restarted !== 1) throw new Error(`Restarted controller clicks: ${restarted}`);
    await fixture.evaluate(() => {
      clicks = 0;
      enabled = true;
      document.querySelector("#options").hidden = true;
      const old = document.querySelector("#current");
      const button = old.cloneNode(true);
      button.textContent = "高清";
      old.replaceWith(button);
      button.addEventListener("click", () => {
        document.querySelector("#options").hidden = false;
        setTimeout(() => { controller.stop(); controller.start(); }, 40);
      });
      controller.start();
    });
    await fixture.waitForTimeout(350);
    const overlappingRestart = await fixture.evaluate(() => { controller.stop(); return clicks; });
    if (overlappingRestart !== 1) throw new Error(`Obsolete task survived restart: ${overlappingRestart}`);
    await fixture.evaluate(() => {
      clicks = 0;
      enabled = true;
      document.querySelector("#options").hidden = true;
      const old = document.querySelector("#current");
      const button = old.cloneNode(true);
      button.textContent = "高清";
      old.replaceWith(button);
      button.style.display = "none";
      button.addEventListener("click", () => { document.querySelector("#options").hidden = false; });
      controller.start();
    });
    await fixture.waitForTimeout(100);
    const revealAt = Date.now();
    await fixture.evaluate(() => { document.querySelector("#current").style.display = "block"; });
    await fixture.waitForFunction(() => clicks === 1, null, { timeout: 1200 });
    const cssRevealLatencyMs = Date.now() - revealAt;
    await fixture.evaluate(() => controller.stop());
    return { idle, canceled, restarted, overlappingRestart, cssRevealLatencyMs };
  } finally { await fixture.close(); }
}
