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
        /* Sense UI message geometry copied from the deployed site's component. */
        .ss-message__wrapper{position:fixed;left:0;width:100%;text-align:center;pointer-events:none;z-index:4003}
        .ss-message{display:inline-flex;align-items:center;height:40px;box-sizing:border-box;padding:0 16px;
          border-radius:4px;background:#fff;color:#333;font-size:14px;line-height:16px;box-shadow:0 8px 24px 0 rgba(31,31,31,.16)}
        .ss-message svg{width:18px;height:18px;margin-right:8px}
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
          window.nativeNotices=[];
          const nativeMessage=(type,text)=>{
            window.nativeNotices.push({type,text});
            const wrapper=document.createElement('div');wrapper.className='ss-message__wrapper';
            wrapper.style.top=(40+document.querySelectorAll('.ss-message__wrapper').length*48)+'px';
            const message=document.createElement('div');message.className='ss-message';
            const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 18 18');
            const circle=document.createElementNS(icon.namespaceURI,'circle');
            circle.setAttribute('cx','9');circle.setAttribute('cy','9');circle.setAttribute('r','9');
            circle.setAttribute('fill',type==='success'?'#11d611':'#ff4747');
            icon.append(circle);const span=document.createElement('span');span.textContent=text;
            message.append(icon,span);wrapper.append(message);document.body.append(wrapper);
            setTimeout(()=>wrapper.remove(),3000);
          };
          main.__vue__={ resourceId:'wb_course_fixture',join_id:'join_fixture',practiceList:${JSON.stringify(state.map(q=>({id:q.id,is_collected:q.collect})))},
            $message:{success:text=>nativeMessage('success',text),error:text=>nativeMessage('error',text)}};
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
    const styles = await mark.evaluate(button => {
      const style=getComputedStyle(button), icon=button.querySelector('img'), bounds=button.getBoundingClientRect();
      return {width:bounds.width,height:bounds.height,border:style.borderTopColor,radius:style.borderRadius,
        padding:style.padding,gap:getComputedStyle(button.parentElement).gap,iconWidth:icon.width,
        iconHeight:icon.height,loaded:icon.complete && icon.naturalWidth===20};
    });
    assert(styles.width===32 && styles.height===32 && styles.border==='rgb(235, 235, 235)' && styles.radius==='8px' &&
      styles.padding==='0px' && styles.gap==='12px' && styles.iconWidth===20 && styles.iconHeight===20 && styles.loaded,
      `Original button geometry diverged: ${JSON.stringify(styles)}`);
    await mark.hover();
    assert(await mark.evaluate(button => getComputedStyle(button).backgroundColor)==='rgb(255, 255, 255)', 'Hover added a non-native gray background');
    const badge = await fixture.locator('.xet-analysis-card-mark').evaluate(image => {
      const style=getComputedStyle(image);return {width:image.width,height:image.height,top:style.top,right:style.right,
        loaded:image.complete && image.naturalWidth===40 && image.naturalHeight===39};
    });
    assert(badge.width===20 && badge.height===20 && badge.top==='-10px' && badge.right==='-10px' && badge.loaded,
      'Answer card did not use the original circular badge');
    await fixture.screenshot({ path: "output/playwright/analysis-actions.png" });

    async function checkNotice(text, screenshot) {
      stage = `native feedback: ${text}`;
      await fixture.waitForFunction(text=>window.nativeNotices.some(n=>n.text===text),text);
      assert(await fixture.locator('.xet-analysis-feedback').count()===0, 'Native message was replaced with an extension fallback');
      assert(await fixture.locator('#xet-ultra-quality-toast').count()===0, 'Question feedback leaked into the video toast');
      const notice=fixture.locator('.ss-message__wrapper').filter({hasText:text}).last();
      const layout=await notice.evaluate(wrapper=>{
        const box=wrapper.querySelector('.ss-message'), bounds=box.getBoundingClientRect(), style=getComputedStyle(box);
        return {center:(bounds.left+bounds.right)/2,height:bounds.height,top:bounds.top,font:style.fontSize,
          radius:style.borderRadius,padding:style.padding,color:style.color,background:style.backgroundColor};
      });
      assert(Math.abs(layout.center-640)<.02 && layout.height===40 && layout.top>=40 && layout.font==='14px' && layout.radius==='4px' &&
        layout.padding==='0px 16px' && layout.color==='rgb(51, 51, 51)' && layout.background==='rgb(255, 255, 255)',
        `Native notice geometry diverged: ${JSON.stringify(layout)}`);
      await fixture.screenshot({path:`output/playwright/analysis-${screenshot}.png`,clip:{x:0,y:0,width:1280,height:500}});
      await fixture.waitForFunction(()=>!document.querySelector('.ss-message__wrapper'));
    }

    stage = "mouse mark persistence";
    await mark.click();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=mark]').getAttribute('aria-pressed') === 'false');
    assert(await fixture.locator(".xet-analysis-card-mark").count() === 0, "Answer card kept canceled mark");
    await checkNotice('取消标记成功','unmark');
    stage = "keyboard favorite persistence";
    await collect.press("Space");
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=collect]').getAttribute('aria-pressed') === 'true');
    assert(await fixture.evaluate(() => window.mediaActions) === 0, "Space activated video instead of question button");
    assert(state[0].mark === false && state[0].collect === true, "UI and saved state diverged");
    await checkNotice('收藏成功','collect');
    await collect.click();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=collect]').getAttribute('aria-pressed') === 'false');
    await checkNotice('取消收藏成功','uncollect');
    await collect.click();
    await fixture.waitForFunction(() => document.querySelector('#analysis-1 [data-xet-action=collect]').getAttribute('aria-pressed') === 'true');
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
    await checkNotice('标记成功','mark');

    stage = "save rejection and uncertain network response";
    rejectSave = true;
    await collect.click();
    await fixture.waitForFunction(() => window.nativeNotices.some(n=>n.type==='error' && n.text==='收藏操作失败，请稍后重试'));
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
    await fixture.waitForFunction(() => window.nativeNotices.filter(n=>n.type==='error').length>=3);
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
    stage = "missing site message fallback and cleanup";
    await fixture.evaluate(() => {delete document.querySelector('.practice-analysis').__vue__.$message;});
    await mark.click();
    await fixture.waitForFunction(()=>document.querySelector('.xet-analysis-feedback')?.textContent==='标记成功');
    await fixture.waitForTimeout(350); // Let the original 300ms entrance animation settle.
    const fallback=await fixture.locator('.xet-analysis-feedback').evaluate(wrapper=>{
      const box=wrapper.firstElementChild,bounds=box.getBoundingClientRect();
      return {top:bounds.top,height:bounds.height,center:(bounds.left+bounds.right)/2,
        role:wrapper.getAttribute('role'),manual:wrapper.getAttribute('popover'),open:wrapper.matches(':popover-open')};
    });
    assert(fallback.top===40 && fallback.height===40 && Math.abs(fallback.center-190)<.02 && fallback.role==='status' && fallback.manual==='manual' && fallback.open,
      `Fallback notice was not accessible or centered: ${JSON.stringify(fallback)}`);
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(()=>!document.querySelector('.xet-analysis-feedback'));
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { passed: true, questions: 41, savedActions: writes.length,
      checked: ["real MV3 bridge", "original artwork", "original geometry and hover", "four native messages", "post-submission persistence", "answer card marks", "Space/Enter", "trusted clicks", "double clicks", "errors", "network reconciliation", "concurrent saves", "focus refresh", "remount", "responsive layout", "SPA", "disable", "unknown flags", "accessible fallback cleanup"] };
  } catch (error) {
    const diagnostic = await fixture.evaluate(() => ({notices:window.nativeNotices,
      fallback:document.querySelector('.xet-analysis-feedback')?.textContent,
      mark:document.querySelector('#analysis-1 [data-xet-action=mark]')?.getAttribute('aria-pressed')}));
    throw new Error(`${stage}: ${error.message}; ${JSON.stringify(diagnostic)}`);
  }
  finally {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
