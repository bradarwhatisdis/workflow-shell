/**
 * Welcome overlay (first-visit) and file-preview overlay (images, PDF, video).
 */
import { getSessionToken } from './api.js';
import { escapeHtml, getExtension, joinPath } from './utils.js';

var previewExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'pdf', 'mp4', 'webm', 'ogg', 'mov'];

/** Show welcome overlay if not dismissed, fetch workspace path */
export function initWelcomeOverlay() {
  var overlay = document.getElementById('welcome-overlay');
  var dismiss = document.getElementById('welcome-dismiss');
  var workspaceEl = document.getElementById('welcome-workspace');
  if (!overlay || !dismiss) return;

  if (localStorage.getItem('wfs-welcome-dismissed')) {
    overlay.style.display = 'none';
  }

  fetch('/api/cwd', { headers: { 'x-session-token': getSessionToken() } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (workspaceEl) workspaceEl.textContent = 'Workspace: ' + (d.path || d.cwd || '');
    }).catch(function() { /* ignore */ });

  dismiss.addEventListener('click', function() {
    overlay.style.display = 'none';
    localStorage.setItem('wfs-welcome-dismissed', '1');
  });
}

/** Show preview overlay for image, PDF, or video files */
export function showPreview(fileName, filePath) {
  var previewOverlay = document.getElementById('preview-overlay');
  var previewBody = document.getElementById('preview-body');
  var previewFilename = document.getElementById('preview-filename');
  if (!previewOverlay || !previewBody || !previewFilename) return;

  previewFilename.textContent = fileName;
  var ext = getExtension(fileName);
  previewBody.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i></div>';
  var token = getSessionToken();

  var previewUrl = '/api/file?path=' + encodeURIComponent(filePath) + '&download=1';
  fetch(previewUrl, { headers: { 'x-session-token': token } })
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to load');
      return r.blob();
    })
    .then(function(blob) {
      var url = URL.createObjectURL(blob);
      previewBody.innerHTML = '';
      if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].indexOf(ext) !== -1) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = fileName;
        img.onerror = function() { previewBody.innerHTML = '<div class="search-empty"><i class="fas fa-file-image"></i><p>Failed to load image</p></div>'; };
        previewBody.appendChild(img);
      } else if (ext === 'pdf') {
        var iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.title = fileName;
        previewBody.appendChild(iframe);
      } else if (['mp4', 'webm', 'ogg', 'mov'].indexOf(ext) !== -1) {
        var video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        var source = document.createElement('source');
        source.src = url;
        source.type = 'video/' + ext;
        video.appendChild(source);
        previewBody.appendChild(video);
      }
    })
    .catch(function() {
      previewBody.innerHTML = '<div class="search-empty"><i class="fas fa-eye"></i><p>Preview not available. Open in editor instead.</p></div>';
    });

  previewOverlay.style.display = 'flex';
  var container = document.getElementById('terminal-container');
  if (container) container.style.display = 'none';
}

/** Wire preview close button and patch openEditor to intercept previewable files */
export function initPreviewEvents(openEditor) {
  var previewClose = document.getElementById('preview-close');
  if (previewClose) {
    previewClose.addEventListener('click', function() {
      document.getElementById('preview-overlay').style.display = 'none';
      var container = document.getElementById('terminal-container');
      if (container) container.style.display = 'flex';
    });
  }

  // Return patched openEditor that intercepts previewable files
  var previewOverlay = document.getElementById('preview-overlay');
  if (typeof openEditor === 'function' && previewOverlay) {
    var origOpenEditor = openEditor;
    return function patchedOpenEditor(fileName) {
      var ext = getExtension(fileName);
      if (previewExtensions.indexOf(ext) !== -1) {
        var filePath = joinPath(state.currentPath, fileName);
        showPreview(fileName, filePath);
        return;
      }
      return origOpenEditor(fileName);
    };
  }
}
