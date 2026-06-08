// ─── WebSocket Router ────────────────────────────────────────────────────

const WS_HEARTBEAT_INTERVAL = 30000;

/**
 * Validate WebSocket origin against the server host.
 * Returns true if the origin is allowed, false otherwise.
 * When AUTH_ENABLED is false, all origins are allowed.
 */
function wsOriginCheck(ws, req, AUTH_ENABLED) {
  const origin = req.headers.origin;
  if (!origin || !AUTH_ENABLED) return true;
  try {
    const originHost = new URL(origin).host;
    const serverHost = req.headers.host;
    if (originHost === serverHost || originHost.endsWith('.trycloudflare.com')) return true;
  } catch (e) {}
  ws.close(4001, 'Origin not allowed');
  return false;
}

/**
 * Require WebSocket authentication handshake.
 * Waits up to 5 seconds for an 'auth' message with a valid session token.
 * Calls callback() on success, closes the socket on failure.
 */
function requireWsAuth(ws, callback, deps) {
  const { AUTH_ENABLED, sessions, SESSION_TTL } = deps;
  if (!AUTH_ENABLED) {
    callback();
    return;
  }

  const timeout = setTimeout(() => {
    ws.removeAllListeners('message');
    ws.close(4001, 'Authentication timeout');
  }, 5000);

  ws.once('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'auth' && msg.token) {
        const entry = sessions.get(msg.token);
        if (entry && Date.now() - entry.time < SESSION_TTL) {
          entry.time = Date.now();
          clearTimeout(timeout);
          callback();
          return;
        }
      }
    } catch (e) {}
    clearTimeout(timeout);
    ws.close(4001, 'Authentication required');
  });
}

module.exports = function (wss, deps) {
  const {
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
  } = deps;

  const authDeps = { AUTH_ENABLED, sessions, SESSION_TTL };

  const handleTerminalWS = require('./terminal');
  const handleInstallWS = require('./install');
  const handleVncWS = require('./vnc');
  const handleWatchWS = require('./watch');

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (!wsOriginCheck(ws, req, AUTH_ENABLED)) return;

    if (pathname === '/install') {
      return handleInstallWS(ws, url, {
        requireWsAuth: (ws, cb) => requireWsAuth(ws, cb, authDeps),
        installState,
        startVNCServer,
        INSTALL_SCRIPT,
        log,
      });
    }

    if (pathname === '/vnc') {
      return handleVncWS(ws, url, {
        requireWsAuth: (ws, cb) => requireWsAuth(ws, cb, authDeps),
        net,
        sessions,
        SESSION_TTL,
        VNC_RFB_PORT,
        log,
      });
    }

    if (pathname === '/watch') {
      return handleWatchWS(ws, url, {
        requireWsAuth: (ws, cb) => requireWsAuth(ws, cb, authDeps),
        watchClients,
      });
    }

    handleTerminalWS(ws, url, {
      requireWsAuth: (ws, cb) => requireWsAuth(ws, cb, authDeps),
      pty,
      WORKSPACE,
      log,
    });
  });

  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch (e) {}
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    });
  }, WS_HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  return heartbeatTimer;
};
