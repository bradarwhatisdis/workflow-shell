/**
 * Kill button — shuts down the server and all processes.
 * Uses init pattern: loadDir is injected to avoid circular deps.
 */
import { dom, state } from './state.js';
import { api } from './api.js';
import { toast } from './toast.js';
import { joinPath } from './utils.js';

var _loadDir = null;

/** Wire #kill-btn to show confirm modal, and #confirm-action to execute kill */
export function initKillButton(loadDir) {
  _loadDir = loadDir;

  // Kill button: set killConfirm and show modal
  document.getElementById('kill-btn').addEventListener('click', function() {
    state.killConfirm = true;
    state.selectedFile = null;
    document.getElementById('confirm-text').innerHTML =
      '<i class="fas fa-power-off" style="color:var(--danger);font-size:1.2rem;display:block;text-align:center;margin-bottom:12px"></i>' +
      'Kill all processes and stop the workflow?<br><span style="font-size:0.82rem;color:var(--text-muted)">This will terminate the server and SSH tunnel.</span>';
    document.getElementById('confirm-action').textContent = 'Shut Down';
    dom.confirmModal.classList.add('active');
  });

  // Confirm action handler: check for killConfirm first
  document.getElementById('confirm-action').addEventListener('click', function() {
    if (state.killConfirm) {
      state.killConfirm = false;
      dom.confirmModal.classList.remove('active');
      executeKill();
      return;
    }
    // Otherwise handle delete (from context menu / keyboard)
    if (state.selectedFile) {
      var filePath = joinPath(state.currentPath, state.selectedFile.name);
      api('/api/file?path=' + encodeURIComponent(filePath), { method: 'DELETE' })
        .then(function() {
          toast('Deleted: ' + state.selectedFile.name, 'fa-trash', 'var(--danger)');
          if (_loadDir) _loadDir(state.currentPath);
        })
        .catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
    }
    dom.confirmModal.classList.remove('active');
  });
}

/** Execute kill: POST to /api/kill, replace body after 3s */
export function executeKill() {
  var btn = document.getElementById('kill-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  toast('Shutting down...', 'fa-power-off', 'var(--danger)');
  api('/api/kill', { method: 'POST' }).then(function(d) {
    toast(d.message || 'Goodbye!', 'fa-power-off', 'var(--danger)');
  }).catch(function() {});
  setTimeout(function() {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--bg-primary);color:var(--text-muted);font-family:var(--font-sans)"><div style="text-align:center"><i class="fas fa-power-off" style="font-size:3rem;opacity:0.3;margin-bottom:16px;display:block"></i><p>Workflow Shell terminated</p><p style="font-size:0.85rem;margin-top:8px;opacity:0.6">The server has been shut down.</p></div></div>';
  }, 3000);
}
