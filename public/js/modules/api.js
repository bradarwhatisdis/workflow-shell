/**
 * Centralized API client and session token management.
 */
'use strict';

const STORAGE_KEY_TOKEN = 'wfs-session-token';

/**
 * Retrieve the session token from URL param (first-time) or localStorage.
 */
function getSessionToken() {
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get('token');
  if (tokenFromUrl) {
    localStorage.setItem(STORAGE_KEY_TOKEN, tokenFromUrl);
    window.history.replaceState({}, document.title, window.location.pathname);
    return tokenFromUrl;
  }
  return localStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Centralized fetch wrapper.
 * - Attaches auth token header
 * - Handles 401 by clearing token and redirecting
 * - Returns parsed JSON
 */
async function api(url, options = {}) {
  const token = getSessionToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['x-session-token'] = token;
  }
  headers['X-Pinggy-No-Screen'] = 'true';

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    window.location.replace('/login.html');
    throw new Error('Unauthorized');
  }
  if (res.status === 204) return null;
  return res.json();
}

export { api, getSessionToken, STORAGE_KEY_TOKEN };
