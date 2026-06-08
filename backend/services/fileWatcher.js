/**
 * File watcher service.
 * Extracted from server.js — chokidar-based file change notification for WebSocket clients.
 */
'use strict';

const fs = require('fs');
const chokidar = require('chokidar');
const { WORKSPACE } = require('../config');

// ── State ──

const watchClients = new Set();
let fileWatcher = null;

// ── Functions ──

function startFileWatcher() {
  try { if (fileWatcher) fileWatcher.close(); } catch (e) {}

  if (!fs.existsSync(WORKSPACE)) {
    console.warn('[warn] Workspace not found, file watcher disabled');
    return;
  }

  let debounceTimer;
  try {
    fileWatcher = chokidar.watch(WORKSPACE, {
      ignored: /(^|[/\\])\..|node_modules/,
      persistent: true,
      ignoreInitial: true,
    });

    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const msg = JSON.stringify({ type: 'change' });
        watchClients.forEach(ws => {
          try { ws.send(msg); } catch (e) {}
        });
      }, 200);
    };

    fileWatcher.on('add', notify);
    fileWatcher.on('change', notify);
    fileWatcher.on('unlink', notify);
    fileWatcher.on('addDir', notify);
    fileWatcher.on('unlinkDir', notify);

    console.log('[info] File watcher started on ' + WORKSPACE);
  } catch (e) {
    console.warn('[warn] File watcher error:', e.message);
  }
}

module.exports = { watchClients, fileWatcher, startFileWatcher };
