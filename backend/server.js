'use strict';

/**
 * Workflow Shell — refactored entry point.
 *
 * Wires together all extracted modules via dependency injection.
 * Server lifecycle: config → services → middleware → routes → WebSocket → start
 */

// ─── Core Dependencies ──────────────────────────────────────────────────────

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');
const pty = require('node-pty');

// ─── Config ─────────────────────────────────────────────────────────────────

const {
  PORT,
  WORKSPACE,
  AUTH_ENABLED,
  AUTH_USER,
  AUTH_PASS,
  SESSION_TTL,
  PUBLIC_PATHS,
  QUICK_ACTIONS_PATH,
  REPO_ROOT,
  INSTALL_SCRIPT,
  VNC_RFB_PORT,
  NOVNC_DIR,
  UPDATE_POLL_INTERVAL,
} = require('./config');

// ─── Services ───────────────────────────────────────────────────────────────

const { log }                 = require('./services/logger');
const { sessions }            = require('./services/auth');
const { generateToken }       = require('./services/auth');
const { loginRateLimit }      = require('./services/auth');
const { getSafePath,
        sanitizeFilename,
        isPrivateHostname,
        getResolvedWorkspace } = require('./services/files');
const { killRateLimiter,
        quickActionsRateLimiter } = require('./services/rateLimiter');
const { installState,
        startVNCServer,
        stopVNCServer }       = require('./services/vnc');
const { watchClients,
        fileWatcher,
        startFileWatcher }    = require('./services/fileWatcher');
const { updateStatus,
        checkForUpdates }     = require('./services/updates');

// ─── Middleware ──────────────────────────────────────────────────────────────

const authMiddlewareFactory  = require('./middleware/auth');
const createUploadMiddleware = require('./middleware/upload');
const securityHeaders        = require('./middleware/security');
const safeError              = require('./middleware/error');

// ─── Express App ────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ─── Body Parsing & Static Files ───────────────────────────────────────────

const VENDOR_DIR = path.join(__dirname, 'node_modules');

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Security Headers ───────────────────────────────────────────────────────

app.use(securityHeaders);

// ─── Session Auth Middleware ────────────────────────────────────────────────

const { authMiddleware } = authMiddlewareFactory({
  AUTH_ENABLED,
  sessions,
  SESSION_TTL,
  PUBLIC_PATHS,
});
app.use(authMiddleware);

// ─── Vendor Static Files ────────────────────────────────────────────────────

app.use('/vendor/xterm', express.static(path.join(VENDOR_DIR, 'xterm')));
app.use('/vendor/xterm-addon-fit', express.static(path.join(VENDOR_DIR, 'xterm-addon-fit')));

// ─── noVNC (download on first run if missing) ───────────────────────────────

(function ensureNovnc() {
  if (fs.existsSync(NOVNC_DIR + '/core/rfb.js')) {
    app.use('/novnc', express.static(NOVNC_DIR));
    log('info', 'noVNC served from ' + NOVNC_DIR);
    return;
  }
  log('info', 'noVNC not found at ' + NOVNC_DIR + ' — attempting to download...');
  try {
    const tmp = '/tmp/novnc-repo';
    spawnSync('rm', ['-rf', tmp]);
    spawnSync('git', ['clone', '--depth', '1', 'https://github.com/novnc/noVNC.git', tmp], { stdio: 'pipe', timeout: 30000 });
    spawnSync('mkdir', ['-p', path.dirname(NOVNC_DIR)]);
    spawnSync('mv', [tmp, NOVNC_DIR], { stdio: 'pipe' });
    spawnSync('rm', ['-rf', tmp]);
    if (fs.existsSync(NOVNC_DIR + '/core/rfb.js')) {
      app.use('/novnc', express.static(NOVNC_DIR));
      log('info', 'noVNC downloaded and served from ' + NOVNC_DIR);
    } else {
      log('info', 'noVNC download failed — Desktop tab unavailable');
    }
  } catch (e) {
    log('info', 'noVNC download error: ' + e.message);
  }
})();

// ─── WebSocket Setup ────────────────────────────────────────────────────────

const wsDeps = {
  AUTH_ENABLED,
  sessions,
  SESSION_TTL,
  log,
  net,
  pty,
  WORKSPACE,
  installState,
  startVNCServer,
  INSTALL_SCRIPT,
  VNC_RFB_PORT,
  watchClients,
};

const heartbeatTimer = require('./websocket/index')(wss, wsDeps);

// ─── Graceful Shutdown (after WS — needs heartbeatTimer) ────────────────────

function gracefulShutdown(reason) {
  require('./utils/gracefulShutdown')(reason, {
    stopVNCServer,
    fileWatcher,
    heartbeatTimer,
    wss,
    server,
    log,
  });
}

// ─── Routes (dependency injection) ─────────────────────────────────────────

const routeDeps = {
  // Auth
  sessions,
  generateToken,
  loginRateLimit,
  AUTH_ENABLED,
  AUTH_USER,
  AUTH_PASS,
  // Files
  getSafePath,
  sanitizeFilename,
  isPrivateHostname,
  getResolvedWorkspace,
  // Middleware
  safeError,
  uploadMiddleware: createUploadMiddleware,
  // Rate limiting
  killRateLimiter,
  quickActionsRateLimiter,
  // Config
  QUICK_ACTIONS_PATH,
  REPO_ROOT,
  WORKSPACE,
  // Shared state
  updateStatus,
  gracefulShutdown,
  // Logging
  log,
};

require('./routes/tunnel')(app, { log });
require('./routes/auth')(app, routeDeps);
require('./routes/files')(app, routeDeps);
require('./routes/quickActions')(app, routeDeps);
require('./routes/system')(app, { ...routeDeps, child_process: require('child_process') });
require('./routes/control')(app, routeDeps);

// ─── Start ─────────────────────────────────────────────────────────────────
// ─── Update Checker ─────────────────────────────────────────────────────────

setTimeout(checkForUpdates, 3000);
setInterval(checkForUpdates, UPDATE_POLL_INTERVAL);

// ─── Listen ────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  log('info', 'workflow-shell running on port ' + PORT);
  log('info', 'Workspace: ' + WORKSPACE);
  startFileWatcher();
});
