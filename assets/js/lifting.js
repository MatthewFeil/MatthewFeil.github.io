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

  const state = {
    lifts: [],
    logs: [],
    query: '',
    logLiftQuery: ''
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
    liftName: document.getElementById('lift-name'),
    renameLiftModal: document.getElementById('rename-lift-modal'),
    renameLiftClose: document.getElementById('rename-lift-close'),
    renameLiftForm: document.getElementById('rename-lift-form'),
    renameLiftId: document.getElementById('rename-lift-id'),
    renameLiftName: document.getElementById('rename-lift-name'),
    logForm: document.getElementById('log-form'),
    logLiftSearch: document.getElementById('log-lift-search'),
    logLiftSearchStatus: document.getElementById('log-lift-search-status'),
    logLift: document.getElementById('log-lift'),
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
    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
    button.setAttribute('aria-busy', String(isLoading));
    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
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

  function renderLiftOptions() {
    const submitButton = els.logForm.querySelector('button[type="submit"]');

    if (!state.lifts.length) {
      els.logLift.innerHTML = '<option value="">Add a lift first</option>';
      els.logLiftSearch.value = '';
      els.logLiftSearch.disabled = true;
      els.logLiftSearchStatus.textContent = '';
      submitButton.disabled = true;
      els.logSetOpen.disabled = true;
      return;
    }

    const query = state.logLiftQuery.toLowerCase();
    const filteredLifts = state.lifts.filter((lift) => lift.name.toLowerCase().includes(query));
    const currentSelection = els.logLift.value;
    const nextSelection = filteredLifts.some((lift) => lift.id === currentSelection)
      ? currentSelection
      : filteredLifts[0]?.id || '';

    els.logLiftSearch.disabled = false;
    els.logSetOpen.disabled = false;
    submitButton.disabled = !filteredLifts.length;
    els.logLift.innerHTML = filteredLifts.length
      ? filteredLifts
      .map((lift) => `<option value="${escapeHtml(lift.id)}">${escapeHtml(lift.name)}</option>`)
      .join('')
      : '<option value="">No matching lifts</option>';
    els.logLift.value = nextSelection;
    els.logLiftSearchStatus.textContent = state.logLiftQuery && !filteredLifts.length
      ? 'No matching lifts.'
      : '';
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
    els.renameLiftModal.showModal();
    els.renameLiftName.focus();
    els.renameLiftName.select();
  }

  function openLogSetModal(liftId = '') {
    state.logLiftQuery = '';
    els.logLiftSearch.value = '';
    renderLiftOptions();

    const hasLift = liftId && state.lifts.some((lift) => lift.id === liftId);
    if (hasLift) {
      els.logLift.value = liftId;
    }

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
              <div class="lifting-card-meta">${item.logs.length} log${item.logs.length === 1 ? '' : 's'}</div>
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
              <button class="lifting-action" type="button" data-rename-lift="${escapeHtml(item.lift.id)}">Rename</button>
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

  els.lockButton.addEventListener('click', async () => {
    els.workspace.hidden = true;
    await window.PersonalAuth.signOut().catch(() => {});
    redirectToPersonal();
  });

  els.addLiftOpen.addEventListener('click', () => {
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
    const form = new FormData(els.addLiftForm);
    const submitButton = els.addLiftForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Creating...');
    setStatus('');
    try {
      await api('addLift', { name: form.get('name') });
      els.addLiftForm.reset();
      els.addLiftModal.close();
      await loadLifts();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  els.logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.logForm);
    const submitButton = els.logForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Adding...');
    setStatus('');
    try {
      await api('addLog', {
        lift_id: form.get('lift_id'),
        lifted_at: form.get('lifted_at'),
        weight: Number(form.get('weight')),
        reps: Number(form.get('reps')),
        notes: form.get('notes')
      });
      const selectedLift = els.logLift.value;
      els.logForm.reset();
      state.logLiftQuery = '';
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
    const form = new FormData(els.renameLiftForm);
    const id = String(form.get('id') || '');
    const submitButton = els.renameLiftForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, 'Saving...');
    setStatus('');
    try {
      await api('renameLift', {
        id,
        name: form.get('name')
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

  els.logLiftSearch.addEventListener('input', () => {
    state.logLiftQuery = els.logLiftSearch.value.trim();
    renderLiftOptions();
  });

  document.addEventListener('click', async (event) => {
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
