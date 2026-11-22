async page => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Use a fresh persistent profile with the real extension');
  const fixture = await page.context().newPage();
  const origin = 'https://collections.pc.xiaoe-tech.com';
  const errors = [], requests = [], checks = [];
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  fixture.on('pageerror', e => errors.push(e.message));
  fixture.setDefaultTimeout(10000);
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.route(origin + '/**', async route => {
      if (route.request().method() !== 'GET') {
        requests.push(new URL(route.request().url()).pathname);
        await route.fulfill({ status: 500, body: 'No mutation or extra query expected' }); return;
      }
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8">
        <title>收藏列表测试</title><style>
          body{font:16px sans-serif}main{max-width:900px;margin:auto}.list-grid{display:flex;flex-wrap:wrap}
          .resource-card{width:250px;background:#f5f7fa;margin:4px}.resource-card__info{padding:16px}
        </style><main class="practice-record-page"><nav>
          <button id="practice">练习</button><button id="exam">考试</button><button id="drill">刷题本</button>
        </nav><section id="outlet"></section></main><script>
          window.USERID='user_fixture';window.nativeClicks=0;window.loadCalls=0;
          const make=(id,count)=>({resource_id:id,collection_name:id,qs_count:count});
          const pages=[
            [[make('empty_one',0),make('empty_two','0')],[make('nonempty',2),make('unknown',null)],[make('empty_three',0)]],
            [[make('empty_exam',0)]],[[make('nonempty_drill',3)]]
          ];
          const main=document.querySelector('main');
          window.showCategory=tab=>{
            history.replaceState({},'',location.pathname+'?tab=2&subTab='+tab);
            outlet.innerHTML='<div class="question-collect-tab"><div class="list-grid"></div><div class="scroll-footer">没有更多了</div></div>';
            const batches=pages[tab],total=batches.flat().length;
            window.v={$options:{name:'QuestionCollectTab'},list:[...batches[0]],activeSubTab:tab,
              loading:false,noMore:batches[0].length>=total,pagination:{page:1,pageSize:2},
              loadMore(){if(this.loading||this.noMore)throw Error('Invalid loadMore');
                loadCalls++;this.loading=true;
                setTimeout(()=>{this.list=this.list.concat(batches[this.pagination.page++]||[]);
                  this.noMore=this.list.length>=total;this.loading=false;render()},20)} };
            main.__vue__={$children:[v]};render();window.dispatchEvent(new PopStateEvent('popstate'));
          };
          window.render=()=>{
            const grid=document.querySelector('.list-grid');
            for(const item of v.list){let card=[...grid.children].find(c=>c.__vue__?.item===item);
              if(!card){card=document.createElement('a');card.href='#'+item.resource_id;card.className='resource-card';
                card.__vue__={item};card.innerHTML='<div class="resource-card__info"><div class="resource-card__title"></div><div class="card-line"></div></div>';
                card.onclick=e=>{e.preventDefault();nativeClicks++};grid.append(card)}
              card.dataset.id=item.resource_id;card.querySelector('.resource-card__title').textContent=item.collection_name;
              card.querySelector('.card-line').textContent=(item.qs_count||0)+'题'}
          };
          practice.onclick=()=>showCategory(0);exam.onclick=()=>showCategory(1);drill.onclick=()=>showCategory(2);
          showCategory(0);
        </script>` });
    });
    await fixture.goto(origin + '/p/t_pc/pc_evaluation/practice_record?tab=2'); await fixture.bringToFront();
    await fixture.waitForFunction(() => document.querySelectorAll('[data-xet-empty-collection]').length === 2);
    assert(await fixture.locator('.resource-card:visible').count() === 0, 'Initial zero rows remain visible');
    assert(await fixture.locator('.xet-history-more').isVisible(), 'All-empty first page lost continuation');
    assert(await fixture.locator('.xet-history-status').innerText() === '暂无非空收藏，请继续加载。', 'Wrong partial-empty state');
    await fixture.locator('.xet-history-more').click();
    await fixture.waitForFunction(() => document.querySelectorAll('.resource-card').length === 4 && !document.querySelector('.xet-history-status'));
    assert(await fixture.locator('.resource-card:visible').count() === 2, 'Valid or unknown row was removed');
    await fixture.locator('.xet-history-more').click();
    await fixture.waitForFunction(() => document.querySelectorAll('[data-xet-empty-collection]').length === 3 && !document.querySelector('.xet-history-more'));
    assert(await fixture.evaluate(() => v.list.length === 5 && v.noMore && v.pagination.page === 3 && loadCalls === 2), 'Raw pagination counts changed');
    checks.push('empty first page continues; raw totals/end-of-list remain correct; valid and unknown counts survive');
    await fixture.locator('[data-id="nonempty"]').click();
    assert(await fixture.evaluate(() => nativeClicks === 1), 'Native valid-card navigation blocked');
    await fixture.evaluate(() => { window.savedCard=document.querySelector('[data-id="empty_one"]'); v.list[0].qs_count=4;render(); });
    await fixture.waitForFunction(() => !document.querySelector('[data-id="empty_one"]').hasAttribute('data-xet-empty-collection'));
    assert(await fixture.locator('[data-id="empty_one"]').isVisible(), 'Recollected group stays hidden');
    assert(await fixture.evaluate(() => savedCard===document.querySelector('[data-id="empty_one"]')), 'Recreated native card');
    await fixture.evaluate(() => { v.list[0].qs_count=0;render(); });
    await fixture.waitForFunction(() => document.querySelector('[data-id="empty_one"]').hasAttribute('data-xet-empty-collection'));
    checks.push('new nonempty count restores original group; last uncollection hides it again; native links retained');
    await fixture.locator('#exam').click();
    await fixture.waitForFunction(() => document.querySelector('.xet-history-status')?.textContent === '暂无收藏');
    assert(await fixture.locator('.scroll-footer').isHidden(), 'Misleading no-more footer shown for empty collection');
    assert(await fixture.locator('.xet-history-more').count() === 0, 'Unbounded load on all-empty completed list');
    await fixture.locator('#drill').click();
    await fixture.waitForFunction(() => document.querySelector('[data-id="nonempty_drill"][data-xet-history-row]'));
    assert(await fixture.locator('.resource-card:visible').count() === 1 && await fixture.locator('.xet-history-status').count() === 0, 'Drill category inherited empty state');
    checks.push('practice/exam/drill category changes and true empty-state UI');
    await fixture.locator('#practice').click();
    await fixture.waitForFunction(() => document.querySelectorAll('[data-xet-empty-collection]').length === 2);
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => !document.querySelector('[data-xet-history-list]'));
    assert(await fixture.locator('[data-xet-empty-collection]').count() === 0 && await fixture.locator('.resource-card:visible').count() === 2, 'Disable did not restore original UI');
    assert(await fixture.locator('.xet-history-status,.xet-history-more').count() === 0, 'Disable leaked controls');
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.waitForFunction(() => document.querySelectorAll('[data-xet-empty-collection]').length === 2);
    checks.push('disable/re-enable restores native data and removes owned controls');
    assert(requests.length === 0, 'Filtering issued an unexpected API call: ' + requests.join(','));
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, checks, mutations: 0 };
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
