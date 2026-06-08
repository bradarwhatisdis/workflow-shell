/**
 * Update checker — polls /api/update-status, displays banner with pending commits.
 */
import { api, getSessionToken } from './api.js';
import { escapeHtml } from './utils.js';
import { toast } from './toast.js';

/** Initialise update-check banner and polling */
export function initUpdateChecker() {
  var topbar = document.querySelector('.topbar');
  if (!topbar) return;

  var banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML =
    '<div class="update-banner-body">' +
      '<i class="fas fa-arrow-up-from-bracket"></i>' +
      '<span class="update-banner-summary"></span>' +
      '<span class="update-banner-toggle">show details <i class="fas fa-chevron-down"></i></span>' +
    '</div>' +
    '<div class="update-banner-commits"></div>' +
    '<button class="update-banner-btn"><i class="fas fa-rotate"></i> Update</button>';
  topbar.insertAdjacentElement('afterend', banner);

  var bodyEl = banner.querySelector('.update-banner-body');
  var summaryEl = banner.querySelector('.update-banner-summary');
  var toggleEl = banner.querySelector('.update-banner-toggle');
  var commitsEl = banner.querySelector('.update-banner-commits');
  var btnEl = banner.querySelector('.update-banner-btn');
  var previousCount = 0;

  // Toggle commit details
  bodyEl.addEventListener('click', function() {
    commitsEl.classList.toggle('open');
    toggleEl.innerHTML = commitsEl.classList.contains('open')
      ? 'hide details <i class="fas fa-chevron-up"></i>'
      : 'show details <i class="fas fa-chevron-down"></i>';
  });

  // Update button
  btnEl.addEventListener('click', function() {
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    api('/api/update', { method: 'POST' })
      .then(function(d) { toast(d.message || 'Update started', 'fa-rotate', 'var(--accent)'); })
      .catch(function() { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-rotate"></i> Update'; });
  });

  // Poll for status
  function poll() {
    fetch('/api/update-status', { headers: { 'x-session-token': getSessionToken() } })
      .then(function(r) { return r.json(); })
      .then(function(status) {
        if (status.count > 0) {
          var newCount = status.count;
          summaryEl.textContent = newCount + ' new commit' + (newCount > 1 ? 's' : '') + ' available';

          if (newCount !== previousCount) {
            commitsEl.innerHTML = '';
            status.pending.forEach(function(c) {
              var div = document.createElement('div');
              div.className = 'update-banner-commit';
              div.innerHTML =
                '<div class="update-banner-commit-msg">' + escapeHtml(c.message) + '</div>' +
                '<div class="update-banner-commit-hash">' + escapeHtml(c.hash) + '</div>';
              if (c.files && c.files.length) {
                var filesDiv = document.createElement('div');
                filesDiv.className = 'update-banner-commit-files';
                c.files.forEach(function(f) {
                  var s = document.createElement('span');
                  s.textContent = f;
                  filesDiv.appendChild(s);
                });
                div.appendChild(filesDiv);
              }
              commitsEl.appendChild(div);
            });
            previousCount = newCount;
          }

          if (!banner.classList.contains('active')) {
            banner.classList.add('active');
          }
        } else {
          banner.classList.remove('active');
          previousCount = 0;
        }
      })
      .catch(function() { /* ignore polling errors */ });
  }

  poll();
  setInterval(poll, 10000);
}
