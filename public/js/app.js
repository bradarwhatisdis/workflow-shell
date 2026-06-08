/**
 * Workflow Shell — refactored ES module entry point.
 *
 * Imports and initialises all frontend modules.
 * Keyboard shortcuts, pane-switching, and shared coordination live here.
 */

import { state, dom, initDom } from './modules/state.js';
import { api, getSessionToken } from './modules/api.js';
import { escapeHtml, joinPath } from './modules/utils.js';
import { toast } from './modules/toast.js';

import { initTerminal, sendToTerminal, termThemePresets } from './terminal.js';
import { initPaneResizer, initModalOverlayClose } from './utils.js';
import { applyTerminalTheme, initThemeToggle } from './modules/theme.js';
import { initSessionTimer } from './modules/sessionTimer.js';
import { initTunnelUrl } from './modules/tunnelUrl.js';
import { initLogout } from './modules/logout.js';
import { initUpdateChecker } from './modules/updateChecker.js';
import { initWelcomeOverlay, initPreviewEvents } from './modules/welcomePreview.js';
import { initKillButton } from './modules/kill.js';
import { initDragDropMove } from './modules/dragDrop.js';
import { initHotReload } from './modules/hotReload.js';
import { initKeyboardShortcuts } from './modules/keyboard.js';
import { initContextMenuEvents } from './modules/contextMenu.js';
import { initPaletteEvents } from './modules/commandPalette.js';
import { loadDir, toggleSearch, hideSearch, showNewFile, startRename, showDeleteConfirm } from './modules/fileManager.js';
import { initSearchSortEvents, initFileListEvents, initFileListNavigation, initViewToggle } from './modules/fileManager.js';
import { openEditor, closeEditor, initEditorEvents } from './modules/editor.js';
import { loadFileTree, switchFileTab, initFileTabEvents } from './modules/fileTree.js';
import { initUploadEvents } from './modules/upload.js';
import { loadQuickActions, renderQuickActions, closeRunner, initQuickActionEvents } from './modules/quickActions.js';
import { loadStats, initStatsEvents } from './modules/stats.js';
import { loadGitStatus, initGitEvents } from './modules/git.js';
import { doFileSearch, initSearchEvents } from './modules/search.js';
import { activateDesktop, initDesktopEvents } from './modules/desktop.js';

// ─── DOM Setup ──────────────────────────────────────────────────────────────

initDom();

// ─── Process Running Indicator (terminal activity) ─────────────────────────

const processIndicator = document.getElementById('process-indicator');
let terminalActivityTimer;

function showProcessIndicator() {
  if (processIndicator) processIndicator.style.display = 'inline-flex';
  clearTimeout(terminalActivityTimer);
  terminalActivityTimer = setTimeout(function() {
    if (processIndicator) processIndicator.style.display = 'none';
  }, 5000);
}

// ─── Terminal ───────────────────────────────────────────────────────────────

initTerminal({ onActivity: showProcessIndicator });
initPaneResizer();
initModalOverlayClose();

// ─── Pane Tab Switching (shared across modules) ───────────────────────────

function switchPaneTab(tab) {
  // Warn on unsaved editor changes
  if (state.editorInstance && typeof state.editorInstance.getValue === 'function' &&
      state.editorInstance.getValue() !== state.editingOriginalContent) {
    if (!confirm('You have unsaved changes in the editor. Switch tabs?')) return;
  }

  // Warn on running terminal process
  if (processIndicator && processIndicator.style.display !== 'none' && tab !== 'terminal') {
    if (!confirm('A terminal process may still be running. Switch tabs?')) return;
  }

  document.querySelectorAll('.pane-tab').forEach(function(t) { t.classList.remove('active'); });
  var target = document.querySelector('.pane-tab[data-tab="' + tab + '"]');
  if (target) target.classList.add('active');

  var containers = {
    terminal: 'terminal-container',
    'quick-actions': 'quick-actions-container',
    stats: 'stats-container',
    git: 'git-container',
    'search-results': 'search-results-container',
    desktop: 'desktop-container',
  };
  Object.keys(containers).forEach(function(key) {
    var el = document.getElementById(containers[key]);
    if (el) el.style.display = key === tab ? (key === 'terminal' ? 'flex' : 'block') : 'none';
  });

  // Close preview when switching tabs
  var previewOverlay = document.getElementById('preview-overlay');
  if (previewOverlay && previewOverlay.style.display === 'flex') {
    previewOverlay.style.display = 'none';
    var container = document.getElementById('terminal-container');
    if (container) container.style.display = 'flex';
  }

  if (tab === 'desktop') activateDesktop();
}

// ─── Init File Manager ──────────────────────────────────────────────────────

initSearchSortEvents();
initFileListEvents();
initFileListNavigation();
initViewToggle();
initEditorEvents();
initFileTabEvents();
initUploadEvents();

// ─── Init Context Menu (needs loadDir + openEditor) ───────────────────────

initContextMenuEvents({ loadDir, openEditor });

// ─── Init Palette (needs app-level callbacks) ──────────────────────────────

var themeToggle = document.getElementById('theme-toggle');
var killBtn = document.getElementById('kill-btn');

initPaletteEvents({
  showNewFile: showNewFile,
  loadDir: loadDir,
  toggleHelp: function() {
    document.getElementById('help-modal').classList.toggle('active');
  },
  themeToggle: themeToggle,
  switchPaneTab: switchPaneTab,
  loadStats: loadStats,
  loadGitStatus: loadGitStatus,
  killBtnClick: function() { killBtn.click(); },
});

