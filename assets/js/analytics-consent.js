/* Basic consent: the Google tag is requested only after an explicit Yes. */
(() => {
  const script = document.currentScript;
  const measurementId = script?.dataset.measurementId;
  if (!/^G-[A-Z0-9]+$/.test(measurementId || '')) return;
  const eligible = script.dataset.analyticsEnabled === 'true';
  const privacyUrl = script.dataset.privacyUrl;
  const storageKey = 'site-analytics-consent';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const version = 1;
  const disabledKey = `ga-disable-${measurementId}`;
  const browserOptOut = navigator.globalPrivacyControl === true ||
    [window.doNotTrack, navigator.doNotTrack, navigator.msDoNotTrack].some(value => value === '1' || value === 'yes');
  let memoryChoice = null;
  let choice = readChoice();
  let configured = false;
  let guarded = false;
  let expiryTimer;
  let returnFocus;
  window[disabledKey] = true;

  function readChoice() {
    try {
      const record = JSON.parse(localStorage.getItem(storageKey));
      if (record?.version === version && ['yes', 'no'].includes(record.choice) &&
          Number.isFinite(record.expiresAt) && record.expiresAt > Date.now() &&
          record.expiresAt <= Date.now() + lifetime) return record;
    } catch { return memoryChoice && memoryChoice.expiresAt > Date.now() ? memoryChoice : null; }
    return null;
  }

  function clearCookies() {
    const names = document.cookie.split(';').map(cookie => cookie.trim().split('=')[0])
      .filter(name => /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name));
    const parts = location.hostname.split('.');
    const domains = ['', location.hostname];
    for (let index = 0; index < parts.length - 1; index++) domains.push(`.${parts.slice(index).join('.')}`);
    const paths = ['/'];
    const segments = location.pathname.split('/').filter(Boolean);
    for (let index = 1; index <= segments.length; index++) {
      paths.push(`/${segments.slice(0, index).join('/')}`, `/${segments.slice(0, index).join('/')}/`);
    }
    for (const name of names) for (const domain of domains) for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; path=${path}${domain ? `; domain=${domain}` : ''}; SameSite=Lax`;
    }
  }

  function stop() {
    // Disable before deleting cookies; do not send denied-consent cookieless pings.
    window[disabledKey] = true;
    clearCookies();
  }

  function guardTransport() {
    if (guarded) return;
    guarded = true;
    // The tag can batch events while consent is granted and flush later. Its
    // disable flag prevents new events; this narrow guard also stops old batches.
    function blocked(input) {
      if (!window[disabledKey] && choice?.expiresAt > Date.now()) return false;
      try {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
        return url.hostname === 'google-analytics.com' || url.hostname.endsWith('.google-analytics.com');
      } catch { return false; }
    }
    const originalFetch = window.fetch;
    window.fetch = function (input, ...args) {
      if (blocked(input)) return Promise.resolve(new Response(null, {status:204}));
      return originalFetch.call(this, input, ...args);
    };
    const originalBeacon = navigator.sendBeacon;
    if (originalBeacon) navigator.sendBeacon = function (url, data) {
      if (blocked(url)) return true;
      return originalBeacon.call(this, url, data);
    };
    const requestUrls = new WeakMap();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      requestUrls.set(this, url);
      return originalOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (blocked(requestUrls.get(this))) { this.abort(); return; }
      return originalSend.apply(this, args);
    };
  }

  function start() {
    if (browserOptOut || choice?.choice !== 'yes') { stop(); return; }
    if (!eligible) return;
    window[disabledKey] = false;
    if (configured) return;
    configured = true;
    guardTransport();
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const denied = {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'};
    window.gtag('consent', 'default', denied);
    window.gtag('consent', 'update', {...denied, analytics_storage: 'granted'});
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: lifetime / 1000,
      cookie_update: false,
      // Avoid authentication fragments, search terms, and tool state in page URLs.
      page_location: location.origin + location.pathname,
      page_referrer: cleanReferrer()
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    tag.onload = () => { if (window[disabledKey]) clearCookies(); };
    document.head.append(tag);
  }

  function cleanReferrer() {
    try { const url = new URL(document.referrer); return url.origin + url.pathname; } catch { return ''; }
  }

  const notice = document.createElement('section');
  notice.className = 'analytics-notice';
  notice.setAttribute('aria-label', 'Analytics preference');
  notice.hidden = true;
  notice.innerHTML = '<p class="analytics-notice-title">Help me improve this site with usage stats?</p>' +
    '<p class="analytics-notice-detail">Google Analytics uses cookies. Usage reports are grouped and don’t include your name.</p>' +
    '<p class="analytics-notice-status"></p>' +
    '<div class="analytics-notice-actions"><button type="button" class="analytics-yes">Yes</button>' +
    '<button type="button" class="analytics-no">No</button><a>Privacy</a></div>';
  notice.querySelector('a').href = privacyUrl;
  const yes = notice.querySelector('.analytics-yes');
  const no = notice.querySelector('.analytics-no');
  const status = notice.querySelector('.analytics-notice-status');
  if (browserOptOut) {
    yes.disabled = true;
    yes.hidden = true;
  }
  document.body.append(notice);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let noticeVisible = false;
  let noticeMotion;

  function revealNotice(visible) {
    if (visible === noticeVisible) return;
    noticeVisible = visible;
    noticeMotion?.cancel();
    noticeMotion = null;
    notice.hidden = false;
    notice.inert = !visible;
    if (!notice.animate) { notice.hidden = !visible; return; }
    const frames = reducedMotion.matches ? [{opacity:0.6}, {opacity:1}] :
      [{clipPath:'inset(100% 0 0 0)', opacity:0.65}, {clipPath:'inset(0% 0 0 0)', opacity:1}];
    if (!visible) frames.reverse();
    const animation = notice.animate(frames, {
      duration: reducedMotion.matches ? (visible ? 90 : 60) : (visible ? 280 : 160),
      easing: visible ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
      fill:'both'
    });
    noticeMotion = animation;
    animation.finished.then(() => {
      if (noticeMotion !== animation) return;
      notice.hidden = !noticeVisible;
      animation.cancel();
      noticeMotion = null;
    }).catch(() => { /* A newer preference action supersedes this transition. */ });
  }
  reducedMotion.addEventListener('change', () => {
    noticeMotion?.cancel();
    noticeMotion = null;
    notice.hidden = !noticeVisible;
  });

  function open(trigger) {
    returnFocus = trigger || null;
    status.textContent = browserOptOut ? 'Your browser requests no tracking. Analytics stays off.' :
      choice ? `Analytics is ${choice.choice === 'yes' ? 'on' : 'off'}. You can change your choice.` : '';
    status.hidden = !status.textContent;
    revealNotice(true);
    if (trigger && document.documentElement.dataset.keyboardNavigation === 'on') no.focus();
  }

  function close() {
    revealNotice(false);
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
    returnFocus = null;
  }

  function apply() {
    clearTimeout(expiryTimer);
    if (choice) {
      expiryTimer = setTimeout(() => {
        choice = readChoice();
        apply();
      }, Math.min(choice.expiresAt - Date.now() + 1, 2147483647));
    }
    start();
    if (!choice && eligible && !browserOptOut) open(); else close();
  }

  function save(value) {
    choice = {version, choice: value, expiresAt: Date.now() + lifetime};
    memoryChoice = choice;
    try { localStorage.setItem(storageKey, JSON.stringify(choice)); } catch { /* Choice lasts for this page if storage is blocked. */ }
    apply();
  }
  yes.addEventListener('click', () => save('yes'));
  no.addEventListener('click', () => save('no'));

  function preferenceButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'analytics-preferences';
    button.textContent = 'Analytics preferences';
    button.addEventListener('click', () => open(button));
    return button;
  }
  const footer = document.querySelector('.site-footer-privacy');
  if (footer) footer.append(preferenceButton());
  else {
    const links = document.createElement('div');
    links.className = 'analytics-links';
    const link = document.createElement('a');
    link.href = privacyUrl;
    link.textContent = 'Privacy';
    links.append(link, preferenceButton());
    const destination = document.querySelector('.transcribe-shortcuts');
    if (!destination) links.classList.add('analytics-links--standalone');
    (destination || document.body).append(links);
  }
  document.querySelectorAll('[data-analytics-preferences]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => open(button));
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) { choice = readChoice(); apply(); }
  });
  window.addEventListener('pageshow', () => { choice = readChoice(); apply(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { choice = readChoice(); apply(); }
  });
  apply();
})();
