(() => {
  const SUPABASE_URL = 'https://ofrbbmkbbtohocgifwly.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_efyz5f-mSSU9k1ybHWE38g_Nl2hkIqH';

  if (!window.supabase?.createClient) {
    throw new Error('Supabase Auth failed to load.');
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  async function session() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password
    });
    if (error) throw error;
    return data.session;
  }

  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }

  async function authorizedFetch(url, init = {}) {
    const currentSession = await session();
    if (!currentSession?.access_token) {
      const error = new Error('Personal Space sign-in required.');
      error.status = 401;
      throw error;
    }

    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${currentSession.access_token}`
      }
    });
  }

  window.PersonalAuth = {
    authorizedFetch,
    session,
    signIn,
    signOut
  };
})();
