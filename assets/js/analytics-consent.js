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

  // Fixed vocabulary only: never accept tool inputs, filenames, or raw errors.
  const toolEvents = {
    transcribe: {
      tool_action: ['audio_loaded', 'playback_started', 'loop_enabled', 'speed_changed', 'pitch_changed', 'config_imported', 'stems_started'],
      tool_interaction: [
        'playback_started', 'playback_paused', 'return_to_start', 'seek_backward',
        'seek_forward', 'seek_committed', 'waveform_seek', 'overview_navigated',
        'preset_speed_changed', 'custom_speed_changed', 'pitch_changed', 'pitch_lock_enabled',
        'pitch_lock_disabled', 'volume_changed', 'channel_changed', 'zoom_changed',
        'loop_enabled', 'loop_disabled', 'selection_changed', 'selection_cleared',
        'selection_only_enabled', 'selection_only_disabled', 'selection_analysis_enabled', 'selection_analysis_disabled',
        'chords_enabled', 'chords_disabled', 'detection_balanced_selected', 'detection_bass_selected',
        'detection_chordal_selected', 'detection_melody_selected', 'detection_range_changed', 'timeline_view',
        'analysis_view', 'controls_opened', 'controls_closed', 'shortcuts_opened',
        'shortcuts_closed', 'sound_reset', 'analysis_reset', 'stems_reset',
        'eq_reset', 'eq_changed', 'spectrum_shown', 'spectrum_hidden',
        'measure_marked', 'section_marked', 'marker_removed', 'marker_moved',
        'marker_section_changed', 'measures_deleted', 'markers_undone', 'markers_redone',
        'marker_navigated', 'measure_navigated', 'marked_passage_looped', 'numbering_changed',
        'stems_requested', 'stems_canceled', 'stems_enabled', 'stems_disabled',
        'stem_muted', 'stem_unmuted', 'piano_note_played'
      ],
      tool_complete: ['audio_loaded', 'config_imported', 'stems_separated', 'saved_data_cleared'],
      tool_export: ['json'],
      tool_error: ['audio_load_failed', 'config_import_failed', 'stems_failed', 'playback_failed', 'detection_range_invalid', 'saved_data_clear_failed']
    },
    investment_calculator: {
      tool_action: ['stock_view', 'interest_view', 'details_opened'],
      tool_interaction: ['stock_view', 'interest_view', 'details_opened', 'details_closed',
        'amount_changed', 'amount_cleared', 'ticker_changed', 'ticker_cleared',
        'start_date_changed', 'start_date_cleared', 'end_date_changed', 'end_date_cleared',
        'calculation_requested', 'inflation_unavailable'],
      tool_complete: ['calculation'],
      tool_error: ['calculation_failed', 'dates_invalid', 'inputs_invalid',
        'amount_invalid', 'ticker_invalid', 'start_date_invalid', 'end_date_invalid']
    },
    interest_calculator: {
      tool_action: ['details_opened'],
      tool_interaction: ['details_opened', 'details_closed', 'amount_changed', 'amount_cleared',
        'rate_changed', 'rate_cleared', 'start_date_changed', 'start_date_cleared',
        'end_date_changed', 'end_date_cleared', 'compound_selected', 'simple_selected',
        'calculation_requested', 'inflation_unavailable'],
      tool_complete: ['calculation', 'compound_historical', 'simple_historical',
        'compound_projection', 'simple_projection'],
      tool_error: ['calculation_failed', 'dates_invalid', 'inputs_invalid',
        'amount_invalid', 'rate_invalid', 'start_date_invalid', 'end_date_invalid', 'method_invalid']
    },
    grade_calculator: {
      tool_action: ['rounding_changed', 'scale_saved', 'weight_saved'],
      tool_interaction: ['current_grade_cleared', 'final_score_cleared',
        'mobile_settings_opened', 'mobile_settings_closed',
        'rounding_opened', 'rounding_dismissed', 'scale_opened', 'scale_dismissed',
        'weight_opened', 'weight_dismissed', 'rounding_enabled', 'rounding_disabled',
        'rounding_reset', 'scale_reset', 'weight_reset'],
      tool_complete: ['calculation', 'final_score_preview', 'rounding_saved', 'scale_saved', 'weight_saved'],
      tool_error: ['current_grade_invalid', 'final_score_invalid', 'rounding_invalid', 'scale_invalid', 'weight_invalid']
    }
  };
  const startedTools = new Set();
  const usedFeatures = new Set();
  const siteEvents = {
    navigation_click: ['home', 'about', 'posts', 'playlists', 'work', 'personal_space', 'privacy',
      'transcribe', 'cta_l_live_art', 'grade_calculator', 'investment_calculator', 'post'],
    navigation_menu: ['open', 'close'],
    theme_change: ['system', 'light', 'dark'],
    keyboard_navigation_change: ['on', 'off']
  };
  function canTrack() {
    return eligible && !browserOptOut && choice?.choice === 'yes' &&
      choice.expiresAt > Date.now() && !window[disabledKey] && configured;
  }
  window.siteAnalytics = Object.freeze({
    trackSite(event, value, placement) {
      if (!canTrack() || !Object.prototype.hasOwnProperty.call(siteEvents, event) ||
          !siteEvents[event].includes(value)) return false;
      let parameters;
      if (event === 'navigation_click') {
        if (!['header', 'footer', 'work', 'home', 'posts'].includes(placement)) return false;
        parameters = {destination: value, placement};
      } else {
        if (placement !== undefined) return false;
        const parameter = event === 'theme_change' ? 'theme' : 'state';
        parameters = {[parameter]: value};
      }
      window.gtag('event', event, parameters);
      return true;
    },
    track(event, tool, value) {
      if (!canTrack()) return false;
      const vocabulary = Object.prototype.hasOwnProperty.call(toolEvents, tool) && toolEvents[tool];
      if (!vocabulary) return false;
      if (event !== 'tool_start' && (!Object.prototype.hasOwnProperty.call(vocabulary, event) ||
          !vocabulary[event].includes(value))) return false;
      if (event === 'tool_start' && value !== undefined) return false;
      // Feature adoption counts once per feature per page; outcomes count per operation.
      const feature = `${tool}:${value}`;
      if (event === 'tool_action' && usedFeatures.has(feature)) return false;
      if (!startedTools.has(tool)) {
        window.gtag('event', 'tool_start', {tool_name: tool});
        startedTools.add(tool);
      } else if (event === 'tool_start') return false;
      if (event !== 'tool_start') {
        const parameter = event === 'tool_export' ? 'format' : event === 'tool_error' ? 'error_code' : 'action';
        window.gtag('event', event, {tool_name: tool, [parameter]: value});
        if (event === 'tool_action') usedFeatures.add(feature);
      }
      return true;
    }
  });

  // Only shared navigation and public entry links; never read text or raw URLs
  // from tool controls. GA4's enhanced measurement already covers outbound clicks.
  const entryRoutes = new Map([
    ['/transcribe/', 'transcribe'], ['/cta-l-live-art/', 'cta_l_live_art'],
    ['/gradecalculatorv2/', 'grade_calculator'], ['/investmentcalculator/', 'investment_calculator'],
    ['/work/', 'work']
  ]);
  const headerRoutes = new Map([
    ['/playlists.html/', 'playlists'], ['/work/', 'work'], ['/personal/', 'personal_space']
  ]);
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    let destination;
    let placement;
    if (link.closest('.site-header')) {
      placement = 'header';
      if (link.matches('.site-title') && url.pathname === '/') destination = 'home';
      else if (url.pathname === '/' && ['#about', '#posts'].includes(url.hash)) destination = url.hash.slice(1);
      else destination = headerRoutes.get(url.pathname);
    } else if (link.closest('.site-footer') && url.pathname === '/privacy/') {
      placement = 'footer'; destination = 'privacy';
    } else if (link.matches('.work-card')) {
      placement = 'work'; destination = entryRoutes.get(url.pathname);
    } else if (link.closest('.home-featured-project, .home-project-index')) {
      placement = 'home'; destination = entryRoutes.get(url.pathname);
    } else if (link.matches('.post-card')) {
      placement = 'posts'; destination = 'post';
    }
    if (destination) window.siteAnalytics.trackSite('navigation_click', destination, placement);
  });

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
      !eligible ? 'This page does not collect analytics. Your choice applies to public pages where analytics is enabled.' :
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
    button.dataset.analyticsPreferences = '';
    button.textContent = 'Analytics preferences';
    return button;
  }
  const footer = document.querySelector('.site-footer-privacy');
  if (footer) {
    if (!footer.querySelector('[data-analytics-preferences]')) footer.append(preferenceButton());
  }
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
