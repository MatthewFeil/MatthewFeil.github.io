(() => {
  const app = document.querySelector('.lifting-app');
  const apiUrl = app.dataset.apiUrl;
  const personalUrl = app.dataset.personalUrl || '/personal/';
  const repPercent = {
    1: 1,
    2: 0.95,
    3: 0.93,
    4: 0.9,
    5: 0.87,
    6: 0.85,
    7: 0.83,
    8: 0.8,
    9: 0.77,
    10: 0.75
  };
  const equipmentTypes = {
    dumbbell: {
      label: 'Dumbbell',
      badge: 'Dumbbell',
      instruction: 'Per-dumbbell weight.'
    },
    machine: {
      label: 'Machine',
      badge: 'Machine',
      instruction: 'Machine setting.'
    },
    barbell: {
      label: 'Barbell',
      badge: 'Barbell',
      instruction: 'Total or use plates.'
    },
    other: {
      label: 'Other',
      badge: 'Other',
      instruction: 'Total weight.'
    }
  };

  const state = {
    lifts: [],
    logs: [],
    query: '',
    logExpanded: false,
    activeLogLiftId: '',
    workspaceView: 'log'
  };

  const els = {
    workspace: document.getElementById('lifting-workspace'),
    lockButton: document.getElementById('lifting-lock-button'),
    logSetClose: document.getElementById('log-set-close'),
    logSetPanel: document.getElementById('log-set-panel'),
    logSetHome: document.getElementById('log-set-home'),
    logSetTitle: document.getElementById('log-set-title'),
    logSetFeedback: document.getElementById('log-set-feedback'),
    workspaceTabs: document.getElementById('lift-workspace-tabs'),
    logPane: document.getElementById('lift-log-pane'),
    targetsPane: document.getElementById('lift-targets-pane'),
    repTargets: document.getElementById('lift-rep-targets'),
    viewLogs: document.getElementById('workspace-view-logs'),
    editLift: document.getElementById('workspace-edit-lift'),
    liftLogsModal: document.getElementById('lift-logs-modal'),
    liftLogsClose: document.getElementById('lift-logs-close'),
    liftLogsTitle: document.getElementById('lift-logs-title'),
    liftLogsDelete: document.getElementById('lift-logs-delete'),
    liftLogsContent: document.getElementById('lift-logs-content'),
    addLiftOpen: document.getElementById('add-lift-open'),
    addLiftClose: document.getElementById('add-lift-close'),
    addLiftModal: document.getElementById('add-lift-modal'),
    addLiftForm: document.getElementById('add-lift-form'),
    addLiftError: document.getElementById('add-lift-error'),
    liftName: document.getElementById('lift-name'),
    renameLiftModal: document.getElementById('rename-lift-modal'),
    renameLiftClose: document.getElementById('rename-lift-close'),
    renameLiftForm: document.getElementById('rename-lift-form'),
    renameLiftId: document.getElementById('rename-lift-id'),
    renameLiftName: document.getElementById('rename-lift-name'),
    renameLiftEquipmentType: document.getElementById('rename-lift-equipment-type'),
    logForm: document.getElementById('log-form'),
    logLift: document.getElementById('log-lift'),
    logEquipmentNote: document.getElementById('log-equipment-note'),
    logEquipmentBadge: document.getElementById('log-equipment-badge'),
    logEquipmentInstruction: document.getElementById('log-equipment-instruction'),
    barbellCalculator: document.getElementById('barbell-calculator'),
    plateCalculatorToggle: document.getElementById('plate-calculator-toggle'),
    plateCalculatorPanel: document.getElementById('plate-calculator-panel'),
    barbellTotals: [...document.querySelectorAll('[data-barbell-total]')],
    plateInputs: [...document.querySelectorAll('[data-plate-weight]')],
    logWeight: document.getElementById('log-weight'),
    logDate: document.getElementById('log-date'),
    search: document.getElementById('lift-search'),
    list: document.getElementById('lifting-list'),
    status: document.getElementById('lifting-status')
  };
  const logDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAnimations = new Map();
  const logDrafts = new Map();
  const mobileWorkspace = window.matchMedia('(max-width: 760px)');

  function animateFeedback(element, keyframes, duration) {
    motionAnimations.get(element)?.cancel();
    if (!element?.animate || document.hidden) return;
    const animation = element.animate(keyframes, {
      duration,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
    });
    motionAnimations.set(element, animation);
    const clear = () => {
      if (motionAnimations.get(element) === animation) motionAnimations.delete(element);
    };
    animation.addEventListener('finish', clear, { once: true });
    animation.addEventListener('cancel', clear, { once: true });
  }

  function stopMotion() {
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations.clear();
  }

  reducedMotion.addEventListener('change', stopMotion);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMotion();
  });

  function highlightUpdate(element) {
    if (!element) return;
    animateFeedback(element, [
      { backgroundColor: 'color-mix(in srgb, var(--lifting-good) 13%, var(--lifting-soft))' },
      { backgroundColor: 'var(--lifting-soft)' }
    ], reducedMotion.matches ? 140 : 420);
  }

  function setStatus(message, isError = false) {
    const changed = els.status.textContent !== message;
    els.status.textContent = message;
    els.status.style.color = isError ? 'var(--lifting-warn)' : '';
    els.status.classList.toggle('is-loading', !isError && message.endsWith('...'));
    els.status.setAttribute('aria-busy', String(!isError && message.endsWith('...')));
    if (changed && message) {
      animateFeedback(els.status, [{ opacity: 0.7 }, { opacity: 1 }], reducedMotion.matches ? 100 : 180);
    }
  }

  function setButtonLoading(button, isLoading, loadingText = 'Working...') {
    if (!button) return;
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent;
    }
    button.classList.toggle('is-loading', isLoading);
    button.setAttribute('aria-busy', String(isLoading));
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
    button.disabled = isLoading || (button.form ? !formIsComplete(button.form) : false);
  }

  function formIsComplete(form) {
    const requiredTextFields = form.querySelectorAll('input[required][type="text"], input[required][type="search"], textarea[required]');
    const requiredValues = form.querySelectorAll('[data-required-value]');
    return form.checkValidity()
      && [...requiredTextFields].every((field) => field.value.trim())
      && [...requiredValues].every((field) => field.value);
  }

  function syncSubmitButton(form) {
    const button = form.querySelector('button[type="submit"]');
    if (!button || button.classList.contains('is-loading')) return;
    button.disabled = !formIsComplete(form);
  }

  function watchFormCompletion(form) {
    form.addEventListener('input', () => syncSubmitButton(form));
    form.addEventListener('change', () => syncSubmitButton(form));
    form.addEventListener('reset', () => setTimeout(() => syncSubmitButton(form), 0));
    syncSubmitButton(form);
  }

  async function hasSession() {
    return Boolean(await window.PersonalAuth.session());
  }

  function redirectToPersonal() {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${personalUrl}?next=${next}`;
  }

  function lockMotionDelay() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
  }

  async function api(action, payload = {}) {
    const response = await window.PersonalAuth.authorizedFetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ action, ...payload })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'The lifting tracker request failed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function formatWeight(value) {
    if (!Number.isFinite(value) || value <= 0) return '-';
    return `${Math.round(value * 2) / 2} lb`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function formatLogDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : logDate.format(date);
  }

  function estimateOneRepMax(log) {
    return Number(log.weight) / repPercent[Number(log.reps)];
  }

  function getLiftLogs(liftId) {
    return state.logs.filter((log) => log.lift_id === liftId);
  }

  function metricsForLift(lift) {
    const logs = getLiftLogs(lift.id);
    const realOneRep = logs.reduce((max, log) => Math.max(max, Number(log.weight)), 0);
    const theoreticalOneRep = logs.reduce((max, log) => Math.max(max, estimateOneRepMax(log)), 0);
    return { lift, logs, realOneRep, theoreticalOneRep };
  }

  function equipmentTypeForLift(lift) {
    if (equipmentTypes[lift?.equipment_type]) return lift.equipment_type;
    return lift?.uses_dumbbells ? 'dumbbell' : 'other';
  }

  function equipmentForLift(lift) {
    return equipmentTypes[equipmentTypeForLift(lift)];
  }

  function updatePlateCalculator() {
    const platesPerSide = els.plateInputs.reduce((total, input) => {
      const plateCount = Math.max(0, Math.trunc(Number(input.value) || 0));
      input.value = String(plateCount);
      return total + (Number(input.dataset.plateWeight) * plateCount);
    }, 0);
    const totalWeight = 45 + (platesPerSide * 2);
    els.barbellTotals.forEach((total) => {
      const changed = total.textContent !== `${totalWeight} lb total`;
      total.textContent = `${totalWeight} lb total`;
      if (changed && !els.logSetPanel.hidden && !els.barbellCalculator.hidden) {
        animateFeedback(total, [{ opacity: 0.55 }, { opacity: 1 }], reducedMotion.matches ? 100 : 180);
      }
    });
    els.logWeight.value = String(totalWeight);
    syncSubmitButton(els.logForm);
  }

  function resetPlateCalculator() {
    els.plateInputs.forEach((input) => {
      input.value = '0';
    });
    els.barbellTotals.forEach((total) => {
      total.textContent = '45 lb total';
    });
  }

  function setPlateCalculatorOpen(isOpen) {
    const shouldOpen = Boolean(isOpen);
    const shouldHide = !shouldOpen;
    els.plateCalculatorPanel.classList.toggle('is-open', shouldOpen);
    els.plateCalculatorPanel.toggleAttribute('inert', shouldHide);
    els.plateCalculatorPanel.setAttribute('aria-hidden', String(shouldHide));
    els.plateCalculatorToggle.setAttribute('aria-expanded', String(shouldOpen));
  }

  function updateLogEquipmentInterface() {
    const selectedLift = state.lifts.find((lift) => lift.id === els.logLift.value);
    if (!selectedLift) {
      els.logEquipmentNote.hidden = true;
      els.barbellCalculator.hidden = true;
      setPlateCalculatorOpen(false);
      return;
    }

    const equipment = equipmentForLift(selectedLift);
    els.logEquipmentBadge.textContent = equipment.badge;
    els.logEquipmentInstruction.textContent = equipment.instruction;
    els.logEquipmentNote.hidden = false;
    const equipmentType = equipmentTypeForLift(selectedLift);
    els.barbellCalculator.hidden = equipmentType !== 'barbell';
    if (equipmentType === 'barbell') {
      updatePlateCalculator();
      setPlateCalculatorOpen(false);
    } else {
      setPlateCalculatorOpen(false);
    }
  }

  function rememberLogDraft() {
    if (!state.activeLogLiftId) return;
    logDrafts.set(state.activeLogLiftId, {
      date: els.logDate.value,
      weight: els.logWeight.value,
      reps: document.getElementById('log-reps').value,
      plates: els.plateInputs.map((input) => input.value),
      platesOpen: els.plateCalculatorToggle.getAttribute('aria-expanded') === 'true',
      feedback: els.logSetFeedback.textContent
    });
  }

  function restoreLogDraft(liftId) {
    const draft = logDrafts.get(liftId);
    els.logLift.value = liftId;
    resetPlateCalculator();
    els.plateInputs.forEach((input, index) => { input.value = draft?.plates[index] || '0'; });
    updateLogEquipmentInterface();
    if (draft) els.logWeight.value = draft.weight;
    else if (els.barbellCalculator.hidden) els.logWeight.value = '';
    document.getElementById('log-reps').value = draft?.reps || '';
    els.logDate.value = draft?.date || window.CalculatorDates.formatLocal(new Date());
    els.logSetFeedback.textContent = draft?.feedback || '';
    setPlateCalculatorOpen(Boolean(draft?.platesOpen && !els.barbellCalculator.hidden));
    logDateInput.toISO();
    syncSubmitButton(els.logForm);
  }

  function selectLogLift(liftId) {
    if (state.activeLogLiftId !== liftId) {
      rememberLogDraft();
      state.activeLogLiftId = liftId;
      restoreLogDraft(liftId);
    }
    state.workspaceView = 'log';
    mountInlineLog();
  }

  function syncWorkspaceView() {
    const mobile = mobileWorkspace.matches;
    const showTargets = state.workspaceView === 'targets';
    els.workspaceTabs.hidden = !mobile;
    els.logPane.hidden = mobile && showTargets;
    els.targetsPane.hidden = mobile && !showTargets;
    for (const [pane, tabId, desktopLabel] of [
      [els.logPane, 'lift-tab-log', 'log-set-title'],
      [els.targetsPane, 'lift-tab-targets', 'rep-targets-title']
    ]) {
      if (mobile) pane.setAttribute('role', 'tabpanel');
      else pane.removeAttribute('role');
      pane.setAttribute('aria-labelledby', mobile ? tabId : desktopLabel);
    }
    els.workspaceTabs.querySelectorAll('[role="tab"]').forEach((tab) => {
      const selected = (tab.id === 'lift-tab-targets') === showTargets;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function renderRepGrid(theoreticalOneRep) {
    if (!theoreticalOneRep) {
      return '<p class="lifting-empty">Add a log to calculate rep targets.</p>';
    }

    return `
      <div class="lifting-rep-grid">
        ${Object.entries(repPercent).map(([reps, percent]) => `
          <div class="lifting-rep-cell">
            <span>${reps} rep${reps === '1' ? '' : 's'}</span>
            <strong>${formatWeight(theoreticalOneRep * percent)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderLogs(logs) {
    if (!logs.length) {
      return '<p class="lifting-empty">No logs for this lift yet.</p>';
    }

    return `
      <div class="lifting-log-list">
        ${logs.map((log) => `
          <article class="lifting-log">
            <div>
              <strong>${formatWeight(Number(log.weight))} x ${log.reps}</strong>
              <p><span class="lifting-log-date">${formatLogDate(log.lifted_at)}</span>${log.notes ? ` - ${escapeHtml(log.notes)}` : ''}</p>
            </div>
            <button class="lifting-action" type="button" data-delete-log="${escapeHtml(log.id)}">Delete</button>
          </article>
        `).join('')}
      </div>
    `;
  }

  function openLogsModal(liftId) {
    const lift = state.lifts.find((item) => item.id === liftId);
    if (!lift) return;

    const logs = getLiftLogs(liftId);
    els.liftLogsModal.dataset.liftId = liftId;
    els.liftLogsTitle.textContent = `${lift.name} logs`;
    els.liftLogsDelete.dataset.deleteLift = liftId;
    els.liftLogsContent.innerHTML = renderLogs(logs);
    els.liftLogsModal.showModal();
  }

  function openRenameModal(liftId) {
    const lift = state.lifts.find((item) => item.id === liftId);
    if (!lift) return;

    els.renameLiftId.value = lift.id;
    els.renameLiftName.value = lift.name;
    els.renameLiftEquipmentType.value = equipmentTypeForLift(lift);
    syncSubmitButton(els.renameLiftForm);
    els.renameLiftModal.showModal();
    els.renameLiftName.focus();
    els.renameLiftName.select();
  }

  function mountInlineLog() {
    const card = [...els.list.querySelectorAll('[data-lift-card]')]
      .find((item) => item.dataset.liftCard === state.activeLogLiftId);
    const visible = state.logExpanded && Boolean(card);
    if (visible) card.querySelector('.lifting-card-summary').after(els.logSetPanel);
    else els.logSetHome.append(els.logSetPanel);
    els.logSetPanel.hidden = !visible;
    if (visible) {
      const lift = state.lifts.find((item) => item.id === state.activeLogLiftId);
      els.repTargets.innerHTML = renderRepGrid(metricsForLift(lift).theoreticalOneRep);
      els.viewLogs.dataset.openLogs = lift.id;
      els.editLift.dataset.renameLift = lift.id;
    }
    syncWorkspaceView();
    els.list.querySelectorAll('[data-toggle-lift]').forEach((button) => {
      const expanded = visible && button.dataset.toggleLift === state.activeLogLiftId;
      button.setAttribute('aria-expanded', String(expanded));
      button.closest('.lifting-card').classList.toggle('is-active', expanded);
    });
  }

  function closeInlineLog() {
    const liftId = state.activeLogLiftId;
    state.logExpanded = false;
    mountInlineLog();
    const button = [...els.list.querySelectorAll('[data-toggle-lift]')]
      .find((item) => item.dataset.toggleLift === liftId);
    (button || els.search).focus({ preventScroll: true });
  }

  function openInlineLog(liftId = '') {
    if (els.logForm.querySelector('button[type="submit"]').classList.contains('is-loading')) return;
    const visibleIds = [...els.list.querySelectorAll('[data-lift-card]')].map((card) => card.dataset.liftCard);
    const selectedId = liftId || (visibleIds.includes(state.activeLogLiftId) ? state.activeLogLiftId : visibleIds[0]);
    if (!selectedId) {
      setStatus(state.lifts.length ? 'Clear the search to choose a lift.' : 'Add a lift before logging a set.');
      return;
    }
    state.logExpanded = true;
    selectLogLift(selectedId);
    mountInlineLog();
    if (!mobileWorkspace.matches) {
      els.logSetPanel.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      els.logWeight.focus({ preventScroll: true });
      els.logWeight.select();
    }
    if (!reducedMotion.matches) animateFeedback(els.logSetPanel, [{ opacity: 0.75 }, { opacity: 1 }], 160);
  }

  function renderList() {
    // Preserve the live editor and its draft when search or saved metrics replace rows.
    els.logSetHome.append(els.logSetPanel);
    els.logSetPanel.hidden = true;
    // A search or refresh replaces the rows; discard effects on old content.
    motionAnimations.forEach((animation, element) => {
      if (els.list.contains(element)) {
        animation.cancel();
        motionAnimations.delete(element);
      }
    });
    const allMetrics = state.lifts.map(metricsForLift);

    const filtered = allMetrics.filter((item) => (
      item.lift.name.toLowerCase().includes(state.query.toLowerCase())
    ));

    if (!filtered.length) {
      els.list.innerHTML = `<p class="lifting-empty">${state.lifts.length ? 'No lifts match your search.' : 'No lift types yet. Add a lift to start logging sets and tracking progress.'}</p>`;
      mountInlineLog();
      return;
    }

    els.list.innerHTML = filtered.map((item) => `
      <article class="lifting-card" data-lift-card="${escapeHtml(item.lift.id)}">
        <div class="lifting-card-summary">
          <button class="lifting-row" type="button" data-toggle-lift="${escapeHtml(item.lift.id)}" aria-controls="log-set-panel" aria-expanded="false">
            <div class="lifting-card-title">
              <h3>${escapeHtml(item.lift.name)}</h3>
              <div class="lifting-card-meta">
                <span class="lifting-equipment-badge" title="${escapeHtml(equipmentForLift(item.lift).label)} lift" aria-label="${escapeHtml(equipmentForLift(item.lift).label)} lift">${escapeHtml(equipmentForLift(item.lift).badge)}</span>
              </div>
            </div>
            <div class="lifting-row-metric">
              <span>Actual 1RM</span>
              <strong>${formatWeight(item.realOneRep)}</strong>
            </div>
            <div class="lifting-row-metric">
              <span>Est. 1RM</span>
              <strong>${formatWeight(item.theoreticalOneRep)}</strong>
            </div>
            <svg class="lifting-workspace-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
          </button>
        </div>
      </article>
    `).join('');
    mountInlineLog();
  }

  function render() {
    rememberLogDraft();
    if (state.lifts.some((lift) => lift.id === state.activeLogLiftId)) {
      restoreLogDraft(state.activeLogLiftId);
    } else {
      state.logExpanded = false;
      state.activeLogLiftId = '';
      els.logLift.value = '';
    }
    renderList();
  }

  async function loadLifts(updatedLiftId = '') {
    setStatus('Loading lifts...');
    const data = await api('list');
    state.lifts = data.lifts || [];
    state.logs = data.logs || [];
    render();
    if (updatedLiftId) {
      const row = [...els.list.querySelectorAll('[data-toggle-lift]')]
        .find((button) => button.dataset.toggleLift === updatedLiftId);
      highlightUpdate(row?.closest('.lifting-card-summary'));
    }
    setStatus(`Updated ${new Date().toLocaleTimeString()}.`);
  }

  const logDateInput = window.CalculatorDates.bindInput(els.logDate, {
    onEdit: () => syncSubmitButton(els.logForm)
  });
  [els.addLiftForm, els.logForm, els.renameLiftForm].forEach(watchFormCompletion);

  els.lockButton.addEventListener('click', async () => {
    if (els.lockButton.disabled) return;
    els.lockButton.disabled = true;
    els.lockButton.classList.add('is-locking');
    els.lockButton.setAttribute('aria-busy', 'true');
    app.classList.add('is-locking');
    await Promise.all([
      window.PersonalAuth.signOut().catch(() => {}),
      new Promise((resolve) => window.setTimeout(resolve, lockMotionDelay()))
    ]);
    els.workspace.hidden = true;
    redirectToPersonal();
  });

  els.addLiftOpen.addEventListener('click', () => {
    els.addLiftError.textContent = '';
    syncSubmitButton(els.addLiftForm);
    els.addLiftModal.showModal();
    els.liftName.focus();
  });

  els.addLiftClose.addEventListener('click', () => {
    els.addLiftModal.close();
  });

  els.logSetClose.addEventListener('click', () => {
    closeInlineLog();
  });

  els.liftLogsClose.addEventListener('click', () => {
    els.liftLogsModal.close();
  });

  els.renameLiftClose.addEventListener('click', () => {
    els.renameLiftModal.close();
  });

  els.liftLogsModal.addEventListener('close', () => {
    delete els.liftLogsModal.dataset.liftId;
  });

  els.renameLiftModal.addEventListener('close', () => {
    els.renameLiftForm.reset();
  });

  [els.addLiftModal, els.renameLiftModal, els.liftLogsModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.close();
      }
    });
  });

  els.addLiftForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!formIsComplete(els.addLiftForm)) {
      syncSubmitButton(els.addLiftForm);
      return;
    }
    const form = new FormData(els.addLiftForm);
    const submitButton = els.addLiftForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Creating...');
    setStatus('');
    els.addLiftError.textContent = '';
    try {
      await api('addLift', {
        name: form.get('name'),
        equipment_type: form.get('equipment_type')
      });
      els.addLiftForm.reset();
      els.addLiftModal.close();
      await loadLifts();
    } catch (error) {
      els.addLiftError.textContent = error.message;
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  els.logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!logDateInput.toISO() || !formIsComplete(els.logForm)) {
      syncSubmitButton(els.logForm);
      return;
    }
    if (els.logForm.querySelector('button[type="submit"]').classList.contains('is-loading')) return;
    els.logSetFeedback.textContent = '';
    const form = new FormData(els.logForm);
    const submitButton = els.logForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('');
    try {
      await api('addLog', {
        lift_id: form.get('lift_id'),
        lifted_at: logDateInput.toISO(),
        weight: Number(form.get('weight')),
        reps: Number(form.get('reps'))
      });
      const selectedLift = String(form.get('lift_id'));
      await loadLifts(selectedLift);
      els.logSetFeedback.textContent = 'Set logged.';
      if (!els.logSetPanel.hidden && !mobileWorkspace.matches) {
        els.logWeight.focus({ preventScroll: true });
        els.logWeight.select();
      }
    } catch (error) {
      els.logSetFeedback.textContent = error.message;
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  els.renameLiftForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!formIsComplete(els.renameLiftForm)) {
      syncSubmitButton(els.renameLiftForm);
      return;
    }
    const form = new FormData(els.renameLiftForm);
    const id = String(form.get('id') || '');
    const submitButton = els.renameLiftForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Saving...');
    setStatus('');
    try {
      await api('renameLift', {
        id,
        name: form.get('name'),
        equipment_type: form.get('equipment_type')
      });
      els.renameLiftModal.close();
      await loadLifts(id);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  els.search.addEventListener('input', () => {
    state.query = els.search.value.trim();
    renderList();
  });

  els.workspaceTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    state.workspaceView = tab.id === 'lift-tab-targets' ? 'targets' : 'log';
    syncWorkspaceView();
  });
  els.workspaceTabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    state.workspaceView = event.key === 'Home' ? 'log' : event.key === 'End' ? 'targets'
      : state.workspaceView === 'log' ? 'targets' : 'log';
    syncWorkspaceView();
    els.workspaceTabs.querySelector('[aria-selected="true"]').focus();
  });
  mobileWorkspace.addEventListener('change', syncWorkspaceView);

  els.plateInputs.forEach((input) => input.addEventListener('input', updatePlateCalculator));
  els.plateCalculatorToggle.addEventListener('click', () => {
    setPlateCalculatorOpen(!els.plateCalculatorPanel.classList.contains('is-open'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.plateCalculatorPanel.classList.contains('is-open')) {
      setPlateCalculatorOpen(false);
    }
  });

  els.barbellCalculator.addEventListener('click', (event) => {
    const adjustButton = event.target.closest('[data-plate-adjust]');
    if (!adjustButton) return;
    const input = adjustButton.parentElement.querySelector('[data-plate-weight]');
    const nextValue = Math.max(0, Math.trunc(Number(input.value) || 0) + Number(adjustButton.dataset.plateAdjust));
    input.value = String(nextValue);
    updatePlateCalculator();
  });

  document.addEventListener('click', async (event) => {
    const toggleButton = event.target.closest('[data-toggle-lift]');
    const logsButton = event.target.closest('[data-open-logs]');
    const renameLiftButton = event.target.closest('[data-rename-lift]');
    const deleteLogButton = event.target.closest('[data-delete-log]');
    const deleteLiftButton = event.target.closest('[data-delete-lift]');

    try {
      if (toggleButton) {
        const liftId = toggleButton.dataset.toggleLift;
        if (state.logExpanded && !els.logSetPanel.hidden && state.activeLogLiftId === liftId) closeInlineLog();
        else openInlineLog(liftId);
      }

      if (logsButton) {
        openLogsModal(logsButton.dataset.openLogs);
      }

      if (renameLiftButton) {
        openRenameModal(renameLiftButton.dataset.renameLift);
      }

      if (deleteLogButton && confirm('Delete this lift log?')) {
        const openLogsLiftId = els.liftLogsModal.dataset.liftId;
        setButtonLoading(deleteLogButton, true, 'Deleting...');
        setStatus('');
        await api('deleteLog', { id: deleteLogButton.dataset.deleteLog });
        await loadLifts();
        if (els.liftLogsModal.open && openLogsLiftId) {
          const lift = state.lifts.find((item) => item.id === openLogsLiftId);
          if (lift) {
            els.liftLogsModal.dataset.liftId = openLogsLiftId;
            els.liftLogsTitle.textContent = `${lift.name} logs`;
            els.liftLogsDelete.dataset.deleteLift = openLogsLiftId;
            els.liftLogsContent.innerHTML = renderLogs(getLiftLogs(openLogsLiftId));
          }
        }
      }

      if (deleteLiftButton && confirm('Delete this lift and all of its logs?')) {
        setButtonLoading(deleteLiftButton, true, 'Deleting...');
        setStatus('');
        await api('deleteLift', { id: deleteLiftButton.dataset.deleteLift });
        els.liftLogsModal.close();
        await loadLifts();
      }
    } catch (error) {
      setStatus(error.message, true);
      setButtonLoading(deleteLogButton, false);
      setButtonLoading(deleteLiftButton, false);
    }
  });

  async function boot() {
    try {
      if (!await hasSession()) {
        redirectToPersonal();
        return;
      }

      els.workspace.hidden = false;
      await loadLifts();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        await window.PersonalAuth.signOut().catch(() => {});
        redirectToPersonal();
        return;
      }
      setStatus(error instanceof Error ? error.message : 'The lifting tracker request failed.', true);
    }
  }

  boot();
})();
