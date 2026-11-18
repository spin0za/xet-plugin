async page => {
  // Run with a fresh persistent profile loading the real MV3 extension.
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/src/background.js'));
  if (!worker) throw Error('Real MV3 extension required');
  const fixture = await context.newPage();
  const origin = 'https://audio-shortcuts.pc.xiaoe-tech.com';
  const path = '/p/t_pc/course_pc_detail/audio/a_fixture';
  const checks = [], errors = [];
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  fixture.on('pageerror', error => errors.push(error.message));
  fixture.setDefaultTimeout(10000);
  // A real 60-second PCM media resource, not mocked currentTime/duration.
  const wav = Buffer.alloc(44 + 60 * 8000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const setTime = value => fixture.evaluate(async value => {
    const audio = document.querySelector('audio'); audio.pause(); audio.currentTime = value;
    if (audio.seeking) await new Promise(resolve => audio.addEventListener('seeked', resolve, { once: true }));
    document.activeElement?.blur();
  }, value);
  const time = () => fixture.locator('audio').evaluate(audio => audio.currentTime);
  const pressAt = async (value, key, expected) => {
    await setTime(value);
    assert(Math.abs(await time() - value) < 0.01, `Fixture could not seek to ${value}: ` + JSON.stringify(await fixture.locator('audio').evaluate(a => ({ current: a.currentTime, duration: a.duration, ready: a.readyState, seekable: Array.from({length:a.seekable.length},(_,i)=>[a.seekable.start(i),a.seekable.end(i)]) }))));
    await fixture.keyboard.press(key);
    assert(Math.abs(await time() - expected) < 0.01, `${key}: expected ${expected}, got ${await time()}`);
  };
  let tabId;
  try {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [], keepAliveEnabled: false }));
    await fixture.route(origin + '/**', async route => {
      if (new URL(route.request().url()).pathname.endsWith('.wav')) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
        const body = wav.subarray(start, end + 1);
        await route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body,
          headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(body.length),
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) } }); return;
      }
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>
        <meta charset="utf-8"><title>Audio keyboard fixture</title>
        <style>.audio-content-header{padding:20px;width:700px;height:130px}audio{display:none}</style>
        <main class="audio-content-header"><div class="study-header-control">
          <button id="play">Play</button><span class="volume">Volume</span>
          <audio preload="auto" muted src="/sound.wav"></audio>
        </div></main>
        <label>Comment <input id="text" value="abcdef"></label>
        <label>Notes <textarea id="notes">abcdef</textarea></label>
        <label>Volume <input id="range" type="range" min="0" max="100" value="50"></label>
        <label>Mode <select id="select"><option>One</option><option>Two</option></select></label>
        <div id="editable" contenteditable="true" tabindex="0">Notes</div>
        <div id="slider" role="slider" aria-label="Volume" tabindex="0"></div>
        <div id="shadow"></div><script>
          const audio = document.querySelector('audio');
          window.nativeCalls = {keydown:0, keyup:0};
          // Reproduce the native 15-second handler after window capture.
          for (const type of ['keydown','keyup']) document.addEventListener(type, event => {
            if (!['ArrowLeft','ArrowRight'].includes(event.code)) return;
            nativeCalls[type]++;
            if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing ||
                event.composedPath().some(n => n instanceof Element &&
                  (n.matches('input,textarea,select,[role="slider"]') || n.isContentEditable))) return;
            if (type === 'keydown') audio.currentTime = Math.max(0, Math.min(audio.duration,
              audio.currentTime + (event.code === 'ArrowLeft' ? -15 : 15)));
          }, true);
          document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML = '<input value="abcdef">';
          document.querySelector('#play').onclick = () => audio.paused ? audio.play() : audio.pause();
        </script>` });
    });
    await fixture.goto(origin + path); await fixture.bringToFront();
    await fixture.waitForFunction(() => document.querySelector('audio').readyState >= 3);
    tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(t => t.url?.startsWith(origin))?.id, origin);
    await fixture.waitForFunction(() => Boolean(document.querySelector('.xet-download-button')));
    await pressAt(30, 'ArrowRight', 35); await pressAt(30, 'ArrowLeft', 25);
    assert(await fixture.evaluate(() => nativeCalls.keydown === 0 && nativeCalls.keyup === 0), 'Native 15-second handler also ran');
    assert(await fixture.locator('audio').evaluate(a => a.paused), 'Seeking started paused audio');
    checks.push('real audio seeks ±5s; native keydown/keyup suppressed; paused state preserved');
    await pressAt(2, 'ArrowLeft', 0); await pressAt(58, 'ArrowRight', 60);
    await setTime(30);
    await fixture.keyboard.down('ArrowRight'); await fixture.keyboard.down('ArrowRight'); await fixture.keyboard.up('ArrowRight');
    assert(Math.abs(await time() - 40) < 0.01, 'Held arrow is not 5s per repeat');
    checks.push('start/end clamping and held-key repeats');
    for (const selector of ['#text', '#notes', '#range', '#select', '#editable', '#slider', '#shadow input']) {
      await setTime(30); await fixture.locator(selector).focus();
      const before = await fixture.evaluate(() => nativeCalls.keydown);
      await fixture.keyboard.press('ArrowLeft');
      assert(await time() === 30, `Hijacked editor/control ${selector}`);
      assert(await fixture.evaluate(() => nativeCalls.keydown) === before + 1, `Blocked native editing ${selector}`);
    }
    assert(await fixture.locator('#range').inputValue() === '49', 'Native range navigation lost');
    for (const key of ['Control+ArrowRight', 'Alt+ArrowRight', 'Meta+ArrowRight', 'Shift+ArrowRight']) await pressAt(30, key, 30);
    checks.push('text, textarea, range, select, contenteditable, ARIA slider, shadow input and modifiers retain native behavior');
    await setTime(30);
    await fixture.evaluate(() => document.querySelector('audio').play());
    const beforePlaySeek = await time(); await fixture.keyboard.press('ArrowRight');
    assert(await time() >= beforePlaySeek + 5 && await time() < beforePlaySeek + 5.5, 'Playing audio did not seek 5s');
    assert(await fixture.locator('audio').evaluate(a => !a.paused), 'Seeking paused playing audio');
    await fixture.locator('audio').evaluate(a => a.pause());
    checks.push('playing state preserved');
    await fixture.evaluate(() => {
      const old = document.querySelector('audio'), replacement = old.cloneNode(true);
      old.replaceWith(replacement); replacement.load();
    });
    await fixture.waitForFunction(() => document.querySelector('audio').readyState >= 3);
    await pressAt(30, 'ArrowRight', 35);
    checks.push('new audio elements are resolved without controller reinjection');
    // Isolated content-script helpers are inspected only in their own world.
    const enabled = () => worker.evaluate(async tabId => (await chrome.scripting.executeScript({
      target: { tabId }, world: 'ISOLATED', func: () => Boolean(document.querySelector('.xet-download-button')),
    }))[0].result, tabId);
    await worker.evaluate(origin => chrome.storage.local.set({ disabledSites: [origin] }), origin);
    await fixture.waitForFunction(() => !document.querySelector('.xet-download-button'));
    assert(!await enabled(), 'Disable did not apply');
    // Native handler closes over the original audio; use delivery counts here.
    const nativeBefore = await fixture.evaluate(() => nativeCalls.keydown);
    await fixture.keyboard.press('ArrowRight');
    assert(await fixture.evaluate(() => nativeCalls.keydown) === nativeBefore + 1, 'Disabled extension still intercepts arrows');
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.waitForFunction(() => Boolean(document.querySelector('.xet-download-button')));
    await pressAt(30, 'ArrowLeft', 25);
    await fixture.evaluate(() => history.pushState({}, '', '/bought'));
    await pressAt(30, 'ArrowRight', 30);
    checks.push('site disable/re-enable cleanup and unrelated-route guard');
    assert(errors.length === 0, errors.join('\n'));
    return { passed: true, checks };
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    await fixture.close();
  }
}
