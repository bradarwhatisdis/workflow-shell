/**
 * Context menu for file items — right-click menu with actions.
 * Uses init pattern for loadDir/openEditor to avoid circular deps.
 */
import { state, dom } from './state.js';
import { api } from './api.js';
import { escapeHtml, joinPath } from './utils.js';
import { toast } from './toast.js';

// Module-level references to injected dependencies
var _loadDir = null;
var _openEditor = null;

/** Show context menu at (x, y) for the given file <li> element */
export function showContextMenu(x, y, li) {
  state.contextTarget = {
    name: li.dataset.name,
    path: li.dataset.path,
    isDir: li.dataset.isDir === 'true',
  };
  var menu = dom.contextMenu;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('visible');

  var maxX = window.innerWidth - menu.offsetWidth - 10;
  var maxY = window.innerHeight - menu.offsetHeight - 10;
  if (x > maxX) menu.style.left = maxX + 'px';
  if (y > maxY) menu.style.top = maxY + 'px';

  var items = menu.querySelectorAll('.context-menu-item');
  items.forEach(function(item) {
    var action = item.dataset.action;
    if (action === 'open') {
      item.style.display = state.contextTarget.isDir ? 'flex' : 'none';
    }
    if (action === 'edit') {
      item.style.display = state.contextTarget.isDir ? 'none' : 'flex';
    }
    if (action === 'download') {
      item.style.display = state.contextTarget.isDir ? 'none' : 'flex';
    }
    if (action === 'extract') {
      var archiveExts = ['.zip', '.tar', '.gz', '.tgz', '.tar.gz', '.rar', '.7z'];
      var isArchive = !state.contextTarget.isDir && archiveExts.some(function(ext) {
        return state.contextTarget.name.toLowerCase().endsWith(ext);
      });
      item.style.display = isArchive ? 'flex' : 'none';
    }
  });
}

/** Hide the context menu and clear target */
export function hideContextMenu() {
  dom.contextMenu.classList.remove('visible');
  state.contextTarget = null;
}

/**
 * Wire context-menu-item clicks, document click to hide, and archive/extract actions.
 * @param {Object} deps - { loadDir: fn, openEditor: fn }
 */
export function initContextMenuEvents(deps) {
  _loadDir = deps.loadDir;
  _openEditor = deps.openEditor;

  document.querySelectorAll('.context-menu-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var action = this.dataset.action;
      var target = state.contextTarget;
      if (!target) return;
      hideContextMenu();

      if (action === 'open') _loadDir(target.path);
      else if (action === 'edit') _openEditor(target.name);
      else if (action === 'rename') startRenameFromContext(target.name);
      else if (action === 'download') downloadFile(target.name);
      else if (action === 'copy-path') copyPath(target.path);
      else if (action === 'delete') showDeleteConfirm(target.name, target.isDir);
    });
  });

  // Archive action
  document.querySelectorAll('.context-menu-item[data-action="archive"]').forEach(function(el) {
    el.addEventListener('click', function() {
      var target = state.contextTarget;
      if (!target) return;
      hideContextMenu();
      var archiveName = prompt('Archive name:', target.name + '.zip');
      if (!archiveName) return;
      if (!archiveName.endsWith('.zip')) archiveName += '.zip';
      toast('Creating archive...', 'fa-file-zipper', 'var(--accent)');
      api('/api/archive', {
        method: 'POST',
        body: JSON.stringify({ paths: [target.path], name: archiveName.replace('.zip', '') }),
      }).then(function(data) {
        toast('Created: ' + data.file, 'fa-file-zipper', 'var(--success)');
        _loadDir(state.currentPath);
      }).catch(function(err) {
        toast('Archive failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
      });
    });
  });

  // Extract action
  document.querySelectorAll('.context-menu-item[data-action="extract"]').forEach(function(el) {
    el.addEventListener('click', function() {
      var target = state.contextTarget;
      if (!target) return;
      hideContextMenu();
      toast('Extracting...', 'fa-box-open', 'var(--accent)');
      api('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ path: target.path }),
      }).then(function() {
        toast('Extracted: ' + target.name, 'fa-box-open', 'var(--success)');
        _loadDir(state.currentPath);
      }).catch(function(err) {
        toast('Extract failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
      });
    });
  });

  // Document click to hide context menu
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.context-menu')) {
      hideContextMenu();
    }
  });
}

// ─── Internal helpers (extracted from app.js) ─────────────────────────

function startRenameFromContext(name) {
  var li = dom.fileList.querySelector('[data-name="' + CSS.escape(name) + '"]');
  if (li) startRename(li);
}

function startRename(li) {
  var name = li.dataset.name;
  var nameEl = li.querySelector('.name');
  var original = name;

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = name;
  input.spellcheck = false;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  var dot = original.lastIndexOf('.');
  if (dot > 0) input.setSelectionRange(0, dot);

  function finish(confirmed) {
    var newName = input.value.trim();
    if (confirmed && newName && newName !== original) {
      renameFile(original, newName);
    }
    nameEl.textContent = escapeHtml(original);
  }

  input.addEventListener('blur', function() { finish(true); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

async function renameFile(oldName, newName) {
  var oldPath = joinPath(state.currentPath, oldName);
  var newPath = joinPath(state.currentPath, newName);
  try {
    await api('/api/file/move', {
      method: 'POST',
      body: JSON.stringify({ from: oldPath, to: newPath }),
    });
    toast('Renamed: ' + oldName + ' → ' + newName, 'fa-pencil', 'var(--success)');
    if (_loadDir) _loadDir(state.currentPath);
  } catch (err) {
    toast('Rename failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  }
}

function downloadFile(fileName) {
  var filePath = joinPath(state.currentPath, fileName);
  var token = localStorage.getItem('wfs-session-token') || '';
  fetch('/api/download?path=' + encodeURIComponent(filePath), {
    headers: { 'x-session-token': token },
  }).then(function(resp) {
    if (!resp.ok) throw new Error('Download failed');
    return resp.blob();
  }).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }).catch(function(err) {
    toast('Download failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  });
}

function copyPath(filePath) {
  navigator.clipboard.writeText(filePath).then(function() {
    toast('Path copied: ' + filePath, 'fa-link', 'var(--accent)');
  }).catch(function() {
    toast('Failed to copy path', 'fa-circle-exclamation', 'var(--danger)');
  });
}

function showDeleteConfirm(name, isDir) {
  state.selectedFile = { name: name, isDir: isDir };
  state.killConfirm = false;
  document.getElementById('confirm-text').textContent =
    (isDir ? 'Delete folder' : 'Delete file') + ' "' + name + '"? This cannot be undone.';
  document.getElementById('confirm-action').textContent = (isDir ? 'Delete Folder' : 'Delete');
  dom.confirmModal.classList.add('active');
}
