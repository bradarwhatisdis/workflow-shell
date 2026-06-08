/**
 * File manager module for Workflow Shell.
 * Directory listing, search, sort, rename, delete, context menu, and file navigation.
 */
import { state, dom } from './state.js';
import { api, getSessionToken } from './api.js';
import { escapeHtml, joinPath, dirname, getFileIcon, formatSize } from './utils.js';
import { toast } from './toast.js';
import { openEditor } from './editor.js';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function showSkeleton() {
  dom.fileList.innerHTML = '';
  if (dom.fileSkeleton) dom.fileSkeleton.style.display = 'flex';
}

function hideSkeleton() {
  if (dom.fileSkeleton) dom.fileSkeleton.style.display = 'none';
}

// ─── Directory Loading ───────────────────────────────────────────────────────

async function loadDir(dirPath) {
  state.currentPath = dirPath;
  showSkeleton();
  try {
    const data = await api('/api/files?path=' + encodeURIComponent(dirPath));
    state.items = data.items || [];
    applyFilterAndSort();
    updateBreadcrumb(data.path);
    if (dom.workspacePath) dom.workspacePath.innerHTML = '<i class="fas fa-folder"></i> ' + escapeHtml(data.path);
  } catch (err) {
    dom.fileList.innerHTML = '';
    dom.fileListStatus.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
  } finally {
    hideSkeleton();
  }
}

// ─── Filter & Sort ───────────────────────────────────────────────────────────

