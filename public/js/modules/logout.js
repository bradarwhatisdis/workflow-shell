/**
 * Logout — checks for session token, wires logout button.
 */
import { getSessionToken, api } from './api.js';
import { toast } from './toast.js';

/** Show logout button if session exists, wire click to POST /api/logout */
export function initLogout() {
  var logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  var token = getSessionToken();
  if (token) {
    logoutBtn.style.display = 'inline-flex';
  }

  logoutBtn.addEventListener('click', function() {
    api('/api/logout', { method: 'POST' }).then(function() {
      localStorage.removeItem('wfs-session-token');
      toast('Logged out', 'fa-right-from-bracket', 'var(--accent)');
      setTimeout(function() { window.location.href = '/login.html'; }, 800);
    }).catch(function() {
      localStorage.removeItem('wfs-session-token');
      window.location.href = '/login.html';
    });
  });
}
