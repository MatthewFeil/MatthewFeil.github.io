// Run against a fresh Jekyll preview. Requires Playwright with a Chromium browser.
// TRANSCRIBE_BROWSER_URL, PLAYWRIGHT_MODULE_PATH and PLAYWRIGHT_EXECUTABLE_PATH are optional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = process.env.TRANSCRIBE_BROWSER_URL || 'http://127.0.0.1:4187/transcribe/';
const output = process.env.TRANSCRIBE_BROWSER_OUTPUT;
const matrix = [
  [568, 320, true, 1], [667, 375, true, 1], [844, 390, true, 1],
  [320, 568, true, 1], [390, 844, true, 1], [900, 700, true, 1],
  [1024, 768, true, 1], [1440, 900, false, 1], [844, 390, false, 1],
  [320, 568, true, 2], [390, 844, true, 2], [667, 375, true, 2], [844, 390, true, 2]
];
function tone() {
  const n = 44100 * 8, wav = Buffer.alloc(44 + n * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(176400, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin(i * 2 * Math.PI * 440 / 44100) * 10000);
    wav.writeInt16LE(v, 44 + i * 4); wav.writeInt16LE(v, 46 + i * 4);
  }
  return wav;
}
async function swipe(cdp, x, y, dx, dy) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] });
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function config(page) {
  const value = await page.evaluate(async () => {
    document.getElementById('transcribe-config-export').click();
    return JSON.parse(await window.lastConfigBlob.text());
  });
  await page.locator('#transcribe-config-dismiss').click();
  return value;
}
async function visiblePoint(page, selector) {
  return page.evaluate(selector => {
    const e = document.querySelector(selector), r = e.getBoundingClientRect();
    const footer = document.querySelector('.transcribe-transport').getBoundingClientRect();
    const top = Math.max(0, r.top), bottom = Math.min(innerHeight, footer.top, r.bottom);
    const x = r.left + r.width / 2, y = (top + bottom) / 2;
    return { x, y, height: bottom - top, hit: document.elementFromPoint(x, y) === e };
  }, selector);
}
async function revealWave(page, cdp) {
  // Real touch events only: never scrollIntoView or assign scrollTop to pass reachability.
  for (let i = 0; i < 5; i++) {
    const point = await visiblePoint(page, '#transcribe-waveform');
    if (point.height >= 24 && point.hit) return point;
    let pan = await visiblePoint(page, '#transcribe-mark-ruler');
    if (pan.height < 24 || !pan.hit) {
      pan = await page.evaluate(() => {
        const r = document.querySelector('.transcribe-identity').getBoundingClientRect();
        const limit = document.querySelector('.transcribe-transport').getBoundingClientRect().top;
        return { x: innerWidth / 2, y: Math.min(r.bottom - 8, limit - 8) };
      });
    }
    await swipe(cdp, pan.x, pan.y, 0, -Math.min(120, pan.y - 8));
    await page.waitForTimeout(120);
  }
  throw Error('Waveform is not reachable through touch gestures');
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const results = [];
  try {
    for (const [width, height, touch, scale] of matrix) {
      const name = `${width}x${height}-${touch ? 'touch' : 'pointer'}-${scale}`;
      if (process.env.TRANSCRIBE_BROWSER_CASE && name !== process.env.TRANSCRIBE_BROWSER_CASE) continue;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
      await context.addInitScript(() => {
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.lastConfigBlob = blob; return create(blob); };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(url);
        if (scale === 2) await page.evaluate(() => document.documentElement.style.fontSize = '200%');
        await page.waitForTimeout(150);
        await page.locator('#transcribe-file').setInputFiles({ name: 'regression-tone.wav', mimeType: 'audio/wav', buffer: tone() });
        await page.waitForFunction(() => !document.getElementById('transcribe-play').disabled);
        await page.keyboard.press('m');
        await page.waitForTimeout(150);
        const before = await config(page);
        const cdp = await context.newCDPSession(page);
        if (width === 390 && touch && scale === 1) {
          const ruler = await page.locator('#transcribe-mark-ruler').boundingBox();
          await swipe(cdp, 4, ruler.y + ruler.height / 2, 0, 32);
          assert.deepEqual((await config(page)).annotations, before.annotations, 'Cancelled vertical marker drag changed annotations');
          await swipe(cdp, 4, ruler.y + ruler.height / 2, 48, 0);
          assert((await config(page)).annotations.markers[0].time > 0.2, 'Horizontal touch marker drag failed');
          await page.keyboard.press('Control+z');
          assert.deepEqual((await config(page)).annotations, before.annotations, 'Marker undo failed');
        }
        let point;
        if (touch) {
          point = await revealWave(page, cdp);
          assert.deepEqual((await config(page)).annotations, before.annotations, 'Vertical panning changed markers');
          await swipe(cdp, width * 0.2, point.y, width * 0.45, 0);
        } else {
          const r = await page.locator('#transcribe-waveform').boundingBox();
          await page.mouse.move(r.x + r.width * 0.2, r.y + r.height / 2);
          await page.mouse.down(); await page.mouse.move(r.x + r.width * 0.65, r.y + r.height / 2, { steps: 12 }); await page.mouse.up();
        }
        assert.equal(await page.locator('#transcribe-selection-only').getAttribute('aria-pressed'), 'true', 'Horizontal selection failed');
        await page.locator('#transcribe-play').click(); await page.waitForTimeout(120);
        assert.equal(await page.locator('#transcribe-play').getAttribute('aria-label'), 'Pause');
        await page.locator('#transcribe-play').click();
        await page.locator('#transcribe-keyboard').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#transcribe-keyboard').getAttribute('aria-valuenow'), '25');
        await page.keyboard.down('Space'); await page.keyboard.up('Space');
        assert(await page.locator('#transcribe-audio').evaluate(e => e.paused), 'Piano Space started recording');
        await page.keyboard.press('c'); await page.waitForTimeout(200);
        const close = page.getByRole('button', { name: 'Close controls', exact: true });
        assert(await close.isVisible());
        for (const theme of ['light', 'dark']) {
          await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
          await page.waitForTimeout(150);
          if (output) await page.screenshot({ path: `${output}/${name}-${theme}.png` });
        }
        const highpass = page.locator('#transcribe-highpass');
        await highpass.fill('120'); await highpass.dispatchEvent('change');
        await page.getByRole('button', { name: 'Reset EQ to default', exact: true }).click();
        assert.equal(await highpass.inputValue(), '20');
        await page.getByRole('button', { name: 'Using the equalizer', exact: true }).click();
        assert(await page.locator('#transcribe-eq-info').evaluate(e => e.matches(':popover-open')));
        await page.keyboard.press('Escape');
        const geometry = await page.evaluate(() => {
          const eq = document.querySelector('#transcribe-section-eq').getBoundingClientRect();
          const stems = document.querySelector('#transcribe-section-stems').getBoundingClientRect();
          const play = document.querySelector('#transcribe-play').getBoundingClientRect();
          const small = [...document.querySelectorAll('.transcribe-flat-sidebar button,.transcribe-flat-sidebar input,.transcribe-flat-sidebar select,.transcribe-transport-sliders input')].filter(e => !e.disabled).map(e => ({ id: e.id, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })).filter(r => r.w && r.h && (r.w < 43.9 || r.h < 43.9));
          return { overlap: eq.bottom > stems.top, small, playBottom: play.bottom, width: document.documentElement.scrollWidth };
        });
        assert(!geometry.overlap, 'EQ overlaps Stems');
        if (touch) assert.deepEqual(geometry.small, [], 'Small settings hit areas');
        assert(await page.locator('.transcribe-section-reset').evaluateAll(buttons => buttons.every(e => e.scrollWidth <= e.clientWidth + 1)), 'Reset label clipped');
        assert(geometry.playBottom <= height + 1, 'Playback clipped');
        assert(geometry.width <= width + 1, 'Document overflow');
        await close.click();
        await page.locator('#transcribe-file').setInputFiles({ name: 'invalid.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') });
        await page.waitForFunction(() => document.getElementById('transcribe-selection-status').textContent.includes('could not be decoded'));
        assert.deepEqual(errors, []);
        results.push({ name, pass: true, touchWavePoint: point });
      } catch (error) {
        results.push({ name, pass: false, error: error.message });
        if (output) await page.screenshot({ path: `${output}/${name}-failure.png` });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  if (output) fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  assert(results.every(result => result.pass), 'Responsive workflow regressions found');
})().catch(error => { console.error(error); process.exitCode = 1; });