function applyFilterAndSort() {
  let items = state.items;
  if (state.filterText) {
    const lower = state.filterText.toLowerCase();
    items = items.filter(function(item) { return item.name.toLowerCase().includes(lower); });
  }
  items.sort(function(a, b) {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    let cmp = 0;
    if (state.sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (state.sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (state.sortBy === 'date') cmp = (a.modified || '').localeCompare(b.modified || '');
    return state.sortAsc ? cmp : -cmp;
  });
  renderFileList(items);
  updateFileCount(items.length);
}

// ─── Render File List ────────────────────────────────────────────────────────

function renderFileList(items) {
  dom.fileList.innerHTML = '';
  dom.fileListStatus.innerHTML = '';

  if (state.currentPath !== '/') {
    const parentLi = document.createElement('li');
    parentLi.className = 'file-item parent-item';
    parentLi.dataset.name = '..';
    parentLi.dataset.isDir = 'true';
    parentLi.dataset.path = dirname(state.currentPath);
    parentLi.innerHTML =
      '<i class="fas fa-arrow-up icon" style="color:var(--accent)"></i>' +
      '<span class="name" style="color:var(--accent)">..</span>' +
      '<span class="meta">UP</span>';
    dom.fileList.appendChild(parentLi);
  }

  if (items.length === 0) {
    const emptyMsg = state.filterText ? 'No files match "' + state.filterText + '"' : 'Empty directory';
    dom.fileListStatus.innerHTML =
      '<div class="empty-state"><i class="fas fa-' + (state.filterText ? 'search' : 'folder-open') + '"></i><p>' + emptyMsg + '</p></div>';
    return;
  }

  items.forEach(function(item, idx) {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.style.animationDelay = (idx * 0.03) + 's';
    li.dataset.name = item.name;
    li.dataset.isDir = item.isDirectory ? 'true' : 'false';
    li.dataset.path = joinPath(state.currentPath, item.name);

    const icon = getFileIcon(item.name, item.isDirectory);
    const iconClass = item.isDirectory ? 'folder' : icon.split(' ')[1] || 'file';
    const iconBase = icon.split(' ')[0];

    if (item.isDirectory) {
      li.innerHTML =
        '<i class="fas ' + iconBase + ' icon folder"></i>' +
        '<span class="name">' + escapeHtml(item.name) + '</span>' +
        '<span class="meta">DIR</span>' +
        '<div class="actions">' +
        '<button class="action-btn delete" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>';
    } else {
      li.innerHTML =
        '<i class="fas ' + iconBase + ' icon ' + iconClass + '"></i>' +
        '<span class="name">' + escapeHtml(item.name) + '</span>' +
        '<span class="meta">' + formatSize(item.size) + '</span>' +
        '<div class="actions">' +
        '<button class="action-btn edit" title="Edit"><i class="fas fa-pen-to-square"></i></button>' +
        '<button class="action-btn download" title="Download"><i class="fas fa-download"></i></button>' +
        '<button class="action-btn delete" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>';
    }

    dom.fileList.appendChild(li);
  });
}

// ─── File Count ──────────────────────────────────────────────────────────────

function updateFileCount(count) {
  if (dom.fileCountBadge) {
    dom.fileCountBadge.textContent = count > 0 ? count : '';
    dom.fileCountBadge.title = (count || 0) + ' file' + (count !== 1 ? 's' : '');
  }
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────

function updateBreadcrumb(dirPath) {
  dom.breadcrumb.innerHTML = '';
  const parts = dirPath.split('/').filter(Boolean);

  const root = document.createElement('span');
  root.className = 'breadcrumb-item' + (parts.length === 0 ? ' active' : '');
  root.innerHTML = '<i class="fas fa-home"></i>';
  root.title = 'Workspace root';
  if (parts.length > 0) root.addEventListener('click', function() { loadDir('/'); });
  dom.breadcrumb.appendChild(root);

  let built = '';
  parts.forEach(function(part, i) {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '/';
    dom.breadcrumb.appendChild(sep);

    built = built ? built + '/' + part : '/' + part;
    const item = document.createElement('span');
    const isLast = (i === parts.length - 1);
    item.className = 'breadcrumb-item' + (isLast ? ' active' : '');
    item.textContent = part;
    if (!isLast) {
      item.addEventListener('click', function() { loadDir(built); });
    }
    dom.breadcrumb.appendChild(item);
  });
}

// ─── Search ──────────────────────────────────────────────────────────────────

function toggleSearch() {
  const isVisible = dom.searchBox.style.display !== 'none';
  if (isVisible) {
    hideSearch();
  } else {
    dom.searchBox.style.display = 'flex';
    dom.searchToggle.classList.add('active');
    dom.searchInput.focus();
  }
}

function hideSearch() {
  dom.searchBox.style.display = 'none';
  dom.searchToggle.classList.remove('active');
  dom.sortBar.style.display = 'none';
  state.filterText = '';
  dom.searchInput.value = '';
  applyFilterAndSort();
  dom.fileToolbar.style.display = 'none';
}

// ─── Rename ──────────────────────────────────────────────────────────────────

function startRename(li) {
  const name = li.dataset.name;
  const nameEl = li.querySelector('.name');
  const original = name;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = name;
  input.spellcheck = false;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  const dot = original.lastIndexOf('.');
  if (dot > 0) input.setSelectionRange(0, dot);

  function finish(confirmed) {
    const newName = input.value.trim();
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

function startRenameFromContext(name) {
  const li = dom.fileList.querySelector('[data-name="' + CSS.escape(name) + '"]');
  if (li) startRename(li);
}

async function renameFile(oldName, newName) {
  const oldPath = joinPath(state.currentPath, oldName);
  const newPath = joinPath(state.currentPath, newName);
  try {
    await api('/api/file/move', {
      method: 'POST',
      body: JSON.stringify({ from: oldPath, to: newPath }),
    });
    toast('Renamed: ' + oldName + ' → ' + newName, 'fa-pencil', 'var(--success)');
    loadDir(state.currentPath);
  } catch (err) {
    toast('Rename failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

function showDeleteConfirm(name, isDir) {
  state.selectedFile = { name: name, isDir: isDir };
  state.killConfirm = false;
  document.getElementById('confirm-text').textContent =
    (isDir ? 'Delete folder' : 'Delete file') + ' "' + name + '"? This cannot be undone.';
  document.getElementById('confirm-action').textContent = (isDir ? 'Delete Folder' : 'Delete');
  dom.confirmModal.classList.add('active');
}

// ─── Context Menu ────────────────────────────────────────────────────────────

function showContextMenu(x, y, li) {
  state.contextTarget = {
    name: li.dataset.name,
    path: li.dataset.path,
    isDir: li.dataset.isDir === 'true',
  };
  const menu = dom.contextMenu;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('visible');

  const maxX = window.innerWidth - menu.offsetWidth - 10;
  const maxY = window.innerHeight - menu.offsetHeight - 10;
  if (x > maxX) menu.style.left = maxX + 'px';
  if (y > maxY) menu.style.top = maxY + 'px';

  const items = menu.querySelectorAll('.context-menu-item');
  items.forEach(function(item) {
    const action = item.dataset.action;
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
      const archiveExts = ['.zip', '.tar', '.gz', '.tgz', '.tar.gz', '.rar', '.7z'];
      const isArchive = !state.contextTarget.isDir && archiveExts.some(function(ext) {
        return state.contextTarget.name.toLowerCase().endsWith(ext);
      });
      item.style.display = isArchive ? 'flex' : 'none';
    }
  });
}

function hideContextMenu() {
  dom.contextMenu.classList.remove('visible');
  state.contextTarget = null;
}

// ─── Download ────────────────────────────────────────────────────────────────

function downloadFile(fileName) {
  const filePath = joinPath(state.currentPath, fileName);
  const token = getSessionToken();
  fetch('/api/download?path=' + encodeURIComponent(filePath), {
    headers: { 'x-session-token': token },
  }).then(function(resp) {
    if (!resp.ok) throw new Error('Download failed');
    return resp.blob();
  }).then(function(blob) {
    const a = document.createElement('a');
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

// ─── Copy Path ───────────────────────────────────────────────────────────────

function copyPath(filePath) {
  navigator.clipboard.writeText(filePath).then(function() {
    toast('Path copied: ' + filePath, 'fa-link', 'var(--accent)');
  }).catch(function() {
    toast('Failed to copy path', 'fa-circle-exclamation', 'var(--danger)');
  });
}

// ─── Event Initializers ──────────────────────────────────────────────────────

function initSearchSortEvents() {
  // Search toggle button
  dom.searchToggle.addEventListener('click', function() {
    const globalSearchBar = document.getElementById('global-search-bar');
    const globalSearchInput = document.getElementById('global-search-input');
    if (globalSearchBar) {
      globalSearchBar.classList.toggle('active');
      if (globalSearchBar.classList.contains('active')) {
        globalSearchInput.focus();
      } else {
        globalSearchInput.value = '';
        globalSearchBar.classList.remove('active');
      }
    }
    if (dom.searchBox.style.display !== 'none') {
      hideSearch();
    }
  });

  // Search input
  dom.searchInput.addEventListener('input', function() {
    state.filterText = dom.searchInput.value;
    applyFilterAndSort();
    if (state.filterText) {
      dom.sortBar.style.display = 'flex';
      dom.searchClear.classList.add('visible');
    } else {
      dom.sortBar.style.display = 'none';
      dom.searchClear.classList.remove('visible');
    }
  });

  // Search clear
  dom.searchClear.addEventListener('click', function() {
    state.filterText = '';
    dom.searchInput.value = '';
    dom.searchClear.classList.remove('visible');
    dom.sortBar.style.display = 'none';
    applyFilterAndSort();
    dom.searchInput.focus();
  });

  // Sort button
  dom.sortBtn.addEventListener('click', function() {
    dom.sortBar.style.display = dom.sortBar.style.display === 'none' ? 'flex' : 'none';
  });

  // Sort options
  document.querySelectorAll('.sort-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const sort = this.dataset.sort;
      if (state.sortBy === sort) {
        state.sortAsc = !state.sortAsc;
        const icon = this.querySelector('i');
        icon.className = 'fas fa-sort-' + (sort === 'name' ? 'alpha' : sort === 'size' ? 'numeric' : 'amount') + '-' + (state.sortAsc ? 'down' : 'up');
      } else {
        document.querySelectorAll('.sort-option').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.sortBy = sort;
        state.sortAsc = true;
      }
      applyFilterAndSort();
    });
  });
}

function initFileListEvents() {
  // Click: navigate / action buttons
  dom.fileList.addEventListener('click', function(e) {
    const li = e.target.closest('.file-item');
    if (!li) return;

    if (li.classList.contains('parent-item')) {
      loadDir(li.dataset.path);
      return;
    }

    const name = li.dataset.name;
    const targetPath = li.dataset.path;
    const isDir = li.dataset.isDir === 'true';

    const actionBtn = e.target.closest('.action-btn');
    if (actionBtn) {
      e.stopPropagation();
      if (actionBtn.classList.contains('edit')) openEditor(name);
      else if (actionBtn.classList.contains('download')) downloadFile(name);
      else if (actionBtn.classList.contains('delete')) showDeleteConfirm(name, isDir);
      return;
    }

    if (isDir) {
      loadDir(targetPath);
    } else {
      openEditor(name);
    }
  });

  // Double-click: start rename
  dom.fileList.addEventListener('dblclick', function(e) {
    const li = e.target.closest('.file-item');
    if (!li || li.classList.contains('parent-item')) return;
    startRename(li);
  });

  // Context menu
  dom.fileList.addEventListener('contextmenu', function(e) {
    const li = e.target.closest('.file-item');
    if (!li) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, li);
  });

  // Mouseover: track focused index
  dom.fileList.addEventListener('mouseover', function(e) {
    const li = e.target.closest('.file-item');
    if (!li) return;
    dom.fileList.querySelectorAll('.file-item.selected').forEach(function(el) {
      if (el !== li) el.classList.remove('selected');
    });
    if (!li.classList.contains('parent-item')) {
      li.classList.add('selected');
      const items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      for (let i = 0; i < items.length; i++) {
        if (items[i] === li) { state.focusedIndex = i; break; }
      }
    }
  });

  // Mouseleave: remove selection
  dom.fileList.addEventListener('mouseleave', function() {
    dom.fileList.querySelectorAll('.file-item.selected').forEach(function(el) {
      el.classList.remove('selected');
    });
  });

}

function initFileListNavigation() {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        state.focusedIndex = Math.min(state.focusedIndex + 1, items.length - 1);
      } else {
        state.focusedIndex = Math.max(state.focusedIndex - 1, 0);
      }
      dom.fileList.querySelectorAll('.file-item.selected').forEach(function(el) { el.classList.remove('selected'); });
      items[state.focusedIndex].classList.add('selected');
      items[state.focusedIndex].scrollIntoView({ block: 'nearest' });
    }

    if (e.key === 'Enter' && state.focusedIndex >= 0 && !e.target.closest('input,textarea')) {
      e.preventDefault();
      const items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      const li = items[state.focusedIndex];
      if (li) {
        if (li.dataset.isDir === 'true') {
          loadDir(li.dataset.path);
        } else {
          openEditor(li.dataset.name);
        }
      }
    }

    if (e.key === 'F2') {
      e.preventDefault();
      const items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      const li = items[state.focusedIndex];
      if (li) startRename(li);
    }

    if (e.key === 'Delete') {
      if (state.focusedIndex < 0) return;
      const items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      const li = items[state.focusedIndex];
      if (li && !e.target.closest('input')) {
        showDeleteConfirm(li.dataset.name, li.dataset.isDir === 'true');
      }
    }
  });
}

// ─── New File Modal ──────────────────────────────────────────────────────────

function showNewFile() {
  dom.newfileModal.classList.add('active');
  document.getElementById('newfile-type').value = 'file';
  document.getElementById('newfile-name').value = '';
  setTimeout(function() { document.getElementById('newfile-name').focus(); }, 100);
}

function initViewToggle() {
  dom.viewToggle.addEventListener('click', function() {
    state.isListView = !state.isListView;
    dom.viewToggle.innerHTML = '<i class="fas fa-' + (state.isListView ? 'list' : 'table-cells') + '"></i>';
    dom.fileList.classList.toggle('grid-view', !state.isListView);
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  loadDir,
  applyFilterAndSort,
  renderFileList,
  updateFileCount,
  updateBreadcrumb,
  toggleSearch,
  hideSearch,
  showNewFile,
  showSkeleton,
  hideSkeleton,
  initSearchSortEvents,
  initFileListEvents,
  initFileListNavigation,
  initViewToggle,
  startRename,
  startRenameFromContext,
  renameFile,
  showDeleteConfirm,
};
