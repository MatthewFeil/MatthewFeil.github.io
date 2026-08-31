(() => {
  const app = document.querySelector('[data-personal-app]');
  if (!app) return;

  const emptyMessages = {
    calendar: 'No events left today.',
    todoist: 'No tasks left today.'
  };

  const pendingTodoistCompletions = new Map();
  let dashboardLoading = false;
  let dashboardStatusTimeout;

  const els = {
    lock: document.getElementById('personal-lock'),
    workspace: document.getElementById('personal-workspace'),
    form: document.getElementById('personal-unlock-form'),
    email: document.getElementById('personal-email'),
    password: document.getElementById('personal-password'),
    unlockButton: document.getElementById('personal-unlock-button'),
    unlockLabel: document.querySelector('.personal-button-label'),
    status: document.getElementById('personal-status'),
    lockButton: document.getElementById('personal-lock-button'),
    dashboardDate: document.getElementById('personal-dashboard-date'),
    dashboardStatus: document.getElementById('personal-dashboard-status'),
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

  async function hasSession() {
    return Boolean(await window.PersonalAuth.session());
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
    els.unlockLabel.textContent = isLoading ? 'Checking' : 'Sign in';
  }

  function setDashboardStatus(message, isError = false, timeout = 0) {
    window.clearTimeout(dashboardStatusTimeout);
    els.dashboardStatus.textContent = message;
    els.dashboardStatus.classList.toggle('is-error', isError);
    els.dashboardStatus.classList.remove('is-updating');
    if (message) {
      void els.dashboardStatus.offsetWidth;
      els.dashboardStatus.classList.add('is-updating');
    }
    if (timeout && message) {
      dashboardStatusTimeout = window.setTimeout(() => setDashboardStatus(''), timeout);
    }
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
    setTodoistLoading(isCompleting);
  }

  function showWorkspace() {
    els.lock.hidden = true;
    els.workspace.hidden = false;
    app.classList.add('is-unlocked');
    app.classList.remove('is-denied', 'is-loading', 'is-locking');
    els.lock.classList.remove('is-entering');
    els.lockButton.classList.remove('is-locking');
    els.lockButton.disabled = false;
    els.lockButton.setAttribute('aria-busy', 'false');
    loadDashboard();
  }

  function showLock(animate = false) {
    els.workspace.hidden = true;
    els.lock.hidden = false;
    app.classList.remove('is-unlocked', 'is-locking');
    if (animate) {
      els.lock.classList.add('is-entering');
      window.setTimeout(() => els.lock.classList.remove('is-entering'), 250);
    }
    (els.email.value ? els.password : els.email).focus();
  }

  function lockMotionDelay() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
  }

  function nextPath() {
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next || !next.startsWith('/') || next.startsWith('//')) return '';
    return next;
  }

  async function unlock(email, password) {
    await window.PersonalAuth.signIn(email, password);
  }

  async function loadDashboard() {
    if (dashboardLoading) return;
    dashboardLoading = true;
    els.dashboardDate.textContent = today.format(new Date());
    setDashboardStatus('');

    if (app.dataset.dashboardMode !== 'live') {
      renderDashboard({});
      setDashboardStatus('Dashboard preview does not include live data.');
      dashboardLoading = false;
      return;
    }

    setDashboardLoading(true);
    try {
      const response = await window.PersonalAuth.authorizedFetch(app.dataset.dashboardUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'summary' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Dashboard data request failed.');
      }
      renderDashboard(data);
    } catch (error) {
      renderDashboardError(error);
    } finally {
      setDashboardLoading(false);
      dashboardLoading = false;
    }
  }

  function renderDashboard(data) {
    let hasUnavailableData = false;
    if (Array.isArray(data.calendar)) {
      renderCalendar(data.calendar);
    } else {
      hasUnavailableData = true;
      renderReloadState(els.calendarWidget, els.calendarCount, els.calendarList, 'Calendar', 'Couldn’t load today’s events.');
    }

    if (Array.isArray(data.todoist)) {
      renderTodoist(sortTodoistTasks(data.todoist));
    } else {
      hasUnavailableData = true;
      renderReloadState(els.todoistWidget, els.todoistCount, els.todoistList, 'Todoist', 'Couldn’t load today’s tasks.');
    }

    if (hasUnavailableData) {
      setDashboardStatus('Couldn’t load one or more dashboard sections. Try again.', true);
    }
  }

  function renderDashboardError(error) {
    const sessionExpired = error?.status === 401 || error?.status === 403;
    const message = sessionExpired
      ? 'Your session may have expired. Lock, then sign in again.'
      : 'Couldn’t load your dashboard. Try again.';

    setDashboardStatus(message, true);
    renderReloadState(els.calendarWidget, els.calendarCount, els.calendarList, 'Calendar', message);
    renderReloadState(els.todoistWidget, els.todoistCount, els.todoistList, 'Todoist', message);
  }

  function renderCalendar(calendar) {
    setWidgetCount(els.calendarCount, calendar.length, 'event');
    setWidgetEmpty(els.calendarWidget, calendar.length === 0);
    if (!calendar.length) {
      renderEmptyState(els.calendarList, emptyMessages.calendar);
      return;
    }

    els.calendarList.innerHTML = calendar.map((event, index) => `
      <li class="personal-dashboard-entry" style="--entry-index: ${Math.min(index, 6)}">
        <a href="${escapeHtml(event.url || 'https://calendar.google.com/calendar/u/0/r/day')}" target="_blank" rel="noopener">
          <span>${escapeHtml(event.time)}</span>
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(event.detail)}</span>
        </a>
      </li>
    `).join('');
  }

  function renderTodoist(todoist) {
    setWidgetCount(els.todoistCount, todoist.length, 'task');
    setWidgetEmpty(els.todoistWidget, todoist.length === 0);
    if (!todoist.length) {
      renderEmptyState(els.todoistList, emptyMessages.todoist);
      return;
    }

    els.todoistList.innerHTML = todoist.map((task, index) => `
      <li class="personal-dashboard-entry" style="--entry-index: ${Math.min(index, 6)}" data-task-id="${escapeHtml(task.id || '')}" data-priority="${escapeHtml(task.priority || 1)}" data-task-title="${escapeHtml(task.title)}">
        <button class="personal-task-check" type="button" data-complete-task="${escapeHtml(task.id || '')}" data-priority="${escapeHtml(task.priority || 1)}" aria-label="Complete ${escapeHtml(task.title)}"></button>
        <div class="personal-task-content">
          <a href="${escapeHtml(task.url || 'https://todoist.com/app/today')}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(task.title)} in Todoist (opens in a new tab)">
            <span class="personal-task-title-line">
              ${taskTime(task) ? `<span class="personal-task-time">${escapeHtml(taskTime(task))}</span>` : ''}
              <strong>${escapeHtml(task.title)}</strong>
            </span>
            ${taskDetails(task).map((detail) => `<span>${escapeHtml(detail)}</span>`).join('')}
          </a>
        </div>
      </li>
    `).join('');
  }

  function renderEmptyState(list, message) {
    list.innerHTML = `
      <li class="personal-empty-message">
        <span>${escapeHtml(message)}</span>
      </li>
    `;
  }

  function renderReloadState(widget, count, list, source, message) {
    setWidgetCount(count, 0, source === 'Calendar' ? 'event' : 'task');
    setWidgetEmpty(widget, true);
    list.innerHTML = `
      <li class="personal-empty-message">
        <span>${escapeHtml(message)}</span>
        <button class="personal-reload-message" type="button">Try again</button>
      </li>
    `;
  }

  function setWidgetCount(count, value, singular) {
    const total = Number(value) || 0;
    count.textContent = String(total);
    count.setAttribute('aria-label', `${total} ${singular}${total === 1 ? '' : 's'} today`);
  }

  function setWidgetEmpty(widget, isEmpty) {
    widget?.classList.toggle('is-empty', isEmpty);
  }

  function taskDetails(task) {
    const time = taskTime(task);
    if (Array.isArray(task.details)) {
      return task.details.filter((detail) => detail && String(detail).trim() !== time);
    }
    return task.detail ? [task.detail] : [];
  }

  function taskTime(task) {
    return String(task.time || '').trim();
  }

  function taskSortTime(task) {
    if (task.sortTime !== null && task.sortTime !== undefined && task.sortTime !== '') {
      const numericSortTime = Number(task.sortTime);
      if (Number.isFinite(numericSortTime)) return numericSortTime;
    }

    const time = taskTime(task);
    if (!time) return Number.POSITIVE_INFINITY;

    const match = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return Number.POSITIVE_INFINITY;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'AM' && hour === 12) hour = 0;
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    return (hour * 60) + minute;
  }

  function sortTodoistTasks(tasks) {
    return tasks
      .map((task, index) => ({ task, index }))
      .sort((left, right) => {
        const leftSortTime = taskSortTime(left.task);
        const rightSortTime = taskSortTime(right.task);
        const leftIsTimed = Number.isFinite(leftSortTime);
        const rightIsTimed = Number.isFinite(rightSortTime);

        if (leftIsTimed && rightIsTimed) {
          return leftSortTime - rightSortTime || left.index - right.index;
        }
        if (leftIsTimed) return -1;
        if (rightIsTimed) return 1;

        return Number(right.task.priority || 1) - Number(left.task.priority || 1) ||
          left.index - right.index;
      })
      .map(({ task }) => task);
  }

  function updateTodoistCount() {
    setWidgetCount(els.todoistCount, visibleTodoistTaskCount(), 'task');
  }

  function visibleTodoistTaskCount() {
    return els.todoistList.querySelectorAll('[data-task-id]:not(.is-removing)').length;
  }

  function syncTodoistEmptyState() {
    if (visibleTodoistTaskCount() === 0) {
      setWidgetEmpty(els.todoistWidget, true);
      renderEmptyState(els.todoistList, emptyMessages.todoist);
    }
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
    button?.setAttribute('aria-label', `Undo completion for ${taskLabel(taskRow)}`);

    const timeoutId = window.setTimeout(() => {
      pendingTodoistCompletions.delete(taskId);
      finishTodoistCompletion(taskId, taskRow, button);
    }, 1500);
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
    if (taskRow) button?.setAttribute('aria-label', `Complete ${taskLabel(taskRow)}`);
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
        const response = await window.PersonalAuth.authorizedFetch(app.dataset.dashboardUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
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
        syncTodoistEmptyState();
      }, 360);
    } catch (error) {
      taskRow.classList.remove('is-complete', 'is-pending-complete');
      button?.removeAttribute('disabled');
      button?.setAttribute('aria-pressed', 'false');
      button?.setAttribute('aria-label', `Complete ${taskLabel(taskRow)}`);
      setDashboardStatus(`Couldn’t complete “${taskLabel(taskRow)}”. Try again.`, true);
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

  function taskLabel(taskRow) {
    const title = String(taskRow?.dataset.taskTitle || 'this task').trim();
    return title.length > 96 ? `${title.slice(0, 93)}…` : title;
  }

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    setLoading(true);
    try {
      await unlock(els.email.value, els.password.value);
      const redirectPath = nextPath();
      if (redirectPath) {
        window.location.href = redirectPath;
        return;
      }
      setStatus('');
      els.email.value = '';
      els.password.value = '';
      showWorkspace();
    } catch (error) {
      await window.PersonalAuth.signOut().catch(() => {});
      setStatus('Incorrect email or password.', true);
    } finally {
      setLoading(false);
    }
  });

  [els.email, els.password].forEach((input) => input.addEventListener('input', () => {
    if (app.classList.contains('is-denied')) {
      setStatus('');
    }
  }));

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
    els.email.value = '';
    els.password.value = '';
    setStatus('');
    showLock(true);
  });

  els.todoistList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-complete-task]');
    if (button) {
      completeTodoistTask(button.dataset.completeTask);
      return;
    }

  });

  [els.calendarList, els.todoistList].forEach((list) => list.addEventListener('click', (event) => {
    if (!event.target.closest('.personal-reload-message')) return;
    loadDashboard();
  }));

  async function boot() {
    try {
      if (await hasSession()) {
        showWorkspace();
        return;
      }
    } catch {
      await window.PersonalAuth.signOut().catch(() => {});
    }
    showLock();
  }

  boot();
})();
