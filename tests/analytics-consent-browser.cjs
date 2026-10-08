// Production build required. Google endpoints are intercepted; no test traffic reaches GA4.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = process.env.ANALYTICS_BUILD_DIR || '/private/tmp/mf-ga4-check';
const key = 'site-analytics-consent';
const id = 'G-DSJ82YWBSZ';
const ttl = 180 * 86400000;
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2'};
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(error ? 'Missing' : data);
  });
});
// Model the documented disable flag and config behavior to test the site's consent lifecycle.
const fakeTag = `(() => {
  const commands = window.dataLayer.map(args => Array.from(args));
  const config = commands.find(args => args[0] === 'config');
  window.__gaTestEmit = () => {
    if (window['ga-disable-${id}']) return;
    document.cookie = '_ga=test; path=/';
    document.cookie = '_ga_DSJ82YWBSZ=test; path=/';
    fetch('https://www.google-analytics.com/g/collect?en=page_view');
  };
  if (config) window.__gaTestEmit();
})();`;

(async () => {
  let browser;
  const errors = [];
  let origin;
  async function setup(options = {}) {
    const context = await browser.newContext(options);
    const google = [];
    await context.route(/https:\/\/.*(?:googletagmanager|google-analytics)\.com\//, async route => {
      google.push(route.request().url());
      if (route.request().url().includes('/gtag/js')) await route.fulfill({contentType:'text/javascript', body:fakeTag});
      else await route.fulfill({status:204});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return {context, page, google};
  }
  async function visit(page, route = '/') { await page.goto(origin + route); }
  async function choose(page, value) { await page.locator(value === 'yes' ? '.analytics-yes' : '.analytics-no').click(); }
  async function open(page) { await page.locator('.site-footer-privacy .analytics-preferences').click(); }
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
    // First visit, rejection, persistence across routes, opt-in, configuration, withdrawal.
    const {context, page, google} = await setup();
    await visit(page, '/?private=value#token');
    assert.equal(await page.locator('.analytics-notice').isVisible(), true);
    assert.deepEqual(google, []);
    assert.equal((await context.cookies()).some(c => c.name.startsWith('_ga')), false);
    await choose(page, 'no');
    await visit(page, '/work/');
    assert.equal(await page.locator('.analytics-notice').isVisible(), false);
    assert.deepEqual(google, []);
    await open(page);
    await choose(page, 'yes');
    await page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    await page.waitForFunction(() => document.cookie.includes('_ga='));
    assert.equal(google.filter(url => url.includes('/gtag/js')).length, 1);
    assert.equal(google.filter(url => url.includes('/g/collect')).length, 1);
    const commands = await page.evaluate(() => window.dataLayer.map(args => Array.from(args)));
    assert.equal(commands[0][0], 'consent');
    assert.equal(commands[0][2].analytics_storage, 'denied');
    assert.equal(commands[1][2].analytics_storage, 'granted');
    assert.equal(commands[1][2].ad_storage, 'denied');
    const config = commands.find(args => args[0] === 'config')[2];
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.allow_ad_personalization_signals, false);
    assert.equal(config.cookie_update, false);
    assert.equal(config.page_location, origin + '/work/');
    assert.ok(!config.page_referrer.includes('?') && !config.page_referrer.includes('#'));
    // Opening and reaccepting preferences must not duplicate the current page view.
    await open(page); await choose(page, 'yes');
    assert.equal(google.filter(url => url.includes('/g/collect')).length, 1);
    await page.reload();
    await page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    assert.equal(await page.locator('.analytics-notice').isVisible(), false);
    assert.equal(google.filter(url => url.includes('/gtag/js')).length, 2);
    await open(page); await choose(page, 'no');
    assert.equal((await context.cookies()).some(c => c.name.startsWith('_ga')), false);
    const count = google.length;
    await page.evaluate(() => window.__gaTestEmit());
    await page.waitForTimeout(100);
    assert.equal(google.length, count);
    await page.reload(); assert.equal(google.length, count);
    // Clearing consent and corrupt/expired preferences fail closed.
    for (const record of [null, '{bad json', JSON.stringify({version:1, choice:'yes', expiresAt:Date.now() - 1}), JSON.stringify({version:2, choice:'yes', expiresAt:Date.now() + ttl})]) {
      await page.evaluate(({key, record}) => record === null ? localStorage.removeItem(key) : localStorage.setItem(key, record), {key, record});
      await page.reload();
      assert.equal(await page.locator('.analytics-notice').isVisible(), true);
      assert.equal(google.length, count);
    }
    await context.close();
    // Consent expires while the page is open.
    const expiring = await setup();
    await expiring.context.addInitScript(({key}) => localStorage.setItem(key, JSON.stringify({version:1, choice:'yes', expiresAt:Date.now() + 1000})), {key});
    await visit(expiring.page);
    await expiring.page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    await expiring.page.locator('.analytics-notice').waitFor({state:'visible'});
    assert.equal(await expiring.page.evaluate(id => window['ga-disable-' + id], id), true);
    await expiring.context.close();
    // Withdrawal from another tab stops an already loaded tag.
    const tabs = await setup(); await visit(tabs.page); await choose(tabs.page, 'yes');
    await tabs.page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    const other = await tabs.context.newPage(); await visit(other);
    await open(other); await choose(other, 'no');
    await tabs.page.waitForFunction(id => window['ga-disable-' + id] === true, id);
    assert.equal((await tabs.context.cookies()).some(c => c.name.startsWith('_ga')), false);
    await tabs.context.close();
    // Eligible standalone pages share the controller; excluded pages never request Google.
    for (const route of ['/privacy/', '/birds/', '/personal/', '/portfolio/', '/lifting/']) {
      const excluded = await setup();
      await excluded.context.addInitScript(({key, ttl}) => localStorage.setItem(key, JSON.stringify({version:1, choice:'yes', expiresAt:Date.now() + ttl})), {key, ttl});
      await visit(excluded.page, route);
      assert.equal(await excluded.page.locator('.analytics-notice').isVisible(), false);
      assert.deepEqual(excluded.google, []);
      assert.ok(await excluded.page.locator('.analytics-preferences').count());
      await excluded.context.close();
    }
    // Privacy preferences work from a page that does not itself collect analytics.
    const privacy = await setup(); await visit(privacy.page, '/privacy/');
    await privacy.page.locator('[data-analytics-preferences]').click();
    await choose(privacy.page, 'yes'); assert.deepEqual(privacy.google, []);
    await visit(privacy.page); await privacy.page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    await privacy.context.close();
    // Browser opt-outs and unavailable storage.
    for (const signal of ['doNotTrack', 'globalPrivacyControl']) {
      const optout = await setup();
      await optout.context.addInitScript(signal => Object.defineProperty(navigator, signal, {value:signal === 'doNotTrack' ? '1' : true}), signal);
      await visit(optout.page); await open(optout.page);
      assert.equal(await optout.page.locator('.analytics-yes').isVisible(), false);
      assert.deepEqual(optout.google, []); await optout.context.close();
    }
    const blocked = await setup();
    await blocked.context.addInitScript(() => {Storage.prototype.getItem = Storage.prototype.setItem = () => {throw new Error('Storage blocked');};});
    await visit(blocked.page); assert.deepEqual(blocked.google, []);
    await choose(blocked.page, 'yes'); await blocked.page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    await blocked.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await blocked.page.evaluate(id => window['ga-disable-' + id], id), false);
    await blocked.context.close();
    // Optional real Google tag, downloaded separately; collection endpoints remain intercepted.
    if (process.env.ANALYTICS_REAL_TAG_PATH) {
      const realContext = await browser.newContext();
      const collected = [];
      let tagRequests = 0;
      await realContext.route(/^https:\/\//, async route => {
        const url = route.request().url();
        if (url.startsWith('https://www.googletagmanager.com/gtag/js?')) {
          tagRequests++;
          await route.fulfill({contentType:'text/javascript', body:fs.readFileSync(process.env.ANALYTICS_REAL_TAG_PATH, 'utf8')});
        } else {
          collected.push({url, body:route.request().postData()});
          await route.fulfill({status:204});
        }
      });
      const real = await realContext.newPage();
      await visit(real, '/?private=value#token');
      assert.equal(tagRequests, 0); assert.deepEqual(collected, []);
      await choose(real, 'yes');
      await real.waitForFunction(() => document.cookie.includes('_ga='));
      await real.waitForTimeout(1500);
      const pageviews = collected.filter(r => r.url.includes('google-analytics.com') &&
        (r.url.includes('en=page_view') || r.body?.includes('en=page_view')));
      assert.equal(tagRequests, 1);
      assert.equal(pageviews.length, 1, JSON.stringify(collected));
      const pageviewParams = new URL(pageviews[0].url).searchParams;
      assert.equal(pageviewParams.get('dl'), origin + '/');
      await open(real); await choose(real, 'no');
      const requestsAtWithdrawal = collected.length;
      assert.equal((await realContext.cookies()).some(c => c.name.startsWith('_ga')), false);
      await real.evaluate(id => window.gtag('event', 'consent_withdrawal_check', {send_to:id}), id);
      await real.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await real.waitForTimeout(1500);
      assert.equal(collected.length, requestsAtWithdrawal, JSON.stringify(collected));
      await realContext.close();
      console.log('Real Google tag: exactly one initial page view, URL sanitization, cookie deletion, and no collection after withdrawal passed; collection requests intercepted.');
    }
    // Notice geometry, themes, shortcuts, and opt-in focus; collect one screenshot batch.
    const screenshots = process.env.ANALYTICS_SCREENSHOT_DIR;
    for (const [width, theme, route] of [[1440,'light','/'], [390,'dark','/'], [320,'light','/'], [390,'dark','/transcribe/'], [390,'dark','/cta-l-live-art/']]) {
      const view = await setup({viewport:{width, height:900}, colorScheme:theme});
      await visit(view.page, route);
      const box = await view.page.locator('.analytics-notice').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      for (const button of ['.analytics-yes', '.analytics-no']) assert.ok((await view.page.locator(button).boundingBox()).height >= (width <= 720 ? 44 : 32));
      await view.page.locator('.analytics-no').focus();
      assert.equal(await view.page.locator('.analytics-no').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await view.page.keyboard.press('Alt+Shift+K');
      assert.equal(await view.page.evaluate(() => document.documentElement.dataset.keyboardNavigation), 'on');
      await view.page.keyboard.press('Tab');
      if (route === '/') await view.page.waitForTimeout(2500);
      if (route === '/transcribe/') await view.page.waitForTimeout(2000);
      if (screenshots) {
        fs.mkdirSync(screenshots, {recursive:true});
        await view.page.screenshot({path:path.join(screenshots, `${width}-${theme}-${route.replaceAll('/', '') || 'home'}.png`), fullPage:true});
      }
      assert.deepEqual(view.google, []);
      await view.context.close();
    }
    assert.deepEqual(errors, []);
    for (const file of ['index.html', 'transcribe/index.html', 'cta-l-live-art/index.html']) {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(html.includes('analytics-consent.js'));
      assert.ok(!html.includes('cloudflareinsights'));
    }
    console.log('Consent gating, persistence, withdrawal, expiry, cross-tab changes, exclusions, browser opt-outs, blocked storage, and five viewport/theme captures passed. Google tag behavior simulated; no GA4 dashboard verification.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => {console.error(error); process.exitCode = 1;});
