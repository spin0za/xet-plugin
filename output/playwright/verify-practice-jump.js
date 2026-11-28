async (page) => {
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith("/src/background.js"));
  if (!worker) throw new Error("Load the extension in a fresh isolated browser profile");
  const origin = "https://practice-jump-fixture.pc.xiaoe-tech.com";
  const path = "/p/t_pc/pc_evaluation/practice_sheet/wb_course_fixture?task_id=pt_fixture";
  const vue = await context.request.get("https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js");
  if (!vue.ok()) throw new Error("Could not load Vue for the fixture");
  const html = `<!doctype html><meta charset="utf-8"><style>
    .all-questions-container { width: 600px; height: 480px; overflow: auto; overflow-anchor: none; }
    .stem { height: 120px; }
    iframe { display: block; border: 0; width: 100%; }
  </style><div id="app"></div><script>${await vue.text()}</script><script>
    window.vm = new Vue({el:'#app', data:{resourceId:'wb_course_fixture',taskId:'pt_fixture',join_id:'uwb_fixture',pageSize:10,
      practiceRenderStartIndex:170,practicePageLoading:false,isLoadingPreviousPracticePage:false,
      isProgrammaticPracticeScroll:false,lastPracticeScrollTop:0,currentQuestionNum:171,
      mediaHeight:0,nativeFinishes:0,activeLoads:0,maxLoads:0,gate:false},
      computed:{rows(){return Array.from({length:200-this.practiceRenderStartIndex},(_,i)=>this.practiceRenderStartIndex+i+1);}},
      template:\`<main class="practice-sheet"><nav><button @click="handleSwitchQuestion({weight:[185]},185)">186</button><button @click="handleSwitchQuestion({weight:[189]},189)">190</button><span id="selected">{{currentQuestionNum+1}}</span></nav><section ref="practiceQuestionsContainer" class="all-questions-container" @scroll="track"><article v-for="n in rows" :key="n" :id="'practice-question-anchor-'+n" class="question-wrapper"><div class="stem">Question {{n}}</div><iframe v-if="n===179 && mediaHeight" :style="{height:mediaHeight+'px'}" title="Delayed video" srcdoc="<p>Video frame placeholder</p>"></iframe></article></section></main>\`,
      methods:{
        setPracticeActiveQuestion(i){this.currentQuestionNum=i;},
        async loadPracticePageByIndex(){
          this.practicePageLoading=true;
          try { await new Promise(resolve=>window.finishPrepend=resolve); }
          finally { this.practicePageLoading=false; }
        }, async loadPreviousPracticePage(){},
        async handleSwitchQuestion(cell, fallback){
          if(this.practicePageLoading)throw new Error('Native loader still locked');
          this.isProgrammaticPracticeScroll=true;
          const i=Array.isArray(cell.weight)?cell.weight[0]:fallback;
          this.activeLoads++;this.maxLoads=Math.max(this.activeLoads,this.maxLoads);
          if(this.gate){this.gate=false;await new Promise(resolve=>window.unblock=resolve);}
          this.activeLoads--;
          this.setPracticeActiveQuestion(i,true);
          await this.$nextTick();
          this.scrollToPracticeQuestion(i);
          this.finishProgrammaticPracticeScroll(i);
        },
        scrollToPracticeQuestion(i, behavior='smooth'){
          this.$nextTick(()=>{
            const list=this.$refs.practiceQuestionsContainer,row=document.getElementById('practice-question-anchor-'+(i+1));
            list.scrollTo({top:list.scrollTop+row.getBoundingClientRect().top-list.getBoundingClientRect().top,behavior});
            window.startedScroll=true;
          });
        },
        finishProgrammaticPracticeScroll(i){
          this.nativeFinishes++;
          setTimeout(()=>{this.setPracticeActiveQuestion(i,true);this.lastPracticeScrollTop=this.$refs.practiceQuestionsContainer.scrollTop;this.isProgrammaticPracticeScroll=false;},700);
        },
        track(){
          if(this.isProgrammaticPracticeScroll)return;
          const list=this.$refs.practiceQuestionsContainer,top=list.getBoundingClientRect().top;
          const row=[...list.children].find(row=>row.getBoundingClientRect().top>=top-4);
          if(row)this.setPracticeActiveQuestion(Number(row.id.split('-').pop())-1);
        }
      },mounted(){window.originalSwitch=this.handleSwitchQuestion;}
    });
  </script>`;
  await context.route(`${origin}/**`, r => r.fulfill({ contentType: "text/html", body: html }));
  const fixture = await context.newPage();
  const errors = [];
  fixture.on("pageerror", error => errors.push(error.message));
  fixture.setDefaultTimeout(5000);
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const align = n => fixture.evaluate(n => {
    const scroll = vm.$refs.practiceQuestionsContainer, top = scroll.getBoundingClientRect().top;
    return document.getElementById(`practice-question-anchor-${n}`).getBoundingClientRect().top - top;
  }, n);
  const waitAlign = n => fixture.waitForFunction(n => {
    const scroll = vm.$refs.practiceQuestionsContainer, top = scroll.getBoundingClientRect().top;
    return Math.abs(document.getElementById(`practice-question-anchor-${n}`).getBoundingClientRect().top - top) < 2;
  }, n);
  const ready = () => fixture.waitForFunction(() => window.vm && vm.handleSwitchQuestion !== originalSwitch);
  const click = n => fixture.getByRole("button", { name: String(n), exact: true }).click();
  const setMedia = height => fixture.evaluate(height => { vm.mediaHeight = height; }, height);
  const locked = () => fixture.evaluate(() => vm.isProgrammaticPracticeScroll);
  let stage = "unpatched delayed video";
  try {
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.goto(origin + path);
    await click(186);
    await fixture.waitForFunction(() => window.startedScroll);
    await setMedia(480);
    await fixture.waitForFunction(() => !vm.isProgrammaticPracticeScroll);
    const original = { at182: await align(182), at186: await align(186) };
    check(Math.abs(original.at182) < 2 && Math.abs(original.at186) > 400, `Baseline did not reproduce 186 → 182: ${JSON.stringify(original)}`);

    stage = "patched delayed video";
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.goto(origin + path);
    await ready();
    await click(186);
    await waitAlign(186);
    await setMedia(480);
    await fixture.locator("iframe[title='Delayed video']").waitFor({ state: "attached" });
    await waitAlign(186);
    await setMedia(720);
    await waitAlign(186);
    check(await fixture.locator("#selected").textContent() === "186", "Answer card selection changed");

    stage = "manual wheel releases target";
    await fixture.mouse.move(320, 240);
    await fixture.mouse.wheel(0, 180);
    await fixture.waitForFunction(() => !vm.isProgrammaticPracticeScroll);
    await fixture.waitForFunction(() => document.getElementById("practice-question-anchor-186").getBoundingClientRect().top < 0);
    await setMedia(760);
    await fixture.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    check(await align(186) < -100, "Late layout forced the user back after wheel input");
    check(await fixture.evaluate(() => vm.nativeFinishes === 0), "Native delayed timer could still force an old selection");

    stage = "pending upward load cannot block a card jump";
    await fixture.goto(origin + path);
    await ready();
    await fixture.evaluate(() => { window.prepend = vm.loadPreviousPracticePage(); });
    await fixture.waitForFunction(() => window.finishPrepend && vm.practicePageLoading);
    await click(186);
    await fixture.evaluate(async () => { finishPrepend(); await prepend; });
    await waitAlign(186);
    check(await fixture.evaluate(() => vm.practiceRenderStartIndex === 170 && !vm.isLoadingPreviousPracticePage),
      "Pending earlier page replaced the explicitly requested viewport");

    stage = "latest selection wins during native page load";
    await fixture.goto(origin + path);
    await ready();
    await fixture.evaluate(() => { vm.gate = true; });
    await click(186);
    await fixture.waitForFunction(() => window.unblock);
    await click(190);
    await fixture.evaluate(() => { unblock(); });
    await waitAlign(190);
    await setMedia(480);
    await waitAlign(190);
    check(await fixture.locator("#selected").textContent() === "190" &&
      await fixture.evaluate(() => vm.maxLoads === 1), "Late original click overrode the newer selection");
    check(await locked(), "Fixture should still be within the short alignment window");
    await fixture.evaluate(path => history.pushState({}, "", path), path.replace("practice_sheet", "practice_analysis"));
    await fixture.waitForFunction(() => vm.handleSwitchQuestion === originalSwitch && !vm.isProgrammaticPracticeScroll);
    check(!errors.length, errors.join("; "));
    return { baselineLandedOn182: true, patchedLandedOn186: true, delayedVideoReflowHandled: true,
      wheelRetakesControl: true, pendingPrependYields: true, latestClickWins: true, routeCleanup: true };
  } catch (error) {
    throw new Error(`${stage}: ${error.message}${errors.length ? `; page errors: ${errors.join("; ")}` : ""}`);
  } finally {
    await fixture.close();
    await context.unroute(`${origin}/**`);
    await worker.evaluate(() => chrome.storage.local.remove("disabledSites"));
  }
}
