async (page) => {
  const fixture = await page.context().newPage();
  try {
    await fixture.setContent(`<!doctype html><style>
      .pc-live-player, .xgplayer {width:640px;height:360px}video{width:100%;height:90%}
      .speed-control {display:none}.selector_item.active {color:blue}
      #vod, #native {display:none}
    </style><div id=liveRoot class=pc-live-player><video id=live></video><div class=speed-btn>
      <div id=liveLabel>1.0X</div><div class=speed-control>
        ${[2, 1.5, 1.25, 1, 0.75].map(rate => `<div class="selector_item ${rate === 1 ? "active" : ""}" data-rate="${rate}">${rate}X</div>`).join("")}
      </div></div></div>
      <div id=vod class=xgplayer><video id=vodVideo></video><div class=xgplayer-playbackrate><span id=vodLabel>1x</span><ul>
        ${[3, 2.5, 2, 1.75, 1.5, 1.25, 1, 0.75, 0.5].map(rate => `<li data-rate="${rate}">${rate}x</li>`).join("")}
      </ul></div></div><video id=native controls></video><input id=notes>`);
    await fixture.evaluate(() => {
      window.liveRateState = 1;
      for (const item of document.querySelectorAll(".selector_item")) item.addEventListener("click", () => {
        const next = Number(item.dataset.rate);
        if (liveRateState === next) return; // Same guard as the merchant's Vue control.
        liveRateState = live.playbackRate = next;
        liveLabel.textContent = `${next}X`;
        document.querySelectorAll(".selector_item").forEach(el => el.classList.toggle("active", el === item));
      });
      for (const item of document.querySelectorAll(".xgplayer-playbackrate li")) item.addEventListener("click", () => {
        vodVideo.playbackRate = Number(item.dataset.rate);
        vodLabel.textContent = item.textContent;
        document.querySelectorAll(".xgplayer-playbackrate li").forEach(el => el.classList.toggle("selected", el === item));
      });
    });
    for (const path of ["src/content/player-dom.js", "src/content/media-shortcuts.js"]) await fixture.addScriptTag({ path });
    await fixture.evaluate(() => {
      window.controller = __xetPlayerHelperModules.mediaShortcuts.createShortcutController({
        playerDom: __xetPlayerHelperModules.playerDom, fullscreen: { isWebFullscreen: () => false },
      });
      controller.start();
    });
    const assertLiveRate = async (rate) => {
      const state = await fixture.evaluate(() => ({
        actual: live.playbackRate, sdk: liveRateState, label: Number(liveLabel.textContent.replace(/x/i, "")),
        active: Number(document.querySelector(".selector_item.active").dataset.rate),
      }));
      if (Object.values(state).some(value => value !== rate)) throw new Error(`Live rate mismatch: ${JSON.stringify(state)}`);
    };
    await fixture.keyboard.press("Shift+Period"); await assertLiveRate(1.25);
    await fixture.keyboard.press("Shift+Period"); await assertLiveRate(1.5);
    await fixture.keyboard.press("Shift+Period"); await assertLiveRate(2);
    await fixture.keyboard.press("Shift+Period"); await assertLiveRate(2);
    await fixture.keyboard.press("Shift+Comma"); await assertLiveRate(1.5);
    // Open the actual menu and use a trusted mouse click, then keyboard again.
    await fixture.locator(".speed-control").evaluate(el => el.style.display = "block");
    await fixture.locator('.selector_item[data-rate="0.75"]').click(); await assertLiveRate(0.75);
    await fixture.keyboard.press("Shift+Comma"); await assertLiveRate(0.75);
    await fixture.keyboard.press("Shift+Period"); await assertLiveRate(1);
    await fixture.evaluate(() => { live.playbackRate = 1.25; }); // Reproduce an old stale native-only shortcut.
    await fixture.keyboard.press("Shift+Comma"); await assertLiveRate(1);
    await fixture.locator("#notes").focus();
    await fixture.keyboard.press("Shift+Period"); await assertLiveRate(1);
    await fixture.evaluate(() => { document.activeElement.blur(); liveRoot.style.display = "none"; vod.style.display = "block"; });
    await fixture.keyboard.press("Shift+Period");
    if (await fixture.evaluate(() => vodVideo.playbackRate !== 1.25 || vodLabel.textContent !== "1.25x")) {
      throw new Error("xgplayer menu did not synchronize");
    }
    await fixture.evaluate(() => { vod.style.display = "none"; native.style.display = "block"; });
    await fixture.keyboard.press("Shift+Period");
    if (await fixture.evaluate(() => native.playbackRate) !== 1.25) throw new Error("Native fallback failed");
    await fixture.evaluate(() => controller.stop());
    await fixture.keyboard.press("Shift+Period");
    if (await fixture.evaluate(() => native.playbackRate) !== 1.25) throw new Error("Disabled shortcut still ran");
    return { liveRateAndLabel: true, selectedOption: true, actualMenuSteps: true, bidirectional: true,
      staleActiveOption: true, editableSafe: true, xgplayer: true, nativeFallback: true, disabled: true };
  } finally { await fixture.close(); }
}
