/**
 * Drag-to-move files: drag file items onto folder items to move them.
 */
import { dom, state } from './state.js';
import { api } from './api.js';
import { toast } from './toast.js';

/** Wire drag-and-drop events for moving files between directories */
export function initDragDropMove(loadDir) {
  // Drag start: set transfer data to the file path
  document.addEventListener('dragstart', function(e) {
    var li = e.target.closest('.file-item');
    if (!li || li.classList.contains('parent-item')) return;
    var path = li.dataset.path;
    if (path) e.dataTransfer.setData('text/plain', path);
  });

  // Drag over: highlight valid drop targets (directories)
  document.addEventListener('dragover', function(e) {
    var li = e.target.closest('.file-item');
    if (li && li.dataset.isDir === 'true' && !li.classList.contains('parent-item')) {
      e.preventDefault();
      li.classList.add('highlighted');
    }
  });

  // Drag leave: remove highlight
  document.addEventListener('dragleave', function(e) {
    var li = e.target.closest('.file-item');
    if (li) li.classList.remove('highlighted');
  });

  // Drop: move file to target directory
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
    dom.fileList.style.opacity = '0.5';
    dom.fileList.style.pointerEvents = 'none';
    api('/api/file/move', {
      method: 'POST',
      body: JSON.stringify({ from: from, to: to }),
    }).then(function() {
      dom.fileList.style.opacity = '';
      dom.fileList.style.pointerEvents = '';
      toast('Moved: ' + fileName, 'fa-arrows', 'var(--success)');
      loadDir(state.currentPath);
    }).catch(function(err) {
      dom.fileList.style.opacity = '';
      dom.fileList.style.pointerEvents = '';
      toast('Move failed: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
    });
  });
}
