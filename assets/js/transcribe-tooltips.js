/* Short, shared hover and keyboard-focus labels for the Transcribe workspace. */
(() => {
  const app = document.querySelector('[data-transcribe-app]');
  if (!app) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'transcribe-tooltip';
  tooltip.id = 'transcribe-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  const hoverCapable = matchMedia('(hover: hover) and (pointer: fine)');
  let active = null;
  let trigger = null;
  let timer = null;
  let pointer = null;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function hide() {
    clearTimer();
    tooltip.hidden = true;
    active = null;
    trigger = null;
    pointer = null;
  }

  function position() {
    const rect = active.getBoundingClientRect();
    const anchorX = pointer ? pointer.x : rect.left + rect.width / 2;
    const anchorY = pointer ? pointer.y : rect.bottom;
    const gap = pointer ? 16 : 8;
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchorX - bounds.width / 2, innerWidth - bounds.width - 8));
    const below = anchorY + gap;
    const above = (pointer ? anchorY : rect.top) - bounds.height - gap;
    const top = below + bounds.height <= innerHeight - 8 ? below : Math.max(8, above);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function show() {
    const label = active?.dataset.tooltip;
    if (!active || !active.isConnected || active.disabled || !label) { hide(); return; }
    tooltip.textContent = label;
    tooltip.hidden = false;
    position();
  }

  function targetFor(node) {
    const target = node instanceof Element ? node.closest('[data-tooltip]') : null;
    return target && app.contains(target) && !target.disabled ? target : null;
  }

  function schedule(target, source, delay, event) {
    if (active !== target || trigger !== source) {
      clearTimer();
      tooltip.hidden = true;
    }
    active = target;
    trigger = source;
    if (event) pointer = {x: event.clientX, y: event.clientY};
    else pointer = null;
    if (delay === 0) { show(); return; }
    timer = setTimeout(() => { timer = null; show(); }, delay);
  }

  document.addEventListener('pointerover', event => {
    if (!hoverCapable.matches || event.pointerType === 'touch') return;
    const target = targetFor(event.target);
    if (!target || target === active) return;
    schedule(target, 'pointer', 400, event);
  });

  document.addEventListener('pointermove', event => {
    if (trigger !== 'pointer' || event.pointerType === 'touch') return;
    if (!active || targetFor(event.target) !== active) return;
    pointer = {x: event.clientX, y: event.clientY};
    if (!tooltip.hidden) show();
  });

  document.addEventListener('pointerout', event => {
    if (trigger !== 'pointer' || targetFor(event.target) !== active) return;
    if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
    hide();
  });

  document.addEventListener('focusin', event => {
    const target = targetFor(event.target);
    if (target?.matches(':focus-visible')) schedule(target, 'focus', 0);
  });
  document.addEventListener('focusout', event => {
    if (trigger === 'focus' && active?.contains(event.target)) hide();
  });
  document.addEventListener('pointerdown', event => {
    if (!active || !active.contains(event.target)) return;
    const target = active;
    hide();
    if (target.matches('.eq-point') && event.pointerType !== 'touch' && target.dataset.tooltip) {
      schedule(target, 'pointer', 200, event);
    }
  });
  document.addEventListener('click', event => {
    if (active?.contains(event.target) && !active.matches('.eq-point')) hide();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('transcribe-tooltip-update', event => {
    if (active === targetFor(event.target) && !tooltip.hidden) show();
  });
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
})();
