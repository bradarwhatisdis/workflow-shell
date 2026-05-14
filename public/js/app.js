// ─── App State ────────────────────────────────────────

var currentPath = '/';
var editorInstance = null;
var editingOriginalContent = '';

// ─── DOM refs ─────────────────────────────────────────

var fileList = document.getElementById('file-list');
var breadcrumb = document.getElementById('breadcrumb');
var cwdDisplay = document.getElementById('cwd-display');
var uploadModal = document.getElementById('upload-modal');
var editorModal = document.getElementById('editor-modal');
var newfileModal = document.getElementById('newfile-modal');
var confirmModal = document.getElementById('confirm-modal');
var dropzone = document.getElementById('dropzone');
var fileInput = document.getElementById('file-input');
var progressFill = document.getElementById('progress-fill');
var progressText = document.getElementById('progress-text');
var uploadProgressDiv = document.getElementById('upload-progress');
var toastContainer = document.getElementById('toast-container');

// ─── Utils ────────────────────────────────────────────

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

// ─── Toast ────────────────────────────────────────────

function toast(message, icon, color) {
  icon = icon || 'fa-circle-info';
  color = color || 'var(--text-primary)';
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<i class="fas ' + icon + '" style="color:' + color + '"></i> <span>' + escapeHtml(message) + '</span>';
  toastContainer.appendChild(el);
  setTimeout(function() {
    el.classList.add('removing');
    el.addEventListener('animationend', function() { el.remove(); });
  }, 3000);
}

// ─── API Helpers ──────────────────────────────────────

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

// ─── Event Delegation for File List ───────────────────

fileList.addEventListener('click', function(e) {
  var li = e.target.closest('.file-item');
  if (!li) return;

  var name = li.dataset.name;
  var targetPath = li.dataset.path;
  var isDir = li.dataset.isDir === 'true';

  // Action buttons
  var actionBtn = e.target.closest('.action-btn');
  if (actionBtn) {
    e.stopPropagation();
    if (actionBtn.classList.contains('edit')) openEditor(name);
    else if (actionBtn.classList.contains('download')) downloadFile(name);
    else if (actionBtn.classList.contains('delete')) showDeleteConfirm(name, isDir);
    return;
  }

  // Navigate or open
  if (isDir) {
    loadDir(targetPath);
  } else {
    openEditor(name);
  }
});

// ─── File Manager ─────────────────────────────────────

async function loadDir(dirPath) {
  currentPath = dirPath;
  try {
    var data = await api('/api/files?path=' + encodeURIComponent(dirPath));
    renderFileList(data.items, data.path);
    updateBreadcrumb(data.path);
    cwdDisplay.innerHTML = '<i class="fas fa-folder"></i> ' + escapeHtml(data.path);
  } catch (err) {
    toast(err.message, 'fa-circle-exclamation', 'var(--danger)');
  }
}

function renderFileList(items, dirPath) {
  fileList.innerHTML = '';

  // Parent directory
  if (dirPath !== '/') {
    var parentLi = document.createElement('li');
    parentLi.className = 'file-item';
    parentLi.dataset.name = '..';
    parentLi.dataset.isDir = 'true';
    parentLi.dataset.path = dirname(dirPath);
    parentLi.innerHTML = '<i class="fas fa-arrow-up icon"></i><span class="name">..</span><span class="meta"></span>';
    fileList.appendChild(parentLi);
  }

  if (items.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<i class="fas fa-folder-open"></i><p>Empty directory</p>';
    fileList.appendChild(empty);
    return;
  }

  items.forEach(function(item, idx) {
    var li = document.createElement('li');
    li.className = 'file-item';
    li.style.animationDelay = (idx * 0.03) + 's';
    li.dataset.name = item.name;
    li.dataset.isDir = item.isDirectory ? 'true' : 'false';
    li.dataset.path = joinPath(dirPath, item.name);

    if (item.isDirectory) {
      li.innerHTML =
        '<i class="fas fa-folder icon folder"></i>' +
        '<span class="name">' + escapeHtml(item.name) + '</span>' +
        '<span class="meta">DIR</span>' +
        '<div class="actions">' +
        '<button class="action-btn delete" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>';
    } else {
      var ext = getExtension(item.name);
      li.innerHTML =
        '<i class="fas ' + getIconClass(ext) + ' icon file"></i>' +
        '<span class="name">' + escapeHtml(item.name) + '</span>' +
        '<span class="meta">' + formatSize(item.size) + '</span>' +
        '<div class="actions">' +
        '<button class="action-btn edit" title="Edit"><i class="fas fa-pen-to-square"></i></button>' +
        '<button class="action-btn download" title="Download"><i class="fas fa-download"></i></button>' +
        '<button class="action-btn delete" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>';
    }

    fileList.appendChild(li);
  });
}

