(() => {
  const TOKEN_KEY = 'personalSpaceToken';
  const TOKEN_EXPIRY_KEY = 'personalSpaceTokenExpiresAt';
  const app = document.querySelector('[data-personal-app]');
  if (!app) return;

  const demoDashboard = {
    calendar: [
      { id: 'demo-school', time: '7:45 AM', title: 'School', detail: 'Classes and commute', url: 'https://calendar.google.com/calendar/u/0/r/day' },
      { id: 'demo-practice', time: '3:30 PM', title: 'Practice block', detail: 'Open time after school', url: 'https://calendar.google.com/calendar/u/0/r/day' },
      { id: 'demo-review', time: '8:00 PM', title: 'Review tomorrow', detail: 'Calendar and task reset', url: 'https://calendar.google.com/calendar/u/0/r/day' }
    ],
    todoist: [
      { id: 'demo-dashboard', title: 'Finish personal dashboard wiring', details: ['8:30 AM', 'Personal site'], priority: 4, priorityClass: 'p4', url: 'https://todoist.com/app/today' },
      { id: 'demo-lift', title: 'Log today’s lift', details: ['Fitness'], priority: 3, priorityClass: 'p3', url: 'https://todoist.com/app/today' },
      { id: 'demo-portfolio', title: 'Check portfolio notes', details: ['Finance'], priority: 2, priorityClass: 'p2', url: 'https://todoist.com/app/today' }
    ]
  };

  const pendingTodoistCompletions = new Map();

  const els = {
    lock: document.getElementById('personal-lock'),
    workspace: document.getElementById('personal-workspace'),
    form: document.getElementById('personal-unlock-form'),
    password: document.getElementById('personal-password'),
    unlockButton: document.getElementById('personal-unlock-button'),
    unlockLabel: document.querySelector('.personal-button-label'),
    status: document.getElementById('personal-status'),
    lockButton: document.getElementById('personal-lock-button'),
    dashboardDate: document.getElementById('personal-dashboard-date'),
    calendarWidget: document.getElementById('personal-calendar-widget'),
    calendarCount: document.getElementById('personal-calendar-count'),
    calendarList: document.getElementById('personal-calendar-list'),
    todoistWidget: document.getElementById('personal-todoist-widget'),
    todoistCount: document.getElementById('personal-todoist-count'),
    todoistList: document.getElementById('personal-todoist-list')
  };

  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function storedSessionIsFresh() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expiresAt = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY));
    return Boolean(token && Number.isFinite(expiresAt) && expiresAt > Date.now());
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  }

  function sessionToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('is-error', isError);
    app.classList.toggle('is-denied', isError);
  }

  function setLoading(isLoading) {
    els.unlockButton.disabled = isLoading;
    els.unlockButton.classList.toggle('is-loading', isLoading);
    els.unlockButton.setAttribute('aria-busy', String(isLoading));
    app.classList.toggle('is-loading', isLoading);
    els.unlockLabel.textContent = isLoading ? 'Checking' : 'Enter';
  }

  function setWidgetLoading(widget, isLoading) {
    widget?.classList.toggle('is-loading', isLoading);
    widget?.setAttribute('aria-busy', String(isLoading));
  }

  function setDashboardLoading(isLoading) {
    setWidgetLoading(els.calendarWidget, isLoading);
    setWidgetLoading(els.todoistWidget, isLoading);
  }

  function setTodoistLoading(isLoading) {
    setWidgetLoading(els.todoistWidget, isLoading);
  }

  function syncTodoistCompletionLoading(isCompleting = false) {
    setTodoistLoading(isCompleting || pendingTodoistCompletions.size > 0);
  }

  function showWorkspace() {
    els.lock.hidden = true;
    els.workspace.hidden = false;
    app.classList.add('is-unlocked');
    app.classList.remove('is-denied', 'is-loading');
    loadDashboard();
  }

  function showLock() {
    els.workspace.hidden = true;
    els.lock.hidden = false;
    app.classList.remove('is-unlocked');
    els.password.focus();
  }

  function nextPath() {
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next || !next.startsWith('/') || next.startsWith('//')) return '';
    return next;
  }

  async function unlock(password) {
    const response = await fetch(app.dataset.authUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unlockPersonal', password })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'The password was not accepted.');
    }

    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(data.expiresAt));
  }

  async function loadDashboard() {
    els.dashboardDate.textContent = today.format(new Date());

    if (app.dataset.dashboardMode !== 'live') {
      renderDashboard(demoDashboard);
      return;
    }

    setDashboardLoading(true);
    try {
      const response = await fetch(app.dataset.dashboardUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-personal-token': sessionToken()
        },
        body: JSON.stringify({ action: 'summary' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Dashboard data request failed.');
      }
      renderDashboard(data);
    } catch (error) {
      renderDashboard(demoDashboard);
    } finally {
      setDashboardLoading(false);
    }
  }

  function renderDashboard(data) {
    const calendar = Array.isArray(data.calendar) ? data.calendar : demoDashboard.calendar;
    const todoist = Array.isArray(data.todoist) ? data.todoist : demoDashboard.todoist;

    els.calendarCount.textContent = String(calendar.length);
    els.calendarList.innerHTML = calendar.map((event) => `
      <li>
        <a href="${escapeHtml(event.url || 'https://calendar.google.com/calendar/u/0/r/day')}" target="_blank" rel="noopener">
          <span>${escapeHtml(event.time)}</span>
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(event.detail)}</span>
        </a>
      </li>
    `).join('');

    els.todoistCount.textContent = String(todoist.length);
    els.todoistList.innerHTML = todoist.map((task) => `
      <li data-task-id="${escapeHtml(task.id || '')}" data-priority="${escapeHtml(task.priority || 1)}">
        <button class="personal-task-check" type="button" data-complete-task="${escapeHtml(task.id || '')}" data-priority="${escapeHtml(task.priority || 1)}" aria-label="Complete ${escapeHtml(task.title)}"></button>
        <a href="${escapeHtml(task.url || 'https://todoist.com/app/today')}" target="_blank" rel="noopener">
          <strong>${escapeHtml(task.title)}</strong>
          ${taskDetails(task).map((detail) => `<span>${escapeHtml(detail)}</span>`).join('')}
        </a>
      </li>
    `).join('');
  }

  function taskDetails(task) {
    if (Array.isArray(task.details)) {
      return task.details.filter(Boolean);
    }
    return task.detail ? [task.detail] : [];
  }

  function updateTodoistCount() {
    els.todoistCount.textContent = String(els.todoistList.querySelectorAll('li:not(.is-removing)').length);
  }

  async function completeTodoistTask(taskId) {
    if (!taskId) return;

    const taskRow = els.todoistList.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
    const button = els.todoistList.querySelector(`[data-complete-task="${CSS.escape(taskId)}"]`);
    if (!taskRow || button?.disabled) return;

    if (pendingTodoistCompletions.has(taskId)) {
      cancelTodoistCompletion(taskId);
      return;
    }

    taskRow.classList.add('is-complete', 'is-pending-complete');
    button?.setAttribute('aria-pressed', 'true');

    const timeoutId = window.setTimeout(() => {
      pendingTodoistCompletions.delete(taskId);
      finishTodoistCompletion(taskId, taskRow, button);
    }, 3000);
    pendingTodoistCompletions.set(taskId, timeoutId);
    syncTodoistCompletionLoading();
  }

  function cancelTodoistCompletion(taskId) {
    const timeoutId = pendingTodoistCompletions.get(taskId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    pendingTodoistCompletions.delete(taskId);

    const taskRow = els.todoistList.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
    const button = els.todoistList.querySelector(`[data-complete-task="${CSS.escape(taskId)}"]`);
    taskRow?.classList.remove('is-complete', 'is-pending-complete');
    button?.setAttribute('aria-pressed', 'false');
    syncTodoistCompletionLoading();
  }

  async function finishTodoistCompletion(taskId, taskRow, button) {
    button?.setAttribute('aria-busy', 'true');
    button?.setAttribute('disabled', '');
    taskRow.classList.add('is-complete');
    button?.setAttribute('aria-pressed', 'true');
    syncTodoistCompletionLoading(true);

    try {
      if (app.dataset.dashboardMode === 'live') {
        const response = await fetch(app.dataset.dashboardUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-personal-token': sessionToken()
          },
          body: JSON.stringify({ action: 'completeTodoistTask', taskId })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Todoist task completion failed.');
        }
      }

      collapseTodoistRow(taskRow);
      taskRow.classList.remove('is-pending-complete');
      updateTodoistCount();
      window.setTimeout(() => {
        taskRow.remove();
      }, 360);
    } catch (error) {
      taskRow.classList.remove('is-complete', 'is-pending-complete');
      button?.removeAttribute('disabled');
      button?.setAttribute('aria-pressed', 'false');
    } finally {
      button?.setAttribute('aria-busy', 'false');
      syncTodoistCompletionLoading();
    }
  }

  function collapseTodoistRow(taskRow) {
    taskRow.style.maxHeight = `${taskRow.scrollHeight}px`;
    taskRow.style.setProperty('--task-row-height', `${taskRow.scrollHeight}px`);
    taskRow.getBoundingClientRect();
    taskRow.classList.add('is-removing');
    taskRow.style.maxHeight = '0px';
  }

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    setLoading(true);
    try {
      await unlock(els.password.value);
      const redirectPath = nextPath();
      if (redirectPath) {
        window.location.href = redirectPath;
        return;
      }
      setStatus('');
      els.password.value = '';
      showWorkspace();
    } catch (error) {
      clearSession();
      setStatus('Incorrect password.', true);
    } finally {
      setLoading(false);
    }
  });

  els.password.addEventListener('input', () => {
    if (app.classList.contains('is-denied')) {
      setStatus('');
    }
  });

  els.lockButton.addEventListener('click', () => {
    clearSession();
    els.password.value = '';
    setStatus('');
    showLock();
  });

  els.todoistList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-complete-task]');
    if (!button) return;
    completeTodoistTask(button.dataset.completeTask);
  });

  if (storedSessionIsFresh()) {
    showWorkspace();
  } else {
    clearSession();
    showLock();
  }
})();
