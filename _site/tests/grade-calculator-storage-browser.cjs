const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

// Exercise the calculator source independently of Jekyll and external site services.
const source = fs.readFileSync(path.join(__dirname, '..', 'gradecalculatorv2.html'), 'utf8')
  .replace(/^---[\s\S]*?---\s*/, '');
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(source);
});
const key = 'finals-grade-calculator-v1';

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    let page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const open = id => page.locator(`[data-open-dialog="${id}-dialog"]`).click();
    await page.goto(url);
    assert.match(await page.locator('#settings-summary').innerText(), /Final exam counts for 20%/);
    await page.locator('#current-grade').fill('92.5');
    await page.locator('#example-final-grade').fill('86');
    await page.locator('#rounding-toggle').click();
    await open('rounding');
    await page.locator('#rounding-window').fill('1.25');
    await page.locator('#save-rounding').click();
    await open('weight');
    await page.locator('#final-weight').fill('35');
    await page.locator('#save-weight').click();
    await open('scale');
    await page.locator('#scale-1').fill('94');
    await page.locator('#save-scale').click();
    const expected = await saved();
    assert.equal(expected.scale[1].low, 94);
    assert.equal(expected.finalWeight, 35);
    assert.equal(expected.roundingWindow, 1.25);
    assert.equal(expected.roundingEnabled, false);
    assert.equal(expected.currentGrade, 92.5);
    assert.equal(expected.finalScore, 86);

    // A new page on the same origin must restore inputs and calculated results.
    await page.close();
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    assert.equal(await page.locator('#current-grade').inputValue(), '92.5');
    assert.equal(await page.locator('#example-final-grade').inputValue(), '86');
    assert.match(await page.locator('#example-output').innerText(), /90.22%/);
    assert.match(await page.locator('#settings-summary').innerText(), /Final exam counts for 35%.*Rounding is off/);
    await open('scale');
    assert.equal(await page.locator('#scale-1').inputValue(), '94');
    await page.locator('#scale-0').fill('10');
    await page.locator('#save-scale').click();
    assert.deepEqual(await saved(), expected);
    await page.locator('#scale-dialog [data-close-dialog]').first().click();
    await open('weight');
    await page.locator('#final-weight').fill('101');
    await page.locator('#save-weight').click();
    assert.deepEqual(await saved(), expected);
    await page.locator('#final-weight').fill('50');
    await page.locator('#weight-dialog [data-close-dialog]').first().click();
    await page.locator('#current-grade').fill('151');
    await page.locator('#example-final-grade').fill('101');
    assert.deepEqual(await saved(), expected);
    await page.reload();
    assert.equal(await page.locator('#current-grade').inputValue(), '92.5');
    await page.locator('#example-final-grade').fill('');
    await page.locator('#current-grade').fill('');
    await page.reload();
    assert.equal(await page.locator('#current-grade').inputValue(), '');
    assert.equal(await page.locator('#example-final-grade').inputValue(), '');
    assert.equal(await page.locator('#results-panel').isVisible(), false);

    for (const setting of ['rounding', 'scale', 'weight']) {
      await open(setting);
      await page.locator(`#reset-${setting}`).click();
      await page.locator(`#${setting}-dialog [data-close-dialog]`).first().click();
    }
    await page.reload();
    const reset = await saved();
    assert.equal(reset.roundingWindow, 0.5);
    assert.equal(reset.finalWeight, 20);
    assert.equal(reset.scale[1].low, 93);

    // Reject malformed, unsupported, and out-of-range stored data safely.
    for (const value of ['{broken', JSON.stringify({ version: 2, finalWeight: 50 }),
      JSON.stringify({ version: 1, finalWeight: 101, currentGrade: '99', roundingWindow: -1,
        roundingEnabled: 'false', scale: expected.scale.map(grade => ({ ...grade, name: '<img>' })) })]) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
      await page.reload();
      assert.match(await page.locator('#settings-summary').innerText(), /Final exam counts for 20%.*within 0.5%/);
      assert.equal(await page.locator('#current-grade').inputValue(), '');
    }

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
    });
    const blockedPage = await blocked.newPage();
    blockedPage.on('pageerror', error => errors.push(error.message));
    await blockedPage.goto(url);
    await blockedPage.locator('#current-grade').fill('90');
    await blockedPage.locator('#example-final-grade').fill('80');
    assert.match(await blockedPage.locator('#example-output').innerText(), /88%/);
    assert.deepEqual(errors, []);
    console.log('Passed: reopening, calculations, saved settings, clearing, resets, invalid edits/data, and blocked storage.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
