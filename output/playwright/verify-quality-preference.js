async (page) => {
  const fixture = await page.context().newPage();
  const check = async (id, expected) => {
    const selected = await fixture.locator(`#${id} .selected`).textContent();
    if (selected !== expected) throw new Error(`${id}: expected ${expected}, received ${selected}`);
  };
  try {
    await fixture.route("https://quality-choice.test/**", (route) => route.fulfill({
      contentType: "text/html", body: "<!doctype html><main></main>",
    }));
    await fixture.goto("https://quality-choice.test/course/a");
    for (const path of ["src/content/player-dom.js", "src/content/quality-preference.js", "src/content/media-shortcuts.js", "src/content/quality.js"]) {
      await fixture.addScriptTag({ path });
    }
    await fixture.evaluate(() => {
      window.qualityClicks = [];
      window.addPlayer = (id, legacy = false) => {
        const root = document.createElement("div"); root.id = id; root.className = "xgplayer";
        root.innerHTML = `<video style="width:400px;height:225px"></video><div class=xgplayer-definition>
          <button class=current>高清</button><ul>
            <li tabindex=0 ${legacy ? 'cname="超清1080P"' : 'definition="1080p"'}>超清</li>
            <li tabindex=0 class=selected ${legacy ? 'cname="高清720P"' : 'definition="720p"'}>高清</li>
          </ul></div>`;
        root.querySelector(".xgplayer-definition").addEventListener("click", (event) => {
          const option = event.target.closest("li"); if (!option) return;
          root.querySelectorAll("li").forEach((item) => item.classList.toggle("selected", item === option));
          root.querySelector(".current").textContent = option.textContent;
          qualityClicks.push({ id, label: option.textContent, trusted: event.isTrusted });
          const video = root.querySelector("video");
          // A quality choice causes exactly the same source events as loading.
          for (const type of ["emptied", "loadstart", "loadedmetadata", "canplay"]) video.dispatchEvent(new Event(type));
        });
        root.addEventListener("keydown", (event) => {
          if (["Enter", " "].includes(event.key) && event.target.matches("li")) {
            event.preventDefault(); event.target.click();
          }
        });
        document.querySelector("main").append(root);
        return root;
      };
      addPlayer("first"); addPlayer("second", true);
      window.shortcuts = __xetPlayerHelperModules.mediaShortcuts.createShortcutController({
        fullscreen: {}, playerDom: __xetPlayerHelperModules.playerDom,
      });
      shortcuts.start();
      window.controller = __xetPlayerHelperModules.quality.createQualityController({
        isEnabled: () => true, notify() {}, playerDom: __xetPlayerHelperModules.playerDom,
      });
      controller.start();
    });
    await fixture.waitForFunction(() => document.querySelector("#first .selected").textContent === "超清");
    // Normal menu opening must not hand ownership to the user.
    await fixture.locator("#first .current").click();
    await fixture.evaluate(() => document.querySelector('#first li[definition="720p"]').click());
    await fixture.waitForFunction(() => document.querySelector("#first .selected").textContent === "超清");
    await fixture.locator('#first li[definition="720p"]').click();
    await fixture.waitForTimeout(200);
    await check("first", "高清");
    // An unrelated player's default remains active after the first is manual.
    await fixture.waitForFunction(() => document.querySelector("#second .selected").textContent === "超清");
    await fixture.locator('#second li[cname="高清720P"]').press("Enter");
    await fixture.waitForTimeout(100);
    await check("second", "高清");
    await fixture.evaluate(() => {
      controller.wake();
      const video = document.querySelector("#first video"); video.src = "#720p";
      video.dispatchEvent(new Event("play"));
    });
    await fixture.waitForTimeout(200);
    await check("first", "高清");
    // Generic buttons: keyboard input can be forwarded as a synthetic click.
    await fixture.evaluate(() => {
      const root = document.createElement("div"); root.id = "generic"; root.className = "xgplayer";
      root.innerHTML = `<video style="width:400px;height:225px"></video><button id=current>高清</button>
        <div id=options hidden><button id=ultra>超清</button><button id=hd>高清</button></div>`;
      document.querySelector("main").append(root);
      current.addEventListener("click", () => { options.hidden = false; });
      for (const button of [ultra, hd]) button.addEventListener("click", () => {
        current.textContent = button.textContent; options.hidden = true;
        window.genericClicks = (window.genericClicks || []).concat(button.textContent);
      });
    });
    await fixture.waitForFunction(() => window.genericClicks?.includes("超清"));
    await fixture.locator("#current").click();
    await fixture.locator("#hd").press("Space");
    await fixture.waitForTimeout(200);
    if (await fixture.locator("#current").textContent() !== "高清") throw new Error("Keyboard manual choice was overridden");
    // Wait through the real idle retry, not just immediate mutation callbacks.
    await fixture.waitForTimeout(15500);
    await check("first", "高清");
    if (await fixture.locator("#current").textContent() !== "高清") throw new Error("Idle retry overrode manual quality");
    // Reset ownership on a new lesson even when the SDK reuses the same root.
    await fixture.evaluate(() => { history.pushState({}, "", "/course/b"); controller.wake(); });
    await fixture.waitForFunction(() => document.querySelector("#first .selected").textContent === "超清");
    // Cancel the 160 ms generic-menu task while it is still settling.
    await fixture.evaluate(() => {
      controller.stop();
      document.querySelectorAll(".xgplayer").forEach((root) => root.remove());
      const root = document.createElement("div"); root.id = "pending"; root.className = "xgplayer";
      root.innerHTML = `<video style="width:400px;height:225px"></video><button id=loadingCurrent>高清</button>
        <div id=loadingOptions hidden><button id=loadingUltra>超清</button><button id=loadingHd>高清</button></div>`;
      document.querySelector("main").append(root);
      loadingCurrent.addEventListener("click", () => { loadingOptions.hidden = false; });
      window.pendingClicks = 0;
      loadingUltra.addEventListener("click", () => { pendingClicks++; });
      loadingHd.addEventListener("click", () => { loadingCurrent.textContent = "高清"; });
      controller.start();
    });
    await fixture.waitForFunction(() => !loadingOptions.hidden, null, { polling: 5 });
    await fixture.locator("#loadingHd").click();
    await fixture.waitForTimeout(350);
    if (await fixture.evaluate(() => pendingClicks) !== 0) throw new Error("Pending auto task overrode manual selection");
    await fixture.evaluate(() => { controller.stop(); shortcuts.stop(); });
    return { mouseSelection: true, keyboardSelection: true, sourceReload: true, perPlayer: true, idleRetry: true, nextLesson: true, pendingTaskCanceled: true };
  } finally { await fixture.close(); }
}
