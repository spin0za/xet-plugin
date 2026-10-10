async (page) => {
  // Real MV3 worker + isolated content scripts; all data is an owned fixture.
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in an owned persistent Chromium profile");
  const origin = "https://merchant.pc.xiaoe-tech.com";
  const path = "/p/t_pc/pc_evaluation/practice_analysis/wb_course_fixture";
  const url = `${origin}${path}?join_id=join_fixture&task_id=task_fixture`;
  const state = Array.from({ length: 41 }, (_, index) => ({
    id: `qs_fixture_${index + 1}`, mark: index === 0, collect: index === 1,
  }));
  const writes = [];
  const errors = [];
  let rejectSave = false;
  let loseSaveResponse = false;
  let holdSave = false;
  let holdQuestionId = "";
  let rejectQuestionId = "";
  let releaseSave;
  let omitMark = false;
  const fixture = await page.context().newPage();
  fixture.on("pageerror", e => errors.push(e.message));
  let stage = "initial render";
  function assert(value, message) { if (!value) throw new Error(message); }
  try {
    await worker.evaluate(() => chrome.storage.local.set({
      enabled: true, volumeEnabled: true, disabledSites: [], keepAliveEnabled: false,
    }));
    await fixture.setViewportSize({ width: 1280, height: 900 });
    await fixture.route(`${origin}/**`, async route => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname;
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        let response;
        if (endpoint.endsWith("/commit_record")) {
          response = { list: state.map(q => ({ id: q.id, ...(omitMark && q.id === state[2].id ? {} : { is_marked: q.mark }), type: 0 })) };
        } else if (endpoint.endsWith("/get_paper_question")) {
          response = { practice_list: state.map(q => ({ id: q.id, is_collected: q.collect })) };
        } else if (endpoint.endsWith("/question.mark/1.0.0") || endpoint.endsWith("/xe.qs.coll.question.collect/1.0.0")) {
          writes.push({ endpoint, body });
          if (holdSave && (!holdQuestionId || body.question_id === holdQuestionId)) await new Promise(resolve => { releaseSave = resolve; });
          if (rejectSave || body.question_id === rejectQuestionId) { await route.fulfill({ json: { code: 4001, msg: "Fixture rejection" } }); return; }
          const question = state.find(q => q.id === body.question_id);
          assert(question, "Unknown question identity");
          if (endpoint.endsWith("/question.mark/1.0.0")) {
            assert(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["is_mark", "join_id", "question_id", "source_id", "source_type"].sort()), "Unexpected mark payload");
            assert(body.source_id === "wb_course_fixture" && body.join_id === "join_fixture" && body.source_type === 1, "Wrong mark scope");
            question.mark = body.is_mark === 1;
          } else {
            assert(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["is_collect", "question_id", "resource_id", "resource_type", "task_id"].sort()), "Unexpected favorite payload");
            assert(body.resource_id === "wb_course_fixture" && body.task_id === "task_fixture" && body.resource_type === 34, "Wrong favorite scope");
            question.collect = body.is_collect;
          }
          if (loseSaveResponse) { loseSaveResponse = false; await route.abort("failed"); return; }
          response = {};
        } else throw new Error(`Unexpected API call: ${endpoint}`);
        await route.fulfill({ json: { code: 0, data: response } });
        return;
      }
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang=zh-CN><style>
        body{font:16px system-ui;background:#f4f6fa;margin:0;padding:24px}
        .practice-analysis{max-width:1000px;margin:auto;background:white;padding:20px;border-radius:12px}
        .analysis-item{padding:20px 0;border-bottom:1px solid #eee}
        .question-header{font-size:16px}.question-type{color:#1677ff;font-size:14px;margin-bottom:16px}
        video{width:160px;height:90px;background:#ddd}p{line-height:1.5}
      </style><main class=practice-analysis><h1>在线练习解析 / Fixture</h1>
        <aside class=answer-card__content__card style="display:flex;gap:8px;margin-bottom:16px">
          ${state.slice(0,3).map((q,i)=>`<div class=answer-card__content__card__item style="width:32px;height:32px;border:1px solid #1677ff"><span>${i+1}</span></div>`).join('')}
        </aside>
        ${state.map((q,i)=>`<section class=analysis-item id=analysis-${i+1}>
          <div class=question-header><div class=question-type>${i+1}. 单选题</div><p>第 ${i+1} 题：解析页面示例</p></div>
          <p>A. 选项一　B. 选项二　C. 选项三</p><p>解析：示例内容，不涉及真实答题数据。</p>
          ${i === 2 ? '<div class=question-header><div class=question-type>材料子题</div></div>' : ''}
        </section>`).join("")}<video id=test-video></video></main><script>
          window.mediaActions=0;
          document.querySelector('video').play=async()=>{ window.mediaActions++; };
          document.querySelector('video').pause=()=>{ window.mediaActions++; };
          const main=document.querySelector('.practice-analysis');
          main.__vue__={ resourceId:'wb_course_fixture',join_id:'join_fixture',practiceList:${JSON.stringify(state.map(q=>({id:q.id,is_collected:q.collect})))}};
        </script></html>` });
    });
    await fixture.goto(url);
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-analysis-actions").length === 41);
    const mark = fixture.locator("#analysis-1 button[data-xet-action=mark]");
    const collect = fixture.locator("#analysis-1 button[data-xet-action=collect]");
    assert(await mark.getAttribute("aria-pressed") === "true", "Existing mark was not loaded");
    assert(await fixture.locator(".xet-analysis-card-mark").count() === 1, "Answer card did not display existing mark");
    assert(await fixture.locator("#analysis-2 button[data-xet-action=collect]").getAttribute("aria-pressed") === "true", "Existing favorite was not loaded");
    assert(await fixture.locator("#analysis-3 .xet-analysis-actions").count() === 1, "Material children received duplicate actions");
    await fixture.screenshot({ path: "output/playwright/analysis-actions.png" });

    stage = "mouse mark persistence";
    await mark.click();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=mark]').getAttribute('aria-pressed') === 'false');
    assert(await fixture.locator(".xet-analysis-card-mark").count() === 0, "Answer card kept canceled mark");
    stage = "keyboard favorite persistence";
    await collect.press("Space");
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=collect]').getAttribute('aria-pressed') === 'true');
    assert(await fixture.evaluate(() => window.mediaActions) === 0, "Space activated video instead of question button");
    assert(state[0].mark === false && state[0].collect === true, "UI and saved state diverged");
    await fixture.reload();
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-analysis-actions").length === 41);
    assert(await mark.getAttribute("aria-pressed") === "false" && await collect.getAttribute("aria-pressed") === "true", "Reload lost saved flags");

    stage = "duplicate and synthetic clicks";
    const beforeSynthetic = writes.length;
    await mark.evaluate(button => button.click());
    await fixture.waitForTimeout(150);
    assert(writes.length === beforeSynthetic, "Page script initiated a save without a user click");
    holdSave = true;
    await mark.press("Enter");
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=mark]').getAttribute('aria-busy') === 'true');
    await mark.press("Enter");
    await fixture.waitForTimeout(100);
    assert(writes.length === beforeSynthetic + 1, "Double click issued duplicate writes");
    holdSave = false; releaseSave();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=mark]').getAttribute('aria-pressed') === 'true');

    stage = "save rejection and uncertain network response";
    rejectSave = true;
    await collect.click();
    await fixture.waitForFunction(() => document.querySelector('#xet-ultra-quality-toast')?.textContent.includes('未能确认'));
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=collect]').getAttribute('aria-busy') === 'false');
    assert(await collect.getAttribute("aria-pressed") === "true" && state[0].collect === true, "Rejected save changed the selected state");
    rejectSave = false; loseSaveResponse = true;
    await collect.click();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=collect]').getAttribute('aria-pressed') === 'false');
    assert(state[0].collect === false, "Lost response was not reconciled against the server");

    stage = "focus refresh and remount";
    state[1].collect = false;
    await fixture.evaluate(() => window.dispatchEvent(new Event("focus")));
    await fixture.waitForFunction(() => document.querySelector('#analysis-2 [data-xet-action=collect]').getAttribute('aria-pressed') === 'false');
    stage = "concurrent saves and failed refresh";
    holdSave = true; holdQuestionId = state[0].id; rejectQuestionId = state[1].id;
    await mark.click();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=mark]').getAttribute('aria-busy') === 'true');
    await fixture.locator('#analysis-2 [data-xet-action=collect]').click();
    await fixture.waitForFunction(() => document.querySelector('#xet-ultra-quality-toast')?.textContent.includes('未能确认'));
    holdSave = false; holdQuestionId = ""; rejectQuestionId = ""; releaseSave();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=mark]').getAttribute('aria-pressed') === 'false');
    assert(await fixture.locator('#analysis-2 [data-xet-action=collect]').getAttribute('aria-pressed') === 'false', "Failed refresh overwrote concurrent saved state");
    await fixture.evaluate(() => {
      const header=document.querySelector('#analysis-1 .question-header');
      const replacement=header.cloneNode(true); replacement.querySelector('.xet-analysis-actions').remove();
      replacement.removeAttribute('data-xet-analysis-action-header'); header.replaceWith(replacement);
    });
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-analysis-actions").length === 41);
    assert(await fixture.locator("#analysis-1 .xet-analysis-actions").count() === 1, "Remount duplicated buttons");
    for (const width of [720, 380]) {
      await fixture.setViewportSize({ width, height: 900 });
      const overlap = await fixture.locator("#analysis-1").evaluate(item => {
        const group=item.querySelector('.xet-analysis-actions').getBoundingClientRect();
        const text=item.querySelector('.question-type').getBoundingClientRect();
        return text.right > group.left || group.right > innerWidth;
      });
      assert(!overlap, "Narrow screen buttons overlap the question heading");
    }

    stage = "SPA route and website disable";
    await fixture.evaluate(() => history.pushState({}, "", "/p/t_pc/pc_evaluation/practice_sheet/wb_course_fixture"));
    await fixture.waitForFunction(() => !document.querySelector(".xet-analysis-actions"));
    await fixture.evaluate(url => history.pushState({}, "", url), url);
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-analysis-actions").length === 41);
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => !document.querySelector(".xet-analysis-actions"));
    assert(await fixture.locator("[data-xet-analysis-action-header]").count() === 0, "Disable left layout changes behind");
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-analysis-actions").length === 41);

    stage = "missing flags fail closed";
    omitMark = true;
    await fixture.reload();
    await fixture.waitForFunction(() => document.querySelectorAll(".xet-analysis-actions").length === 40);
    assert(await fixture.locator("#analysis-3 .xet-analysis-actions").count() === 0, "Unknown flags were shown as false");
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { passed: true, questions: 41, savedActions: writes.length,
      checked: ["real MV3 bridge", "post-submission persistence", "answer card marks", "Space/Enter", "trusted clicks", "double clicks", "errors", "network reconciliation", "concurrent saves", "focus refresh", "remount", "responsive layout", "SPA", "disable", "unknown flags"] };
  } catch (error) { throw new Error(`${stage}: ${error.message}`); }
  finally {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
