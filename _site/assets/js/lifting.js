(() => {
  const PASSWORD_KEY = 'liftingTrackerPassword';
  const app = document.querySelector('.lifting-app');
  const apiUrl = app.dataset.apiUrl;
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
    password: sessionStorage.getItem(PASSWORD_KEY) || '',
    lifts: [],
    logs: [],
    query: ''
  };

  const els = {
    lock: document.getElementById('lifting-lock'),
    workspace: document.getElementById('lifting-workspace'),
    unlockForm: document.getElementById('lifting-unlock-form'),
    password: document.getElementById('lifting-password'),
    lockButton: document.getElementById('lifting-lock-button'),
    logSetOpen: document.getElementById('log-set-open'),
    logSetClose: document.getElementById('log-set-close'),
    logSetModal: document.getElementById('log-set-modal'),
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

  async function api(action, payload = {}) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lifting-password': state.password
      },
      body: JSON.stringify({ action, ...payload })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'The lifting tracker request failed.');
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
        <button class="lifting-row" type="button" data-toggle-lift="${item.lift.id}">
          <div class="lifting-card-title">
            <h3>${item.lift.name}</h3>
            <div class="lifting-card-meta">${item.logs.length} log${item.logs.length === 1 ? '' : 's'}</div>
          </div>
          <div class="lifting-row-metric">
            <span>Actual 1RM</span>
            <strong>${formatWeight(item.realOneRep)}</strong>
          </div>
          <div class="lifting-row-metric">
            <span>Theoretical 1RM</span>
            <strong>${formatWeight(item.theoreticalOneRep)}</strong>
          </div>
          <span class="lifting-row-cue">Show more</span>
        </button>
        <div class="lifting-details" id="details-${item.lift.id}" hidden>
          <section>
            <div class="lifting-metric">
              <span>True max moved</span>
              <strong>${formatWeight(item.trueMax)}</strong>
            </div>
            <div class="lifting-detail-heading">
              <h4 class="lifting-subhead">Rep targets from best theoretical 1RM</h4>
              <button class="lifting-action" type="button" data-toggle-logs="${item.lift.id}">Show logs</button>
            </div>
            ${renderRepGrid(item.theoreticalOneRep)}
          </section>
          <section class="lifting-logs-section" id="logs-${item.lift.id}" hidden>
            <div class="lifting-logs-heading">
              <h4 class="lifting-subhead">Logs</h4>
              <button class="lifting-action" type="button" data-delete-lift="${item.lift.id}">Delete lift</button>
            </div>
            ${renderLogs(item.logs)}
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

  async function unlock(password) {
    state.password = password;
    await loadLifts();
    sessionStorage.setItem(PASSWORD_KEY, password);
    els.lock.hidden = true;
    els.workspace.hidden = false;
  }

  els.logDate.valueAsDate = new Date();

  els.unlockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await unlock(els.password.value);
    } catch (error) {
      setStatus(error.message, true);
      alert(error.message);
    }
  });

  els.lockButton.addEventListener('click', () => {
    sessionStorage.removeItem(PASSWORD_KEY);
    state.password = '';
    els.password.value = '';
    els.lock.hidden = false;
    els.workspace.hidden = true;
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
    const logsButton = event.target.closest('[data-toggle-logs]');
    const deleteLogButton = event.target.closest('[data-delete-log]');
    const deleteLiftButton = event.target.closest('[data-delete-lift]');

    try {
      if (toggleButton) {
        const toggleLiftId = toggleButton.dataset.toggleLift;
        const details = document.getElementById(`details-${toggleLiftId}`);
        const isHidden = details.hidden;
        details.hidden = !isHidden;
        toggleButton.querySelector('.lifting-row-cue').textContent = isHidden ? 'Show less' : 'Show more';
      }

      if (logsButton) {
        const logsLiftId = logsButton.dataset.toggleLogs;
        const logs = document.getElementById(`logs-${logsLiftId}`);
        const isHidden = logs.hidden;
        logs.hidden = !isHidden;
        logsButton.textContent = isHidden ? 'Hide logs' : 'Show logs';
      }

      if (deleteLogButton && confirm('Delete this lift log?')) {
        await api('deleteLog', { id: deleteLogButton.dataset.deleteLog });
        await loadLifts();
      }

      if (deleteLiftButton && confirm('Delete this lift and all of its logs?')) {
        await api('deleteLift', { id: deleteLiftButton.dataset.deleteLift });
        await loadLifts();
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  if (state.password) {
    unlock(state.password).catch(() => {
      sessionStorage.removeItem(PASSWORD_KEY);
      state.password = '';
    });
  }
})();
