async (page) => {
  const extensionScript = "src/content.js";

  async function installChromeStub(targetPage) {
    await targetPage.evaluate(() => {
      window.chrome = {
        runtime: {
          sendMessage: async () => ({ enabled: true, disabledHosts: [] }),
        },
        storage: {
          local: {
            get: async () => ({ enabled: true, disabledHosts: [] }),
          },
          onChanged: {
            addListener() {},
          },
        },
      };
    });
  }

  async function verifyLegacyPlayer(targetPage) {
    await targetPage.setContent(`
      <style>
        video { display: block; width: 800px; height: 450px; }
        .xgplayer-definition { width: 60px; height: 150px; }
        .xgplayer-definition ul { display: none; }
      </style>
      <video></video>
      <div class="xgplayer-definition">
        <ul>
          <li cname="超清1080P">超清1080P</li>
          <li class="selected" cname="高清720P">高清720P</li>
        </ul>
        <p class="name name-wrapper">高清</p>
      </div>
      <script>
        document.querySelector(".xgplayer-definition").addEventListener(
          "click",
          (event) => {
            const item = event.target.closest("li");
            if (!item) return;
            document.querySelectorAll("li").forEach((node) =>
              node.classList.toggle("selected", node === item)
            );
            document.querySelector(".name").textContent =
              item.getAttribute("cname").slice(0, 2);
            window.__selectedQuality = item.getAttribute("cname");
          }
        );
      </script>
    `);
    await installChromeStub(targetPage);
    await targetPage.addScriptTag({ path: extensionScript });
    await targetPage.waitForFunction(
      () => window.__selectedQuality === "超清1080P",
    );
    return targetPage.evaluate(() => window.__selectedQuality);
  }

  async function verifyCurrentPlayer(targetPage) {
    await targetPage.setContent(`
      <style>
        video { display: block; width: 800px; height: 450px; }
        .xgplayer-definition { display: block; width: 60px; height: 40px; }
        .xg-options-list { opacity: 0; }
      </style>
      <video></video>
      <xg-icon class="xgplayer-definition">
        <div class="xgplayer-icon"><span class="icon-text">高清</span></div>
        <ul class="xg-options-list">
          <li class="option-item" definition="1080p"><span>超清</span></li>
          <li class="option-item selected" definition="720p">
            <span>高清</span>
          </li>
        </ul>
      </xg-icon>
      <script>
        document.querySelector(".xg-options-list").addEventListener(
          "click",
          (event) => {
            const item = event.target.closest("li");
            if (!item) return;
            document.querySelectorAll("li").forEach((node) =>
              node.classList.toggle("selected", node === item)
            );
            document.querySelector(".icon-text").textContent =
              item.textContent.trim();
            window.__selectedQuality = item.getAttribute("definition");
          }
        );
      </script>
    `);
    await installChromeStub(targetPage);
    await targetPage.addScriptTag({ path: extensionScript });
    await targetPage.waitForFunction(
      () => window.__selectedQuality === "1080p",
    );
    return targetPage.evaluate(() => window.__selectedQuality);
  }

  async function verifyImmediateDuringMutationStorm(targetPage) {
    await targetPage.setContent(`
      <style>
        video { display: block; width: 800px; height: 450px; }
        .xgplayer-definition { display: block; width: 60px; height: 40px; }
        .xg-options-list { opacity: 0; }
      </style>
      <video></video>
      <div id="player"></div>
      <div id="busy-region"></div>
    `);
    await installChromeStub(targetPage);
    await targetPage.addScriptTag({ path: extensionScript });

    await targetPage.evaluate(() => {
      const busyRegion = document.querySelector("#busy-region");
      const mutationTimer = setInterval(() => {
        const marker = document.createElement("i");
        busyRegion.replaceChildren(marker);
      }, 10);
      setTimeout(() => clearInterval(mutationTimer), 2_000);

      setTimeout(() => {
        window.__optionInsertedAt = performance.now();
        document.querySelector("#player").innerHTML = `
          <xg-icon class="xgplayer-definition">
            <div class="xgplayer-icon">
              <span class="icon-text">高清</span>
            </div>
            <ul class="xg-options-list">
              <li class="option-item" definition="1080p">
                <span>超清</span>
              </li>
              <li class="option-item selected" definition="720p">
                <span>高清</span>
              </li>
            </ul>
          </xg-icon>
        `;
        document
          .querySelector(".xg-options-list")
          .addEventListener("click", (event) => {
            const item = event.target.closest("li");
            if (item?.getAttribute("definition") === "1080p") {
              window.__selectedAt = performance.now();
            }
          });
      }, 100);
    });

    await targetPage.waitForFunction(() => window.__selectedAt);
    const latencyMs = await targetPage.evaluate(
      () => window.__selectedAt - window.__optionInsertedAt,
    );
    if (latencyMs >= 500) {
      throw new Error(`Selection took ${latencyMs.toFixed(1)}ms`);
    }
    return Math.round(latencyMs);
  }

  async function verifyFullscreenShortcuts(targetPage) {
    await targetPage.setContent(`
      <style>
        .xgplayer-skin-default {
          display: block;
          width: 800px;
          height: 450px;
        }
        video { display: block; width: 800px; height: 450px; }
      </style>
      <div class="xgplayer-skin-default">
        <video></video>
        <button class="xgplayer-fullscreen" type="button"></button>
        <button class="xgplayer-cssfullscreen" type="button"></button>
      </div>
      <input id="notes" />
      <script>
        window.__nativeClicks = 0;
        window.__webClicks = 0;
        window.__builtInArrowEvents = 0;
        window.__builtInSpeedEvents = 0;
        window.__escapePassThroughEvents = 0;
        const player = document.querySelector(".xgplayer-skin-default");
        const video = player.querySelector("video");
        let currentTime = 50;
        let paused = true;
        let playbackRate = 1;
        Object.defineProperties(video, {
          currentTime: {
            configurable: true,
            get: () => currentTime,
            set: (value) => { currentTime = value; },
          },
          duration: {
            configurable: true,
            get: () => 120,
          },
          paused: {
            configurable: true,
            get: () => paused,
          },
          ended: {
            configurable: true,
            get: () => false,
          },
          playbackRate: {
            configurable: true,
            get: () => playbackRate,
            set: (value) => { playbackRate = value; },
          },
        });
        video.play = () => {
          paused = false;
          return Promise.resolve();
        };
        video.pause = () => { paused = true; };
        document.addEventListener("keydown", (event) => {
          if (event.target.closest?.("input, textarea, [contenteditable]")) return;
          if (event.key === "ArrowLeft") {
            window.__builtInArrowEvents++;
            video.currentTime -= 15;
          }
          if (event.key === "ArrowRight") {
            window.__builtInArrowEvents++;
            video.currentTime += 15;
          }
          if (event.key === "<" || event.key === ">") {
            window.__builtInSpeedEvents++;
          }
          if (event.key === "Escape") {
            window.__escapePassThroughEvents++;
          }
        });
        document
          .querySelector(".xgplayer-fullscreen")
          .addEventListener("click", () => {
            window.__nativeClicks++;
            // Reproduce xgplayer's old behavior: the first native-fullscreen
            // click while in web fullscreen only exits web fullscreen.
            if (player.classList.contains("xgplayer-is-cssfullscreen")) {
              player.classList.remove("xgplayer-is-cssfullscreen");
              return;
            }
            player.classList.toggle("xgplayer-is-fullscreen");
          });
        document
          .querySelector(".xgplayer-cssfullscreen")
          .addEventListener("click", () => {
            window.__webClicks++;
            if (player.classList.contains("xgplayer-is-fullscreen")) {
              player.classList.remove("xgplayer-is-fullscreen");
              return;
            }
            player.classList.toggle("xgplayer-is-cssfullscreen");
          });
      </script>
    `);
    await installChromeStub(targetPage);
    await targetPage.addScriptTag({ path: extensionScript });

    // Ordinary on/off behavior.
    await targetPage.keyboard.press("f");
    await targetPage.keyboard.press("f");
    await targetPage.keyboard.press("t");
    await targetPage.keyboard.press("t");

    // Web -> native must finish in native mode with one F press.
    await targetPage.keyboard.press("t");
    await targetPage.keyboard.press("f");
    const webToNative = await targetPage.evaluate(() => ({
      native: document
        .querySelector(".xgplayer-skin-default")
        .classList.contains("xgplayer-is-fullscreen"),
      web: document
        .querySelector(".xgplayer-skin-default")
        .classList.contains("xgplayer-is-cssfullscreen"),
    }));

    // Native -> web must finish in web mode with one T press.
    await targetPage.keyboard.press("t");
    await targetPage.waitForTimeout(50);
    const nativeToWeb = await targetPage.evaluate(() => ({
      native: document
        .querySelector(".xgplayer-skin-default")
        .classList.contains("xgplayer-is-fullscreen"),
      web: document
        .querySelector(".xgplayer-skin-default")
        .classList.contains("xgplayer-is-cssfullscreen"),
    }));

    // Escape must exit web fullscreen, then pass through normally when web
    // fullscreen is no longer active.
    await targetPage.keyboard.press("Escape");
    const webAfterEscape = await targetPage.$eval(
      ".xgplayer-skin-default",
      (player) => player.classList.contains("xgplayer-is-cssfullscreen"),
    );

    // T must also exit web fullscreen when an editable element has focus.
    await targetPage.keyboard.press("t");
    await targetPage.locator("#notes").focus();
    await targetPage.keyboard.press("t");
    const webAfterFocusedT = await targetPage.$eval(
      ".xgplayer-skin-default",
      (player) => player.classList.contains("xgplayer-is-cssfullscreen"),
    );
    await targetPage.evaluate(() => document.activeElement.blur());

    // Escape must likewise exit while an editable element has focus.
    await targetPage.keyboard.press("t");
    await targetPage.locator("#notes").focus();
    await targetPage.keyboard.press("Escape");
    const webAfterFocusedEscape = await targetPage.$eval(
      ".xgplayer-skin-default",
      (player) => player.classList.contains("xgplayer-is-cssfullscreen"),
    );
    await targetPage.evaluate(() => document.activeElement.blur());
    await targetPage.keyboard.press("Escape");

    // Media navigation shortcuts.
    await targetPage.keyboard.press("ArrowLeft");
    const afterLeft = await targetPage.$eval("video", (video) => video.currentTime);
    await targetPage.keyboard.press("ArrowRight");
    const afterRight = await targetPage.$eval("video", (video) => video.currentTime);
    await targetPage.keyboard.press("j");
    const afterJ = await targetPage.$eval("video", (video) => video.currentTime);
    await targetPage.keyboard.press("l");
    const afterL = await targetPage.$eval("video", (video) => video.currentTime);
    await targetPage.keyboard.press("k");
    const afterFirstK = await targetPage.$eval("video", (video) => video.paused);
    await targetPage.keyboard.press("k");
    const afterSecondK = await targetPage.$eval("video", (video) => video.paused);
    await targetPage.keyboard.press("Shift+Comma");
    const afterLessThan = await targetPage.$eval(
      "video",
      (video) => video.playbackRate,
    );
    await targetPage.keyboard.press("Shift+Period");
    const afterGreaterThan = await targetPage.$eval(
      "video",
      (video) => video.playbackRate,
    );
    await targetPage.$eval("video", (video) => { video.playbackRate = 2; });
    await targetPage.keyboard.press("Shift+Period");
    const afterTwo = await targetPage.$eval(
      "video",
      (video) => video.playbackRate,
    );
    await targetPage.keyboard.press("Shift+Period");
    await targetPage.keyboard.press("Shift+Period");
    const atUpperLimit = await targetPage.$eval(
      "video",
      (video) => video.playbackRate,
    );
    await targetPage.$eval("video", (video) => { video.playbackRate = 0.5; });
    await targetPage.keyboard.press("Shift+Comma");
    const atLowerLimit = await targetPage.$eval(
      "video",
      (video) => video.playbackRate,
    );
    await targetPage.$eval("video", (video) => { video.playbackRate = 1; });

    await targetPage.locator("#notes").focus();
    await targetPage.keyboard.press("f");
    await targetPage.keyboard.press("t");
    await targetPage.keyboard.press("ArrowLeft");
    await targetPage.keyboard.press("j");
    await targetPage.keyboard.press("k");
    await targetPage.keyboard.press("Shift+Comma");
    await targetPage.keyboard.press("Shift+Period");

    const result = await targetPage.evaluate(() => ({
      nativeClicks: window.__nativeClicks,
      webClicks: window.__webClicks,
      builtInArrowEvents: window.__builtInArrowEvents,
      builtInSpeedEvents: window.__builtInSpeedEvents,
      escapePassThroughEvents: window.__escapePassThroughEvents,
      currentTime: document.querySelector("video").currentTime,
      paused: document.querySelector("video").paused,
      playbackRate: document.querySelector("video").playbackRate,
    }));
    if (
      !webToNative.native ||
      webToNative.web ||
      nativeToWeb.native ||
      !nativeToWeb.web ||
      webAfterEscape ||
      webAfterFocusedT ||
      webAfterFocusedEscape ||
      result.nativeClicks !== 4 ||
      result.webClicks !== 10 ||
      result.builtInArrowEvents !== 0 ||
      result.builtInSpeedEvents !== 0 ||
      result.escapePassThroughEvents !== 1 ||
      afterLeft !== 45 ||
      afterRight !== 50 ||
      afterJ !== 40 ||
      afterL !== 50 ||
      afterFirstK !== false ||
      afterSecondK !== true ||
      afterLessThan !== 0.75 ||
      afterGreaterThan !== 1 ||
      afterTwo !== 2.5 ||
      atUpperLimit !== 3 ||
      atLowerLimit !== 0.5 ||
      result.currentTime !== 50 ||
      result.paused !== true ||
      result.playbackRate !== 1
    ) {
      throw new Error(`Unexpected shortcut result: ${JSON.stringify(result)}`);
    }
    return {
      ...result,
      webToNative,
      nativeToWeb,
      webAfterEscape,
      webAfterFocusedT,
      webAfterFocusedEscape,
      media: {
        afterLeft,
        afterRight,
        afterJ,
        afterL,
        afterFirstK,
        afterSecondK,
        afterLessThan,
        afterGreaterThan,
        afterTwo,
        atUpperLimit,
        atLowerLimit,
      },
    };
  }

  async function verifyNativeVideoShortcuts(targetPage) {
    await targetPage.setContent(`
      <style>
        article { width: 720px; padding: 24px; }
        video { display: block; width: 540px; height: 304px; }
      </style>
      <article id="task-card">
        <h1>打卡课程</h1>
        <video controls></video>
      </article>
      <script>
        const card = document.querySelector("#task-card");
        const video = card.querySelector("video");
        let currentTime = 50;
        let paused = true;
        let playbackRate = 1;
        Object.defineProperties(video, {
          currentTime: {
            configurable: true,
            get: () => currentTime,
            set: (value) => { currentTime = value; },
          },
          duration: {
            configurable: true,
            get: () => 120,
          },
          paused: {
            configurable: true,
            get: () => paused,
          },
          ended: {
            configurable: true,
            get: () => false,
          },
          playbackRate: {
            configurable: true,
            get: () => playbackRate,
            set: (value) => { playbackRate = value; },
          },
        });
        video.play = () => {
          paused = false;
          return Promise.resolve();
        };
        video.pause = () => { paused = true; };
        video.requestFullscreen = () => {
          window.__fullscreenTarget = "VIDEO";
          return Promise.resolve();
        };
        card.requestFullscreen = () => {
          window.__fullscreenTarget = "ARTICLE";
          return Promise.resolve();
        };
      </script>
    `);
    await installChromeStub(targetPage);
    await targetPage.addScriptTag({ path: extensionScript });

    await targetPage.keyboard.press("ArrowLeft");
    await targetPage.keyboard.press("ArrowRight");
    await targetPage.keyboard.press("j");
    await targetPage.keyboard.press("l");
    await targetPage.keyboard.press("k");
    await targetPage.keyboard.press("Shift+Period");
    await targetPage.keyboard.press("f");

    const afterMediaAndNative = await targetPage.evaluate(() => {
      const video = document.querySelector("video");
      return {
        currentTime: video.currentTime,
        paused: video.paused,
        playbackRate: video.playbackRate,
        fullscreenTarget: window.__fullscreenTarget,
      };
    });

    await targetPage.keyboard.press("t");
    const webOn = await targetPage.$eval(
      "video",
      (video) =>
        video.dataset.xetWebFullscreen === "true" &&
        video.style.position === "fixed",
    );
    await targetPage.keyboard.press("Escape");
    const webOffWithEscape = await targetPage.$eval(
      "video",
      (video) =>
        !video.dataset.xetWebFullscreen && video.style.position !== "fixed",
    );
    await targetPage.keyboard.press("t");
    await targetPage.keyboard.press("t");
    const webOffWithT = await targetPage.$eval(
      "video",
      (video) =>
        !video.dataset.xetWebFullscreen && video.style.position !== "fixed",
    );
    const cardUntouched = await targetPage.$eval(
      "#task-card",
      (card) =>
        !card.dataset.xetWebFullscreen && card.style.position !== "fixed",
    );

    if (
      afterMediaAndNative.currentTime !== 50 ||
      afterMediaAndNative.paused !== false ||
      afterMediaAndNative.playbackRate !== 1.25 ||
      afterMediaAndNative.fullscreenTarget !== "VIDEO" ||
      !webOn ||
      !webOffWithEscape ||
      !webOffWithT ||
      !cardUntouched
    ) {
      throw new Error(
        `Unexpected native-video result: ${JSON.stringify({
          ...afterMediaAndNative,
          webOn,
          webOffWithEscape,
          webOffWithT,
          cardUntouched,
        })}`,
      );
    }

    return {
      ...afterMediaAndNative,
      webOn,
      webOffWithEscape,
      webOffWithT,
      cardUntouched,
    };
  }

  const legacyPage = await page.context().newPage();
  const currentPage = await page.context().newPage();
  const timingPage = await page.context().newPage();
  const keyboardPage = await page.context().newPage();
  const nativeVideoPage = await page.context().newPage();
  const legacy = await verifyLegacyPlayer(legacyPage);
  const current = await verifyCurrentPlayer(currentPage);
  const latencyMs = await verifyImmediateDuringMutationStorm(timingPage);
  const shortcuts = await verifyFullscreenShortcuts(keyboardPage);
  const nativeVideo = await verifyNativeVideoShortcuts(nativeVideoPage);
  await legacyPage.close();
  await currentPage.close();
  await timingPage.close();
  await keyboardPage.close();
  await nativeVideoPage.close();

  return { legacy, current, latencyMs, shortcuts, nativeVideo };
}
