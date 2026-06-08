/**
 * Command palette (Ctrl+Shift+P) — fuzzy-find and execute actions.
 * Uses init pattern: callbacks are injected via initPaletteEvents().
 */
import { escapeHtml } from './utils.js';
import { state } from './state.js';

var paletteActions = [];

/** Toggle command palette open/closed */
export function togglePalette() {
  var overlay = document.getElementById('cmd-palette');
  if (!overlay) return;
  var isActive = overlay.classList.contains('active');
  overlay.classList.toggle('active');
  if (!isActive) {
    document.getElementById('cmd-palette-input').value = '';
    document.getElementById('cmd-palette-results').innerHTML = '';
    setTimeout(function() { document.getElementById('cmd-palette-input').focus(); }, 50);
    renderPalette('');
  }
}

/** Filter and render palette items based on query */
export function renderPalette(query) {
  var results = document.getElementById('cmd-palette-results');
  if (!results) return;
  var filtered = paletteActions;
  if (query.trim()) {
    var lower = query.toLowerCase();
    filtered = paletteActions.filter(function(a) {
      return a.name.toLowerCase().includes(lower) || a.desc.toLowerCase().includes(lower);
    });
  }
  if (!filtered.length) {
    results.innerHTML = '<div class="cmd-palette-empty">No commands found</div>';
    return;
  }
  results.innerHTML = '';
  filtered.forEach(function(action, idx) {
    var item = document.createElement('div');
    item.className = 'cmd-palette-item' + (idx === 0 ? ' active' : '');
    item.innerHTML = '<i class="fas ' + action.icon + '"></i><span class="cmd-palette-name">' + escapeHtml(action.name) + '</span><span class="cmd-palette-desc">' + escapeHtml(action.desc) + '</span>';
    item.addEventListener('click', function() { action.action(); togglePalette(); });
    results.appendChild(item);
  });
}

/**
 * Initialise command palette events.
 * @param {Object} callbacks - { showNewFile, loadDir, toggleHelp, themeToggle, switchPaneTab, loadStats, loadGitStatus, killBtnClick }
 */
export function initPaletteEvents(callbacks) {
  var cb = callbacks || {};
  var showNewFile = cb.showNewFile;
  var loadDir = cb.loadDir;
  var toggleHelp = cb.toggleHelp;
  var themeToggle = cb.themeToggle;
  var switchPaneTab = cb.switchPaneTab;
  var loadStats = cb.loadStats;
  var loadGitStatus = cb.loadGitStatus;
  var killBtnClick = cb.killBtnClick;

  // Build palette action definitions
  paletteActions = [
    { name: 'Search files...', desc: 'Filter current directory', icon: 'fa-search', action: function() { document.getElementById('search-toggle').click(); } },
    { name: 'Search in files...', desc: 'Full-text search workspace', icon: 'fa-file-search', action: function() { document.getElementById('search-toggle').click(); } },
    { name: 'New File', desc: 'Create a new file (Ctrl+N)', icon: 'fa-file-circle-plus', action: function() { if (showNewFile) showNewFile(); } },
    { name: 'New Folder', desc: 'Create a new directory', icon: 'fa-folder-plus', action: function() { document.getElementById('new-dir-btn').click(); } },
    { name: 'Upload File', desc: 'Upload files to current directory', icon: 'fa-upload', action: function() { document.getElementById('upload-btn').click(); } },
    { name: 'Refresh', desc: 'Refresh file list (Ctrl+R)', icon: 'fa-arrows-rotate', action: function() { if (loadDir) loadDir(state.currentPath); } },
    { name: 'Toggle Theme', desc: 'Switch dark/light theme', icon: 'fa-palette', action: function() { if (themeToggle) themeToggle.click(); } },
    { name: 'Quick Actions', desc: 'View and run quick commands', icon: 'fa-bolt', action: function() { if (switchPaneTab) switchPaneTab('quick-actions'); } },
    { name: 'System Stats', desc: 'View disk, memory, CPU stats', icon: 'fa-chart-simple', action: function() { if (switchPaneTab) switchPaneTab('stats'); if (loadStats) loadStats(); } },
    { name: 'Git Status', desc: 'View git branch and changes', icon: 'fab fa-git-alt', action: function() { if (switchPaneTab) switchPaneTab('git'); if (loadGitStatus) loadGitStatus(); } },
    { name: 'Keyboard Shortcuts', desc: 'View shortcut keys (?)', icon: 'fa-keyboard', action: function() { if (toggleHelp) toggleHelp(); } },
    { name: 'Kill & Stop Workflow', desc: 'Terminate all processes and exit', icon: 'fa-power-off', action: function() { if (killBtnClick) killBtnClick(); } },
  ];

  // Input filtering
  document.getElementById('cmd-palette-input').addEventListener('input', function() {
    renderPalette(this.value);
  });

  // Keyboard navigation
  document.getElementById('cmd-palette-input').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { togglePalette(); }
    if (e.key === 'Enter') {
      var active = document.querySelector('.cmd-palette-item.active');
      if (active) { active.click(); togglePalette(); }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var items = document.querySelectorAll('.cmd-palette-item');
      var active = document.querySelector('.cmd-palette-item.active');
      if (active) { active.classList.remove('active'); }
      var next = active ? active.nextElementSibling : items[0];
      if (next) next.classList.add('active');
      else if (items.length) items[0].classList.add('active');
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      var items = document.querySelectorAll('.cmd-palette-item');
      var active = document.querySelector('.cmd-palette-item.active');
      if (active) { active.classList.remove('active'); }
      var prev = active ? active.previousElementSibling : items[items.length - 1];
      if (prev) prev.classList.add('active');
      else if (items.length) items[items.length - 1].classList.add('active');
    }
  });

  // Overlay click to close
  document.getElementById('cmd-palette').addEventListener('click', function(e) {
    if (e.target === this) togglePalette();
  });
}
