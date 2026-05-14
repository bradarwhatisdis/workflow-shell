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
initDom();

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

function getSessionToken() {
  return localStorage.getItem('wfs-session-token') || '';
}

async function api(url, options) {
  options = options || {};
  var headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  var token = getSessionToken();
  if (token) headers['x-session-token'] = token;
  options.headers = headers;

  var res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('wfs-session-token');
    window.location.href = '/login.html';
    throw new Error('Authentication required');
  }
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

// ─── Quick Actions ─────────────────────────────────────────────────────────

var quickActionsData = [];

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

function runQuickAction(action) {
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

function closeRunner() {
  var overlay = document.getElementById('qa-runner-overlay');
  var terminal = document.getElementById('terminal-container');
  overlay.style.display = 'none';
  terminal.style.display = 'block';
  document.getElementById('qa-runner-output').innerHTML = '';
}

document.getElementById('qa-runner-close').addEventListener('click', closeRunner);
document.getElementById('qa-runner-close-btn').addEventListener('click', closeRunner);

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

document.querySelectorAll('.pane-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.pane-tab').forEach(function(t) { t.classList.remove('active'); });
    this.classList.add('active');
    var tabName = this.dataset.tab;
    var terminal = document.getElementById('terminal-container');
    var qa = document.getElementById('quick-actions-container');
    if (tabName === 'terminal') {
      terminal.style.display = 'block';
      qa.style.display = 'none';
    } else {
      terminal.style.display = 'none';
      qa.style.display = 'flex';
      loadQuickActions();
    }
  });
});

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

document.getElementById('qa-command').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('qa-submit').click();
});

// ─── Theme Toggle ──────────────────────────────────────────────────────────

