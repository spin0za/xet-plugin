async (page) => {
  // Real extension, owned merchant documents only. Hold child responses to
  // reproduce the src/initial-about:blank mismatch shown in Chrome's error UI.
  const worker = page.context().serviceWorkers().find((entry) => entry.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in a fresh persistent test profile first");
  const fixture = await page.context().newPage();
  const browserLog = await page.context().newCDPSession(fixture);
  const errors = [];
  // Origin-mismatch diagnostics use Chrome's browser Log domain rather
  // than console.error / Runtime.consoleAPICalled. Watch both surfaces.
  browserLog.on("Log.entryAdded", ({ entry }) => {
    if (/postMessage|target origin/i.test(entry.text)) errors.push(entry.text);
  });
  await browserLog.send("Log.enable");
  fixture.on("console", (message) => {
    if (message.type() === "error" && /postMessage|target origin/i.test(message.text())) errors.push(message.text());
  });
  fixture.on("pageerror", (error) => errors.push(error.message));
  let releaseLoad;
  const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
  const parentOrigin = "https://merchant.pc.xiaoe-tech.com";
  const html = `<!doctype html><style>html,body{margin:0;height:100%}
    .xgplayer{position:relative;width:100%;height:100%}</style>
    <div class=xgplayer><video></video><div class=xgplayer-controls>Original controls</div></div>`;
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.setViewportSize({ width: 1280, height: 900 });
    await fixture.route(`${parentOrigin}/**`, (route) => route.fulfill({
      contentType: "text/html", body: "<!doctype html><style>body{margin:0;padding:20px}</style><div id=questions></div>",
    }));
    await fixture.route("https://iframe.xiaoeknow.com/**", async (route) => {
      if (route.request().url().endsWith("/slow")) await loadGate;
      if (route.request().url().endsWith("/redirect")) {
        // Client navigation keeps iframe.src on the old origin, just like
        // embedded player redirects. Each document remains an owned fixture.
        await route.fulfill({ contentType: "text/html",
          body: '<!doctype html><script>location.replace("https://player.eapps.cn/final")</script>' });
      } else await route.fulfill({ contentType: "text/html", body: html });
    });
    await fixture.route("https://player.eapps.cn/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await fixture.goto(`${parentOrigin}/p/t_pc/pc_evaluation/practice_analysis/fixture`);
    await fixture.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-layout"));

    await fixture.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.id = "slow";
      frame.className = "xiaoe-iframe-video";
      frame.src = "https://iframe.xiaoeknow.com/slow";
      document.querySelector("#questions").append(frame);
    });
    await fixture.waitForFunction(() => document.querySelector("#slow").getBoundingClientRect().width === 960);
    // Wait for two rAFs and delivery of bootstrap messages while the frame
    // still contains its inherited-origin initial document.
    await fixture.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await fixture.waitForTimeout(150);
    if (errors.length) throw new Error(`Initial blank frame errors: ${errors.join("; ")}`);
    releaseLoad();
    const waitEmbed = async (url) => {
      const child = fixture.frames().find((entry) => entry.url() === url) ||
        await fixture.waitForEvent("framenavigated", { predicate: (frame) => frame.url() === url, timeout: 15000 });
      await child.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-embed"));
      return child;
    };
    const slow = await waitEmbed("https://iframe.xiaoeknow.com/slow");
    await fixture.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.id = "redirect";
      frame.className = "xiaoe-iframe-video";
      frame.src = "https://iframe.xiaoeknow.com/redirect";
      document.querySelector("#questions").append(frame);
    });
    const redirected = await waitEmbed("https://player.eapps.cn/final");

    // Forged sibling/window messages cannot set a preview flag on another
    // document or replace the parent's established channel.
    await fixture.evaluate(() => {
      window.postMessage({ type: "xet:analysis-frame", active: true }, "*");
      const channel = new MessageChannel();
      window.postMessage({ type: "xet:analysis-frame-ready" }, "*", [channel.port2]);
      channel.port1.close();
    });
    await fixture.waitForTimeout(100);
    if (await fixture.evaluate(() => document.documentElement.hasAttribute("data-xet-analysis-embed"))) {
      throw new Error("Unrelated message affected the parent");
    }

    await fixture.evaluate(() => history.pushState({}, "", "/course/portrait"));
    await slow.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-embed"));
    await redirected.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-embed"));
    await fixture.evaluate(() => history.pushState({}, "", "/p/t_pc/pc_evaluation/practice_sheet/fixture"));
    await slow.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-embed"));
    await redirected.waitForFunction(() => document.documentElement.hasAttribute("data-xet-analysis-embed"));

    await fixture.evaluate(() => { document.querySelector("#slow").src = "https://iframe.xiaoeknow.com/replaced"; });
    const replaced = await waitEmbed("https://iframe.xiaoeknow.com/replaced");
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: ["https://merchant.pc.xiaoe-tech.com"] }));
    await replaced.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-embed"));
    await redirected.waitForFunction(() => !document.documentElement.hasAttribute("data-xet-analysis-embed"));
    if (errors.length) throw new Error(`Iframe communication errors: ${errors.join("; ")}`);
    return { delayedLoad: true, redirect: true, navigation: true, routeRestore: true, forgedMessagesIgnored: true,
      siteDisable: true, originMismatchErrors: errors.length };
  } finally {
    releaseLoad();
    await browserLog.detach();
    await fixture.close();
  }
}
