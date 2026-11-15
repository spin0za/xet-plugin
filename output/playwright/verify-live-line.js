async page => {
  const context = page.context(), worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 extension required');
  const origin = 'https://live-line.pc.xiaoe-tech.com', extension = worker.url().replace('/src/background.js', '');
  const checks = [], errors = [], fixture = await context.newPage();
  const assert = (value, message) => { if (!value) throw Error(message); };
  fixture.setDefaultTimeout(10000); fixture.on('pageerror', error => errors.push(error.message));
  const open = async (id, line = 1, options = '1,2,3', kind = 'live') => {
    await fixture.goto(origin + (kind === 'live' ? '/p/t_pc/live_pc/pc/l_' + id : '/p/t_pc/course_pc_detail/video/v_' + id) + '?selected=' + line + '&options=' + options);
    await fixture.bringToFront();
    await fixture.waitForFunction(() => window.audit && document.querySelector('.line-switch-btn'));
  };
  await fixture.route(origin + '/**', async route => {
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset=utf-8><style>
      .pc-live-player{height:400px;width:700px}.line-switch-btn{display:inline-block;padding:10px}.line-switch-menu{display:none}.line-switch-btn:hover .line-switch-menu{display:block}.menu-item{cursor:pointer;padding:10px}.active{color:blue}
      </style><div class=pc-live-player><video id=media></video><div class=line-switch-btn><span>线路</span><div class=line-switch-menu></div></div></div><script>
      window.audit={clicks:[],media:0};const video=document.querySelector('video');window.originalVideo=video;
      video.play=()=>{audit.media++;return Promise.resolve()};video.pause=()=>audit.media++;video.load=()=>audit.media++;
      const query=new URL(location.href).searchParams;window.selected=Number(query.get('selected'))||1;
      window.select=line=>{selected=line;for(const e of document.querySelectorAll('.menu-item'))e.classList.toggle('active',Number(e.dataset.line)===line)};
      window.addLine=line=>{const item=document.createElement('div');item.className='menu-item selecter-item icon';item.dataset.line=line;item.textContent='线路'+line;
      item.classList.toggle('active',line===selected);item.onclick=()=>{audit.clicks.push(line);select(line)};document.querySelector('.line-switch-menu').append(item)};
      for(const line of query.get('options').split(',').map(Number))addLine(line);
      </script>` });
  });
  try {
    await worker.evaluate(() => chrome.storage.local.set({ defaultLiveLine: 2, enabled: false, volumeEnabled: false, disabledSites: [], keepAliveEnabled: false }));
    await open('first');
    await fixture.waitForFunction(() => selected === 2);
    assert(await fixture.evaluate(() => audit.clicks.join() === '2' && audit.media === 0 && document.querySelector('video') === originalVideo), 'Default did not use exactly one native selection or touched media');
    checks.push('actual MV3: exact hidden native option selected once, independent of quality/volume toggles; media untouched');
    await fixture.locator('.line-switch-btn').hover();
    await fixture.getByText('线路3', { exact: true }).click();
    await fixture.evaluate(() => { document.dispatchEvent(new Event('loadedmetadata')); document.body.append(document.createElement('p')); });
    await fixture.waitForTimeout(1200);
    assert(await fixture.evaluate(() => selected === 3 && audit.clicks.join() === '2,3'), 'Default fought manual selection');
    await fixture.evaluate(() => select(1));
    await fixture.waitForTimeout(1200);
    assert(await fixture.evaluate(() => selected === 1), 'Default fought native failover');
    checks.push('trusted manual line 3 and later native failover remain in charge');
    await open('already', 2);
    await fixture.waitForTimeout(300);
    assert(await fixture.evaluate(() => selected === 2 && !audit.clicks.length), 'Already-selected line reloaded');
    await open('missing', 1, '1,3');
    await fixture.waitForTimeout(300);
    assert(await fixture.evaluate(() => selected === 1 && !audit.clicks.length), 'Missing line did not preserve native choice');
    await fixture.evaluate(() => addLine(2));
    await fixture.waitForFunction(() => selected === 2 && audit.clicks.length === 1);
    checks.push('already-selected, missing and asynchronously added preferred lines');
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: ['https://live-line.pc.xiaoe-tech.com'] }));
    await open('disabled'); await fixture.waitForTimeout(300);
    assert(await fixture.evaluate(() => !audit.clicks.length && selected === 1), 'Site disable did not stop line selection');
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], defaultLiveLine: 0 }));
    await fixture.waitForTimeout(300);
    assert(await fixture.evaluate(() => !audit.clicks.length && selected === 1), 'Follow website changed playback');
    await worker.evaluate(() => chrome.storage.local.set({ defaultLiveLine: 2 }));
    await fixture.waitForFunction(() => selected === 2);
    await open('course', 1, '1,2,3', 'course');
    await fixture.waitForTimeout(300); assert(await fixture.evaluate(() => !audit.clicks.length && selected === 1), 'Course video changed line');
    checks.push('site disable, follow website, setting changes and ordinary-course exclusion');
    await open('storage'); await fixture.waitForFunction(() => selected === 2);
    const popup = await context.newPage();
    try {
      await popup.setViewportSize({ width: 330, height: 600 });
      await popup.goto(extension + '/popup/popup.html');
      await popup.waitForFunction(() => !document.querySelector('#default-live-line').disabled);
      assert(await popup.locator('#default-live-line').inputValue() === '2', 'Saved preference not displayed');
      await popup.locator('#default-live-line').selectOption('3');
      await fixture.waitForFunction(() => selected === 3);
      assert((await worker.evaluate(() => chrome.storage.local.get('defaultLiveLine'))).defaultLiveLine === 3, 'Popup did not persist preference');
      await popup.reload(); await popup.waitForFunction(() => !document.querySelector('#default-live-line').disabled);
      assert(await popup.locator('#default-live-line').inputValue() === '3', 'Popup reload lost setting');
      await popup.locator('#default-live-line').focus();
      assert(await popup.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), 'No visible keyboard focus');
      assert(await popup.evaluate(() => document.querySelector('main').scrollWidth <= document.body.clientWidth && document.querySelector('#default-live-line').getBoundingClientRect().right <= 330), 'Popup overflow');
      await popup.screenshot({ path: 'output/playwright/live-line-popup.png' });
      checks.push('real extension popup persistence/reload, live setting propagation, native select focus and no overflow');
    } finally { await popup.close(); }
    assert(!errors.length, errors.join('; '));
    return { checks, errors };
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({ defaultLiveLine: 0, disabledSites: [] }));
    await fixture.close();
  }
}
