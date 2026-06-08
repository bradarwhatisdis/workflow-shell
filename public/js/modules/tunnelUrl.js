/**
 * Tunnel URL display — fetches public URL every 10s, copies on click.
 */
import { api, getSessionToken } from './api.js';
import { toast } from './toast.js';

/** Start polling tunnel URL and wire copy-to-clipboard */
export function initTunnelUrl() {
  var el = document.getElementById('tunnel-url');
  var textEl = document.getElementById('tunnel-url-text');
  if (!el || !textEl) return;

  function fetchTunnelUrl() {
    fetch('/api/tunnel-url', { headers: { 'x-session-token': getSessionToken() } })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.url) {
          textEl.textContent = d.url;
          el.title = 'Click to copy: ' + d.url;
        }
      })
      .catch(function() { /* ignore */ });
  }

  fetchTunnelUrl();
  setInterval(fetchTunnelUrl, 10000);

  el.addEventListener('click', function() {
    if (!textEl.textContent || textEl.textContent === 'Connecting...') return;
    navigator.clipboard.writeText(textEl.textContent).then(function() {
      toast('Tunnel URL copied to clipboard', 'fa-copy', 'var(--success)');
    }).catch(function() { /* ignore */ });
  });
}