var themeToggle = document.getElementById('theme-toggle');
var currentTheme = localStorage.getItem('wfs-theme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);
themeToggle.innerHTML = '<i class="fas fa-' + (currentTheme === 'dark' ? 'sun' : 'moon') + '"></i>';

themeToggle.addEventListener('click', function() {
  var theme = document.documentElement.getAttribute('data-theme');
  var newTheme = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('wfs-theme', newTheme);
  themeToggle.innerHTML = '<i class="fas fa-' + (newTheme === 'dark' ? 'sun' : 'moon') + '"></i>';
  toast(newTheme === 'light' ? 'Light theme' : 'Dark theme', 'fa-palette', 'var(--accent)');
});

// ─── File Pane Tabs (List / Tree) ──────────────────────────────────────────

function switchFileTab(tab) {
  document.querySelectorAll('.pane-header-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('.pane-header-tab[data-ftab="' + tab + '"]').classList.add('active');
  if (tab === 'files') {
    document.getElementById('file-view-container').style.display = 'flex';
    document.getElementById('file-tree-container').style.display = 'none';
  } else {
    document.getElementById('file-view-container').style.display = 'none';
    document.getElementById('file-tree-container').style.display = 'block';
    loadFileTree();
  }
}

document.querySelectorAll('.pane-header-tab').forEach(function(tab) {
  tab.addEventListener('click', function() { switchFileTab(this.dataset.ftab); });
});

// ─── File Tree ──────────────────────────────────────────────────────────────

function loadFileTree() {
  var container = document.getElementById('file-tree');
  var status = document.getElementById('file-tree-status');
  container.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i></div>';
  api('/api/files/tree')
    .then(function(data) {
      renderTree(data.tree || [], container, data.path || '/');
      status.innerHTML = '';
    })
    .catch(function(err) {
      container.innerHTML = '';
      status.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

function renderTree(items, container, basePath) {
  container.innerHTML = '';
  items.forEach(function(item) {
    var div = document.createElement('div');
    div.className = 'tree-item';
    if (item.isDirectory) {
      var hasChildren = item.children && item.children.length > 0;
      var toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.textContent = hasChildren ? '▸' : '';
      div.appendChild(toggle);
      var icon = document.createElement('span');
      icon.className = 'tree-icon folder';
      icon.innerHTML = '<i class="fas fa-folder"></i>';
      div.appendChild(icon);
      var name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = item.name;
      div.appendChild(name);
      var childPath = basePath === '/' ? '/' + item.name : basePath + '/' + item.name;
      div.addEventListener('click', function(e) {
        if (e.target === toggle || toggle.contains(e.target)) {
          var childrenContainer = div.nextElementSibling;
          if (childrenContainer && childrenContainer.classList.contains('tree-children')) {
            childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
            toggle.textContent = childrenContainer.style.display === 'none' ? '▸' : '▾';
          }
        } else {
          switchFileTab('files');
          loadDir(childPath);
        }
      });
      container.appendChild(div);
      var childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      if (hasChildren) renderTree(item.children, childrenContainer, childPath);
      container.appendChild(childrenContainer);
    } else {
      var toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.textContent = '';
      div.appendChild(toggle);
      var icon = document.createElement('span');
      icon.className = 'tree-icon file';
      icon.innerHTML = '<i class="fas fa-file"></i>';
      div.appendChild(icon);
      var name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = item.name;
      div.appendChild(name);
      var filePath = basePath === '/' ? '/' + item.name : basePath + '/' + item.name;
      div.addEventListener('click', function() {
        switchFileTab('files');
        // Navigate to parent and open the file
        var parent = basePath;
        state.currentPath = parent;
        loadDir(parent);
      });
      container.appendChild(div);
    }
  });
  if (!items.length) container.innerHTML = '<div class="search-empty"><i class="fas fa-folder-open"></i><p>Empty</p></div>';
}

// ─── System Stats Panel ─────────────────────────────────────────────────────

var statsTimer = null;

document.querySelector('.pane-tab[data-tab="stats"]').addEventListener('click', function() {
  loadStats();
});

function loadStats() {
  var body = document.getElementById('stats-body');
  body.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i> Loading stats...</div>';
  api('/api/system-stats')
    .then(function(d) {
      var html = '';
      html += '<div class="stat-grid">';
      html += statCard('Disk Size', d.disk.size, 'green');
      html += statCard('Disk Used', d.disk.used, d.disk.usePercent && parseInt(d.disk.usePercent) > 80 ? 'red' : 'yellow');
      html += statCard('Disk Avail', d.disk.avail, 'green');
      html += statCard('Disk Use', d.disk.usePercent || '0%', parseInt(d.disk.usePercent) > 80 ? 'red' : 'green');
      html += statCard('Memory Total', d.memory.total, 'accent');
      html += statCard('Memory Used', d.memory.used, parseInt(d.memory.used) > 4096 ? 'yellow' : 'green');
      html += statCard('Memory Free', d.memory.free, 'green');
      html += statCard('Memory Avail', d.memory.avail || '-', 'green');
      html += statCard('CPU Load (1m)', d.load['1min'], parseFloat(d.load['1min']) > 2 ? 'red' : 'green');
      html += statCard('CPU Load (5m)', d.load['5min'], parseFloat(d.load['5min']) > 2 ? 'yellow' : 'green');
      html += statCard('CPU Load (15m)', d.load['15min'], 'green');
      html += statCard('Processes', d.processes, 'accent');
      html += '</div>';
      html += '<div style="text-align:center;color:var(--text-muted);font-size:0.78rem"><i class="fas fa-clock"></i> Uptime: ' + escapeHtml(d.uptime) + '</div>';
      body.innerHTML = html;
    })
    .catch(function(err) {
      body.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

function statCard(label, value, color) {
  return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value ' + (color || '') + '">' + escapeHtml(String(value)) + '</div></div>';
}

// ─── Git Status Panel ───────────────────────────────────────────────────────

document.querySelector('.pane-tab[data-tab="git"]').addEventListener('click', function() {
  loadGitStatus();
});

function loadGitStatus() {
  var body = document.getElementById('git-body');
  body.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i> Loading git status...</div>';
  api('/api/git-status')
    .then(function(d) {
      var html = '';
      html += '<div class="git-section"><div class="git-section-title"><i class="fas fa-code-branch"></i> Branch</div>';
      html += '<div class="git-branch"><i class="fas fa-code-branch"></i> ' + escapeHtml(d.branch) + '</div></div>';
      if (d.changes && d.changes.length) {
        html += '<div class="git-section"><div class="git-section-title"><i class="fas fa-pen-to-square"></i> Changes (' + d.changes.length + ')</div>';
        d.changes.forEach(function(c) {
          var badge = c.status.trim()[0] || '?';
          var label = { M: 'M', A: 'A', D: 'D', '?': '?' }[badge] || '?';
          html += '<div class="git-change"><span class="git-status-badge ' + label + '">' + label + '</span><span>' + escapeHtml(c.file) + '</span></div>';
        });
        html += '</div>';
      }
      if (d.log && d.log.length) {
        html += '<div class="git-section"><div class="git-section-title"><i class="fas fa-history"></i> Recent Commits</div>';
        d.log.forEach(function(c) {
          html += '<div class="git-commit"><span class="git-hash">' + escapeHtml(c.hash) + '</span><span class="git-msg">' + escapeHtml(c.message) + '</span></div>';
        });
        html += '</div>';
      }
      if (!d.changes.length && (!d.log || !d.log.length)) {
        html += '<div class="search-empty"><i class="fas fa-code-branch"></i><p>No git data available</p></div>';
      }
      body.innerHTML = html;
    })
    .catch(function(err) {
      body.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

// ─── Search in Files ────────────────────────────────────────────────────────

var searchTimer = null;

document.querySelector('.pane-tab[data-tab="search-results"]').addEventListener('click', function() {
  if (!window._lastSearchResults) {
    document.getElementById('search-results-body').innerHTML =
      '<div class="search-empty"><i class="fas fa-search"></i><p>Use the search bar in the topbar to search files</p></div>';
    return;
  }
  renderSearchResults(window._lastSearchResults, window._lastSearchQuery);
});

function doFileSearch(query) {
  window._lastSearchQuery = query;
  var body = document.getElementById('search-results-body');
  if (!query || query.length < 2) {
    body.innerHTML = '<div class="search-empty"><i class="fas fa-search"></i><p>Type at least 2 characters</p></div>';
    window._lastSearchResults = null;
    return;
  }
  body.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  switchPaneTab('search-results');
  api('/api/search?q=' + encodeURIComponent(query))
    .then(function(data) {
      window._lastSearchResults = data.results || [];
      renderSearchResults(window._lastSearchResults, query);
    })
    .catch(function(err) {
      body.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

function renderSearchResults(results, query) {
  var body = document.getElementById('search-results-body');
  if (!results || !results.length) {
    body.innerHTML = '<div class="search-empty"><i class="fas fa-search"></i><p>No results for "' + escapeHtml(query) + '"</p></div>';
    return;
  }
  var html = '<div style="margin-bottom:8px;font-size:0.78rem;color:var(--text-muted)">' + results.length + ' result' + (results.length > 1 ? 's' : '') + ' for <strong>' + escapeHtml(query) + '</strong></div>';
  results.forEach(function(r) {
    var highlighted = escapeHtml(r.match).replace(new RegExp(escapeHtml(query), 'gi'), function(m) { return '<mark>' + m + '</mark>'; });
    html += '<div class="search-result-item" data-file="' + escapeHtml(r.file) + '" data-line="' + r.line + '">' +
      '<div><span class="search-result-file">' + escapeHtml(r.file) + '</span><span class="search-result-line">:' + r.line + '</span></div>' +
      '<div class="search-result-match">' + highlighted + '</div></div>';
  });
  body.innerHTML = html;
  body.querySelectorAll('.search-result-item').forEach(function(el) {
    el.addEventListener('click', function() {
      var file = this.dataset.file;
      switchPaneTab('terminal');
      toast('Found in: ' + file, 'fa-search', 'var(--accent)');
    });
  });
}

function switchPaneTab(tab) {
  document.querySelectorAll('.pane-tab').forEach(function(t) { t.classList.remove('active'); });
  var target = document.querySelector('.pane-tab[data-tab="' + tab + '"]');
  if (target) target.classList.add('active');
  var containers = {
    terminal: 'terminal-container',
    'quick-actions': 'quick-actions-container',
    stats: 'stats-container',
    git: 'git-container',
    'search-results': 'search-results-container',
  };
  Object.keys(containers).forEach(function(key) {
    var el = document.getElementById(containers[key]);
    if (el) el.style.display = key === tab ? 'flex' : 'none';
  });
}

// ─── Command Palette ────────────────────────────────────────────────────────

var paletteActions = [
  { name: 'Search files...', desc: 'Filter current directory', icon: 'fa-search', action: function() { document.getElementById('search-toggle').click(); } },
  { name: 'Search in files...', desc: 'Full-text search workspace', icon: 'fa-file-search', action: function() { document.querySelector('.topbar-btn[title*="Search"]').click(); } },
  { name: 'New File', desc: 'Create a new file (Ctrl+N)', icon: 'fa-file-circle-plus', action: function() { showNewFile(); } },
  { name: 'New Folder', desc: 'Create a new directory', icon: 'fa-folder-plus', action: function() { document.getElementById('new-dir-btn').click(); } },
  { name: 'Upload File', desc: 'Upload files to current directory', icon: 'fa-upload', action: function() { document.getElementById('upload-btn').click(); } },
  { name: 'Refresh', desc: 'Refresh file list (Ctrl+R)', icon: 'fa-arrows-rotate', action: function() { loadDir(state.currentPath); } },
  { name: 'Toggle Theme', desc: 'Switch dark/light theme', icon: 'fa-palette', action: function() { themeToggle.click(); } },
  { name: 'Quick Actions', desc: 'View and run quick commands', icon: 'fa-bolt', action: function() { switchPaneTab('quick-actions'); } },
  { name: 'System Stats', desc: 'View disk, memory, CPU stats', icon: 'fa-chart-simple', action: function() { switchPaneTab('stats'); loadStats(); } },
  { name: 'Git Status', desc: 'View git branch and changes', icon: 'fab fa-git-alt', action: function() { switchPaneTab('git'); loadGitStatus(); } },
  { name: 'Keyboard Shortcuts', desc: 'View shortcut keys (?)', icon: 'fa-keyboard', action: function() { toggleHelp(); } },
];

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
    e.preventDefault();
    togglePalette();
  }
});

function togglePalette() {
  var overlay = document.getElementById('cmd-palette');
  var isActive = overlay.classList.contains('active');
  overlay.classList.toggle('active');
  if (!isActive) {
    document.getElementById('cmd-palette-input').value = '';
    document.getElementById('cmd-palette-results').innerHTML = '';
    setTimeout(function() { document.getElementById('cmd-palette-input').focus(); }, 50);
    renderPalette('');
  }
}

document.getElementById('cmd-palette-input').addEventListener('input', function() {
  renderPalette(this.value);
});

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

function renderPalette(query) {
  var results = document.getElementById('cmd-palette-results');
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

document.getElementById('cmd-palette').addEventListener('click', function(e) {
  if (e.target === this) togglePalette();
});

// ─── Global Search (topbar) ─────────────────────────────────────────────────

var globalSearchHTML = '<div class="global-search-bar" id="global-search-bar">' +
  '<i class="fas fa-file-search" style="color:var(--text-muted);font-size:0.8rem"></i>' +
  '<input type="text" id="global-search-input" placeholder="Search in files..." spellcheck="false">' +
  '</div>';

var refreshBtn = document.getElementById('refresh-btn');
refreshBtn.parentNode.insertBefore(createElementFromHTML(globalSearchHTML), refreshBtn);

function createElementFromHTML(html) {
  var div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild;
}

var globalSearchInput = document.getElementById('global-search-input');
var globalSearchBar = document.getElementById('global-search-bar');

document.querySelector('.search-toggle').addEventListener('click', function() {
  globalSearchBar.classList.toggle('active');
  if (globalSearchBar.classList.contains('active')) {
    globalSearchInput.focus();
  } else {
    globalSearchInput.value = '';
  }
});

globalSearchInput.addEventListener('input', function() {
  var val = this.value.trim();
  clearTimeout(searchTimer);
  if (val.length >= 2) {
    searchTimer = setTimeout(function() { doFileSearch(val); }, 400);
  } else {
    document.getElementById('search-results-body').innerHTML =
      '<div class="search-empty"><i class="fas fa-search"></i><p>Type at least 2 characters</p></div>';
  }
});

// Override search toggle to show global search
var origSearchToggle = document.getElementById('search-toggle');
origSearchToggle.addEventListener('click', function() {
  globalSearchBar.classList.toggle('active');
  if (globalSearchBar.classList.contains('active')) {
    globalSearchInput.focus();
  } else {
    globalSearchInput.value = '';
    globalSearchBar.classList.remove('active');
  }
});

// ─── Context Menu: Archive / Extract ────────────────────────────────────────

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
      loadDir(state.currentPath);
    }).catch(function(err) {
      toast('Archive failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
    });
  });
});

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
      loadDir(state.currentPath);
    }).catch(function(err) {
      toast('Extract failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
    });
  });
});

// ─── Drag to Move Files ─────────────────────────────────────────────────────

document.addEventListener('dragstart', function(e) {
  var li = e.target.closest('.file-item');
  if (!li || li.classList.contains('parent-item')) return;
  var path = li.dataset.path;
  if (path) e.dataTransfer.setData('text/plain', path);
});

document.addEventListener('dragover', function(e) {
  var li = e.target.closest('.file-item');
  if (li && li.dataset.isDir === 'true' && !li.classList.contains('parent-item')) {
    e.preventDefault();
    li.classList.add('highlighted');
  }
});

document.addEventListener('dragleave', function(e) {
  var li = e.target.closest('.file-item');
  if (li) li.classList.remove('highlighted');
});

document.addEventListener('drop', function(e) {
  var li = e.target.closest('.file-item');
  if (!li || li.dataset.isDir !== 'true' || li.classList.contains('parent-item')) return;
  e.preventDefault();
  li.classList.remove('highlighted');
  var from = e.dataTransfer.getData('text/plain');
  var toDir = li.dataset.path;
  if (!from || !toDir) return;
  var fileName = from.split('/').pop() || from.split('\\').pop();
  var to = toDir + '/' + fileName;
  if (from === to) return;
  toast('Moving...', 'fa-arrows', 'var(--accent)');
  api('/api/file/move', {
    method: 'POST',
    body: JSON.stringify({ from: from, to: to }),
  }).then(function() {
    toast('Moved: ' + fileName, 'fa-arrows', 'var(--success)');
    loadDir(state.currentPath);
  }).catch(function(err) {
    toast('Move failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
  });
});

// ─── Auto-refresh via fs.watch ─────────────────────────────────────────────

(function() {
  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var token = getSessionToken();
  var url = protocol + '//' + location.host + '/watch';
  if (token) url += '?token=' + encodeURIComponent(token);
  // Try to connect to a watch endpoint (best-effort)
  try {
    var watchWs = new WebSocket(url);
    watchWs.onmessage = function() {
      loadDir(state.currentPath);
    };
    watchWs.onclose = function() {};
  } catch(e) {}
})();

// ─── File Extension Viewer (preview handler) ────────────────────────────────

// Enhanced icon mapping in getFileIcon already handles this

loadDir('/');
