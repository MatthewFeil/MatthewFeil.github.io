/* Opt-in keyboard navigation. App shortcuts and native text editing stay intact. */
(() => {
  const root = document.documentElement;
  const storageKey = 'site-keyboard-navigation';
  let enabled = false;
  try { enabled = localStorage.getItem(storageKey) === 'on'; } catch { /* Storage is optional. */ }
  let toggle;
  let status;

  function apply(announce = false) {
    root.dataset.keyboardNavigation = enabled ? 'on' : 'off';
    if (toggle) {
      toggle.textContent = `Keyboard navigation: ${enabled ? 'On' : 'Off'}`;
      toggle.setAttribute('aria-pressed', String(enabled));
    }
    if (announce && status) status.textContent = `Keyboard navigation ${enabled ? 'enabled. Tab moves between controls.' : 'disabled. App shortcuts remain available.'}`;
  }

  function change() {
    enabled = !enabled;
    try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch { /* Storage is optional. */ }
    apply(true);
    window.siteAnalytics?.trackSite('keyboard_navigation_change', enabled ? 'on' : 'off');
  }

  apply();
  // Capture before app handlers so their focus traps cannot navigate in default mode.
  document.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyK') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) change();
    } else if (event.key === 'Tab' && !enabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    enabled = event.newValue === 'on';
    apply();
  });

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'keyboard-navigation-toggle';
    toggle.setAttribute('aria-keyshortcuts', 'Alt+Shift+K');
    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
    const altLabel = /Mac|iPhone|iPad|iPod/i.test(platform) ? 'Option' : 'Alt';
    toggle.title = `Toggle keyboard navigation (${altLabel}+Shift+K)`;
    toggle.addEventListener('click', change);
    const destination = document.querySelector('.site-footer-controls') || document.querySelector('.site-footer-details') || document.querySelector('.site-footer-inner, .transcribe-shortcuts');
    if (!destination) toggle.classList.add('keyboard-navigation-toggle--standalone');
    (destination || document.body).append(toggle);
    status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    Object.assign(status.style, {position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)'});
    document.body.append(status);
    apply();
  }, {once: true});
})();