function getExtension(name) {
  var i = name.lastIndexOf('.');
  return i > 0 ? name.substring(i + 1).toLowerCase() : '';
}

function getIconClass(ext) {
  var map = {
    sh: 'fa-file-lines', py: 'fa-file-code', js: 'fa-file-code', ts: 'fa-file-code',
    css: 'fa-file-code', html: 'fa-file-code', json: 'fa-file-code',
    yml: 'fa-file-code', yaml: 'fa-file-code', md: 'fa-file-lines',
    txt: 'fa-file-lines', log: 'fa-file-lines', asciinema: 'fa-file-video',
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

// ─── Breadcrumb ───────────────────────────────────────

function updateBreadcrumb(dirPath) {
  breadcrumb.innerHTML = '';
  var parts = dirPath.split('/').filter(Boolean);

  var root = document.createElement('span');
  root.className = 'breadcrumb-item' + (parts.length === 0 ? ' active' : '');
  root.textContent = 'work';
  if (parts.length > 0) root.addEventListener('click', function() { loadDir('/'); });
  breadcrumb.appendChild(root);

  var built = '';
  parts.forEach(function(part, i) {
    var sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = ' / ';
    breadcrumb.appendChild(sep);

    built += '/' + part;
    var item = document.createElement('span');
    var isLast = (i === parts.length - 1);
    item.className = 'breadcrumb-item' + (isLast ? ' active' : '');
    item.textContent = part;
    if (!isLast) item.addEventListener('click', function() { loadDir(built); });
    breadcrumb.appendChild(item);
  });
}

// ─── Delete Confirmation ──────────────────────────────

var selectedFile = null;

function showDeleteConfirm(name, isDir) {
  selectedFile = { name: name, isDir: isDir };
  document.getElementById('confirm-text').textContent =
    (isDir ? 'Delete folder' : 'Delete file') + ' "' + name + '"? This cannot be undone.';
  confirmModal.classList.add('active');
}

document.getElementById('confirm-action').addEventListener('click', function() {
  if (selectedFile) {
    var filePath = joinPath(currentPath, selectedFile.name);
    api('/api/file?path=' + encodeURIComponent(filePath), { method: 'DELETE' })
      .then(function() {
        toast('Deleted: ' + selectedFile.name, 'fa-trash', 'var(--danger)');
        loadDir(currentPath);
      })
      .catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
  }
  confirmModal.classList.remove('active');
});

document.getElementById('confirm-modal-close').addEventListener('click', function() {
  confirmModal.classList.remove('active');
});

// ─── Upload ───────────────────────────────────────────

document.getElementById('upload-btn').addEventListener('click', function() {
  uploadModal.classList.add('active');
});

document.getElementById('upload-modal-close').addEventListener('click', function() {
  uploadModal.classList.remove('active');
});

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

function handleFiles(files) {
  if (!files.length) return;
  uploadProgressDiv.style.display = 'block';

  Array.from(files).forEach(function(file) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', function(e) {
      if (e.lengthComputable) {
        var pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = 'Uploading ' + file.name + ': ' + pct + '%';
      }
    });

    xhr.addEventListener('load', function() {
      if (xhr.status === 200) {
        toast('Uploaded: ' + file.name, 'fa-check-circle', 'var(--success)');
        loadDir(currentPath);
      } else {
        toast('Upload failed: ' + file.name, 'fa-circle-exclamation', 'var(--danger)');
      }
      progressFill.style.width = '0%';
      setTimeout(function() { uploadProgressDiv.style.display = 'none'; }, 1500);
    });

    xhr.addEventListener('error', function() {
      toast('Upload error: ' + file.name, 'fa-circle-exclamation', 'var(--danger)');
      progressFill.style.width = '0%';
      setTimeout(function() { uploadProgressDiv.style.display = 'none'; }, 1500);
    });

    xhr.send(formData);
  });

  fileInput.value = '';
}

// ─── New File / Directory ─────────────────────────────

document.getElementById('new-file-btn').addEventListener('click', function() {
  newfileModal.classList.add('active');
  document.getElementById('newfile-type').value = 'file';
  document.getElementById('newfile-name').value = '';
  setTimeout(function() { document.getElementById('newfile-name').focus(); }, 100);
});

