var state = {
  currentPath: '/',
  items: [],
  sortBy: 'name',
  sortAsc: true,
  filterText: '',
  editorInstance: null,
  editingOriginalContent: '',
  selectedFile: null,
  contextTarget: null,
  renameTarget: null,
  isListView: true,
};

var dom = {};

function initDom() {
  dom.fileList = document.getElementById('file-list');
  dom.breadcrumb = document.getElementById('breadcrumb');
  dom.cwdDisplay = document.getElementById('cwd-display');
  dom.fileCountBadge = document.getElementById('file-count-badge');
  dom.fileListStatus = document.getElementById('file-list-status');
  dom.fileSkeleton = document.getElementById('file-skeleton');
  dom.searchInput = document.getElementById('search-input');
  dom.searchBox = document.getElementById('search-box');
  dom.searchToggle = document.getElementById('search-toggle');
  dom.searchClear = document.getElementById('search-clear');
  dom.sortBar = document.getElementById('sort-bar');
  dom.sortBtn = document.getElementById('sort-btn');
  dom.viewToggle = document.getElementById('view-toggle');
  dom.contextMenu = document.getElementById('context-menu');
  dom.fullPageDropzone = document.getElementById('full-page-dropzone');
  dom.uploadModal = document.getElementById('upload-modal');
  dom.editorModal = document.getElementById('editor-modal');
  dom.newfileModal = document.getElementById('newfile-modal');
  dom.renameModal = document.getElementById('rename-modal');
  dom.confirmModal = document.getElementById('confirm-modal');
  dom.helpModal = document.getElementById('help-modal');
  dom.toastContainer = document.getElementById('toast-container');
  dom.fileToolbar = document.getElementById('file-toolbar');
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function joinPath(base, name) {
  if (base === '/') return '/' + name;
  return base + '/' + name;
}

function dirname(p) {
  if (!p || p === '/') return '/';
  p = p.replace(/\/+$/, '');
  var i = p.lastIndexOf('/');
  if (i === -1) return '.';
  if (i === 0) return '/';
  return p.substring(0, i);
}

function basename(p) {
  if (!p || p === '/') return '';
  p = p.replace(/\/+$/, '');
  var i = p.lastIndexOf('/');
  return i === -1 ? p : p.substring(i + 1);
}

function getExtension(name) {
  var i = name.lastIndexOf('.');
  return i > 0 ? name.substring(i + 1).toLowerCase() : '';
}

function getFileIcon(name, isDir) {
  if (isDir) return 'fa-folder';
  var ext = getExtension(name);
  var map = {
    sh: 'fa-file-lines sh', py: 'fa-file-code py', js: 'fa-file-code js',
    ts: 'fa-file-code ts', jsx: 'fa-file-code js', tsx: 'fa-file-code ts',
    css: 'fa-file-code css', scss: 'fa-file-code css', less: 'fa-file-code css',
    html: 'fa-file-code html', htm: 'fa-file-code html',
    json: 'fa-file-code json', yml: 'fa-file-code yml', yaml: 'fa-file-code yaml',
    xml: 'fa-file-code', svg: 'fa-file-code html',
    md: 'fa-file-lines md', mdx: 'fa-file-lines md',
    txt: 'fa-file-lines txt', log: 'fa-file-lines log',
    png: 'fa-file-image image', jpg: 'fa-file-image image', jpeg: 'fa-file-image image',
    gif: 'fa-file-image image', webp: 'fa-file-image image', ico: 'fa-file-image image',
    pdf: 'fa-file-pdf', zip: 'fa-file-zipper', tar: 'fa-file-zipper',
    gz: 'fa-file-zipper', rar: 'fa-file-zipper', '7z': 'fa-file-zipper',
    exe: 'fa-gear', deb: 'fa-gear', rpm: 'fa-gear',
    conf: 'fa-file-lines', cfg: 'fa-file-lines', ini: 'fa-file-lines',
    env: 'fa-file-lines', gitignore: 'fa-file-lines',
  };
  return map[ext] || 'fa-file';
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024;
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  var now = new Date();
  var diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toast(message, icon, color) {
  icon = icon || 'fa-circle-info';
  color = color || 'var(--text-primary)';
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<i class="fas ' + icon + '" style="color:' + color + '"></i> <span>' + escapeHtml(message) + '</span>';
  dom.toastContainer.appendChild(el);
  setTimeout(function() {
    el.classList.add('removing');
    el.addEventListener('animationend', function() { el.remove(); });
  }, 3000);
}

async function api(url, options) {
  var res = await fetch(url, Object.assign({
    headers: { 'Content-Type': 'application/json' },
  }, options));
  if (!res.ok) {
    var err = await res.json().catch(function() { return { error: res.statusText }; });
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function showSkeleton() {
  dom.fileList.innerHTML = '';
  if (dom.fileSkeleton) dom.fileSkeleton.style.display = 'flex';
}

function hideSkeleton() {
  if (dom.fileSkeleton) dom.fileSkeleton.style.display = 'none';
}

async function loadDir(dirPath) {
  state.currentPath = dirPath;
  showSkeleton();
  try {
    var data = await api('/api/files?path=' + encodeURIComponent(dirPath));
    state.items = data.items || [];
    applyFilterAndSort();
    updateBreadcrumb(data.path);
    if (dom.cwdDisplay) dom.cwdDisplay.innerHTML = '<i class="fas fa-folder"></i> ' + escapeHtml(data.path);
  } catch (err) {
    dom.fileList.innerHTML = '';
    dom.fileListStatus.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
  } finally {
    hideSkeleton();
  }
}

function applyFilterAndSort() {
  var items = state.items;
  if (state.filterText) {
    var lower = state.filterText.toLowerCase();
    items = items.filter(function(item) { return item.name.toLowerCase().includes(lower); });
  }
  items.sort(function(a, b) {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    var cmp = 0;
    if (state.sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (state.sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (state.sortBy === 'date') cmp = (a.modified || '').localeCompare(b.modified || '');
    return state.sortAsc ? cmp : -cmp;
  });
  renderFileList(items);
  updateFileCount(items.length);
}

function renderFileList(items) {
  dom.fileList.innerHTML = '';
  dom.fileListStatus.innerHTML = '';

  if (state.currentPath !== '/') {
    var parentLi = document.createElement('li');
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
    var emptyMsg = state.filterText ? 'No files match "' + state.filterText + '"' : 'Empty directory';
    dom.fileListStatus.innerHTML =
      '<div class="empty-state"><i class="fas fa-' + (state.filterText ? 'search' : 'folder-open') + '"></i><p>' + emptyMsg + '</p></div>';
    return;
  }

  items.forEach(function(item, idx) {
    var li = document.createElement('li');
    li.className = 'file-item';
    li.style.animationDelay = (idx * 0.03) + 's';
    li.dataset.name = item.name;
    li.dataset.isDir = item.isDirectory ? 'true' : 'false';
    li.dataset.path = joinPath(state.currentPath, item.name);

    var icon = getFileIcon(item.name, item.isDirectory);
    var iconClass = item.isDirectory ? 'folder' : icon.split(' ')[1] || 'file';
    var iconBase = icon.split(' ')[0];

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

function updateFileCount(count) {
  if (dom.fileCountBadge) {
    dom.fileCountBadge.textContent = count > 0 ? count : '';
  }
}

function updateBreadcrumb(dirPath) {
  dom.breadcrumb.innerHTML = '';
  var parts = dirPath.split('/').filter(Boolean);

  var root = document.createElement('span');
  root.className = 'breadcrumb-item' + (parts.length === 0 ? ' active' : '');
  root.innerHTML = '<i class="fas fa-home"></i>';
  root.title = 'Workspace root';
  if (parts.length > 0) root.addEventListener('click', function() { loadDir('/'); });
  dom.breadcrumb.appendChild(root);

  var built = '';
  parts.forEach(function(part, i) {
    var sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '/';
    dom.breadcrumb.appendChild(sep);

    built = built ? built + '/' + part : '/' + part;
    var item = document.createElement('span');
    var isLast = (i === parts.length - 1);
    item.className = 'breadcrumb-item' + (isLast ? ' active' : '');
    item.textContent = part;
    if (!isLast) {
      item.addEventListener('click', function() { loadDir(built); });
    }
    dom.breadcrumb.appendChild(item);
  });
}

dom.fileList.addEventListener('click', function(e) {
  var li = e.target.closest('.file-item');
  if (!li) return;

  if (li.classList.contains('parent-item')) {
    loadDir(li.dataset.path);
    return;
  }

  var name = li.dataset.name;
  var targetPath = li.dataset.path;
  var isDir = li.dataset.isDir === 'true';

  var actionBtn = e.target.closest('.action-btn');
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

dom.fileList.addEventListener('dblclick', function(e) {
  var li = e.target.closest('.file-item');
  if (!li || li.classList.contains('parent-item')) return;
  startRename(li);
});

dom.fileList.addEventListener('contextmenu', function(e) {
  var li = e.target.closest('.file-item');
  if (!li) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, li);
});

document.addEventListener('click', function(e) {
  if (!e.target.closest('.context-menu')) {
    hideContextMenu();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (dom.contextMenu.classList.contains('visible')) {
      hideContextMenu();
      return;
    }
    hideSearch();
    document.querySelectorAll('.modal-overlay.active').forEach(function(m) {
      m.classList.remove('active');
    });
  }
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'f') { e.preventDefault(); toggleSearch(); }
    if (e.key === 'n') { e.preventDefault(); showNewFile(); }
    if (e.key === 'r') { e.preventDefault(); loadDir(state.currentPath); toast('Refreshed', 'fa-rotate', 'var(--accent)'); }
  }
  if (e.key === 'F2') {
    e.preventDefault();
    var selected = dom.fileList.querySelector('.file-item.selected');
    if (selected) startRename(selected);
  }
  if (e.key === 'Delete') {
    var selected = dom.fileList.querySelector('.file-item.selected');
    if (selected && !e.target.closest('input')) {
      var name = selected.dataset.name;
      var isDir = selected.dataset.isDir === 'true';
      showDeleteConfirm(name, isDir);
    }
  }
  if (e.key === '?' && !e.target.closest('input')) {
    toggleHelp();
  }
  if (e.key === 'Enter' && dom.searchInput === document.activeElement) {
    dom.searchInput.blur();
  }
});

dom.fileList.addEventListener('mouseover', function(e) {
  var li = e.target.closest('.file-item');
  if (!li) return;
  dom.fileList.querySelectorAll('.file-item.selected').forEach(function(el) {
    if (el !== li) el.classList.remove('selected');
  });
  if (!li.classList.contains('parent-item')) li.classList.add('selected');
});

dom.fileList.addEventListener('mouseleave', function() {
  dom.fileList.querySelectorAll('.file-item.selected').forEach(function(el) {
    el.classList.remove('selected');
  });
});

function toggleSearch() {
  var isVisible = dom.searchBox.style.display !== 'none';
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

dom.searchToggle.addEventListener('click', function() {
  toggleSearch();
  if (dom.searchBox.style.display !== 'none') {
    dom.fileToolbar.style.display = 'block';
  }
});

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

dom.searchClear.addEventListener('click', function() {
  state.filterText = '';
  dom.searchInput.value = '';
  dom.searchClear.classList.remove('visible');
  dom.sortBar.style.display = 'none';
  applyFilterAndSort();
  dom.searchInput.focus();
});

dom.sortBtn.addEventListener('click', function() {
  dom.sortBar.style.display = dom.sortBar.style.display === 'none' ? 'flex' : 'none';
});

document.querySelectorAll('.sort-option').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var sort = this.dataset.sort;
    if (state.sortBy === sort) {
      state.sortAsc = !state.sortAsc;
      var icon = this.querySelector('i');
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

dom.viewToggle.addEventListener('click', function() {
  state.isListView = !state.isListView;
  dom.viewToggle.innerHTML = '<i class="fas fa-' + (state.isListView ? 'list' : 'table-cells') + '"></i>';
  dom.fileList.classList.toggle('grid-view', !state.isListView);
});

function showContextMenu(x, y, li) {
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
  });
}

function hideContextMenu() {
  dom.contextMenu.classList.remove('visible');
  state.contextTarget = null;
}

document.querySelectorAll('.context-menu-item').forEach(function(item) {
  item.addEventListener('click', function() {
    var action = this.dataset.action;
    var target = state.contextTarget;
    if (!target) return;
    hideContextMenu();

    if (action === 'open') loadDir(target.path);
    else if (action === 'edit') openEditor(target.name);
    else if (action === 'rename') startRenameFromContext(target.name);
    else if (action === 'download') downloadFile(target.name);
    else if (action === 'copy-path') copyPath(target.path);
    else if (action === 'delete') showDeleteConfirm(target.name, target.isDir);
  });
});

function copyPath(filePath) {
  navigator.clipboard.writeText(filePath).then(function() {
    toast('Path copied: ' + filePath, 'fa-link', 'var(--accent)');
  }).catch(function() {
    toast('Failed to copy path', 'fa-circle-exclamation', 'var(--danger)');
  });
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

function startRenameFromContext(name) {
  var li = dom.fileList.querySelector('[data-name="' + CSS.escape(name) + '"]');
  if (li) startRename(li);
}

async function renameFile(oldName, newName) {
  var oldPath = joinPath(state.currentPath, oldName);
  var newPath = joinPath(state.currentPath, newName);
  try {
    var content = await api('/api/file?path=' + encodeURIComponent(oldPath));
    await api('/api/file?path=' + encodeURIComponent(newPath), {
      method: 'PUT',
      body: JSON.stringify({ content: content.content }),
    });
    await api('/api/file?path=' + encodeURIComponent(oldPath), { method: 'DELETE' });
    toast('Renamed: ' + oldName + ' → ' + newName, 'fa-pencil', 'var(--success)');
    loadDir(state.currentPath);
  } catch (err) {
    toast('Rename failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  }
}

async function renameDir(oldName, newName) {
  var oldPath = joinPath(state.currentPath, oldName);
  var newPath = joinPath(state.currentPath, newName);
  try {
    await api('/api/file?path=' + encodeURIComponent(newPath), {
      method: 'PUT',
      body: JSON.stringify({ _isDir: true }),
    });
    var items = await api('/api/files?path=' + encodeURIComponent(oldPath));
    for (var i = 0; i < (items.items || []).length; i++) {
      var item = items.items[i];
      await api('/api/file?path=' + encodeURIComponent(joinPath(oldPath, item.name)), {
        method: 'PUT',
        body: JSON.stringify({ content: (await api('/api/file?path=' + encodeURIComponent(joinPath(oldPath, item.name)))).content }),
      });
    }
    await api('/api/file?path=' + encodeURIComponent(oldPath), { method: 'DELETE' });
    toast('Renamed: ' + oldName + ' → ' + newName, 'fa-pencil', 'var(--success)');
    loadDir(state.currentPath);
  } catch (err) {
    toast('Rename failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  }
}

function showDeleteConfirm(name, isDir) {
  state.selectedFile = { name: name, isDir: isDir };
  document.getElementById('confirm-text').textContent =
    (isDir ? 'Delete folder' : 'Delete file') + ' "' + name + '"? This cannot be undone.';
  dom.confirmModal.classList.add('active');
}

document.getElementById('confirm-action').addEventListener('click', function() {
  if (state.selectedFile) {
    var filePath = joinPath(state.currentPath, state.selectedFile.name);
    api('/api/file?path=' + encodeURIComponent(filePath), { method: 'DELETE' })
      .then(function() {
        toast('Deleted: ' + state.selectedFile.name, 'fa-trash', 'var(--danger)');
        loadDir(state.currentPath);
      })
      .catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
  }
  dom.confirmModal.classList.remove('active');
});

document.getElementById('confirm-modal-close').addEventListener('click', function() {
  dom.confirmModal.classList.remove('active');
});

document.getElementById('upload-btn').addEventListener('click', function() {
  dom.uploadModal.classList.add('active');
});

document.getElementById('upload-modal-close').addEventListener('click', function() {
  dom.uploadModal.classList.remove('active');
});

var dropzone = document.getElementById('dropzone');
var fileInput = document.getElementById('file-input');
var progressFill = document.getElementById('progress-fill');
var progressText = document.getElementById('progress-text');
var uploadProgressDiv = document.getElementById('upload-progress');

dropzone.addEventListener('click', function() { fileInput.click(); });

dropzone.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', function() {
  dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', function() {
  handleFiles(fileInput.files);
});

document.addEventListener('dragover', function(e) {
  if (!e.target.closest('.dropzone') && !e.target.closest('input')) {
    e.preventDefault();
    dom.fullPageDropzone.classList.add('active');
  }
});

document.addEventListener('dragleave', function(e) {
  if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
    dom.fullPageDropzone.classList.remove('active');
  }
});

document.addEventListener('drop', function(e) {
  e.preventDefault();
  dom.fullPageDropzone.classList.remove('active');
  if (!e.target.closest('.dropzone')) {
    dom.uploadModal.classList.add('active');
    handleFiles(e.dataTransfer.files);
  }
});

function handleFiles(files) {
  if (!files.length) return;
  uploadProgressDiv.style.display = 'block';
  dom.uploadModal.classList.add('active');

  var progressContainer = document.getElementById('progress-items');
  progressContainer.innerHTML = '';

  Array.from(files).forEach(function(file) {
    var item = document.createElement('div');
    item.className = 'progress-item';
    item.innerHTML =
      '<span class="progress-text">' + escapeHtml(file.name) + '</span>' +
      '<div class="progress-bar"><div class="progress-fill" data-filename="' + escapeHtml(file.name) + '"></div></div>' +
      '<span class="progress-text" id="pct-' + escapeHtml(file.name) + '">0%</span>';
    progressContainer.appendChild(item);

    var formData = new FormData();
    formData.append('file', file);
    formData.append('path', state.currentPath);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', function(e) {
      if (e.lengthComputable) {
        var pct = Math.round((e.loaded / e.total) * 100);
        var fill = item.querySelector('.progress-fill');
        fill.style.width = pct + '%';
        item.querySelector('.progress-text:last-child').textContent = pct + '%';
      }
    });

    xhr.addEventListener('load', function() {
      if (xhr.status === 200) {
        item.querySelector('.progress-text:first-child').innerHTML = '<i class="fas fa-check-circle" style="color:var(--success)"></i> ' + escapeHtml(file.name);
        item.querySelector('.progress-fill').style.background = 'var(--success)';
        item.querySelector('.progress-text:last-child').textContent = 'Done';
      } else {
        item.querySelector('.progress-text:first-child').innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger)"></i> ' + escapeHtml(file.name);
      }
    });

    xhr.addEventListener('error', function() {
      item.querySelector('.progress-text:first-child').innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger)"></i> ' + escapeHtml(file.name);
    });

    xhr.send(formData);
  });

  fileInput.value = '';
  setTimeout(function() { loadDir(state.currentPath); }, 500);
}

document.getElementById('new-file-btn').addEventListener('click', showNewFile);

document.getElementById('new-dir-btn').addEventListener('click', function() {
  dom.newfileModal.classList.add('active');
  document.getElementById('newfile-type').value = 'directory';
  document.getElementById('newfile-name').value = '';
  setTimeout(function() { document.getElementById('newfile-name').focus(); }, 100);
});

function showNewFile() {
  dom.newfileModal.classList.add('active');
  document.getElementById('newfile-type').value = 'file';
  document.getElementById('newfile-name').value = '';
  setTimeout(function() { document.getElementById('newfile-name').focus(); }, 100);
}

document.getElementById('newfile-modal-close').addEventListener('click', function() {
  dom.newfileModal.classList.remove('active');
});

document.getElementById('newfile-submit').addEventListener('click', function() {
  var name = document.getElementById('newfile-name').value.trim();
  var type = document.getElementById('newfile-type').value;
  if (!name) { toast('Please enter a name.', 'fa-circle-exclamation', 'var(--warning)'); return; }

  var filePath = joinPath(state.currentPath, name);

  var body = type === 'directory' ? { _isDir: true } : { content: '' };

  api('/api/file?path=' + encodeURIComponent(filePath), {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then(function() {
    toast('Created ' + (type === 'directory' ? 'folder' : 'file') + ': ' + name,
      type === 'directory' ? 'fa-folder-plus' : 'fa-file-circle-plus',
      type === 'directory' ? 'var(--accent)' : 'var(--success)');
    dom.newfileModal.classList.remove('active');
    loadDir(state.currentPath);
  }).catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
});

document.getElementById('newfile-name').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('newfile-submit').click();
});

document.getElementById('editor-modal-close').addEventListener('click', closeEditor);

function openEditor(fileName) {
  var filePath = joinPath(state.currentPath, fileName);
  var nameEl = document.getElementById('editor-filename');
  nameEl.textContent = fileName;

  api('/api/file?path=' + encodeURIComponent(filePath))
    .then(function(data) {
      state.editingOriginalContent = data.content;
      dom.editorModal.classList.add('active');

      var ext = getExtension(fileName);
      var modeMap = {
        py: 'python', js: 'javascript', ts: 'javascript', sh: 'shell',
        css: 'css', html: 'htmlmixed', json: 'javascript',
        yml: 'yaml', yaml: 'yaml', md: 'markdown', xml: 'xml',
        jsx: 'javascript', tsx: 'javascript', scss: 'css', less: 'css',
      };
      var mode = modeMap[ext] || null;

      var editorEl = document.getElementById('editor');
      state.editorInstance = CodeMirror(editorEl, {
        value: data.content,
        mode: mode,
        theme: 'material-palenight',
        lineNumbers: true,
        lineWrapping: true,
        indentWithTabs: true,
        tabSize: 2,
        autofocus: true,
        extraKeys: {
          'Ctrl-S': function() { saveEditor(fileName); },
          'Cmd-S': function() { saveEditor(fileName); },
        },
      });

      state.editorInstance.on('change', function() {
        nameEl.innerHTML =
          '<i class="fas fa-pen" style="font-size:0.8rem"></i> ' +
          escapeHtml(fileName) +
          ' <span style="color:var(--warning);font-size:0.75rem;font-weight:400;">(unsaved)</span>';
      });

      setTimeout(function() {
        state.editorInstance.setSize('100%', '100%');
        state.editorInstance.refresh();
      }, 80);
    })
    .catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
}

function saveEditor(fileName) {
  if (!state.editorInstance) return;
  var filePath = joinPath(state.currentPath, fileName);
  api('/api/file?path=' + encodeURIComponent(filePath), {
    method: 'PUT',
    body: JSON.stringify({ content: state.editorInstance.getValue() }),
  }).then(function() {
    state.editingOriginalContent = state.editorInstance.getValue();
    document.getElementById('editor-filename').textContent = fileName;
    toast('Saved: ' + fileName, 'fa-check-circle', 'var(--success)');
  }).catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
}

document.getElementById('editor-save').addEventListener('click', function() {
  var nameEl = document.getElementById('editor-filename');
  var fileName = nameEl.textContent;
  saveEditor(fileName);
});

function closeEditor() {
  if (!state.editorInstance) { dom.editorModal.classList.remove('active'); return; }
  if (state.editorInstance.getValue() !== state.editingOriginalContent) {
    if (!confirm('You have unsaved changes. Close without saving?')) return;
  }
  dom.editorModal.classList.remove('active');
  state.editorInstance.toTextArea();
  state.editorInstance = null;
}

function downloadFile(fileName) {
  var filePath = joinPath(state.currentPath, fileName);
  window.open('/api/download?path=' + encodeURIComponent(filePath), '_blank');
}

document.getElementById('refresh-btn').addEventListener('click', function() {
  toast('Refreshing...', 'fa-rotate fa-spin', 'var(--accent)');
  loadDir(state.currentPath);
});

document.getElementById('help-btn').addEventListener('click', toggleHelp);

document.getElementById('help-modal-close').addEventListener('click', function() {
  dom.helpModal.classList.remove('active');
});

function toggleHelp() {
  dom.helpModal.classList.toggle('active');
}

document.querySelectorAll('.modal-close').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var overlay = this.closest('.modal-overlay');
    if (overlay) overlay.classList.remove('active');
  });
});

initDom();
loadDir('/');
