/**
 * Git Status panel — branch, changes, and recent commits.
 */
'use strict';

import { dom } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

/**
 * Fetch git status from the API and render the panel.
 */
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
      if (d.branch === '(not a git repo)' || (!d.changes.length && (!d.log || !d.log.length))) {
        html = '<div class="git-section"><div class="git-section-title"><i class="fas fa-code-branch"></i> Branch</div>';
        html += '<div class="git-branch"><i class="fas fa-code-branch"></i> ' + escapeHtml(d.branch) + '</div></div>';
        if (!d.changes.length && (!d.log || !d.log.length)) {
          html += '<div class="search-empty"><i class="fas fa-code-branch"></i><p>No changes or commits yet</p></div>';
        }
      }
      body.innerHTML = html;
    })
    .catch(function(err) {
      body.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

/**
 * Wire git pane-tab click to loadGitStatus.
 */
function initGitEvents() {
  var gitTab = document.querySelector('.pane-tab[data-tab="git"]');
  if (gitTab) {
    gitTab.addEventListener('click', function() {
      loadGitStatus();
    });
  }
}

export { loadGitStatus, initGitEvents };
