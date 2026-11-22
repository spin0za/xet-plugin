async page => {
  const worker = page.context().serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Use a fresh persistent profile with the real extension');
  const fixture = await page.context().newPage(), origin = 'https://errbook-scroll.pc.xiaoe-tech.com';
  const book = '/p/t_pc/pc_evaluation/errbook/detail/123?tab=2';
  const checks = [], errors = [];
  let stage = 'baseline';
  fixture.on('pageerror', e => errors.push(e.message)); fixture.setDefaultTimeout(10000);
  const assert = (ok, text) => { if (!ok) throw Error(text); };
  const paint = () => fixture.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const setBottom = async () => {
    await fixture.evaluate(() => scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'})); await paint();
  };
  try {
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin], keepAliveEnabled: false }), origin);
    await fixture.route(origin + '/**', async route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>
      <meta charset="utf-8"><title>Error book entry scroll fixture</title><style>
        body{margin:0}header{height:72px}footer{height:130px}.errbook-detail-page{min-height:600px}
        .question{height:170px;background:#f5f7fa;margin:12px;padding:12px}.overview{height:6000px}
      </style><header>Header</header><div id="app"></div><footer>Footer</footer><script>
        window.overview=()=>{history.pushState({},'','/p/t_pc/pc_evaluation/practice_record?tab=1');app.innerHTML='<main class="overview">Long overview</main>'};
        const content=()=>'<main class="errbook-detail-page"><h1>我的错题</h1>'+Array.from({length:12},(_,i)=>'<section class="question">Question '+(i+1)+'</section>').join('')+'</main>';
        window.enter=(path,delay=0)=>{history.pushState({},'',path);app.innerHTML=delay?'<div>Loading</div>':content();if(delay)setTimeout(()=>app.innerHTML=content(),delay)};
        if(location.pathname.includes('/errbook/detail/'))app.innerHTML=content();else overview();
      </script>` }));
    await fixture.goto(origin + '/p/t_pc/pc_evaluation/practice_record?tab=1'); await fixture.bringToFront();
    await setBottom(); const before = await fixture.evaluate(() => scrollY);
    await fixture.evaluate(path => enter(path), book); await paint();
    const native = await fixture.evaluate(() => ({ y:scrollY, max:document.scrollingElement.scrollHeight-innerHeight }));
    assert(before > native.max && native.y > 0 && Math.abs(native.y-native.max) < 2, 'Did not reproduce inherited/clamped bottom: '+JSON.stringify(native));
    checks.push('without extension: SPA entry from scrolled overview lands at new document bottom');
    stage = 'enable';
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.waitForFunction(() => scrollY === 0);
    await setBottom(); const reading = await fixture.evaluate(() => scrollY);
    await fixture.evaluate(() => { document.querySelector('.question').append(document.createElement('span')); dispatchEvent(new PageTransitionEvent('pageshow')); });
    await paint(); assert(await fixture.evaluate(() => scrollY) === reading, 'DOM update or pageshow reset manual reading position');
    checks.push('entry reset is one-shot; later DOM updates and tab wakes preserve manual scrolling');
    stage = 'fresh SPA entry';
    await fixture.evaluate(() => overview()); await paint(); await setBottom();
    await fixture.evaluate(path => enter(path), book); await fixture.waitForFunction(() => scrollY === 0);
    assert(await fixture.evaluate(() => history.scrollRestoration) === 'auto', 'Global restoration was changed');
    checks.push('fresh SPA entry starts at top without changing global history policy');
    stage = 'delayed mount';
    await fixture.evaluate(() => overview()); await paint(); await setBottom();
    await fixture.evaluate(path => enter(path,200), book);
    await fixture.waitForSelector('.errbook-detail-page'); await fixture.waitForFunction(() => scrollY === 0);
    checks.push('delayed detail mounting starts at top');
    stage = 'reload';
    await setBottom(); await fixture.reload();
    await fixture.waitForFunction(() => scrollY === 0); await paint();
    assert(await fixture.evaluate(() => scrollY) === 0, 'Reload restored an old bottom after initialization');
    checks.push('direct load/reload also starts at top');
    stage = 'categories';
    for (const tab of [1,3]) {
      await fixture.evaluate(() => overview()); await paint(); await setBottom();
      await fixture.evaluate(path => enter(path), book.replace('tab=2','tab='+tab));
      await fixture.waitForFunction(() => scrollY === 0);
    }
    checks.push('all error-book categories are scoped to their detail views');
    await fixture.evaluate(() => overview()); await paint(); await setBottom();
    const overviewY = await fixture.evaluate(() => scrollY);
    await fixture.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow'))); await paint();
    assert(await fixture.evaluate(() => scrollY) === overviewY, 'Unrelated overview was reset');
    await fixture.evaluate(() => enter('/p/t_pc/pc_evaluation/errbook/practice/123')); await paint(); await setBottom();
    const practiceY = await fixture.evaluate(() => scrollY);
    await fixture.evaluate(() => app.append(document.createElement('span'))); await paint();
    assert(await fixture.evaluate(() => scrollY) === practiceY, 'Single-question page was affected');
    checks.push('overview and single-question pages keep native scrolling');
    stage = 'disable';
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.evaluate(() => overview()); await paint(); await setBottom();
    await fixture.evaluate(path => enter(path), book); await paint();
    assert(await fixture.evaluate(() => scrollY) > 0, 'Disabled plugin still resets scrolling');
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, nativeBottom: native, checks };
  } catch (error) {
    throw Error(stage + ': ' + error.message + ' ' + JSON.stringify(await fixture.evaluate(() => ({ path:location.pathname,y:scrollY,ready:document.readyState }))));
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] })); await fixture.close();
  }
}