// ─── Init Quick Actions (needs switchPaneTab) ─────────────────────────────

initQuickActionEvents(switchPaneTab);

// ─── Init Stats & Git (tab clicks) ──────────────────────────────────────────

initStatsEvents();
initGitEvents();
initSearchEvents(switchPaneTab);
initDesktopEvents();

// ─── Init UX Modules ────────────────────────────────────────────────────────

initThemeToggle();
initSessionTimer();
initTunnelUrl();
initWelcomeOverlay();
initKillButton(loadDir);
initLogout();
initUpdateChecker();
initDragDropMove(loadDir);
initHotReload(loadDir);

// ─── Patch openEditor with preview interception ───────────────────────────

const patchedOpenEditor = initPreviewEvents(openEditor);
const finalOpenEditor = patchedOpenEditor || openEditor;

// ─── Init Keyboard Shortcuts (needs everything) ────────────────────────────

initKeyboardShortcuts({
  hideSearch: hideSearch,
  toggleSearch: toggleSearch,
  showNewFile: showNewFile,
  loadDir: loadDir,
  toggleHelp: function() {
    document.getElementById('help-modal').classList.toggle('active');
  },
  togglePalette: function() {
    document.getElementById('cmd-palette').classList.toggle('active');
    if (document.getElementById('cmd-palette').classList.contains('active')) {
      document.getElementById('cmd-palette-input').value = '';
      document.getElementById('cmd-palette-results').innerHTML = '';
      setTimeout(function() { document.getElementById('cmd-palette-input').focus(); }, 50);
    }
  },
  hideContextMenu: function() {
    dom.contextMenu.classList.remove('visible');
    state.contextTarget = null;
  },
  startRename: startRename,
  showDeleteConfirm: showDeleteConfirm,
  openEditor: finalOpenEditor,
});

// ─── Terminal Theme Selector ──────────────────────────────────────────────

(function() {
  var select = document.getElementById('terminal-theme-select');
  if (!select) return;
  var saved = localStorage.getItem('wfs-terminal-theme') || 'default';
  select.value = saved;
  applyTerminalTheme(saved);
  select.addEventListener('change', function() {
    var theme = this.value;
    localStorage.setItem('wfs-terminal-theme', theme);
    applyTerminalTheme(theme);
  });
})();

// ─── Modal Close (generic) ─────────────────────────────────────────────────

document.querySelectorAll('.modal-close').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var overlay = this.closest('.modal-overlay');
    if (overlay) overlay.classList.remove('active');
  });
});

document.getElementById('confirm-modal-close').addEventListener('click', function() {
  dom.confirmModal.classList.remove('active');
});

document.getElementById('editor-modal-close').addEventListener('click', closeEditor);

document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
  overlay.addEventListener('mousedown', function(e) {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ─── Theme-based Terminal Theme Sync ───────────────────────────────────────

themeToggle.addEventListener('click', function() {
  setTimeout(function() {
    applyTerminalTheme(localStorage.getItem('wfs-terminal-theme') || 'default');
  }, 100);
});

// ─── Refresh Button ────────────────────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', function() {
  toast('Refreshing...', 'fa-rotate fa-spin', 'var(--accent)');
  loadDir(state.currentPath);
});

// ─── Help Modal ────────────────────────────────────────────────────────────

document.getElementById('help-btn').addEventListener('click', function() {
  document.getElementById('help-modal').classList.toggle('active');
});
document.getElementById('help-modal-close').addEventListener('click', function() {
  document.getElementById('help-modal').classList.remove('active');
});

// ─── QA Add / New File / New Dir buttons ─────────────────────────────────

document.getElementById('qa-add-btn').addEventListener('click', function() {
  document.getElementById('qa-name').value = '';
  document.getElementById('qa-desc').value = '';
  document.getElementById('qa-command').value = '';
  document.getElementById('qa-modal').classList.add('active');
  setTimeout(function() { document.getElementById('qa-name').focus(); }, 100);
});

document.getElementById('qa-modal-close').addEventListener('click', function() {
  document.getElementById('qa-modal').classList.remove('active');
});

// ─── New File / Dir Buttons ────────────────────────────────────────────────

document.getElementById('new-file-btn').addEventListener('click', showNewFile);

document.getElementById('new-dir-btn').addEventListener('click', function() {
  dom.newfileModal.classList.add('active');
  document.getElementById('newfile-type').value = 'directory';
  document.getElementById('newfile-name').value = '';
  setTimeout(function() { document.getElementById('newfile-name').focus(); }, 100);
});

// ─── Workspace Path Display ───────────────────────────────────────────────

(function() {
  var el = document.getElementById('workspace-path');
  if (!el) return;
  api('/api/cwd')
    .then(function(d) {
      el.textContent = d.path || d.cwd || '';
    })
    .catch(function() {});
})();

// ─── Welcome Dismiss ──────────────────────────────────────────────────────

var dismiss = document.getElementById('welcome-dismiss');
if (dismiss) {
  dismiss.addEventListener('click', function() {
    document.getElementById('welcome-overlay').style.display = 'none';
    localStorage.setItem('wfs-welcome-dismissed', '1');
  });
}

// ─── QA Runner Close ─────────────────────────────────────────────────────

document.getElementById('qa-runner-close').addEventListener('click', closeRunner);
document.getElementById('qa-runner-close-btn').addEventListener('click', closeRunner);

// ─── Initial Load ─────────────────────────────────────────────────────────

loadDir('/');
switchFileTab('tree');
