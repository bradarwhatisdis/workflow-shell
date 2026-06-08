/**
 * Global keyboard shortcuts.
 * Uses init pattern: callbacks are injected to avoid circular dependencies.
 */
import { dom } from './state.js';
import { state } from './state.js';
import { toast } from './toast.js';

/**
 * Wire global document keydown shortcuts.
 * @param {Object} callbacks - { hideSearch, toggleSearch, showNewFile, loadDir, toggleHelp, togglePalette, hideContextMenu, startRename, showDeleteConfirm, openEditor }
 */
export function initKeyboardShortcuts(callbacks) {
  document.addEventListener('keydown', function(e) {
    // Escape: close context menu, hide search, close modals
    if (e.key === 'Escape') {
      if (dom.contextMenu.classList.contains('visible')) {
        if (callbacks.hideContextMenu) callbacks.hideContextMenu();
        return;
      }
      if (callbacks.hideSearch) callbacks.hideSearch();
      document.querySelectorAll('.modal-overlay.active').forEach(function(m) {
        m.classList.remove('active');
      });
    }

    // Ctrl+ shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'f') { e.preventDefault(); if (callbacks.toggleSearch) callbacks.toggleSearch(); }
      if (e.key === 'n') { e.preventDefault(); if (callbacks.showNewFile) callbacks.showNewFile(); }
      if (e.key === 'r') {
        e.preventDefault();
        if (callbacks.loadDir) callbacks.loadDir(state.currentPath);
        toast('Refreshed', 'fa-rotate', 'var(--accent)');
      }
      if (e.key === 'f' && e.shiftKey) {
        e.preventDefault();
        var globalSearchBar = document.getElementById('global-search-bar');
        var globalSearchInput = document.getElementById('global-search-input');
        if (globalSearchBar) {
          globalSearchBar.classList.toggle('active');
          if (globalSearchBar.classList.contains('active') && globalSearchInput) {
            globalSearchInput.focus();
          }
        }
      }
    }

    // Arrow keys: file list navigation
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
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

    // Enter on focused item
    if (e.key === 'Enter' && state.focusedIndex >= 0 && !e.target.closest('input,textarea')) {
      e.preventDefault();
      var items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      var li = items[state.focusedIndex];
      if (li) {
        if (li.dataset.isDir === 'true') {
          if (callbacks.loadDir) callbacks.loadDir(li.dataset.path);
        } else {
          if (callbacks.openEditor) callbacks.openEditor(li.dataset.name);
        }
      }
    }

    // F2: rename selected
    if (e.key === 'F2') {
      e.preventDefault();
      var items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      var li = items[state.focusedIndex];
      if (li && callbacks.startRename) callbacks.startRename(li);
    }

    // Delete key: delete selected
    if (e.key === 'Delete') {
      if (state.focusedIndex < 0) return;
      var items = dom.fileList.querySelectorAll('.file-item:not(.parent-item)');
      var li = items[state.focusedIndex];
      if (li && !e.target.closest('input') && callbacks.showDeleteConfirm) {
        callbacks.showDeleteConfirm(li.dataset.name, li.dataset.isDir === 'true');
      }
    }

    // ? toggle help
    if (e.key === '?' && !e.target.closest('input')) {
      if (callbacks.toggleHelp) callbacks.toggleHelp();
    }

    // Enter in search input blurs
    if (e.key === 'Enter' && dom.searchInput === document.activeElement) {
      dom.searchInput.blur();
    }

    // Ctrl+Shift+P: command palette
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      if (callbacks.togglePalette) callbacks.togglePalette();
    }
  });
}
