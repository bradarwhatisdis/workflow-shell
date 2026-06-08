/**
 * Shared application state and DOM cache for Workflow Shell frontend.
 */
'use strict';

/** Central application state */
const state = {
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
  focusedIndex: -1,
};

/** Cached DOM element references — populated by initDom() */
const dom = {};

function initDom() {
  const ids = [
    'file-list', 'breadcrumb', 'workspace-path', 'file-count-badge',
    'file-list-status', 'file-skeleton', 'search-input', 'search-box',
    'search-toggle', 'search-clear', 'sort-bar', 'sort-btn', 'view-toggle',
    'context-menu', 'full-page-dropzone', 'upload-modal', 'editor-modal',
    'newfile-modal', 'rename-modal', 'confirm-modal', 'help-modal',
    'toast-container', 'file-toolbar',
  ];
  ids.forEach(id => { dom[id] = document.getElementById(id); });
}

export { state, dom, initDom };
