async page => {
  const context = page.context(), worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 extension required');
  const results = [], origin = 'https://countdown.pc.xiaoe-tech.com';
  const assert = (value, message) => { if (!value) throw Error(message); };
  for (const version of ['2.6.14', '2.7.16']) {
    const vue = await (await fetch('https://cdn.jsdelivr.net/npm/vue@' + version + '/dist/vue.min.js')).text();
    for (const kind of ['camp_pro', 'video', 'audio', 'document', 'image_text']) {
      const fixture = await context.newPage(), calls = [], errors = [];
      const routePath = '/p/t_pc/course_pc_detail/' + kind + '/' + (kind === 'camp_pro' ? 'course_fixture' : 'resource_fixture') + (kind === 'camp_pro' ? '' : '?product_id=course_fixture');
      const flags = { start: '2026-11-15 15:00:00', status: 0 };
      const cdp = await context.newCDPSession(fixture);
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
      fixture.setDefaultTimeout(10000); fixture.on('pageerror', e => errors.push(e.message));
      try {
        await fixture.clock.setFixedTime(new Date('2026-11-15T06:30:00Z'));
        await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
        await fixture.route(origin + '/**', async route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/vue.js') { await route.fulfill({ contentType: 'text/javascript', body: vue }); return; }
          if (route.request().method() === 'POST') {
            calls.push(url.pathname);
            await route.fulfill({ json: { code: 0, data: url.pathname === '/catalog' ? { list: [{ chapter_id: 'l_fixture', alive_status: flags.status, alive_start_time: flags.start }] } : { resource_id: '' } } }); return;
          }
          await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset=utf-8><style>body{margin:0}.reading{height:1800px}.catalog{height:200px;overflow:auto}.rows{height:900px}</style><script src=/vue.js></script><div id=app></div><script>
            window.audit={reload:0,media:0,renders:0};
            const post=async(path,p)=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})).json();
            const Section={props:['sectionItem'],methods:{getTimeDifference(from,until){const ms=Math.max(0,new Date(until).getTime()-new Date(from).getTime());return {days:Math.floor(ms/86400000),hours:Math.floor(ms%86400000/3600000),mins:Math.floor(ms%3600000/60000)}}},
              computed:{descText(){const item=this.sectionItem;if(item.alive_status!==0)return ['scheduled','直播中','已结束','支持回放'][item.alive_status];const t=this.getTimeDifference(new Date,item.alive_start_time);return item.alive_start_time+'开播'+(t.days<7&&(t.days||t.hours||t.mins)?'|'+(t.days?t.days+'天':t.hours?t.hours+'小时':t.mins+'分钟')+'后开始':'')}},
              render(h){audit.renders++;return h('div',{attrs:{id:this.sectionItem.chapter_id},domProps:{innerHTML:this.descText}})}};
            const Catalog={name:'CampProCatalog',props:['reloadSwitch'],data(){return {courseId:'course_fixture',appId:'fixture',chapterList:[{chapter_id:'l_fixture',resource_type:4,alive_status:0,alive_start_time:'2026-11-15 15:00:00'}],
              catalogPageSize:50,lastPageSize:1,nextPageSize:1,currentItemPid:0,order_status:'asc',currentSubCourse:'',isOnlyShowWithRightsValue:false,activeNames:['chapter'],isSearchShow:false,apiMap:{getList:p=>post('/catalog',p),getLearnResource:p=>post('/last',p)}}},
              watch:{reloadSwitch(){audit.reload++}},render(h){return h('div',{class:'catalog'},[h('div',{class:'rows'},this.chapterList.map(row=>h(Section,{key:row.chapter_id,props:{sectionItem:row}})))])}};
            const Owner={name:'CourseContentCatalog',data:()=>({courseInfo:{resource_type:50,resource_id:'course_fixture'}}),methods:{reload(){audit.reload++}},render:h=>h(Catalog,{ref:'CampProCatalog'})};
            window.app=new Vue({render:h=>h('div',{attrs:{id:'app'}},[h('div',{class:'reading'},[h('video',{attrs:{id:'media',preload:'none'}})]),h(Owner)])}).$mount('#app');
            window.inspect=()=>{const q=[app];for(let i=0;i<q.length;i++)q.push(...q[i].$children);return q};window.catalog=inspect().find(v=>v.$options.name==='CampProCatalog');
            window.section=()=>inspect().find(v=>v.sectionItem?.chapter_id==='l_fixture');
            window.nativeFormat=section().getTimeDifference;window.originalRows=catalog.chapterList;window.originalRow=originalRows[0];window.originalNode=document.querySelector('#l_fixture');window.originalMedia=document.querySelector('#media');
            originalMedia.play=()=>{audit.media++;return Promise.resolve()};originalMedia.pause=()=>audit.media++;originalMedia.load=()=>audit.media++;
            window.initialText=originalNode.textContent;
          </script>` });
        });
        await fixture.goto(origin + routePath); await fixture.bringToFront();
        await fixture.waitForFunction(() => window.__xetCourseProgress?.patchRevision === 4);
        const initial = await fixture.evaluate(() => ({ text: initialText, now: new Date().toISOString(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
        assert(initial.text.includes('16小时后开始'), 'Fixture failed to reproduce native timezone bug: ' + JSON.stringify(initial));
        await fixture.waitForFunction(() => document.querySelector('#l_fixture').textContent.includes('30分钟后开始'));
        const before = calls.length;
        await fixture.evaluate(() => { scrollTo(0, 400); document.querySelector('.catalog').scrollTop = 120; window.snapshotRenders = audit.renders; __xetCourseProgress.tickCountdowns(); });
        await fixture.evaluate(() => Vue.nextTick());
        assert(await fixture.evaluate(() => audit.renders === snapshotRenders), 'Unchanged time caused rerender');
        await fixture.clock.setFixedTime(new Date('2026-11-15T06:45:00Z'));
        await fixture.evaluate(() => window.dispatchEvent(new Event('focus')));
        await fixture.waitForFunction(() => originalNode.textContent.includes('15分钟后开始'));
        assert(calls.length === before, 'Local countdown/focus unexpectedly fetched');
        assert(await fixture.evaluate(() => catalog.chapterList === originalRows && originalRows[0] === originalRow && document.querySelector('#l_fixture') === originalNode && document.querySelector('#media') === originalMedia && audit.reload === 0 && audit.media === 0 && scrollY === 400 && document.querySelector('.catalog').scrollTop === 120 && catalog.activeNames.join() === 'chapter'), 'Identity, scroll, expansion or media changed');
        flags.start = '2026-11-15 16:00:00';
        await fixture.evaluate(() => __xetCourseProgress.refresh());
        await fixture.waitForFunction(() => originalNode.textContent.includes('1小时后开始'));
        await fixture.evaluate(() => catalog.chapterList.push({ chapter_id: 'l_added', resource_type: 4, alive_status: 0, alive_start_time: '2026-11-15 15:00:00' }));
        await fixture.waitForFunction(() => document.querySelector('#l_added')?.textContent.includes('15分钟后开始'));
        await fixture.clock.setFixedTime(new Date('2026-11-15T08:05:00Z'));
        await fixture.evaluate(() => document.dispatchEvent(new Event('resume')));
        await fixture.waitForFunction(() => !originalNode.textContent.includes('后开始'));
        assert(await fixture.evaluate(() => originalRow.alive_status === 0 && !originalNode.textContent.includes('直播中')), 'Deadline invented broadcast state');
        flags.status = 1; await fixture.evaluate(() => __xetCourseProgress.refresh());
        await fixture.waitForFunction(() => originalNode.textContent === '直播中');
        await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
        await fixture.waitForFunction(() => !__xetCourseProgress.active);
        assert(await fixture.evaluate(() => section().getTimeDifference === nativeFormat), 'Disable did not restore formatter');
        assert(!errors.length, errors.join('; '));
        results.push({ version, kind, checks: 'CST vs PST, computed-cache invalidation, sleep/resume, schedule/API state, dynamic rows, no-fetch clock ticks, preserved DOM/media/scroll/expansion, cleanup', errors });
      } finally {
        await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
        await cdp.detach(); await fixture.close();
      }
    }
  }
  return results;
}
