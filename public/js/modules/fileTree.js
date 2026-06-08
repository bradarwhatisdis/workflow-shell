/**
 * File tree module for Workflow Shell.
 * Collapsible directory tree and file tab switching.
 */
import { state, dom } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { loadDir } from './fileManager.js';
import { openEditor } from './editor.js';

// ─── Switch File Tab ─────────────────────────────────────────────────────────

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

// ─── Load File Tree ──────────────────────────────────────────────────────────

function loadFileTree() {
  const container = document.getElementById('file-tree');
  const status = document.getElementById('file-tree-status');
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

// ─── Render Tree ─────────────────────────────────────────────────────────────

function renderTree(items, container, basePath) {
  container.innerHTML = '';
  items.forEach(function(item) {
    const div = document.createElement('div');
    div.className = 'tree-item';
    if (item.isDirectory) {
      const hasChildren = item.children && item.children.length > 0;
      const toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.textContent = hasChildren ? '▸' : '';
      div.appendChild(toggle);
      const icon = document.createElement('span');
      icon.className = 'tree-icon folder';
      icon.innerHTML = '<i class="fas fa-folder"></i>';
      div.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = item.name;
      div.appendChild(name);
      const childPath = basePath === '/' ? '/' + item.name : basePath + '/' + item.name;
      div.addEventListener('click', function(e) {
        const childrenContainer = div.nextElementSibling;
        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {
          const isHidden = childrenContainer.style.display === 'none';
          childrenContainer.style.display = isHidden ? 'block' : 'none';
          toggle.textContent = isHidden ? '▾' : '▸';
        }
      });
      container.appendChild(div);
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      if (hasChildren) renderTree(item.children, childrenContainer, childPath);
      container.appendChild(childrenContainer);
    } else {
      const toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.textContent = '';
      div.appendChild(toggle);
      const icon = document.createElement('span');
      icon.className = 'tree-icon file';
      icon.innerHTML = '<i class="fas fa-file"></i>';
      div.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = item.name;
      div.appendChild(name);
      const filePath = basePath === '/' ? '/' + item.name : basePath + '/' + item.name;
      div.addEventListener('click', function() {
        state.currentPath = basePath;
        switchFileTab('files');
        loadDir(basePath);
        openEditor(item.name);
      });
      container.appendChild(div);
    }
  });
  if (!items.length) container.innerHTML = '<div class="search-empty"><i class="fas fa-folder-open"></i><p>Empty</p></div>';
}

// ─── Init File Tab Events ────────────────────────────────────────────────────

function initFileTabEvents() {
  document.querySelectorAll('.pane-header-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { switchFileTab(this.dataset.ftab); });
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  loadFileTree,
  renderTree,
  switchFileTab,
  initFileTabEvents,
};
