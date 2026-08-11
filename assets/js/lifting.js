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
    logLiftQuery: '',
    logEquipmentFilter: 'all',
    logActiveOptionIndex: -1
  };

  const els = {
    workspace: document.getElementById('lifting-workspace'),
    lockButton: document.getElementById('lifting-lock-button'),
    logSetOpen: document.getElementById('log-set-open'),
    logSetClose: document.getElementById('log-set-close'),
    logSetModal: document.getElementById('log-set-modal'),
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
    logLiftPicker: document.getElementById('log-lift-picker'),
    logLiftSearch: document.getElementById('log-lift-search'),
    logLiftToggle: document.getElementById('log-lift-toggle'),
    logLiftMenu: document.getElementById('log-lift-menu'),
    logLiftOptions: document.getElementById('log-lift-options'),
    logEquipmentFilters: [...document.querySelectorAll('[data-log-equipment-filter]')],
    logLiftSearchStatus: document.getElementById('log-lift-search-status'),
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
  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.style.color = isError ? 'var(--lifting-warn)' : '';
    els.status.classList.toggle('is-loading', !isError && message.endsWith('...'));
    els.status.setAttribute('aria-busy', String(!isError && message.endsWith('...')));
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
      total.textContent = `${totalWeight} lb total`;
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

  function renderLiftOptions() {
    const submitButton = els.logForm.querySelector('button[type="submit"]');

    if (!state.lifts.length) {
      els.logLiftSearch.value = '';
      els.logLiftSearch.disabled = true;
      els.logLiftToggle.disabled = true;
      els.logLift.value = '';
      els.logLiftOptions.innerHTML = '<div class="lifting-combobox-empty" role="option" aria-disabled="true">Add a lift first.</div>';
      els.logLiftSearchStatus.textContent = '';
      els.logEquipmentNote.hidden = true;
      els.barbellCalculator.hidden = true;
      submitButton.disabled = true;
      els.logSetOpen.disabled = true;
      return;
    }

    els.logLiftSearch.disabled = false;
    els.logLiftToggle.disabled = false;
    els.logSetOpen.disabled = false;
    renderLogLiftResults();
    const selectedLift = state.lifts.find((lift) => lift.id === els.logLift.value);
    if (selectedLift) {
      els.logLiftSearch.value = selectedLift.name;
      updateLogEquipmentInterface();
    } else {
      els.logLift.value = '';
      updateLogEquipmentInterface();
    }
    syncSubmitButton(els.logForm);
  }

  function filteredLogLifts() {
    const query = state.logLiftQuery.toLowerCase();
    return state.lifts.filter((lift) => (
      (!query || lift.name.toLowerCase().includes(query))
      && (state.logEquipmentFilter === 'all' || equipmentTypeForLift(lift) === state.logEquipmentFilter)
    ));
  }

  function renderLogLiftResults() {
    const filteredLifts = filteredLogLifts();
    state.logActiveOptionIndex = Math.min(state.logActiveOptionIndex, filteredLifts.length - 1);
    const selectedLiftId = els.logLift.value;
    els.logEquipmentFilters.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.logEquipmentFilter === state.logEquipmentFilter));
    });
    els.logLiftOptions.innerHTML = filteredLifts.length
      ? filteredLifts.map((lift, index) => `
        <button
          class="lifting-combobox-option${index === state.logActiveOptionIndex ? ' is-active' : ''}"
          id="log-lift-option-${index}"
          type="button"
          role="option"
          aria-selected="${String(lift.id === selectedLiftId)}"
          data-log-lift-option="${escapeHtml(lift.id)}"
        >
          <span>${escapeHtml(lift.name)}</span>
          <span class="lifting-equipment-badge">${escapeHtml(equipmentForLift(lift).badge)}</span>
        </button>
      `).join('')
      : '<div class="lifting-combobox-empty" role="option" aria-disabled="true">No matching lifts.</div>';
    if (state.logActiveOptionIndex >= 0) {
      els.logLiftSearch.setAttribute('aria-activedescendant', `log-lift-option-${state.logActiveOptionIndex}`);
    } else {
      els.logLiftSearch.removeAttribute('aria-activedescendant');
    }
  }

  function setLogLiftMenuOpen(isOpen) {
    els.logLiftMenu.hidden = !isOpen;
    els.logLiftSearch.setAttribute('aria-expanded', String(isOpen));
    els.logLiftToggle.setAttribute('aria-expanded', String(isOpen));
    els.logLiftPicker.classList.toggle('is-open', isOpen);
    els.logSetModal.classList.toggle('is-lift-menu-open', isOpen);
    if (isOpen) {
      els.logSetModal.scrollTop = 0;
      renderLogLiftResults();
    }
    if (!isOpen) {
      state.logActiveOptionIndex = -1;
      els.logLiftSearch.removeAttribute('aria-activedescendant');
    }
  }

  function selectLogLift(liftId) {
    const selectedLift = state.lifts.find((lift) => lift.id === liftId);
    if (!selectedLift) return;
    els.logLift.value = selectedLift.id;
    els.logLiftSearch.value = selectedLift.name;
    els.logLiftSearchStatus.textContent = '';
    state.logLiftQuery = '';
    state.logActiveOptionIndex = -1;
    updateLogEquipmentInterface();
    syncSubmitButton(els.logForm);
    setLogLiftMenuOpen(false);
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
              <p><span class="lifting-log-date">${escapeHtml(log.lifted_at)}</span>${log.notes ? ` - ${escapeHtml(log.notes)}` : ''}</p>
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

  function openLogSetModal(liftId = '') {
    state.logLiftQuery = '';
    state.logEquipmentFilter = 'all';
    state.logActiveOptionIndex = -1;
    els.logLiftSearch.value = '';
    els.logLift.value = '';
    els.logLiftSearchStatus.textContent = '';
    setLogLiftMenuOpen(false);
    resetPlateCalculator();
    renderLiftOptions();

    const hasLift = liftId && state.lifts.some((lift) => lift.id === liftId);
    if (hasLift) {
      selectLogLift(liftId);
    }

    updateLogEquipmentInterface();
    syncSubmitButton(els.logForm);

    els.logSetModal.showModal();
    (hasLift ? document.getElementById('log-weight') : els.logLiftSearch).focus();
  }

  function renderList() {
    const allMetrics = state.lifts.map(metricsForLift);

    const filtered = allMetrics.filter((item) => (
      item.lift.name.toLowerCase().includes(state.query.toLowerCase())
    ));

    if (!filtered.length) {
      els.list.innerHTML = `<p class="lifting-empty">${state.lifts.length ? 'No lifts match your search.' : 'No lift types yet.'}</p>`;
      return;
    }

    els.list.innerHTML = filtered.map((item) => `
      <article class="lifting-card">
        <div class="lifting-card-summary">
          <button class="lifting-row" type="button" data-toggle-lift="${escapeHtml(item.lift.id)}" aria-expanded="false">
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
          </button>
          <button class="lifting-action lifting-card-log" type="button" data-log-lift="${escapeHtml(item.lift.id)}">Log</button>
        </div>
        <div class="lifting-details" id="details-${escapeHtml(item.lift.id)}" hidden>
          <section>
            ${renderRepGrid(item.theoreticalOneRep)}
            <div class="lifting-detail-actions">
              <button class="lifting-action" type="button" data-open-logs="${escapeHtml(item.lift.id)}">View logs</button>
              <button class="lifting-action" type="button" data-rename-lift="${escapeHtml(item.lift.id)}">Edit</button>
            </div>
          </section>
        </div>
      </article>
    `).join('');
  }

  function render() {
    renderLiftOptions();
    renderList();
  }

  async function loadLifts() {
    setStatus('Loading lifts...');
    const data = await api('list');
    state.lifts = data.lifts || [];
    state.logs = data.logs || [];
    render();
    setStatus(`Updated ${new Date().toLocaleTimeString()}.`);
  }

  els.logDate.valueAsDate = new Date();
  [els.addLiftForm, els.logForm, els.renameLiftForm].forEach(watchFormCompletion);

  els.lockButton.addEventListener('click', async () => {
    els.workspace.hidden = true;
    await window.PersonalAuth.signOut().catch(() => {});
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

  els.logSetOpen.addEventListener('click', () => {
    openLogSetModal();
  });

  els.logSetClose.addEventListener('click', () => {
    els.logSetModal.close();
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

  [els.addLiftModal, els.logSetModal, els.renameLiftModal, els.liftLogsModal].forEach((modal) => {
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
    if (!formIsComplete(els.logForm)) {
      syncSubmitButton(els.logForm);
      return;
    }
    const form = new FormData(els.logForm);
    const submitButton = els.logForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('');
    try {
      await api('addLog', {
        lift_id: form.get('lift_id'),
        lifted_at: form.get('lifted_at'),
        weight: Number(form.get('weight')),
        reps: Number(form.get('reps'))
      });
      const selectedLift = els.logLift.value;
      els.logForm.reset();
      els.logLiftSearch.value = '';
      els.logDate.valueAsDate = new Date();
      els.logLift.value = selectedLift;
      els.logSetModal.close();
      await loadLifts();
    } catch (error) {
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
      await loadLifts();
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

  els.logLiftSearch.addEventListener('click', () => {
    setLogLiftMenuOpen(true);
  });

  els.logLiftSearch.addEventListener('input', () => {
    state.logLiftQuery = els.logLiftSearch.value.trim();
    state.logActiveOptionIndex = -1;
    els.logLift.value = '';
    els.logLiftSearchStatus.textContent = '';
    updateLogEquipmentInterface();
    syncSubmitButton(els.logForm);
    setLogLiftMenuOpen(true);
  });

  els.logLiftSearch.addEventListener('keydown', (event) => {
    const filteredLifts = filteredLogLifts();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setLogLiftMenuOpen(true);
      if (!filteredLifts.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (state.logActiveOptionIndex < 0) {
        state.logActiveOptionIndex = direction > 0 ? 0 : filteredLifts.length - 1;
      } else {
        state.logActiveOptionIndex = (state.logActiveOptionIndex + direction + filteredLifts.length) % filteredLifts.length;
      }
      renderLogLiftResults();
      document.getElementById(`log-lift-option-${state.logActiveOptionIndex}`)?.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter' && !els.logLiftMenu.hidden && filteredLifts.length) {
      event.preventDefault();
      const index = state.logActiveOptionIndex >= 0 ? state.logActiveOptionIndex : 0;
      selectLogLift(filteredLifts[index].id);
    }
    if (event.key === 'Escape' && !els.logLiftMenu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setLogLiftMenuOpen(false);
    }
  });

  els.logLiftToggle.addEventListener('click', () => {
    const shouldOpen = els.logLiftMenu.hidden;
    setLogLiftMenuOpen(shouldOpen);
    if (shouldOpen) els.logLiftSearch.focus();
  });

  els.logLiftPicker.addEventListener('click', (event) => {
    const filterButton = event.target.closest('[data-log-equipment-filter]');
    const optionButton = event.target.closest('[data-log-lift-option]');
    if (filterButton) {
      state.logEquipmentFilter = filterButton.dataset.logEquipmentFilter;
      state.logActiveOptionIndex = -1;
      renderLogLiftResults();
      els.logLiftSearch.focus();
    }
    if (optionButton) {
      selectLogLift(optionButton.dataset.logLiftOption);
      els.logLiftSearch.focus();
      setLogLiftMenuOpen(false);
    }
  });

  els.logLiftPicker.addEventListener('focusout', () => {
    setTimeout(() => {
      if (els.logLiftPicker.contains(document.activeElement)) return;
      setLogLiftMenuOpen(false);
      els.logLiftSearchStatus.textContent = els.logLiftSearch.value.trim() && !els.logLift.value
        ? 'Choose a lift from the results.'
        : '';
    }, 0);
  });

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
    if (!event.target.closest('.lifting-lift-picker')) {
      setLogLiftMenuOpen(false);
    }
    const toggleButton = event.target.closest('[data-toggle-lift]');
    const logsButton = event.target.closest('[data-open-logs]');
    const logLiftButton = event.target.closest('[data-log-lift]');
    const renameLiftButton = event.target.closest('[data-rename-lift]');
    const deleteLogButton = event.target.closest('[data-delete-log]');
    const deleteLiftButton = event.target.closest('[data-delete-lift]');

    try {
      if (toggleButton) {
        const toggleLiftId = toggleButton.dataset.toggleLift;
        const details = document.getElementById(`details-${toggleLiftId}`);
        const isHidden = details.hidden;
        details.hidden = !isHidden;
        toggleButton.setAttribute('aria-expanded', String(isHidden));
      }

      if (logsButton) {
        openLogsModal(logsButton.dataset.openLogs);
      }

      if (logLiftButton) {
        openLogSetModal(logLiftButton.dataset.logLift);
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
