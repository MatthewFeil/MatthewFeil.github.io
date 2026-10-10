/* Switch calculator views without recreating forms or changing their state. */
(() => {
  const app = document.querySelector('[data-investment-views]');
  if (!app) return;
  const buttons = [...app.querySelectorAll('[data-investment-switch]')];
  const views = [...app.querySelectorAll('[data-investment-view]')];
  function select(view) {
    for (const panel of views) panel.hidden = panel.dataset.investmentView !== view;
    for (const button of buttons) {
      const active = button.dataset.investmentSwitch === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  function restore() { select(location.hash === '#interest' ? 'interest' : 'stock'); }
  for (const button of buttons) button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    const view = button.dataset.investmentSwitch;
    select(view);
    window.siteAnalytics?.track('tool_action', 'investment_calculator', `${view}_view`);
    window.siteAnalytics?.track('tool_interaction', 'investment_calculator', `${view}_view`);
    const url = new URL(location.href);
    url.hash = view;
    history.replaceState(history.state, '', url);
  });
  window.addEventListener('hashchange', restore);
  window.addEventListener('popstate', restore);
  restore();
})();
