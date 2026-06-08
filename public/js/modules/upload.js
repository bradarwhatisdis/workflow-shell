/**
 * File upload module for Workflow Shell.
 * Handles drag-and-drop, file picker, URL uploads, and progress tracking.
 */
import { state, dom } from './state.js';
import { api, getSessionToken } from './api.js';
import { escapeHtml } from './utils.js';
import { toast } from './toast.js';
import { loadDir } from './fileManager.js';

// ─── Upload from URL ─────────────────────────────────────────────────────────

function uploadFromUrl(url) {
  const progressContainer = document.getElementById('progress-items');
  const item = document.createElement('div');
  item.className = 'progress-item';
  item.innerHTML =
    '<span class="progress-text"><i class="fas fa-spinner fa-spin" style="color:var(--text-muted)"></i> ' + escapeHtml(url) + '</span>' +
    '<div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>' +
    '<span class="progress-text" id="pct-url">Fetching...</span>';
  progressContainer.appendChild(item);

  api('/api/upload/url', {
    method: 'POST',
    body: JSON.stringify({ url: url, path: state.currentPath }),
  }).then(function(data) {
    item.querySelector('.progress-text:first-child').innerHTML = '<i class="fas fa-check-circle" style="color:var(--success)"></i> ' + escapeHtml(data.filename);
    item.querySelector('.progress-fill').style.width = '100%';
    item.querySelector('.progress-text:last-child').textContent = 'Done';
  }).catch(function(err) {
    item.querySelector('.progress-text:first-child').innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger)"></i> ' + escapeHtml(url);
    item.querySelector('.progress-text:last-child').textContent = err.message;
  });

  const uploadProgressDiv = document.getElementById('upload-progress');
  uploadProgressDiv.style.display = 'block';
  dom.uploadModal.classList.add('active');
}

// ─── Handle Files ────────────────────────────────────────────────────────────

function handleFiles(files) {
  if (!files.length) return;
  const uploadProgressDiv = document.getElementById('upload-progress');
  uploadProgressDiv.style.display = 'block';
  dom.uploadModal.classList.add('active');

  const progressContainer = document.getElementById('progress-items');
  progressContainer.innerHTML = '';

  Array.from(files).forEach(function(file) {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.innerHTML =
      '<span class="progress-text">' + escapeHtml(file.name) + '</span>' +
      '<div class="progress-bar"><div class="progress-fill" data-filename="' + escapeHtml(file.name) + '"></div></div>' +
      '<span class="progress-text" id="pct-' + escapeHtml(file.name) + '">0%</span>';
    progressContainer.appendChild(item);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', state.currentPath);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('x-session-token', getSessionToken());

    xhr.upload.addEventListener('progress', function(e) {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        const fill = item.querySelector('.progress-fill');
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

  const fileInput = document.getElementById('file-input');
  fileInput.value = '';
  setTimeout(function() { loadDir(state.currentPath); }, 500);
}

// ─── Init Upload Events ──────────────────────────────────────────────────────

function initUploadEvents() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  // Dropzone click → file picker
  dropzone.addEventListener('click', function() { fileInput.click(); });

  // Dropzone drag-over
  dropzone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  // Dropzone drag-leave
  dropzone.addEventListener('dragleave', function() {
    dropzone.classList.remove('drag-over');
  });

  // Dropzone drop
  dropzone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  // File input change
  fileInput.addEventListener('change', function() {
    handleFiles(fileInput.files);
  });

  // Upload button in toolbar
  document.getElementById('upload-btn').addEventListener('click', function() {
    dom.uploadModal.classList.add('active');
  });

  // Upload modal close
  document.getElementById('upload-modal-close').addEventListener('click', function() {
    dom.uploadModal.classList.remove('active');
  });

  // Upload URL button
  document.getElementById('upload-url-btn').addEventListener('click', function() {
    const urlInput = document.getElementById('upload-url-input');
    const url = urlInput.value.trim();
    if (!url) return;
    urlInput.value = '';
    uploadFromUrl(url);
  });

  // Upload URL input — Enter key
  document.getElementById('upload-url-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('upload-url-btn').click();
  });

  // Full-page dropzone events
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
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  uploadFromUrl,
  handleFiles,
  initUploadEvents,
};
