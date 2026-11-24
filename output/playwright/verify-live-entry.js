async page => {
  const context = page.context(), worker = context.serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Use a fresh isolated Chromium profile with the extension");
  const origin = "https://live-entry-fixture.pc.xiaoe-tech.com", course = "course_fixture";
  const coursePath = "/p/t_pc/course_pc_detail/camp_pro/" + course;
  const roomPath = "/p/t_pc/live_pc/pc/";
  const source = await context.newPage();
  const cases = ["future", "current", "replay", "locked", "anonymous", "conditions", "phone", "password",
    "expired", "special", "other_origin", "other_course", "free_pending", "cancel", "unsupported"];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const detailPath = id => "/detail/l_" + id + "/4?course_id=" + course;
  const errors = [], arrived = [];
  context.on("page", tab => tab.on("pageerror", error => errors.push(error.message)));
  await context.route(origin + "/**", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === coursePath) {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html>
        <div class="camp_pro_content_catalog">${cases.map(id => `<div class="section_item_box" id="${id}"><span>${id}</span></div>`).join("")}</div>
        <script>
          for (const row of document.querySelectorAll(".section_item_box")) {
            const locked = row.id === "locked";
            const vm = { $el: row, isAvailable: true, isNeedMsgCollect: false, communityId: "",
              sectionItem: { chapter_id: "l_" + row.id, course_id: "${course}", resource_type: 4, unlock_state: locked ? 0 : 1 },
              goToContentPage() {
                if (this.isAvailable && this.sectionItem.unlock_state)
                  window.open("/detail/" + this.sectionItem.chapter_id + "/4?course_id=" + this.sectionItem.course_id);
              } };
            row.__vue__ = vm;
            row.addEventListener("click", () => vm.goToContentPage());
          }
        </script>` });
    }
    if (pathname.startsWith(roomPath)) {
      arrived.push(pathname);
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Fixture live room</h1>" });
    }
    if (pathname === "/_alive/api/is_in_special_menu") return route.fulfill({ json: { code: 0 } });
    if (pathname === "/_alive/bff_h5/guide_phone_config/user_info/1.0.0") {
      return route.fulfill({ status: 503, json: { code: 1 } });
    }
    const id = pathname.match(/^\/detail\/l_(\w+)\/4$/)?.[1];
    if (!id) return route.fulfill({ status: 404, body: "" });
    const status = ["replay", "expired"].includes(id) ? 3 : id === "current" ? 1 : 0;
    const target = (id === "other_origin" ? "https://not-the-merchant.invalid" : origin) + roomPath + "l_" + id +
      "?course_id=" + (id === "other_course" ? "course_unrelated" : course) + "&source=fixture";
    return route.fulfill({ contentType: "text/html", body: `<!doctype html>
      <main class="detail"><div class="detail-header__wrapper">
        <div id="detail-header-right-subr"><button class="theme-customize-bg">Enter manually</button>
          <div class="status-wrapper"></div></div>
      </div><button id="stay">Read details</button></main>
      <script>
        window.wasArmed = sessionStorage.getItem("xet:live-entry-intent") !== null;
        window.checked = false;
        const id = ${JSON.stringify(id)}, root = document.querySelector(".detail-header__wrapper");
        const enterLiveRoom = async function() {
          const old = Number(sessionStorage.getItem("fixtureGateCalls") || 0);
          sessionStorage.setItem("fixtureGateCalls", String(old + 1));
          if (this.infos.is_login && this.infos.available && this.learningConditionPassed &&
              !this.isFreeLiveNeedBindPhone && id !== "unsupported") {
            this.$funcTool.jumpTargetUrl({ url: this.liveRoomUrl, isWindowOpen: true });
          }
        };
        const vm = { $el: root, $route: { params: { type: "4", id: "l_" + id } },
          infos: { resource_id: "l_" + id, is_login: id !== "anonymous", available: true,
            alive_status: ${status}, zb_start_rest_time: 4 * 86400000, have_password: id === "password" ? 1 : 0,
            is_public: id === "free_pending" ? 1 : 0, payment_type: id === "free_pending" ? 1 : 2 },
          detailInfos: { id: "l_" + id }, learningConditionPassed: false, isFreeLiveNeedBindPhone: id === "phone",
          limitTimeLookInfo: { server_time: ${status} === 3 ? 100 : -1 }, isSpecialAliveAppId() { return id === "special"; },
          $options: { methods: { enterLiveRoom } }, $funcTool: { jumpTargetUrl() { window.manualJump = true; } },
          getliveRoomUrl() {}, liveRoomUrl: location.origin + "/live/l_" + id };
        root.__vue__ = vm;
        root.querySelector(".status-wrapper").__vue__ = { playBackValid: id !== "expired" };
        root.querySelector("button").addEventListener("click", () => enterLiveRoom.call(vm));
        (async () => {
          await fetch("/_alive/api/is_in_special_menu", { method: "POST" });
          if (id === "free_pending") await fetch("/_alive/bff_h5/guide_phone_config/user_info/1.0.0", { method: "POST" });
          setTimeout(() => {
            vm.liveRoomUrl = ${JSON.stringify(target)};
            vm.learningConditionPassed = id !== "conditions";
            window.checked = true;
          }, id === "cancel" ? 1100 : 160);
        })();
      </script>` });
  });
  const open = async (id, modifiers = []) => {
    await source.bringToFront();
    const [tab] = await Promise.all([
      context.waitForEvent("page"), source.locator("#" + id + " span").click({ modifiers }),
    ]);
    await tab.bringToFront();
    return tab;
  };
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await source.goto(origin + coursePath);
    await source.waitForFunction(() => Boolean(window.__xetLiveEntry));
    for (const id of ["future", "current", "replay"]) {
      const tab = await open(id);
      await tab.waitForURL(origin + roomPath + "l_" + id + "?**");
      assert(await tab.evaluate(() => Number(sessionStorage.getItem("fixtureGateCalls")) === 1), "Native gate not called once: " + id);
      assert(new URL(tab.url()).searchParams.get("source") === "fixture", "Original room URL was rebuilt");
      assert(await tab.evaluate(() => !navigation.entries().some(entry => new URL(entry.url).pathname.startsWith("/detail/"))),
        "Intermediate detail is still in history");
      await tab.close();
    }
    await source.locator("#locked span").click();
    assert(await source.evaluate(() => !sessionStorage.getItem("xet:live-entry-intent")), "Locked row was marked");
    for (const id of ["anonymous", "conditions", "phone", "password", "expired", "special", "other_origin", "other_course", "free_pending", "unsupported"]) {
      const tab = await open(id);
      await tab.waitForFunction(() => window.wasArmed && window.checked && !sessionStorage.getItem("xet:live-entry-intent"));
      // Advance the fixture's wall time so the bounded check finishes instead of waiting 8s per case.
      if (id === "unsupported") {
        await tab.waitForFunction(() => !window.__xetLiveEntry);
        assert(await tab.evaluate(() => Number(sessionStorage.getItem("fixtureGateCalls")) === 1), "Native handler veto was not respected");
      } else {
        await tab.evaluate(() => { const started = Date.now(); Date.now = () => started + 10_000; });
        await tab.waitForFunction(() => !window.__xetLiveEntry);
        assert(await tab.evaluate(() => !sessionStorage.getItem("fixtureGateCalls")), "Gate ran on an ineligible route: " + id);
      }
      assert(tab.url() === origin + detailPath(id), "Unexpected auto-entry: " + id);
      await tab.close();
    }
    const cancelled = await open("cancel");
    await cancelled.waitForFunction(() => Boolean(window.__xetLiveEntry));
    await cancelled.locator("#stay").click();
    await cancelled.waitForFunction(() => window.checked);
    assert(await cancelled.evaluate(() => !window.__xetLiveEntry && !sessionStorage.getItem("fixtureGateCalls")), "Manual interaction did not cancel the shortcut");
    await cancelled.close();
    const modified = await open("future", ["Control"]);
    await modified.waitForFunction(() => window.checked);
    assert(await modified.evaluate(() => !window.wasArmed && !sessionStorage.getItem("fixtureGateCalls")), "Modified click enabled auto-entry");
    await modified.close();
    const direct = await context.newPage();
    await direct.goto(origin + detailPath("future"));
    await direct.waitForFunction(() => window.checked);
    assert(await direct.evaluate(() => !window.wasArmed && !sessionStorage.getItem("fixtureGateCalls")), "Direct detail unexpectedly auto-entered");
    await direct.getByRole("button", { name: "Enter manually" }).click();
    assert(await direct.evaluate(() => window.manualJump === true), "Manual button no longer works");
    await direct.close();
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await source.waitForFunction(() => !window.__xetLiveEntry);
    const disabled = await open("future");
    await disabled.waitForFunction(() => window.checked);
    assert(await disabled.evaluate(() => !window.wasArmed && !sessionStorage.getItem("fixtureGateCalls")), "Disabled site still auto-enters");
    await disabled.close();
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await source.waitForFunction(() => Boolean(window.__xetLiveEntry));
    assert(arrived.join(",") === ["future", "current", "replay"].map(id => roomPath + "l_" + id).join(","), "Extra room navigation");
    assert(errors.length === 0, errors.join("; "));
    return { passed: true, cases: cases.length, joined: arrived.length, nativeChecksAndFallbacks: true };
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    for (const tab of context.pages()) {
      if (tab === source || tab.url().startsWith(origin + "/")) await tab.close();
    }
    await context.unroute(origin + "/**");
  }
}
