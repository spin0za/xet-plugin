async (page) => {
  const fixture = await page.context().newPage();
  try {
    await fixture.route("https://highest-quality.test/**", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8", body: "<!doctype html><main></main>",
    }));
    await fixture.goto("https://highest-quality.test/lesson/a");
    for (const path of ["src/content/player-dom.js", "src/content/player-interactions.js", "src/content/quality-preference.js", "src/content/quality.js"]) {
      await fixture.addScriptTag({ path });
    }
    await fixture.evaluate(() => {
      window.qualityClicks = [];
      window.notices = [];
      window.addPlayer = (id, options, current = "高清") => {
        const root = document.createElement("div"); root.id = id; root.className = "xgplayer";
        root.innerHTML = `<video style="width:320px;height:180px"></video><div class=xgplayer-definition>
          <button class=current>${current}</button><ul hidden>${options.map(({ label, definition = "", disabled = false }) =>
            `<li tabindex=0 definition="${definition}" ${disabled ? 'aria-disabled="true"' : ""}
            class="${current === label ? "selected" : ""}">${label}</li>`).join("")}</ul></div>`;
        root.querySelector(".current").addEventListener("click", () => { root.querySelector("ul").hidden = false; });
        root.querySelector(".xgplayer-definition").addEventListener("click", (event) => {
          const option = event.target.closest("li"); if (!option) return;
          root.querySelectorAll("li").forEach((item) => item.classList.toggle("selected", item === option));
          root.querySelector(".current").textContent = option.textContent;
          root.querySelector("ul").hidden = true;
          qualityClicks.push({ id, label: option.textContent });
          root.querySelector("video").dispatchEvent(new Event("loadedmetadata"));
        });
        document.querySelector("main").append(root);
      };
      addPlayer("live", [{ label: "高清" }, { label: "超清" }, { label: "原画" }], "超清");
      addPlayer("resolution", [{ label: "高清", definition: "720p" }, { label: "2160P" },
        { label: "超清", definition: "1080p" }, { label: "8K", disabled: true }]);
      addPlayer("hd-only", [{ label: "标清" }, { label: "高清" }, { label: "自动" }], "标清");
      addPlayer("metadata", [{ label: "蓝光", definition: "720p" }, { label: "超清", definition: "1080p" }], "蓝光");
      addPlayer("delayed", [{ label: "高清" }, { label: "超清" }]);
      const generic = document.createElement("div"); generic.className = "xgplayer"; generic.id = "generic";
      generic.innerHTML = `<video style="width:320px;height:180px"></video><div class=controls>
        <button id=genericCurrent>超清</button></div><div id=genericOptions role=menu style="width:120px" hidden>
        <div id=genericHD role=menuitem tabindex=0>高清</div><div id=genericUHD role=menuitem tabindex=0>超清</div>
        <div id=genericOriginal role=menuitem tabindex=0>原画</div></div>`;
      document.querySelector("main").append(generic);
      genericCurrent.addEventListener("click", () => { genericOptions.hidden = false; });
      genericOptions.addEventListener("click", (event) => {
        if (!event.target.matches('[role="menuitem"]')) return;
        genericCurrent.textContent = event.target.textContent; genericOptions.hidden = true;
        qualityClicks.push({ id: "generic", label: event.target.textContent });
      });
      localStorage.setItem("test_definitionType", "超清");
      window.controller = __xetPlayerHelperModules.quality.createQualityController({
        isEnabled: () => true, notify: (text) => notices.push(text), playerDom: __xetPlayerHelperModules.playerDom,
      });
      window.interactions = __xetPlayerHelperModules.playerInteractions.createPlayerInteractionController({
        playerDom: __xetPlayerHelperModules.playerDom,
      });
      interactions.start();
      controller.start();
    });
    await fixture.waitForFunction(() => document.querySelector("#live .selected").textContent === "原画" &&
      document.querySelector("#resolution .selected").textContent === "2160P" &&
      document.querySelector("#hd-only .selected").textContent === "高清" &&
      document.querySelector("#metadata .selected").textContent === "超清" &&
      document.querySelector("#genericCurrent").textContent === "原画");
    await fixture.evaluate(() => {
      const option = document.createElement("li"); option.textContent = "原画";
      document.querySelector("#delayed ul").append(option);
    });
    await fixture.waitForFunction(() => document.querySelector("#delayed .selected").textContent === "原画");
    await fixture.locator("#live .current").click();
    await fixture.locator("#live li").filter({ hasText: /^高清$/ }).click();
    await fixture.locator("#genericCurrent").click();
    await fixture.locator("#genericHD").click();
    await fixture.evaluate(() => controller.wake());
    await fixture.waitForTimeout(300);
    if (await fixture.locator("#live .selected").textContent() !== "高清" ||
        await fixture.locator("#genericCurrent").textContent() !== "高清") {
      throw new Error("Highest-quality default overrode a manual choice");
    }
    const count = await fixture.evaluate(() => qualityClicks.filter((item) => item.id === "generic").length);
    await fixture.evaluate(() => { history.pushState({}, "", "/lesson/b"); controller.wake(); });
    await fixture.waitForFunction(() => document.querySelector("#live .selected").textContent === "原画" &&
      document.querySelector("#genericCurrent").textContent === "原画");
    await fixture.evaluate(() => controller.wake());
    await fixture.waitForTimeout(350);
    const repeated = await fixture.evaluate(() => ({
      count: qualityClicks.filter((item) => item.id === "generic").length,
      menuHidden: genericOptions.hidden, notices,
    }));
    if (repeated.count !== count + 1 || !repeated.menuHidden) throw new Error("Highest menu keeps opening/clicking after selection");
    if (!repeated.notices.some((text) => text.includes("原画"))) throw new Error("Toast still hardcodes UHD");
    await fixture.evaluate(() => { controller.stop(); interactions.stop(); });
    return { original: true, explicitResolution: true, disabledSkipped: true, highestHD: true,
      metadata: true, delayedOriginal: true, genericMenu: true, manualOverride: true,
      nextLesson: true, noRepeatedMenuOpen: true };
  } finally { await fixture.close(); }
}
