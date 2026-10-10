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
    // Development builds expose the same controls without ever loading Google.
    if (process.env.ANALYTICS_EXPECT_DISABLED === '1') {
      for (const route of ['/', '/work/', '/privacy/', '/birds/', '/personal/', '/portfolio/', '/lifting/', '/transcribe/', '/cta-l-live-art/']) {
        const dev = await setup();
        await visit(dev.page, route);
        async function revealPreferences() {
          if (route === '/transcribe/') {
            await dev.page.waitForFunction(() => !document.querySelector('[data-transcribe-app]').hasAttribute('data-loading'));
            await dev.page.locator('#transcribe-shortcuts-toggle').click();
          }
          await dev.page.locator('.analytics-preferences').last().waitFor({state:'visible'});
        }
        await revealPreferences();
        assert.equal(await dev.page.locator('.analytics-notice').isVisible(), false);
        const button = dev.page.locator('.analytics-preferences').last();
        assert.equal(await button.isVisible(), true);
        await button.click();
        assert.match(await dev.page.locator('.analytics-notice-status').textContent(), /does not collect analytics/);
        await choose(dev.page, 'yes');
        await dev.page.reload();
        await revealPreferences();
        await button.click(); await choose(dev.page, 'no');
        assert.deepEqual(dev.google, []);
        assert.equal(await dev.page.evaluate(id => window['ga-disable-' + id], id), true);
        await dev.context.close();
      }
      assert.deepEqual(errors, []);
      console.log('Development preferences: shared and standalone controls, acceptance, persistence, withdrawal, and zero Google requests passed.');
      return;
    }
    // First visit, rejection, persistence across routes, opt-in, configuration, withdrawal.
    const {context, page, google} = await setup();
    await visit(page, '/?private=value#token');
    assert.equal(await page.locator('.site-footer-privacy [data-analytics-preferences]').count(), 1);
    assert.equal(await page.locator('.site-footer-privacy [data-analytics-preferences]').isVisible(), true);
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
    assert.equal(await expiring.page.evaluate(() => window.siteAnalytics.track('tool_start', 'transcribe')), false);
    assert.equal(await expiring.page.evaluate(() => window.siteAnalytics.trackSite('theme_change', 'dark')), false);
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
      assert.equal(await excluded.page.evaluate(() => window.siteAnalytics.track('tool_start', 'transcribe')), false);
      await excluded.page.locator('.keyboard-navigation-toggle').click();
      assert.equal(await excluded.page.evaluate(() => window.siteAnalytics.trackSite('theme_change', 'dark')), false);
      assert.equal(await excluded.page.evaluate(() => window.dataLayer?.length || 0), 0);
      assert.ok(await excluded.page.locator('.analytics-preferences').count());
      await excluded.context.close();
    }
    // Privacy preferences work from a page that does not itself collect analytics.
    const privacy = await setup(); await visit(privacy.page, '/privacy/');
    await privacy.page.locator('main [data-analytics-preferences]').click();
    await choose(privacy.page, 'yes'); assert.deepEqual(privacy.google, []);
    await open(privacy.page);
    assert.match(await privacy.page.locator('.analytics-notice-status').textContent(), /does not collect analytics/);
    await choose(privacy.page, 'no'); assert.deepEqual(privacy.google, []);
    await open(privacy.page); await choose(privacy.page, 'yes');
    await visit(privacy.page); await privacy.page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    await privacy.context.close();
    // Browser opt-outs and unavailable storage.
    for (const signal of ['doNotTrack', 'globalPrivacyControl']) {
      const optout = await setup();
      await optout.context.addInitScript(signal => Object.defineProperty(navigator, signal, {value:signal === 'doNotTrack' ? '1' : true}), signal);
      await visit(optout.page); await open(optout.page);
      assert.equal(await optout.page.locator('.analytics-yes').isVisible(), false);
      assert.deepEqual(optout.google, []);
      assert.equal(await optout.page.evaluate(() => window.siteAnalytics.track('tool_start', 'transcribe')), false);
      assert.equal(await optout.page.evaluate(() => window.siteAnalytics.trackSite('theme_change', 'dark')), false);
      await optout.context.close();
    }
    const blocked = await setup();
    await blocked.context.addInitScript(() => {Storage.prototype.getItem = Storage.prototype.setItem = () => {throw new Error('Storage blocked');};});
    await visit(blocked.page); assert.deepEqual(blocked.google, []);
    await choose(blocked.page, 'yes'); await blocked.page.waitForFunction(() => typeof window.__gaTestEmit === 'function');
    await blocked.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await blocked.page.evaluate(id => window['ga-disable-' + id], id), false);
    await blocked.context.close();
    // Shared controls: no replay, fixed values, resulting settings, and one event per click.
    const shared = await setup({viewport:{width:390, height:900}});
    const siteCommands = p => p.evaluate(() => (window.dataLayer || []).map(a => Array.from(a)).filter(a => a[0] === 'event'));
    await visit(shared.page);
    await shared.page.locator('.nav-toggle').click();
    await shared.page.locator('[data-theme-toggle]').click();
    await shared.page.keyboard.press('Alt+Shift+K');
    assert.deepEqual(await siteCommands(shared.page), []);
    await choose(shared.page, 'yes');
    assert.deepEqual(await siteCommands(shared.page), []);
    await shared.page.locator('.nav-toggle').click();
    await shared.page.locator('[data-theme-toggle]').click();
    await shared.page.locator('.nav-toggle').click();
    await shared.page.locator('.nav-toggle').click();
    await shared.page.locator('[data-nav-section="about"] span').click();
    await shared.page.keyboard.press('Alt+Shift+K');
    await shared.page.locator('.keyboard-navigation-toggle').click();
    assert.deepEqual(await siteCommands(shared.page), [
      ['event', 'navigation_menu', {state:'open'}],
      ['event', 'theme_change', {theme:'dark'}],
      ['event', 'navigation_menu', {state:'close'}],
      ['event', 'navigation_menu', {state:'open'}],
      ['event', 'navigation_click', {destination:'about', placement:'header'}],
      ['event', 'keyboard_navigation_change', {state:'off'}],
      ['event', 'keyboard_navigation_change', {state:'on'}]
    ]);
    // Prevent navigation only in the test so its outgoing command remains inspectable.
    await shared.page.evaluate(() => document.addEventListener('click', e => {
      if (e.target.closest('a')) e.preventDefault();
    }, true));
    await shared.page.locator('.home-featured-project-title').click();
    await shared.page.locator('.home-project-index a').first().click();
    await shared.page.locator('.post-card').first().click();
    await shared.page.locator('.site-footer-privacy a').click();
    assert.deepEqual((await siteCommands(shared.page)).slice(-4), [
      ['event', 'navigation_click', {destination:'transcribe', placement:'home'}],
      ['event', 'navigation_click', {destination:'cta_l_live_art', placement:'home'}],
      ['event', 'navigation_click', {destination:'post', placement:'posts'}],
      ['event', 'navigation_click', {destination:'privacy', placement:'footer'}]
    ]);
    const beforeSiteInvalid = await siteCommands(shared.page);
    assert.deepEqual(await shared.page.evaluate(() => [
      window.siteAnalytics.trackSite('__proto__', 'dark'),
      window.siteAnalytics.trackSite('theme_change', 'private text'),
      window.siteAnalytics.trackSite('theme_change', 'dark', 'private text'),
      window.siteAnalytics.trackSite('navigation_click', 'work', 'private text')
    ]), [false, false, false, false]);
    assert.deepEqual(await siteCommands(shared.page), beforeSiteInvalid);
    await open(shared.page); await choose(shared.page, 'no');
    await shared.page.keyboard.press('Alt+Shift+K');
    assert.deepEqual(await siteCommands(shared.page), beforeSiteInvalid);
    await shared.context.close();
    const entries = await setup();
    await entries.context.addInitScript(({key, ttl}) => localStorage.setItem(key, JSON.stringify({version:1, choice:'yes', expiresAt:Date.now() + ttl})), {key, ttl});
    await visit(entries.page, '/work/');
    assert.deepEqual(await siteCommands(entries.page), []);
    await entries.page.evaluate(() => {
      document.querySelector('.work-card').href += '?private=value#secret';
      document.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); }, true);
    });
    await entries.page.locator('.work-card-title').first().click();
    await entries.page.locator('[data-nav-route="work"] span').click();
    assert.deepEqual(await siteCommands(entries.page), [
      ['event', 'navigation_click', {destination:'transcribe', placement:'work'}],
      ['event', 'navigation_click', {destination:'work', placement:'header'}]
    ]);
    await entries.context.close();
    console.log('Shared site events: consent gating, navigation placements, menu, theme, keyboard shortcut/button, exclusions, fixed values, and URL privacy passed.');
    // Tool events fail closed, discard pre-consent actions, and only accept fixed values.
    const events = await setup();
    await visit(events.page, '/gradecalculatorv2/');
    await events.page.locator('#current-grade').fill('92.5');
    await events.page.locator('#current-grade').blur();
    assert.equal(await events.page.evaluate(() => window.dataLayer?.length || 0), 0);
    await choose(events.page, 'yes');
    const eventCommands = p => p.evaluate(() => (window.dataLayer || []).map(a => Array.from(a)).filter(a => a[0] === 'event'));
    assert.deepEqual(await eventCommands(events.page), []); // No pre-consent replay.
    await events.page.locator('#current-grade').fill('93');
    await events.page.locator('#current-grade').blur();
    assert.deepEqual(await eventCommands(events.page), [
      ['event', 'tool_start', {tool_name:'grade_calculator'}],
      ['event', 'tool_complete', {tool_name:'grade_calculator', action:'calculation'}]
    ]);
    await events.page.locator('#rounding-toggle').click();
    await events.page.locator('#rounding-toggle').click();
    assert.equal((await eventCommands(events.page)).filter(a => a[1] === 'tool_action').length, 1);
    const beforeInvalid = await eventCommands(events.page);
    assert.deepEqual(await events.page.evaluate(() => [
      window.siteAnalytics.track('tool_action', 'grade_calculator', 'private text'),
      window.siteAnalytics.track('tool_complete', 'portfolio', 'calculation'),
      window.siteAnalytics.track('__proto__', 'grade_calculator', 'private text'),
      window.siteAnalytics.track('tool_start', '__proto__'),
      window.siteAnalytics.track('tool_export', 'transcribe', 'private-filename.wav')
    ]), [false, false, false, false, false]);
    assert.deepEqual(await eventCommands(events.page), beforeInvalid);
    await open(events.page); await choose(events.page, 'no');
    await events.page.locator('#current-grade').fill('94');
    await events.page.locator('#current-grade').blur();
    assert.deepEqual(await eventCommands(events.page), beforeInvalid);
    await events.context.close();

    // Detailed finals interactions: committed inputs, successful saves, errors,
    // resets, and dismissals. No telemetry from rendering or individual keystrokes.
    const finals = await setup();
    await visit(finals.page, '/gradecalculatorv2/'); await choose(finals.page, 'yes');
    const gradeEvents = () => eventCommands(finals.page);
    const gradeAction = (event, value) => ['event', event, {
      tool_name:'grade_calculator', [event === 'tool_error' ? 'error_code' : 'action']:value
    }];
    const expectedGrade = [];
    assert.deepEqual(await gradeEvents(), []);
    await finals.page.locator('#current-grade').fill('92.5');
    assert.deepEqual(await gradeEvents(), []);
    await finals.page.locator('#current-grade').blur();
    expectedGrade.push(['event', 'tool_start', {tool_name:'grade_calculator'}], gradeAction('tool_complete', 'calculation'));
    assert.deepEqual(await gradeEvents(), expectedGrade);
    for (const score of ['85', '86']) {
      await finals.page.locator('#example-final-grade').fill(score);
      assert.deepEqual(await gradeEvents(), expectedGrade);
      await finals.page.locator('#example-final-grade').blur();
      expectedGrade.push(gradeAction('tool_complete', 'final_score_preview'));
      assert.equal(await finals.page.locator('#example-output').getAttribute('data-result'), 'true');
      assert.deepEqual(await gradeEvents(), expectedGrade);
    }
    await finals.page.locator('#current-grade').fill('151');
    await finals.page.locator('#current-grade').blur();
    expectedGrade.push(gradeAction('tool_error', 'current_grade_invalid'));
    assert.equal(await finals.page.locator('#current-grade').getAttribute('aria-invalid'), 'true');
    await finals.page.locator('#current-grade').fill('93');
    await finals.page.locator('#current-grade').blur();
    expectedGrade.push(gradeAction('tool_complete', 'calculation'));
    await finals.page.locator('#example-final-grade').fill('101');
    await finals.page.locator('#example-final-grade').blur();
    expectedGrade.push(gradeAction('tool_error', 'final_score_invalid'));
    await finals.page.locator('#example-final-grade').fill('');
    await finals.page.locator('#example-final-grade').blur();
    expectedGrade.push(gradeAction('tool_interaction', 'final_score_cleared'));
    assert.deepEqual(await gradeEvents(), expectedGrade);
    for (const state of ['disabled', 'enabled']) {
      await finals.page.locator('#rounding-toggle').click();
      if (state === 'disabled') expectedGrade.push(gradeAction('tool_action', 'rounding_changed'));
      expectedGrade.push(gradeAction('tool_interaction', 'rounding_' + state));
    }
    for (const [setting, input, invalid, dismissal] of [
      ['rounding', '#rounding-window', '11', 'button'],
      ['scale', '#scale-1', '99', 'escape'],
      ['weight', '#final-weight', '101', 'backdrop']
    ]) {
      await finals.page.locator(`[data-open-dialog="${setting}-dialog"]`).click();
      expectedGrade.push(gradeAction('tool_interaction', setting + '_opened'));
      await finals.page.locator(input).fill(invalid);
      await finals.page.locator('#save-' + setting).click();
      expectedGrade.push(gradeAction('tool_error', setting + '_invalid'));
      assert.equal(await finals.page.locator('#' + setting + '-dialog').evaluate(el => el.open), true);
      assert.deepEqual(await gradeEvents(), expectedGrade);
      await finals.page.locator('#reset-' + setting).click();
      expectedGrade.push(gradeAction('tool_interaction', setting + '_reset'));
      await finals.page.locator('#save-' + setting).click();
      if (setting !== 'rounding') expectedGrade.push(gradeAction('tool_action', setting + '_saved'));
      expectedGrade.push(gradeAction('tool_complete', setting + '_saved'));
      await finals.page.waitForFunction(id => !document.getElementById(id).open, setting + '-dialog');
      // Successful saves must not also count as abandoning the dialog.
      assert.deepEqual(await gradeEvents(), expectedGrade);
      await finals.page.locator(`[data-open-dialog="${setting}-dialog"]`).click();
      expectedGrade.push(gradeAction('tool_interaction', setting + '_opened'));
      if (dismissal === 'escape') await finals.page.keyboard.press('Escape');
      else if (dismissal === 'backdrop') await finals.page.mouse.click(2, 2);
      else await finals.page.locator('#' + setting + '-dialog [data-close-dialog]').click();
      expectedGrade.push(gradeAction('tool_interaction', setting + '_dismissed'));
      await finals.page.waitForFunction(id => !document.getElementById(id).open, setting + '-dialog');
      await finals.page.waitForFunction(action => window.dataLayer.some(a => a[2]?.action === action), setting + '_dismissed');
      assert.deepEqual(await gradeEvents(), expectedGrade);
    }
    // Repeated successful saves count each time; adoption counts only once.
    await finals.page.locator('[data-open-dialog="weight-dialog"]').click();
    expectedGrade.push(gradeAction('tool_interaction', 'weight_opened'));
    await finals.page.locator('#save-weight').click();
    expectedGrade.push(gradeAction('tool_complete', 'weight_saved'));
    await finals.page.locator('#current-grade').fill('');
    await finals.page.locator('#current-grade').blur();
    expectedGrade.push(gradeAction('tool_interaction', 'current_grade_cleared'));
    assert.equal(await finals.page.locator('#results-panel').isVisible(), false);
    assert.deepEqual(await gradeEvents(), expectedGrade);
    assert.deepEqual(await finals.page.evaluate(() => [
      window.siteAnalytics.track('tool_interaction', 'grade_calculator', '92.5'),
      window.siteAnalytics.track('tool_interaction', 'transcribe', 'weight_opened'),
      window.siteAnalytics.track('tool_error', 'grade_calculator', 'raw private error')
    ]), [false, false, false]);
    await open(finals.page); await choose(finals.page, 'no');
    await finals.page.locator('[data-open-dialog="rounding-dialog"]').click();
    await finals.page.locator('#rounding-window').fill('11');
    await finals.page.locator('#save-rounding').click();
    await finals.page.locator('#reset-rounding').click();
    await finals.page.locator('#save-rounding').click();
    assert.deepEqual(await gradeEvents(), expectedGrade);
    await finals.context.close();
    const mobileFinals = await setup({viewport:{width:390, height:900}});
    await visit(mobileFinals.page, '/gradecalculatorv2/'); await choose(mobileFinals.page, 'yes');
    await mobileFinals.page.locator('#mobile-settings-open').click();
    await mobileFinals.page.locator('#mobile-settings-open').click();
    await mobileFinals.page.locator('#mobile-settings-open').click();
    await mobileFinals.page.keyboard.press('Escape');
    assert.deepEqual(await eventCommands(mobileFinals.page), [
      ['event', 'tool_start', {tool_name:'grade_calculator'}],
      gradeAction('tool_interaction', 'mobile_settings_opened'),
      gradeAction('tool_interaction', 'mobile_settings_closed'),
      gradeAction('tool_interaction', 'mobile_settings_opened'),
      gradeAction('tool_interaction', 'mobile_settings_closed')
    ]);
    await mobileFinals.context.close();
    console.log('Detailed finals events: committed calculations/previews, settings saves/resets/dismissals, validation errors, mobile settings, repeated outcomes, and withdrawal passed.');

    {
      // Detailed investment events: fixed labels, real controls, intercepted data API.
      const calculator = await setup();
      await visit(calculator.page, '/investmentcalculator/');
      const investmentEvents = () => eventCommands(calculator.page);
      await calculator.page.locator('[data-investment-switch="interest"]').click();
      await calculator.page.locator('#interest-rate').fill('7');
      await calculator.page.locator('#interest-rate').blur();
      assert.deepEqual(await investmentEvents(), []);
      await choose(calculator.page, 'yes');
      assert.deepEqual(await investmentEvents(), []); // No replay or restored-view event.
      let failStock = false;
      let includeInflation = true;
      const apiUrl = await calculator.page.locator('[data-investment-calculator]').getAttribute('data-api-url');
      await calculator.context.route(apiUrl, async route => {
        const request = route.request().postDataJSON();
        if (failStock) return route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({error:'private backend detail'})});
        const inflation = includeInflation ? {factor:1.1, source:'Test CPI'} : null;
        const body = request.action === 'investmentHistory'
          ? {purchase:{date:'2020-01-02', price:100}, current:{date:'2021-01-04', price:120}, inflation}
          : {factor:1.1, source:'Test CPI'};
        await route.fulfill({contentType:'application/json', body:JSON.stringify(body)});
      });
      for (const view of ['stock', 'interest', 'stock']) {
        await calculator.page.locator(`[data-investment-switch="${view}"]`).click();
      }
      let events = await investmentEvents();
      assert.equal(events.filter(e => e[1] === 'tool_interaction' && e[2].action === 'stock_view').length, 2);
      const beforeActiveClick = events.length;
      await calculator.page.locator('[data-investment-switch="stock"]').click();
      assert.equal((await investmentEvents()).length, beforeActiveClick);
      for (const [selector, value, field] of [
        ['#investment-amount', '2500', 'amount'], ['#investment-symbol', 'PRIVATE', 'ticker'],
        ['#investment-date', '01-01-2020', 'start_date'], ['#investment-end-date', '01-01-2021', 'end_date']
      ]) {
        await calculator.page.locator(selector).fill(value);
        await calculator.page.locator(selector).blur();
        assert.ok((await investmentEvents()).some(e => e[2].action === field + '_changed'), field);
      }
      // Masked keyboard edits bypass native change; blur commits once.
      const dateField = calculator.page.locator('#investment-date');
      const changedDates = async () => (await investmentEvents()).filter(e => e[2].action === 'start_date_changed').length;
      const priorDateChanges = await changedDates();
      await dateField.click();
      await dateField.pressSequentially('01022020');
      assert.equal(await changedDates(), priorDateChanges);
      await dateField.blur();
      assert.equal(await changedDates(), priorDateChanges + 1);
      await dateField.focus(); await dateField.blur();
      assert.equal(await changedDates(), priorDateChanges + 1);
      await dateField.click(); await dateField.blur();
      assert.ok((await investmentEvents()).some(e => e[2].action === 'start_date_cleared'));
      await dateField.fill('01-01-2020'); await dateField.blur();
      async function calculate(prefix) {
        await calculator.page.locator('#' + prefix + '-submit').click();
        await calculator.page.waitForFunction(prefix => !document.getElementById(prefix + '-submit').disabled, prefix);
      }
      await calculate('investment');
      assert.equal(await calculator.page.locator('#investment-results').isVisible(), true);
      for (let i = 0; i < 4; i++) await calculator.page.locator('#investment-details-toggle').click();
      includeInflation = false;
      await calculate('investment');
      failStock = true;
      await calculate('investment');
      failStock = false;
      await calculator.page.locator('#investment-end-date').fill('01-01-2019');
      await calculate('investment'); // Semantic range validation after native validation.
      await calculator.page.locator('#investment-amount').fill('');
      await calculator.page.locator('#investment-amount').blur();
      await calculate('investment'); // Native validation prevents the submit handler.
      events = await investmentEvents();
      const stock = events.filter(e => e[2].tool_name === 'investment_calculator');
      assert.equal(stock.filter(e => e[1] === 'tool_start').length, 1);
      assert.equal(stock.filter(e => e[1] === 'tool_complete').length, 2);
      for (const action of ['details_opened', 'details_closed']) {
        assert.equal(stock.filter(e => e[1] === 'tool_interaction' && e[2].action === action).length, 2);
      }
      for (const code of ['calculation_failed', 'dates_invalid', 'amount_invalid']) {
        assert.ok(stock.some(e => e[2].error_code === code));
      }
      assert.ok(stock.some(e => e[2].action === 'amount_cleared'));
      assert.ok(stock.some(e => e[2].action === 'inflation_unavailable'));
      await calculator.page.locator('[data-investment-switch="interest"]').click();
      for (const [selector, value, field] of [
        ['#interest-principal', '3000', 'amount'], ['#interest-rate', '6', 'rate'],
        ['#interest-date', '01-01-2030', 'start_date'], ['#interest-end-date', '01-01-2031', 'end_date']
      ]) {
        await calculator.page.locator(selector).fill(value);
        await calculator.page.locator(selector).blur();
        assert.ok((await investmentEvents()).some(e => e[2].tool_name === 'interest_calculator' && e[2].action === field + '_changed'));
      }
      await calculate('interest');
      await calculator.page.locator('#interest-method').selectOption('simple');
      await calculate('interest');
      await calculator.page.locator('#interest-date').fill('01-01-2020');
      await calculator.page.locator('#interest-end-date').fill('01-01-2021');
      await calculate('interest');
      await calculator.page.locator('#interest-method').selectOption('compound');
      await calculate('interest');
      for (let i = 0; i < 4; i++) await calculator.page.locator('#interest-details-toggle').click();
      await calculator.page.locator('#interest-end-date').fill('01-01-2019');
      await calculate('interest');
      await calculator.page.locator('#interest-rate').fill('');
      await calculator.page.locator('#interest-rate').blur();
      await calculate('interest');
      events = await investmentEvents();
      const interest = events.filter(e => e[2].tool_name === 'interest_calculator');
      assert.equal(interest.filter(e => e[1] === 'tool_start').length, 1);
      assert.equal(interest.filter(e => e[2].action === 'calculation').length, 4);
      for (const action of ['compound_projection', 'simple_projection', 'compound_historical', 'simple_historical',
        'compound_selected', 'simple_selected', 'rate_cleared']) assert.ok(interest.some(e => e[2].action === action), action);
      for (const action of ['details_opened', 'details_closed']) {
        assert.equal(interest.filter(e => e[1] === 'tool_interaction' && e[2].action === action).length, 2);
      }
      for (const code of ['dates_invalid', 'rate_invalid']) assert.ok(interest.some(e => e[2].error_code === code));
      assert.ok(events.every(e => Object.keys(e[2]).every(k => ['tool_name', 'action', 'error_code', 'format'].includes(k))));
      assert.ok(!JSON.stringify(events).includes('PRIVATE'));
      assert.ok(!JSON.stringify(events).includes('private backend detail'));
      assert.deepEqual(await calculator.page.evaluate(() => [
        window.siteAnalytics.track('tool_interaction', 'investment_calculator', 'PRIVATE'),
        window.siteAnalytics.track('tool_complete', 'interest_calculator', '6'),
        window.siteAnalytics.track('tool_error', 'investment_calculator', 'private backend detail')
      ]), [false, false, false]);
      await open(calculator.page); await choose(calculator.page, 'no');
      await calculator.page.locator('#interest-method').selectOption('simple');
      await calculator.page.locator('#interest-rate').fill('5');
      await calculator.page.locator('#interest-end-date').fill('01-01-2021');
      await calculate('interest');
      await calculator.page.locator('#interest-details-toggle').click();
      await calculator.page.locator('[data-investment-switch="stock"]').click();
      assert.deepEqual(await investmentEvents(), events);
      await calculator.context.close();
      console.log('Detailed investment events: repeated switches/details/calculations, committed edits, masked dates, methods/projections, native/range validation, API failure, fixed labels, pre-consent discard, and withdrawal passed.');
    }

    // Real local audio decoding and feature controls; no audio or filename in events.
    const audio = await setup();
    async function openTranscribePreferences() {
      if (!await audio.page.locator('.transcribe-shortcuts').isVisible()) await audio.page.locator('#transcribe-shortcuts-toggle').click();
      await audio.page.locator('.analytics-preferences').click();
    }
    await visit(audio.page, '/transcribe/'); await choose(audio.page, 'no');
    await audio.page.locator('#transcribe-controls-toggle').click();
    await audio.page.locator('#transcribe-chords-toggle').click();
    await audio.page.locator('#transcribe-chords-toggle').click();
    await audio.page.locator('#transcribe-eq-reset').click();
    await audio.page.locator('#transcribe-controls-toggle').click();
    assert.deepEqual(await eventCommands(audio.page), []);
    await openTranscribePreferences(); await choose(audio.page, 'yes');
    assert.deepEqual(await eventCommands(audio.page), []);
    await audio.page.locator('#transcribe-shortcuts-toggle').click();
    const wav = Buffer.alloc(44 + 128000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(128000, 40);
    await audio.page.locator('#transcribe-file').setInputFiles({name:'private-recording.wav', mimeType:'audio/wav', buffer:wav});
    await audio.page.waitForFunction(() => window.dataLayer.some(a => a[2]?.action === 'audio_loaded'));
    const transcribeEvents = () => eventCommands(audio.page);
    const countAction = async (action, event = 'tool_interaction') => (await transcribeEvents()).filter(e => e[1] === event && e[2].action === action).length;
    assert.equal(await countAction('audio_loaded', 'tool_complete'), 1);
    await audio.page.locator('#transcribe-file').setInputFiles({name:'another-private.wav', mimeType:'audio/wav', buffer:wav});
    await audio.page.waitForFunction(() => window.dataLayer.filter(a => a[1] === 'tool_complete' && a[2]?.action === 'audio_loaded').length === 2);
    for (let i = 0; i < 2; i++) {
      await audio.page.locator('#transcribe-play').click();
      await audio.page.waitForFunction(() => !document.getElementById('transcribe-audio').paused);
      await audio.page.locator('#transcribe-play').click();
    }
    assert.equal(await countAction('playback_started'), 2);
    assert.equal(await countAction('playback_paused'), 2);
    for (let i = 0; i < 4; i++) await audio.page.locator('#transcribe-loop-bottom').click();
    assert.equal(await countAction('loop_enabled'), 2);
    assert.equal(await countAction('loop_disabled'), 2);
    await audio.page.locator('#transcribe-forward').click();
    await audio.page.locator('#transcribe-rewind').click();
    await audio.page.locator('#transcribe-start').click();
    await audio.page.locator('[data-speed="0.5"]').click();
    await audio.page.locator('[data-speed="1"]').click();
    assert.equal(await countAction('preset_speed_changed'), 2);
    await audio.page.locator('#transcribe-custom-speed-toggle').click();
    await audio.page.locator('#transcribe-custom-speed-input').fill('73');
    await audio.page.locator('#transcribe-custom-speed-input').press('Enter');
    assert.equal(await countAction('custom_speed_changed'), 1); // Enter + blur do not duplicate.
    await audio.page.locator('#transcribe-controls-toggle').click();
    for (const selector of ['#transcribe-pitch-lock', '#transcribe-chords-toggle', '#transcribe-analyze-selection']) {
      await audio.page.locator(selector).click(); await audio.page.locator(selector).click();
    }
    await audio.page.locator('#transcribe-semitones-number').fill('2');
    await audio.page.locator('#transcribe-semitones-number').blur();
    await audio.page.locator('#transcribe-detection-mode').selectOption('bass');
    await audio.page.locator('#transcribe-detection-low').fill('invalid-private-note');
    await audio.page.locator('#transcribe-detection-low').blur();
    await audio.page.locator('#transcribe-detection-low').fill('C2');
    await audio.page.locator('#transcribe-detection-low').blur();
    await audio.page.locator('#transcribe-eq-bands input[aria-label="Band 1 gain"]').fill('3');
    await audio.page.locator('#transcribe-eq-bands input[aria-label="Band 1 gain"]').blur();
    assert.equal(await countAction('eq_changed'), 1);
    await audio.page.locator('#transcribe-eq-reset').click();
    assert.equal(await countAction('eq_reset'), 1);
    assert.equal(await countAction('eq_changed'), 1); // Reset's synthetic cut changes don't count.
    await audio.page.getByRole('button', {name:'Reset Analysis to default', exact:true}).click();
    assert.equal(await countAction('analysis_reset'), 1);
    await audio.page.locator('#transcribe-shortcuts-toggle').click();
    await audio.page.keyboard.press('Escape');
    await audio.page.locator('#transcribe-start').click();
    await audio.page.locator('#transcribe-play').focus();
    await audio.page.keyboard.press('m');
    await audio.page.keyboard.press('ArrowRight');
    await audio.page.keyboard.press('m');
    await audio.page.keyboard.press('ControlOrMeta+z');
    await audio.page.keyboard.press('ControlOrMeta+Shift+z');
    assert.equal(await countAction('measure_marked'), 2);
    assert.equal(await countAction('markers_undone'), 1);
    assert.equal(await countAction('markers_redone'), 1);
    // Keep separation local and deterministic: a stub worker never loads models.
    await audio.context.route('**/transcribe-stems-worker.js*', route => route.fulfill({contentType:'text/javascript', body:'self.onmessage = () => {};'}));
    const waveform = await audio.page.locator('#transcribe-waveform').boundingBox();
    await audio.page.mouse.move(waveform.x + waveform.width * .15, waveform.y + waveform.height * .5);
    await audio.page.mouse.down();
    await audio.page.mouse.move(waveform.x + waveform.width * .65, waveform.y + waveform.height * .5, {steps:4});
    await audio.page.mouse.up();
    assert.equal(await countAction('selection_changed'), 1);
    await audio.page.locator('#transcribe-controls-toggle').click();
    for (let i = 0; i < 2; i++) {
      await audio.page.locator('#transcribe-stems-enabled').click();
      await audio.page.waitForFunction(() => document.getElementById('transcribe-stems-enabled').textContent === 'Cancel');
      await audio.page.locator('#transcribe-stems-enabled').click();
    }
    assert.equal(await countAction('stems_requested'), 2);
    assert.equal(await countAction('stems_canceled'), 2);
    await audio.page.locator('#transcribe-controls-toggle').click();
    await audio.page.locator('#transcribe-keyboard').focus();
    await audio.page.keyboard.press('Space');
    assert.equal(await countAction('piano_note_played'), 1);
    const downloadPromise = audio.page.waitForEvent('download');
    await audio.page.locator('#transcribe-config-export').click();
    const configDownload = await downloadPromise;
    await audio.page.locator('#transcribe-config-file').setInputFiles({name:'private-config.json', mimeType:'application/json', buffer:fs.readFileSync(await configDownload.path())});
    await audio.page.waitForFunction(() => window.dataLayer.some(a => a[1] === 'tool_complete' && a[2]?.action === 'config_imported'));
    await audio.page.locator('#transcribe-config-file').setInputFiles({name:'private-bad.json', mimeType:'application/json', buffer:Buffer.from('{bad')});
    await audio.page.waitForFunction(() => window.dataLayer.some(a => a[2]?.error_code === 'config_import_failed'));
    const audioEvents = await transcribeEvents();
    for (const action of ['seek_forward', 'seek_backward', 'return_to_start', 'pitch_changed',
      'pitch_lock_enabled', 'pitch_lock_disabled', 'chords_enabled', 'chords_disabled',
      'selection_analysis_enabled', 'selection_analysis_disabled', 'detection_bass_selected',
      'detection_range_changed', 'controls_opened', 'controls_closed', 'shortcuts_opened', 'shortcuts_closed']) {
      assert.ok(audioEvents.some(e => e[1] === 'tool_interaction' && e[2].action === action), action);
    }
    assert.ok(audioEvents.some(e => e[2].error_code === 'detection_range_invalid'));
    assert.equal(audioEvents.filter(e => e[1] === 'tool_start').length, 1);
    assert.ok(audioEvents.every(e => Object.keys(e[2]).every(k => ['tool_name', 'action', 'error_code', 'format'].includes(k))));
    assert.ok(!JSON.stringify(audioEvents).includes('private'));
    assert.deepEqual(await audio.page.evaluate(() => [
      window.siteAnalytics.track('tool_interaction', 'transcribe', 'private-recording.wav'),
      window.siteAnalytics.track('tool_complete', 'transcribe', '73'),
      window.siteAnalytics.track('tool_error', 'transcribe', 'invalid-private-note')
    ]), [false, false, false]);
    await openTranscribePreferences(); await choose(audio.page, 'no');
    const eventsAtWithdrawal = await transcribeEvents();
    await audio.page.locator('#transcribe-controls-toggle').click();
    await audio.page.locator('#transcribe-loop-bottom').click();
    await audio.page.locator('#transcribe-chords-toggle').click();
    await audio.page.locator('#transcribe-eq-reset').click();
    assert.deepEqual(await transcribeEvents(), eventsAtWithdrawal);
    await audio.page.reload();
    await audio.page.waitForFunction(() => !document.querySelector('[data-transcribe-app]').hasAttribute('data-loading'));
    await openTranscribePreferences(); await choose(audio.page, 'yes');
    assert.deepEqual(await transcribeEvents(), []); // Auto-restored audio/settings are not usage.
    await audio.context.close();
    console.log('Detailed Transcribe events: repeated audio/playback/looping, transport and keyboard controls, speed/pitch, analysis, EQ, markers/history, config export/import/error, fixed labels, withdrawal, and silent session restoration passed.');

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
