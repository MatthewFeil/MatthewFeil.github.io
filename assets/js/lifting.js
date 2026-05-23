(() => {
  const TOKEN_KEY = 'personalSpaceToken';
  const TOKEN_EXPIRY_KEY = 'personalSpaceTokenExpiresAt';
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
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    lifts: [],
    logs: [],
    query: ''
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
    logForm: document.getElementById('log-form'),
    logLift: document.getElementById('log-lift'),
    logDate: document.getElementById('log-date'),
    search: document.getElementById('lift-search'),
    list: document.getElementById('lifting-list'),
    status: document.getElementById('lifting-status')
  };

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.style.color = isError ? 'var(--lifting-warn)' : '';
  }

  function sessionIsFresh() {
    const expiresAt = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY));
    return Boolean(state.token && Number.isFinite(expiresAt) && expiresAt > Date.now());
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    state.token = '';
  }

  function redirectToPersonal() {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `${personalUrl}?next=${next}`;
  }

  async function api(action, payload = {}) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-personal-token': state.token
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

  function estimateOneRepMax(log) {
    return Number(log.weight) / repPercent[Number(log.reps)];
  }

  function getLiftLogs(liftId) {
    return state.logs.filter((log) => log.lift_id === liftId);
  }

  function metricsForLift(lift) {
    const logs = getLiftLogs(lift.id);
    const realOneRep = logs
      .filter((log) => Number(log.reps) === 1)
      .reduce((max, log) => Math.max(max, Number(log.weight)), 0);
    const theoreticalOneRep = logs.reduce((max, log) => Math.max(max, estimateOneRepMax(log)), 0);
    const trueMax = logs.reduce((max, log) => Math.max(max, Number(log.weight)), 0);
    return { lift, logs, realOneRep, theoreticalOneRep, trueMax };
  }

  function renderLiftOptions() {
    if (!state.lifts.length) {
      els.logLift.innerHTML = '<option value="">Add a lift first</option>';
      els.logForm.querySelector('button').disabled = true;
      els.logSetOpen.disabled = true;
      return;
    }

    els.logForm.querySelector('button').disabled = false;
    els.logSetOpen.disabled = false;
    els.logLift.innerHTML = state.lifts
      .map((lift) => `<option value="${lift.id}">${lift.name}</option>`)
      .join('');
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
              <p><span class="lifting-log-date">${log.lifted_at}</span>${log.notes ? ` - ${log.notes}` : ''}</p>
            </div>
            <button class="lifting-action" type="button" data-delete-log="${log.id}">Delete</button>
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
        <button class="lifting-row" type="button" data-toggle-lift="${item.lift.id}" aria-expanded="false">
          <div class="lifting-card-title">
            <h3>${item.lift.name}</h3>
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
        <div class="lifting-details" id="details-${item.lift.id}" hidden>
          <section>
            <div class="lifting-detail-heading">
              <h4 class="lifting-subhead">Est. Rep Targets</h4>
            </div>
            ${renderRepGrid(item.theoreticalOneRep)}
            <div class="lifting-detail-actions">
              <button class="lifting-action" type="button" data-open-logs="${item.lift.id}">View logs</button>
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

  els.lockButton.addEventListener('click', () => {
    els.workspace.hidden = true;
    clearSession();
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
    els.logSetModal.showModal();
    els.logLift.focus();
  });

  els.logSetClose.addEventListener('click', () => {
    els.logSetModal.close();
  });

  els.liftLogsClose.addEventListener('click', () => {
    els.liftLogsModal.close();
  });

  els.liftLogsModal.addEventListener('close', () => {
    delete els.liftLogsModal.dataset.liftId;
  });

  [els.addLiftModal, els.logSetModal, els.liftLogsModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.close();
      }
    });
  });

  els.addLiftForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.addLiftForm);
    try {
      await api('addLift', { name: form.get('name') });
      els.addLiftForm.reset();
      els.addLiftModal.close();
      await loadLifts();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(els.logForm);
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
      els.logDate.valueAsDate = new Date();
      els.logLift.value = selectedLift;
      els.logSetModal.close();
      await loadLifts();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.search.addEventListener('input', () => {
    state.query = els.search.value.trim();
    renderList();
  });

  document.addEventListener('click', async (event) => {
    const toggleButton = event.target.closest('[data-toggle-lift]');
    const logsButton = event.target.closest('[data-open-logs]');
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

      if (deleteLogButton && confirm('Delete this lift log?')) {
        const openLogsLiftId = els.liftLogsModal.dataset.liftId;
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
        await api('deleteLift', { id: deleteLiftButton.dataset.deleteLift });
        els.liftLogsModal.close();
        await loadLifts();
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  async function boot() {
    if (!sessionIsFresh()) {
      clearSession();
      redirectToPersonal();
      return;
    }

    els.workspace.hidden = false;

    try {
      await loadLifts();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        clearSession();
        redirectToPersonal();
        return;
      }
      setStatus(error instanceof Error ? error.message : 'The lifting tracker request failed.', true);
    }
  }

  boot();
})();
