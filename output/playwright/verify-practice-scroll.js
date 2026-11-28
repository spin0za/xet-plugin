async (page) => {
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in a fresh isolated browser profile");
  const origin = "https://practice-scroll-fixture.pc.xiaoe-tech.com";
  const routeBase = "/p/t_pc/pc_evaluation/";
  const sheet = origin + routeBase + "practice_sheet/wb_course_fixture?task_id=pt_fixture";
  const vue = await context.request.get("https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js");
  if (!vue.ok()) throw new Error("Could not load Vue for the local fixture");
  const vueCode = await vue.text();
  const fixture = await context.newPage();
  fixture.setDefaultTimeout(5000);
  const errors = [];
  fixture.on("pageerror", error => errors.push(error.message));
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 20px; } .all-questions-container { height: 360px; width: 560px; overflow-y: auto; }
    .question-wrapper { border-bottom: 1px solid #777; box-sizing: border-box; }
    .manual-anchor .all-questions-container { overflow-anchor: none; }
  </style><div id="app"></div><script>${vueCode}</script><script>
    window.vm = new Vue({el:'#app', data:{
      resourceId:'wb_course_fixture', taskId:'pt_fixture', join_id:'uwb_fixture', pageSize:10,
      practiceRenderStartIndex:20, lastPracticeScrollTop:0, practicePageLoading:false,
      isLoadingPreviousPracticePage:false, isProgrammaticPracticeScroll:false, requests:0,
      renderedEnd:49, earlierLoaded:false },
      computed:{ rows() { return Array.from({length:this.renderedEnd+1-this.practiceRenderStartIndex}, (_,i)=>i+this.practiceRenderStartIndex+1); } },
      template:\`<main class="practice-sheet"><button id="jump" @click="jump">Jump</button><section class="all-questions-container" ref="practiceQuestionsContainer"><article class="question-wrapper" v-for="n in rows" :id="'practice-question-anchor-'+n" :key="n" :style="{height:(122+n%3*24)+'px'}">Question {{n}}</article></section></main>\`,
      methods:{
        loadPracticePageByIndex(index){
          this.requests++; this.practicePageLoading=true;
          return new Promise((resolve,reject)=>window.complete=(fail)=>{
            this.practicePageLoading=false;
            if(fail)reject(new Error('fixture load failed'));
            else { this.earlierLoaded=true; resolve(index); }
          });
        },
        async loadPreviousPracticePage(){
          if(this.isLoadingPreviousPracticePage||this.practicePageLoading||this.practiceRenderStartIndex<=0)return;
          const list=this.$refs.practiceQuestionsContainer, oldHeight=list.scrollHeight, oldTop=list.scrollTop;
          this.isLoadingPreviousPracticePage=true;
          try {
            await this.loadPracticePageByIndex(this.practiceRenderStartIndex-1);
            this.practiceRenderStartIndex=Math.max(this.practiceRenderStartIndex-this.pageSize,0);
            await this.$nextTick(); list.scrollTop=oldTop+(list.scrollHeight-oldHeight);
            this.lastPracticeScrollTop=list.scrollTop;
          } finally {this.isLoadingPreviousPracticePage=false;}
        },
        async jump(){
          this.isProgrammaticPracticeScroll=true; this.practiceRenderStartIndex=30;
          await this.$nextTick();
          this.$refs.practiceQuestionsContainer.scrollTop=document.getElementById('practice-question-anchor-34').offsetTop-this.$refs.practiceQuestionsContainer.offsetTop;
        }
      },mounted(){window.originalLoad=this.loadPreviousPracticePage;}
    });
  </script>`;
  await context.route(`${origin}/**`, r => r.fulfill({ contentType: "text/html", body: html }));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const point = () => fixture.evaluate(() => {
    const list = vm.$refs.practiceQuestionsContainer, top = list.getBoundingClientRect().top;
    const anchor = [...list.children].find(el => el.getBoundingClientRect().bottom > top);
    return { id: anchor.id, y: anchor.getBoundingClientRect().top - top, scroll: list.scrollTop };
  });
  const begin = () => fixture.evaluate(() => {
    vm.$refs.practiceQuestionsContainer.scrollTop = 420;
    window.finished = vm.loadPreviousPracticePage().catch(error => error.message);
  });
  const installed = () => fixture.waitForFunction(() => window.vm?.loadPreviousPracticePage !== window.originalLoad);
  let stage = "unpatched baseline";
  try {
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.goto(sheet);
    await fixture.waitForFunction(() => window.originalLoad === window.vm?.loadPreviousPracticePage && window.vm);
    await begin();
    await fixture.evaluate(() => { vm.$refs.practiceQuestionsContainer.scrollTop -= 130; });
    const oldLatest = await point();
    await fixture.evaluate(async () => { complete(); await finished; });
    const snapped = await point();
    check(snapped.id !== oldLatest.id || Math.abs(snapped.y - oldLatest.y) > 40, "Unpatched baseline did not reproduce the rebound");

    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    for (const manual of [false, true]) {
      stage = `preserve wheel (CSS anchoring ${manual ? "off" : "on"})`;
      await fixture.goto(sheet);
      await installed();
      if (manual) await fixture.evaluate(() => document.body.classList.add("manual-anchor"));
      await begin();
      const old = await point();
      await fixture.mouse.move(250, 170);
      await fixture.mouse.wheel(0, -130);
      await fixture.waitForFunction(old => vm.$refs.practiceQuestionsContainer.scrollTop < old - 100, old.scroll);
      const latest = await point();
      await fixture.evaluate(async () => { complete(); await finished; });
      const after = await point();
      check(latest.id === after.id && Math.abs(latest.y - after.y) <= 1, `Dragged viewport moved: ${JSON.stringify({ latest, after, manual })}`);
      check(await fixture.evaluate(() => vm.practiceRenderStartIndex === 10 && vm.requests === 1 &&
        vm.lastPracticeScrollTop === vm.$refs.practiceQuestionsContainer.scrollTop), "Previous page missing or fetched twice");
    }

    stage = "explicit jump";
    await begin();
    await fixture.getByRole("button", { name: "Jump" }).click();
    const jump = await point();
    await fixture.evaluate(async () => { complete(); await finished; });
    const afterJump = await point();
    check(afterJump.id === jump.id && afterJump.y === jump.y && jump.id.endsWith("-34"), "Late previous page replaced an explicit jump");

    stage = "rejection and disable";
    await fixture.goto(sheet);
    await installed();
    await begin();
    check(await fixture.evaluate(async () => { complete(true); return (await finished) === "fixture load failed" &&
      vm.practiceRenderStartIndex === 20 && !vm.isLoadingPreviousPracticePage; }), "Failure locked the native loader");
    await begin();
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => vm.loadPreviousPracticePage === originalLoad);
    await fixture.evaluate(async () => { complete(); await finished; });
    check(await fixture.evaluate(() => vm.practiceRenderStartIndex === 20 && !vm.isLoadingPreviousPracticePage), "Disabled patch changed the viewport");

    stage = "route change";
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.goto(sheet);
    await installed();
    await fixture.evaluate(path => history.pushState({}, "", path), routeBase + "practice_analysis/wb_course_fixture");
    await fixture.waitForFunction(() => vm.loadPreviousPracticePage === originalLoad);
    check(!errors.length, errors.join("; "));
    return { reproducedOriginalRebound: true, preservedLatestWheel: true, noDoubleCompensation: true,
      deliberateJumpPreserved: true, loadFailureRecovered: true, restoredOnDisableAndRouteChange: true };
  } catch (error) {
    throw new Error(`${stage}: ${error.message}${errors.length ? `; page errors: ${errors.join("; ")}` : ""}`);
  } finally {
    await fixture.close();
    await context.unroute(`${origin}/**`);
    await worker.evaluate(() => chrome.storage.local.remove("disabledSites"));
  }
}
