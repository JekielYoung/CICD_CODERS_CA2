// public/js/shared/api.js  YouJun
// fetch wrapper: adds the token, turns errors into Error objects.
const TOKEN_KEY = 'orbit_token';

export const auth = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// api('/trips')                               -> GET
// api('/auth/login', { method: 'POST', body, redirectOn401: false })
// A 401 normally means "session ended": clear the token and go to the login page.
// The login form passes redirectOn401: false, because a 401 there just means a wrong password.
export async function api(path, { method = 'GET', body, redirectOn401 = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Cannot reach the server. Check your connection and try again.');
    err.status = 0;
    throw err;
  }

  if (res.status === 401 && redirectOn401) {
    auth.clear();
    window.location.href = '/login.html';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.field = data.field; // which input the message belongs to, when the server says
    throw err;
  }
  return data;
}

// Used by the top bar's Log out button
export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST', redirectOn401: false });
  } catch {
    // even if the server cannot be reached, still sign out in this browser
  }
  auth.clear();
  window.location.href = '/login.html';
}
