/**
 * Quick Actions — CRUD, execution, and command history for WFS quick actions.
 */
'use strict';

import { state, dom } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { toast } from './toast.js';

/** @type {Array<{Command_Name, Command_Description, Command}>} */
let quickActionsData = [];

/** @type {string} */
let previousTabBeforeRunner = 'terminal';

/** @type {Array<{name, command, time}>} */
let qaHistory = JSON.parse(localStorage.getItem('wfs-qa-history') || '[]');

/** Stored switchPaneTab callback from initQuickActionEvents. */
let _switchPaneTab = null;

// ─── Data Loading ──────────────────────────────────────────────────────────

/**
 * Fetch all quick actions from the server and render them.
 */
function loadQuickActions() {
  var list = document.getElementById('quick-actions-list');
  list.innerHTML = '<div class="qa-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  api('/api/quick-actions')
    .then(function(data) {
      quickActionsData = data.actions || [];
      renderQuickActions();
    })
    .catch(function(err) {
      list.innerHTML = '<div class="qa-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

// ─── Rendering ─────────────────────────────────────────────────────────────

/**
 * Render quick action cards into the DOM.
 */
function renderQuickActions() {
  var list = document.getElementById('quick-actions-list');
  if (!quickActionsData.length) {
    list.innerHTML = '<div class="qa-empty"><i class="fas fa-bolt"></i><p>No quick actions yet</p></div>';
    return;
  }

  list.innerHTML = '';
  var defaultNames = ['Disk Usage', 'Memory Info', 'List Processes', 'Check Uptime', 'Git Log'];

  quickActionsData.forEach(function(action, idx) {
    var isDefault = defaultNames.indexOf(action.Command_Name) !== -1;
    var card = document.createElement('div');
    card.className = 'qa-card' + (isDefault ? ' default' : '');
    card.style.animationDelay = (idx * 0.04) + 's';

    card.innerHTML =
      '<div class="qa-info">' +
        '<div class="qa-name">' + escapeHtml(action.Command_Name) + '</div>' +
        '<div class="qa-desc">' + escapeHtml(action.Command_Description || 'No description') + '</div>' +
        '<div class="qa-command-preview">$ ' + escapeHtml(action.Command) + '</div>' +
      '</div>' +
      '<div class="qa-actions">' +
        '<button class="qa-btn run" title="Run command"><i class="fas fa-play"></i></button>' +
        '<button class="qa-btn delete' + (isDefault ? ' default' : '') + '" title="' + (isDefault ? 'Default action' : 'Delete action') + '">' +
          (isDefault ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-trash"></i>') +
        '</button>' +
      '</div>';

    card.querySelector('.qa-btn.run').addEventListener('click', function() {
      runQuickAction(action);
    });

    if (!isDefault) {
      card.querySelector('.qa-btn.delete').addEventListener('click', function() {
        deleteQuickAction(action.Command_Name);
      });
    }

    list.appendChild(card);
  });
}

// ─── Running Actions ───────────────────────────────────────────────────────

/**
 * Execute a quick action — shows the runner overlay and POSTs the command.
 * Also records the action in command history.
 */
function runQuickAction(action) {
  // Record history before running
  addQaHistory(action.Command_Name, action.Command);

  var activeTab = document.querySelector('.pane-tab.active');
  if (activeTab) previousTabBeforeRunner = activeTab.dataset.tab;
  var overlay = document.getElementById('qa-runner-overlay');
  var terminal = document.getElementById('terminal-container');
  terminal.style.display = 'none';
  overlay.style.display = 'flex';

  document.getElementById('qa-runner-title').textContent = action.Command_Name;
  document.getElementById('qa-runner-desc').textContent = action.Command_Description || 'No description';
  document.getElementById('qa-runner-cmd').textContent = action.Command;

  var outputEl = document.getElementById('qa-runner-output');
  outputEl.innerHTML = '<div class="qa-runner-loading"><i class="fas fa-spinner fa-spin"></i> Running...</div>';

  api('/api/quick-actions/run', {
    method: 'POST',
    body: JSON.stringify({ command: action.Command }),
  }).then(function(data) {
    if (data.success) {
      outputEl.innerHTML = '<pre class="success">' + escapeHtml(data.output || '') + '</pre>';
    } else {
      var html = '';
      if (data.output) html += '<pre class="success">' + escapeHtml(data.output) + '</pre>';
      if (data.error) html += '<pre class="error">' + escapeHtml(data.error) + '</pre>';
      if (!html) html = '<pre class="error">Command failed (exit code: ' + (data.exitCode || 1) + ')</pre>';
      outputEl.innerHTML = html;
    }
  }).catch(function(err) {
    outputEl.innerHTML = '<pre class="error">Error: ' + escapeHtml(err.message) + '</pre>';
  });
}

/**
 * Close the runner overlay and switch back to the previous pane tab.
 */
function closeRunner() {
  document.getElementById('qa-runner-overlay').style.display = 'none';
  document.getElementById('qa-runner-output').innerHTML = '';
  if (_switchPaneTab) {
    _switchPaneTab(previousTabBeforeRunner);
  }
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

/**
 * Delete a quick action by name.
 */
function deleteQuickAction(name) {
  if (!confirm('Delete quick action "' + name + '"?')) return;
  api('/api/quick-actions', {
    method: 'DELETE',
    body: JSON.stringify({ command_name: name }),
  }).then(function(data) {
    quickActionsData = data.actions || [];
    renderQuickActions();
    if (data.pushed) {
      toast('Deleted: ' + name + ' (committed to repo)', 'fa-trash', 'var(--danger)');
    } else {
      toast('Deleted: ' + name, 'fa-trash', 'var(--danger)');
    }
  }).catch(function(err) {
    toast('Delete failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  });
}

// ─── Command History ───────────────────────────────────────────────────────

/**
 * Render the QA history list in the DOM.
 */
function renderQaHistory() {
  var historyList = document.getElementById('qa-history-list');
  var historySection = document.getElementById('qa-history-section');
  if (!historyList) return;
  if (!qaHistory.length) {
    historyList.innerHTML = '<div class="qa-history-empty"><i class="fas fa-clock-rotate-left"></i> No command history yet</div>';
    if (historySection) historySection.style.display = 'none';
    return;
  }
  if (historySection) historySection.style.display = 'block';
  historyList.innerHTML = qaHistory.map(function(h, i) {
    return '<div class="qa-history-item" data-idx="' + i + '">' +
      '<span class="qa-history-name">' + escapeHtml(h.name) + '</span>' +
      '<span class="qa-history-cmd">$ ' + escapeHtml(h.command) + '</span>' +
      '<span class="qa-history-time">' + h.time + '</span>' +
    '</div>';
  }).join('');
  historyList.querySelectorAll('.qa-history-item').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(this.dataset.idx, 10);
      var entry = qaHistory[idx];
      if (entry) {
        toast('Executed: ' + entry.name, 'fa-clock-rotate-left', 'var(--accent)');
        api('/api/quick-actions/run', {
          method: 'POST',
          body: JSON.stringify({ command: entry.command }),
        }).then(function() {}).catch(function() {});
      }
    });
  });
}

/**
 * Add an entry to the QA command history.
 */
function addQaHistory(name, command) {
  qaHistory.unshift({
    name: name,
    command: command,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
  if (qaHistory.length > 50) qaHistory = qaHistory.slice(0, 50);
  localStorage.setItem('wfs-qa-history', JSON.stringify(qaHistory));
  renderQaHistory();
}

// ─── Event Wiring ──────────────────────────────────────────────────────────

/**
 * Wire all Quick Actions UI events.
 * @param {Function} onSwitchTab - callback to switch pane tabs (takes tab id)
 */
function initQuickActionEvents(onSwitchTab) {
  _switchPaneTab = onSwitchTab;

  // ── QA Add button ──────────────────────────────────────────────────────
  document.getElementById('qa-add-btn').addEventListener('click', function() {
    document.getElementById('qa-name').value = '';
    document.getElementById('qa-desc').value = '';
    document.getElementById('qa-command').value = '';
    document.getElementById('qa-modal').classList.add('active');
    setTimeout(function() { document.getElementById('qa-name').focus(); }, 100);
  });

  // ── QA Modal close ─────────────────────────────────────────────────────
  document.getElementById('qa-modal-close').addEventListener('click', function() {
    document.getElementById('qa-modal').classList.remove('active');
  });

  // ── QA Submit ──────────────────────────────────────────────────────────
  document.getElementById('qa-submit').addEventListener('click', function() {
    var name = document.getElementById('qa-name').value.trim();
    var desc = document.getElementById('qa-desc').value.trim();
    var command = document.getElementById('qa-command').value.trim();
    if (!name) { toast('Please enter a command name.', 'fa-circle-exclamation', 'var(--warning)'); return; }
    if (!command) { toast('Please enter a command.', 'fa-circle-exclamation', 'var(--warning)'); return; }

    api('/api/quick-actions', {
      method: 'POST',
      body: JSON.stringify({
        command_name: name,
        command_description: desc,
        command: command,
      }),
    }).then(function(data) {
      quickActionsData = data.actions || [];
      renderQuickActions();
      document.getElementById('qa-modal').classList.remove('active');
      if (data.pushed) {
        toast('Added: ' + name + ' (committed to repo)', 'fa-plus', 'var(--success)');
      } else {
        toast('Added: ' + name, 'fa-plus', 'var(--success)');
      }
    }).catch(function(err) {
      toast('Add failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
    });
  });

  // ── QA Command keydown (Enter to submit) ───────────────────────────────
  document.getElementById('qa-command').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('qa-submit').click();
  });

  // ── Pane tab click for quick-actions ───────────────────────────────────
  var qaTab = document.querySelector('.pane-tab[data-tab="quick-actions"]');
  if (qaTab) {
    qaTab.addEventListener('click', function() {
      if (_switchPaneTab) _switchPaneTab('quick-actions');
      loadQuickActions();
    });
  }

  // ── QA Runner close buttons ────────────────────────────────────────────
  document.getElementById('qa-runner-close').addEventListener('click', closeRunner);
  document.getElementById('qa-runner-close-btn').addEventListener('click', closeRunner);

  // ── QA History clear ───────────────────────────────────────────────────
  var historyClear = document.getElementById('qa-history-clear');
  if (historyClear) {
    historyClear.addEventListener('click', function() {
      qaHistory = [];
      localStorage.removeItem('wfs-qa-history');
      renderQaHistory();
    });
  }

  // ── Initial render of command history ──────────────────────────────────
  renderQaHistory();
}

export {
  loadQuickActions,
  renderQuickActions,
  runQuickAction,
  closeRunner,
  deleteQuickAction,
  initQuickActionEvents,
  renderQaHistory,
  addQaHistory,
};
