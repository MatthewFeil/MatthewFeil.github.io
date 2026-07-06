(() => {
  const TOKEN_KEY = 'personalSpaceToken';
  const TOKEN_EXPIRY_KEY = 'personalSpaceTokenExpiresAt';
  const app = document.querySelector('[data-personal-app]');
  if (!app) return;

  const els = {
    lock: document.getElementById('personal-lock'),
    workspace: document.getElementById('personal-workspace'),
    form: document.getElementById('personal-unlock-form'),
    password: document.getElementById('personal-password'),
    unlockButton: document.getElementById('personal-unlock-button'),
    unlockLabel: document.querySelector('.personal-button-label'),
    status: document.getElementById('personal-status'),
    lockButton: document.getElementById('personal-lock-button')
  };

  function storedSessionIsFresh() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expiresAt = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY));
    return Boolean(token && Number.isFinite(expiresAt) && expiresAt > Date.now());
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
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

  function showWorkspace() {
    els.lock.hidden = true;
    els.workspace.hidden = false;
    app.classList.add('is-unlocked');
    app.classList.remove('is-denied', 'is-loading');
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

  if (storedSessionIsFresh()) {
    showWorkspace();
  } else {
    clearSession();
    showLock();
  }
})();
