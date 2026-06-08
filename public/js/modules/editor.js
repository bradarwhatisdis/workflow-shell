/**
 * Code editor module for Workflow Shell.
 * CodeMirror-based file editor with preview support for images, PDFs, and video.
 */
import { state, dom } from './state.js';
import { api, getSessionToken } from './api.js';
import { escapeHtml, joinPath, getExtension } from './utils.js';
import { toast } from './toast.js';

// ─── Previewable file types ──────────────────────────────────────────────────

const PREVIEW_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'pdf', 'mp4', 'webm', 'ogg', 'mov'];

// ─── Image/PDF/Video Preview ─────────────────────────────────────────────────

function showPreview(fileName, filePath) {
  const previewOverlay = document.getElementById('preview-overlay');
  const previewBody = document.getElementById('preview-body');
  const previewFilename = document.getElementById('preview-filename');
  if (!previewOverlay) return;

  previewFilename.textContent = fileName;
  previewBody.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i></div>';

  const token = getSessionToken();
  const ext = getExtension(fileName);

  fetch('/api/file?path=' + encodeURIComponent(filePath) + '&download=1', {
    headers: { 'x-session-token': token },
  })
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to load');
      return r.blob();
    })
    .then(function(blob) {
      const url = URL.createObjectURL(blob);
      previewBody.innerHTML = '';
      if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].indexOf(ext) !== -1) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = fileName;
        img.onerror = function() {
          previewBody.innerHTML = '<div class="search-empty"><i class="fas fa-file-image"></i><p>Failed to load image</p></div>';
        };
        previewBody.appendChild(img);
      } else if (ext === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.title = fileName;
        previewBody.appendChild(iframe);
      } else if (['mp4', 'webm', 'ogg', 'mov'].indexOf(ext) !== -1) {
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        const source = document.createElement('source');
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
  const container = document.getElementById('terminal-container');
  if (container) container.style.display = 'none';
}

// ─── Open Editor ─────────────────────────────────────────────────────────────

function openEditor(fileName) {
  const ext = getExtension(fileName);
  // Route previewable files to the preview overlay instead of CodeMirror
  if (PREVIEW_EXTS.indexOf(ext) !== -1) {
    const filePath = joinPath(state.currentPath, fileName);
    showPreview(fileName, filePath);
    return;
  }

  state.editingFileName = fileName;
  const filePath = joinPath(state.currentPath, fileName);
  const nameEl = document.getElementById('editor-filename');
  nameEl.innerHTML = '<i class="fas fa-file"></i> ' + escapeHtml(fileName);

  api('/api/file?path=' + encodeURIComponent(filePath))
    .then(function(data) {
      state.editingOriginalContent = data.content;
      dom.editorModal.classList.add('active');

      const modeMap = {
        py: 'python', js: 'javascript', ts: 'javascript', sh: 'shell',
        css: 'css', html: 'htmlmixed', json: 'javascript',
        yml: 'yaml', yaml: 'yaml', md: 'markdown', xml: 'xml',
        jsx: 'javascript', tsx: 'javascript', scss: 'css', less: 'css',
      };
      const mode = modeMap[ext] || null;

      const editorEl = document.getElementById('editor');
      state.editorInstance = window.CodeMirror(editorEl, {
        value: data.content,
        mode: mode,
        theme: 'material-palenight',
        lineNumbers: true,
        lineWrapping: true,
        indentWithTabs: true,
        tabSize: 2,
        autofocus: true,
        extraKeys: {
          'Ctrl-S': function() { saveEditor(state.editingFileName); },
          'Cmd-S': function() { saveEditor(state.editingFileName); },
        },
      });

      state.editorInstance.on('change', function() {
        nameEl.innerHTML =
          '<i class="fas fa-pen" style="font-size:0.8rem"></i> ' +
          escapeHtml(state.editingFileName) +
          ' <span style="color:var(--warning);font-size:0.75rem;font-weight:400;">(unsaved)</span>';
      });

      setTimeout(function() {
        state.editorInstance.setSize('100%', '100%');
        state.editorInstance.refresh();
      }, 80);
    })
    .catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
}

// ─── Save Editor ─────────────────────────────────────────────────────────────

function saveEditor(fileName) {
  if (!state.editorInstance) return;
  const filePath = joinPath(state.currentPath, fileName);
  api('/api/file?path=' + encodeURIComponent(filePath), {
    method: 'PUT',
    body: JSON.stringify({ content: state.editorInstance.getValue() }),
  }).then(function() {
    state.editingOriginalContent = state.editorInstance.getValue();
    document.getElementById('editor-filename').innerHTML = '<i class="fas fa-check-circle" style="color:var(--success)"></i> ' + escapeHtml(fileName);
    toast('Saved: ' + fileName, 'fa-check-circle', 'var(--success)');
  }).catch(function(err) { toast(err.message, 'fa-circle-exclamation', 'var(--danger)'); });
}

// ─── Close Editor ────────────────────────────────────────────────────────────

function closeEditor() {
  if (!state.editorInstance) { dom.editorModal.classList.remove('active'); return; }
  if (typeof state.editorInstance.getValue === 'function' &&
      state.editorInstance.getValue() !== state.editingOriginalContent) {
    if (!confirm('You have unsaved changes. Close without saving?')) return;
  }
  dom.editorModal.classList.remove('active');
  if (typeof state.editorInstance.toTextArea === 'function') {
    state.editorInstance.toTextArea();
  }
  state.editorInstance = null;
}

// ─── Init Editor Events ──────────────────────────────────────────────────────

function initEditorEvents() {
  // Editor modal close
  document.getElementById('editor-modal-close').addEventListener('click', closeEditor);

  // Editor save button
  document.getElementById('editor-save').addEventListener('click', function() {
    saveEditor(state.editingFileName);
  });

  // Window beforeunload — warn on unsaved changes
  window.addEventListener('beforeunload', function(e) {
    if (state.editorInstance && state.editorInstance.getValue() !== state.editingOriginalContent) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Preview close button
  const previewClose = document.getElementById('preview-close');
  if (previewClose) {
    previewClose.addEventListener('click', function() {
      document.getElementById('preview-overlay').style.display = 'none';
      const container = document.getElementById('terminal-container');
      if (container) container.style.display = 'flex';
    });
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  openEditor,
  saveEditor,
  closeEditor,
  initEditorEvents,
};
