/**
 * System Stats panel — disk, memory, CPU, and uptime display.
 */
'use strict';

import { dom } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

/** Stats auto-refresh timer handle (currently unused, reserved). */
let statsTimer = null;

/**
 * Build a single stat card HTML string.
 * @param {string} label
 * @param {string|number} value
 * @param {string} color - CSS class suffix (green, yellow, red, accent)
 * @returns {string} HTML
 */
function statCard(label, value, color) {
  return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value ' + (color || '') + '">' + escapeHtml(String(value)) + '</div></div>';
}

/**
 * Fetch system stats from the API and render the stat grid.
 */
function loadStats() {
  var body = document.getElementById('stats-body');
  body.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i> Loading stats...</div>';
  api('/api/system-stats')
    .then(function(d) {
      var html = '';
      html += '<div class="stat-grid">';
      html += statCard('Disk Size', d.disk.size, 'green');
      html += statCard('Disk Used', d.disk.used, d.disk.usePercent && parseInt(d.disk.usePercent) > 80 ? 'red' : 'yellow');
      html += statCard('Disk Avail', d.disk.avail, 'green');
      html += statCard('Disk Use', d.disk.usePercent || '0%', parseInt(d.disk.usePercent) > 80 ? 'red' : 'green');
      html += statCard('Memory Total', d.memory.total, 'accent');
      html += statCard('Memory Used', d.memory.used, parseInt(d.memory.used) > 4096 ? 'yellow' : 'green');
      html += statCard('Memory Free', d.memory.free, 'green');
      html += statCard('Memory Avail', d.memory.avail || '-', 'green');
      html += statCard('CPU Load (1m)', d.load['1min'], parseFloat(d.load['1min']) > 2 ? 'red' : 'green');
      html += statCard('CPU Load (5m)', d.load['5min'], parseFloat(d.load['5min']) > 2 ? 'yellow' : 'green');
      html += statCard('CPU Load (15m)', d.load['15min'], 'green');
      html += statCard('Processes', d.processes, 'accent');
      html += '</div>';
      html += '<div style="text-align:center;color:var(--text-muted);font-size:0.78rem"><i class="fas fa-clock"></i> Uptime: ' + escapeHtml(d.uptime) + '</div>';
      body.innerHTML = html;
    })
    .catch(function(err) {
      body.innerHTML = '<div class="search-empty"><i class="fas fa-exclamation-circle"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
}

/**
 * Wire stats pane-tab click to loadStats.
 */
function initStatsEvents() {
  var statsTab = document.querySelector('.pane-tab[data-tab="stats"]');
  if (statsTab) {
    statsTab.addEventListener('click', function() {
      loadStats();
    });
  }
}

export { loadStats, initStatsEvents };
