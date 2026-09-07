(() => {
  const personalUrl = document.body.dataset.personalUrl || '/personal/';

  function redirectToPersonal() {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    window.location.replace(`${personalUrl}?next=${next}`);
  }

  async function unlockPage() {
    try {
      if (!window.PersonalAuth || !(await window.PersonalAuth.session())) {
        redirectToPersonal();
        return;
      }

      document.body.classList.remove('is-auth-pending');
      document.querySelector('.personal-auth-gate')?.remove();
    } catch {
      redirectToPersonal();
    }
  }

  unlockPage();
})();
