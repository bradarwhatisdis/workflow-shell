/**
 * Full-text file search — debounced workspace search with result rendering.
 */
'use strict';

import { state, dom } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { toast } from './toast.js';
import { loadDir } from './fileManager.js';
import { openEditor } from './editor.js';

/** Debounce timer handle for search input. */
let searchTimer = null;

/** @type {Array|null} */
let _lastSearchResults = null;

/** @type {string} */
let _lastSearchQuery = '';

/** Stored switchPaneTab callback from initSearchEvents. */
let _switchPaneTab = null;

// ─── Search Execution ──────────────────────────────────────────────────────

/**
 * Perform a full-text file search across the workspace.
 * @param {string} query
 */
function doFileSearch(query) {
  _lastSearchQuery = query;
  var body = document.getElementById('search-results-body');
  if (!query || query.length < 2) {
    body.innerHTML = '<div class="search-empty"><i class="fas fa-search"></i><p>Type at least 2 characters</p></div>';
    _lastSearchResults = null;
    return;
  }
  body.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
  if (_switchPaneTab) _switchPaneTab('search-results');
  api('/api/search?q=' + encodeURIComponent(query))
    .then(function(data) {
      _lastSearchResults = data.results || [];
      renderSearchResults(_lastSearchResults, query);
    })
    .catch(function(err) {
      body.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

// ─── Result Rendering ──────────────────────────────────────────────────────

/**
 * Render search results into the search-results panel body.
 * @param {Array} results
 * @param {string} query
 */
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
      var line = parseInt(this.dataset.line, 10);
      var filePath = file;
      api('/api/file?path=' + encodeURIComponent(filePath)).then(function(data) {
        state.currentPath = '/' + file.split('/').slice(0, -1).join('/');
        state.items = [];
        openEditor(data.name);
      }).catch(function(err) {
        toast('Cannot open: ' + err.message, 'fa-circle-exclamation', 'var(--danger)');
      });
    });
  });
}

// ─── Event Wiring ──────────────────────────────────────────────────────────

/**
 * Wire search-related UI events.
 * @param {Function} onSwitchTab - callback to switch pane tabs
 */
function initSearchEvents(onSwitchTab) {
  _switchPaneTab = onSwitchTab;

  // ── Global search input with debounce ──────────────────────────────────
  var searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var val = this.value.trim();
      clearTimeout(searchTimer);
      if (val.length >= 2) {
        searchTimer = setTimeout(function() { doFileSearch(val); }, 400);
      } else {
        document.getElementById('search-results-body').innerHTML =
          '<div class="search-empty"><i class="fas fa-search"></i><p>Type at least 2 characters</p></div>';
      }
    });
  }

  // ── Search results pane-tab click ──────────────────────────────────────
  var searchTab = document.querySelector('.pane-tab[data-tab="search-results"]');
  if (searchTab) {
    searchTab.addEventListener('click', function() {
      if (!_lastSearchResults) {
        document.getElementById('search-results-body').innerHTML =
          '<div class="search-empty"><i class="fas fa-search"></i><p>Use the search bar in the topbar to search files</p></div>';
        return;
      }
      renderSearchResults(_lastSearchResults, _lastSearchQuery);
    });
  }
}

export { doFileSearch, renderSearchResults, initSearchEvents };
