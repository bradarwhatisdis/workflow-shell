/**
 * Toast notification system for Workflow Shell.
 * Requires dom.toastContainer to be populated (by initDom() in state.js).
 */
import { escapeHtml } from './utils.js';
import { dom } from './state.js';

export function toast(message, icon, color) {
  icon = icon || 'fa-circle-info';
  color = color || 'var(--text-primary)';
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<i class="fas ' + icon + '" style="color:' + color + '"></i> <span>' + escapeHtml(message) + '</span>';
  dom.toastContainer.appendChild(el);

  var dismiss = function() {
    if (el.classList.contains('removing')) return;
    el.classList.add('removing');
    el.addEventListener('animationend', function() { el.remove(); });
  };

  el.addEventListener('click', dismiss);

  setTimeout(dismiss, 10000);
}

export function showErrorToast(message, details) {
  var fullMsg = message;
  if (details) fullMsg += ' — ' + details;
  toast(fullMsg, 'fa-circle-exclamation', 'var(--danger)');
}
