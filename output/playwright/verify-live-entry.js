async page => {
  const context = page.context(), worker = context.serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Use a fresh isolated Chromium profile with the extension");
  const origin = "https://live-entry-fixture.pc.xiaoe-tech.com", course = "course_fixture", app = "app_fixture";
  const coursePath = "/p/t_pc/course_pc_detail/camp_pro/" + course;
  const roomPath = "/p/t_pc/live_pc/pc/";
  const detailPath = id => "/detail/l_" + id + "/4";
  const source = await context.newPage();
  const successes = ["future", "live", "replay", "learned", "free"];
  const failures = ["guest", "locked_detail", "password", "learning", "collect", "phone", "expired", "special",
    "teacher", "endpoint_error", "form_denied", "unknown_live", "bad_id"];
  const rows = [...successes, ...failures, "locked_row", "slow"];
  const documents = [], lookups = [], errors = [];
  let testCase, slowRelease;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  source.on("pageerror", error => errors.push(error.message));
  await context.route(origin + "/**", async route => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (request.resourceType() === "document") documents.push(pathname);
    if (pathname === coursePath) {
      const items = rows.map(id => '<div class="section_item_box" id="' + id + '"><span>' + id + '</span></div>').join("");
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><div class="camp_pro_content_catalog">' + items + '</div><button id="stay">Stay here</button><script>' +
        'const catalog = {$options:{name:"CampProCatalog"}, appId:"app_fixture", courseId:"course_fixture", userId:"u_fixture"};' +
        'for (const row of document.querySelectorAll(".section_item_box")) {' +
        'const vm = {$el:row,$parent:catalog,appId:catalog.appId,isAvailable:true,sectionItem:{chapter_id:"l_"+row.id,course_id:catalog.courseId,resource_type:4,unlock_state:row.id!=="locked_row"},' +
        'goToContentPage(){window.nativeClicks=(window.nativeClicks||0)+1;if(this.sectionItem.unlock_state)window.open("/detail/"+this.sectionItem.chapter_id+"/4?course_id="+catalog.courseId)}};' +
        'row.__vue__=vm;row.addEventListener("click",()=>vm.goToContentPage());}</script>' });
    }
    if (pathname.startsWith(roomPath)) {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Live room</h1>" });
    }
    if (pathname.startsWith("/detail/")) {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Original live detail</h1><button>Enter manually</button>" });
    }
    assert(searchParams.get("app_id") === app && request.headers()["app-id"] === app, "Missing merchant scope");
    lookups.push(pathname);
    const json = data => route.fulfill({ json: { code: 0, data } });
    const id = "l_" + testCase;
    if (pathname === "/api/xe.goods.detail.get/2.0.0") {
      const body = request.postDataJSON();
      assert(body.goods_id === id && body.course_id === course && body.goods_type === 4, "Wrong detail eligibility target");
      if (testCase === "slow") {
        await new Promise(resolve => { slowRelease = resolve; });
        try { await route.fulfill({ status: 503 }); } catch { /* The test aborts the request. */ }
        return;
      }
      if (testCase === "endpoint_error") return route.fulfill({ status: 503 });
      return json({ resource_id: testCase === "bad_id" ? "l_wrong" : id, is_login: testCase !== "guest",
        available: testCase !== "locked_detail", have_password: testCase === "password" ? 1 : 0,
        alive_status: testCase === "live" ? 1 : ["replay", "expired"].includes(testCase) ? 3 : testCase === "unknown_live" ? 2 : 0,
        zb_start_rest_time: 4 * 86400000, payment_type: ["phone", "free"].includes(testCase) ? 1 : 2,
        is_public: ["phone", "free"].includes(testCase) ? 1 : 0 });
    }
    if (pathname === "/auth/get-live-url") {
      assert(request.method() === "GET" && searchParams.get("id") === id, "Wrong room lookup");
      return json(testCase === "teacher" ? { is_teacher: true, link: "https://other.invalid" } : {});
    }
    if (pathname === "/_alive/api/is_in_special_menu") return json({ jump_live_pc_client: { [app]: testCase === "special" } });
    if (pathname.endsWith("/get_learning_condition_state_api/1.0.0")) return json({ is_enable: ["learned", "learning"].includes(testCase) });
    if (pathname.endsWith("/get_user_learning_condition_passed_api/1.0.0")) return json({ is_passed: testCase === "learned" });
    if (pathname === "/information_form/get_information_formv3") {
      assert(request.postDataJSON().bizData.user_id === "u_fixture", "Wrong information-form scope");
      if (testCase === "replay") return route.fulfill({ json: { code: 1 } });
      if (testCase === "form_denied") return route.fulfill({ json: { code: 4005 } });
      return json(testCase === "collect" ? { purchase_data: { switch: true }, append_condition: { value: true },
        user_data: { need_collect: true } } : { purchase_data: { switch: false } });
    }
    if (pathname === "/_alive/api/get_lookback_expire") {
      return json({ server_time: 150, lookback_time: { expire_type: 2, expire: testCase === "expired" ? 100 : 200 } });
    }
    if (pathname === "/_alive/bff_h5/guide_phone_config/user_info/1.0.0") {
      return json({ alive_role: 0, bind_pohone: testCase === "free",
        bind_config: { phone_bind_switch: true, phone_bind_terminal: { pc: true }, phone_bind_config: { free_live: true } } });
    }
    throw new Error("Unexpected fixture endpoint: " + pathname);
  });
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await source.goto(origin + coursePath);
    async function ready() { await source.waitForFunction(() => Boolean(window.__xetLiveEntry)); }
    await ready();
    for (const id of [...successes, ...failures]) {
      testCase = id;
      const before = documents.length;
      await source.locator("#" + id + " span").click();
      const expected = successes.includes(id) ? roomPath + "l_" + id : detailPath(id);
      await source.waitForURL(origin + expected + "?course_id=" + course);
      assert(documents.slice(before).join(",") === expected, "Intermediate or extra document loaded: " + id);
      if (!successes.includes(id)) assert(await source.evaluate(() => !window.__xetLiveEntry), "Fallback still auto-enters from detail");
      await source.goBack();
      await ready();
    }
    const count = lookups.length;
    await source.locator("#locked_row span").click();
    assert(await source.evaluate(() => window.nativeClicks === 1), "Site's locked-row handler was bypassed");
    const [modified] = await Promise.all([
      context.waitForEvent("page"), source.locator("#future span").click({ modifiers: ["Control"] }),
    ]);
    await modified.waitForURL(origin + detailPath("future") + "?course_id=" + course);
    assert(lookups.length === count, "Locked or modified click made eligibility queries");
    await modified.close();
    testCase = "slow";
    await source.locator("#slow span").click();
    await source.waitForFunction(() => document.querySelector("#slow").hasAttribute("data-xet-live-entry-pending"));
    await source.locator("#stay").click();
    await source.waitForFunction(() => !document.querySelector("#slow").hasAttribute("data-xet-live-entry-pending"));
    slowRelease?.();
    assert(source.url() === origin + coursePath, "Cancelled click navigated away");
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await source.waitForFunction(() => !window.__xetLiveEntry);
    const [disabled] = await Promise.all([context.waitForEvent("page"), source.locator("#future span").click()]);
    await disabled.waitForURL(origin + detailPath("future") + "?course_id=" + course);
    await disabled.close();
    const queried = lookups.length;
    await source.goto(origin + detailPath("replay") + "?course_id=" + course);
    assert(await source.evaluate(() => !window.__xetLiveEntry) && lookups.length === queried,
      "Directly visited detail triggered auto-navigation or eligibility checks");
    assert(errors.length === 0, errors.join("; "));
    return { passed: true, noIntermediateDocument: successes, nativeFallbacks: failures.length, sameTabBack: true };
  } finally {
    slowRelease?.();
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await source.close();
    await context.unroute(origin + "/**");
  }
}
