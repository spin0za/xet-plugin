async (page) => {
  // Use a fresh persistent test profile with the actual MV3 extension loaded.
  // Never answer questions or alter copy permissions in a real user's attempt.
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw new Error('Load the extension in an isolated test profile first');
  const origin = 'https://merchant.pc.xiaoe-tech.com';
  const fixture = await context.newPage();
  const errors = [];
  fixture.on('pageerror', error => errors.push(error.message));
  const body = `<!doctype html><meta charset=utf-8><style>
    body { font: 20px monospace; padding: 30px; }
    body.forbidden_contextmenu { -webkit-user-select: none; user-select: none; }
    .practice-answer-page { user-select: none; }
    .question-content, .question-option-item { width: 760px; padding: 16px; }
    .question-option-item { cursor: pointer; border: 1px solid #aaa; margin: 20px 0; }
    .question-content span { user-select: none; }
  </style><body class=forbidden_contextmenu>
    <div class=practice-answer-page style="user-select:none">
      <div class=question-content><span>Question text can be selected and copied.</span></div>
      <div class=question-option-item tabindex=0>
        <div class=question-option-item__content><span>Option text can be selected without submitting an answer.</span></div>
      </div>
      <button id=mark>Mark</button><input id=answer value="Editable answer">
      <div id=outside>Unrelated site content</div>
    </div><script>
      const root = document.querySelector('.practice-answer-page');
      window.blockCounts = { selectstart:0, contextmenu:0, copy:0 };
      window.applyRestrictions = () => {
        root.onselectstart = e => { blockCounts.selectstart++; e.returnValue = false; return false; };
        root.oncontextmenu = e => { blockCounts.contextmenu++; e.returnValue = false; return false; };
        root.oncopy = e => { blockCounts.copy++; e.preventDefault(); };
        root.style.userSelect = 'none';
      };
      applyRestrictions();
      window.answers = 0;
      const option = document.querySelector('.question-option-item');
      option.onclick = () => answers++;
      option.onkeydown = e => { if(e.key === 'Enter') option.click(); };
      window.marks = 0;
      document.querySelector('#mark').onclick = () => marks++;
      window.checkNativeEvent = (selector, type) => {
        const event = new Event(type, { bubbles:true, cancelable:true });
        document.querySelector(selector).dispatchEvent(event);
        return !event.defaultPrevented;
      };
    </script>`;
  const setDisabled = async disabled => {
    await worker.evaluate(({ origin, disabled }) => chrome.storage.local.set({
      enabled: true, volumeEnabled: true, keepAliveEnabled: false,
      disabledSites: disabled ? [origin] : [],
    }), { origin, disabled });
    await fixture.waitForFunction(disabled => document.documentElement.hasAttribute('data-xet-text-selection') !== disabled, disabled);
  };
  const dragText = async selector => {
    await fixture.evaluate(() => getSelection().removeAllRanges());
    const box = await fixture.locator(selector).boundingBox();
    await fixture.mouse.move(box.x + 4, box.y + box.height / 2);
    await fixture.mouse.down();
    await fixture.mouse.move(box.x + 210, box.y + box.height / 2, { steps: 12 });
    await fixture.mouse.up();
    const text = await fixture.evaluate(() => getSelection().toString());
    if (!text.trim()) throw new Error(`Native drag selection failed for ${selector}`);
    return text;
  };
  try {
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin], keepAliveEnabled: false }), origin);
    await fixture.route(`${origin}/**`, route => route.fulfill({ contentType:'text/html; charset=utf-8', body }));
    await fixture.goto(`${origin}/p/t_pc/pc_evaluation/practice_sheet/fixture`);
    await fixture.waitForTimeout(200);
    const original = await fixture.evaluate(() => ({
      style: getComputedStyle(document.querySelector('.question-content span')).userSelect,
      select: checkNativeEvent('.question-content span', 'selectstart'),
      menu: checkNativeEvent('.question-content span', 'contextmenu'),
      copy: checkNativeEvent('.question-content span', 'copy'),
    }));
    if (original.style !== 'none' || original.select || original.menu || original.copy) {
      throw new Error(`Fixture did not reproduce the site's restrictions: ${JSON.stringify(original)}`);
    }
    await setDisabled(false);
    await fixture.waitForFunction(() => getComputedStyle(document.querySelector('.question-content span')).userSelect === 'text');
    const stemSelection = await dragText('.question-content span');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await fixture.keyboard.press('Control+c');
    const copied = await fixture.evaluate(() => navigator.clipboard.readText());
    if (copied !== stemSelection) throw new Error('Ctrl+C did not copy the native text selection');
    const optionSelection = await dragText('.question-option-item__content span');
    if (await fixture.evaluate(() => answers) !== 0) throw new Error('Drag selection submitted an answer');
    await fixture.keyboard.press('Control+c');
    if (await fixture.evaluate(() => navigator.clipboard.readText()) !== optionSelection) {
      throw new Error('Ctrl+C did not copy option text');
    }
    const allowed = await fixture.evaluate(() => ({
      select: checkNativeEvent('.question-content span', 'selectstart'),
      menu: checkNativeEvent('.question-content span', 'contextmenu'),
      copy: checkNativeEvent('.question-content span', 'copy'),
      outsideMenu: checkNativeEvent('#outside', 'contextmenu'),
      inputCopy: checkNativeEvent('#answer', 'copy'),
      bodySelect: getComputedStyle(document.body).userSelect,
    }));
    if (!allowed.select || !allowed.menu || !allowed.copy || allowed.outsideMenu ||
        allowed.inputCopy || allowed.bodySelect !== 'none') {
      throw new Error(`Selection scope is incorrect: ${JSON.stringify(allowed)}`);
    }
    await fixture.locator('.question-option-item__content').click();
    await fixture.locator('.question-option-item').press('Enter');
    await fixture.locator('#mark').click();
    if (await fixture.evaluate(() => answers !== 2 || marks !== 1)) {
      throw new Error('Normal answer selection or mark action was blocked');
    }
    await fixture.locator('#answer').fill('Updated answer');
    if (await fixture.locator('#answer').inputValue() !== 'Updated answer') throw new Error('Input was affected');
    await fixture.evaluate(() => {
      applyRestrictions();
      const content = document.createElement('div');
      content.className = 'question-content';
      content.id = 'dynamic-question';
      content.textContent = 'Dynamically inserted question text';
      document.querySelector('.practice-answer-page').append(content);
    });
    if (!await fixture.evaluate(() => checkNativeEvent('#dynamic-question', 'selectstart') &&
      getComputedStyle(document.querySelector('#dynamic-question')).userSelect === 'text')) {
      throw new Error('Dynamic content or re-applied restrictions defeated the controller');
    }
    const routes = ['practice_analysis/fixture', 'exam_sheet/fixture', 'exam_analysis/fixture',
      'errbook/practice/42?readonly=1', 'practice_sheet/fixture?mode=rote'];
    for (const route of routes) {
      await fixture.evaluate(route => history.pushState({}, '', `/p/t_pc/pc_evaluation/${route}`), route);
      await fixture.waitForFunction(() => document.documentElement.hasAttribute('data-xet-text-selection'));
      if (!await fixture.evaluate(() => checkNativeEvent('.question-content span', 'selectstart'))) {
        throw new Error(`Restriction remained active on ${route}`);
      }
    }
    await fixture.evaluate(() => history.pushState({}, '', '/p/t_pc/course_pc_detail/video/fixture'));
    await fixture.waitForFunction(() => !document.documentElement.hasAttribute('data-xet-text-selection'));
    if (await fixture.evaluate(() => checkNativeEvent('.question-content span', 'selectstart') ||
      getComputedStyle(document.querySelector('.question-content span')).userSelect !== 'none')) {
      throw new Error('Selection overrides leaked outside evaluation routes');
    }
    await fixture.evaluate(() => history.pushState({}, '', '/p/t_pc/pc_evaluation/practice_sheet/fixture'));
    await fixture.waitForFunction(() => document.documentElement.hasAttribute('data-xet-text-selection'));
    await setDisabled(true);
    const restored = await fixture.evaluate(() => ({
      style: getComputedStyle(document.querySelector('.question-content span')).userSelect,
      select: checkNativeEvent('.question-content span', 'selectstart'),
      menu: checkNativeEvent('.question-content span', 'contextmenu'),
      copy: checkNativeEvent('.question-content span', 'copy'),
    }));
    if (JSON.stringify(original) !== JSON.stringify(restored)) throw new Error('Site disable did not restore restrictions');
    await setDisabled(false);
    await dragText('.question-option-item__content span');
    if (await fixture.evaluate(() => answers) !== 2) throw new Error('Restart duplicated click handling');
    if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
    return { original, allowed, nativeCopy: true, dragWithoutAnswer: true,
      normalAnswers: true, inputs: true, dynamicContent: true, routes, restored, restart: true, errors };
  } finally {
    await context.clearPermissions();
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