document.getElementById('new-dir-btn').addEventListener('click', function() {
  newfileModal.classList.add('active');
  document.getElementById('newfile-type').value = 'directory';
  document.getElementById('newfile-name').value = '';
  setTimeout(function() { document.getElementById('newfile-name').focus(); }, 100);
});

document.getElementById('newfile-modal-close').addEventListener('click', function() {
  newfileModal.classList.remove('active');
});

document.getElementById('newfile-submit').addEventListener('click', function() {
  var name = document.getElementById('newfile-name').value.trim();
  var type = document.getElementById('newfile-type').value;
  if (!name) { toast('Please enter a name.', 'fa-circle-exclamation', 'var(--warning)'); return; }

  var filePath = joinPath(currentPath, name);

  if (type === 'directory') {
    api('/api/file?path=' + encodeURIComponent(filePath), {
      method: 'PUT',
      body: JSON.stringify({ _isDir: true }),
    }).then(function() {
      toast('Created folder: ' + name, 'fa-folder-plus', 'var(--accent)');
      newfileModal.classList.remove('active');
      loadDir(currentPath);
    }).catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
  } else {
    api('/api/file?path=' + encodeURIComponent(filePath), {
      method: 'PUT',
      body: JSON.stringify({ content: '' }),
    }).then(function() {
      toast('Created file: ' + name, 'fa-file-circle-plus', 'var(--success)');
      newfileModal.classList.remove('active');
      loadDir(currentPath);
    }).catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
  }
});

// ─── File Editor ──────────────────────────────────────

document.getElementById('editor-modal-close').addEventListener('click', closeEditor);

function openEditor(fileName) {
  var filePath = joinPath(currentPath, fileName);
  var nameEl = document.getElementById('editor-filename');
  nameEl.textContent = fileName;

  api('/api/file?path=' + encodeURIComponent(filePath))
    .then(function(data) {
      editingOriginalContent = data.content;
      editorModal.classList.add('active');

      var ext = getExtension(fileName);
      var modeMap = {
        py: 'python', js: 'javascript', ts: 'javascript', sh: 'shell',
        css: 'css', html: 'htmlmixed', json: 'javascript',
        yml: 'yaml', yaml: 'yaml', md: 'markdown', xml: 'xml',
      };
      var mode = modeMap[ext] || null;

      var editorEl = document.getElementById('editor');
      editorInstance = CodeMirror(editorEl, {
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

      editorInstance.on('change', function() {
        nameEl.innerHTML = '<i class="fas fa-pen" style="font-size:0.8rem"></i> ' +
          escapeHtml(fileName) +
          ' <span style="color:var(--warning);font-size:0.75rem;font-weight:400;">(unsaved)</span>';
      });

      setTimeout(function() {
        editorInstance.setSize('100%', '100%');
        editorInstance.refresh();
      }, 80);
    })
    .catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
}

function saveEditor(fileName) {
  if (!editorInstance) return;
  var filePath = joinPath(currentPath, fileName);
  api('/api/file?path=' + encodeURIComponent(filePath), {
    method: 'PUT',
    body: JSON.stringify({ content: editorInstance.getValue() }),
  }).then(function() {
    editingOriginalContent = editorInstance.getValue();
    document.getElementById('editor-filename').textContent = fileName;
    toast('Saved: ' + fileName, 'fa-check-circle', 'var(--success)');
  }).catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
}

document.getElementById('editor-save').addEventListener('click', function() {
  var nameEl = document.getElementById('editor-filename');
  var fileName = nameEl.textContent.replace(/.*?([^\/]+)$/, function(_, m) { return m; }).trim();
  saveEditor(fileName);
});

function closeEditor() {
  if (!editorInstance) { editorModal.classList.remove('active'); return; }
  if (editorInstance.getValue() !== editingOriginalContent) {
    if (!confirm('You have unsaved changes. Close without saving?')) return;
  }
  editorModal.classList.remove('active');
  editorInstance.toTextArea();
  editorInstance = null;
}

// ─── Download ─────────────────────────────────────────

function downloadFile(fileName) {
  var filePath = joinPath(currentPath, fileName);
  window.open('/api/download?path=' + encodeURIComponent(filePath), '_blank');
}

// ─── Refresh ──────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', function() {
  toast('Refreshing...', 'fa-rotate fa-spin', 'var(--accent)');
  loadDir(currentPath);
});

// ─── Init ─────────────────────────────────────────────

loadDir('/');