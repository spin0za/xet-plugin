async (page) => {
  const fixture = await page.context().newPage();
  try {
    await fixture.setContent(`<style>
      .xgplayer { position:relative; width:640px; height:360px; background:#000; }
      video { width:100%;height:100%; } button {padding:8px;}
    </style><div class=xgplayer><video></video><div class=xgplayer-controls>
      <button id=control>暂停</button></div></div><button id=outside>其他操作</button>`);
    await fixture.addStyleTag({ path: "src/content/fullscreen.css" });
    for (const path of ["src/content/player-dom.js", "src/content/player-interactions.js"]) {
      await fixture.addScriptTag({ path });
    }
    await fixture.evaluate(() => {
      const video = document.querySelector("video");
      Object.defineProperty(video, "paused", { get: () => false });
      Object.defineProperty(video, "ended", { get: () => false });
      window.controller = __xetPlayerHelperModules.playerInteractions.createPlayerInteractionController({
        playerDom: __xetPlayerHelperModules.playerDom,
      });
      controller.start();
    });
    await fixture.keyboard.press("Tab");
    await fixture.waitForTimeout(3400);
    const keyboardHeld = await fixture.locator("#control").evaluate((button) =>
      button.matches(":focus-visible") && button.closest(".xgplayer").dataset.xetControlsHidden === "false",
    );
    if (!keyboardHeld) throw new Error("Keyboard-focused player controls disappeared");
    await fixture.keyboard.press("Tab");
    await fixture.waitForTimeout(3400);
    const afterBlur = await fixture.locator(".xgplayer").getAttribute("data-xet-controls-hidden");
    if (afterBlur !== "true") throw new Error("Idle timer did not resume after keyboard focus left");
    await fixture.locator(".xgplayer").hover({ position: { x: 100, y: 100 } });
    await fixture.locator("#control").click();
    await fixture.mouse.move(800, 400);
    await fixture.waitForTimeout(3400);
    const mouseFocusDoesNotPin = await fixture.locator(".xgplayer").getAttribute("data-xet-controls-hidden");
    if (mouseFocusDoesNotPin !== "true") throw new Error(`Mouse-click focus pinned the controls: ${JSON.stringify(await fixture.evaluate(() => ({
      active: document.activeElement.id, keyboard: document.activeElement.matches(":focus-visible"),
      markers: { ...document.querySelector(".xgplayer").dataset },
    })))}`);
    await fixture.evaluate(() => controller.stop());
    return { keyboardHeld, afterBlur, mouseFocusDoesNotPin };
  } finally { await fixture.close(); }
}
