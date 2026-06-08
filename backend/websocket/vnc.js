// ─── VNC WebSocket Proxy ─────────────────────────────────────────

/**
 * Handle a VNC WebSocket connection.
 * Accepts token via query param (?token=xxx) for noVNC compatibility,
 * or falls back to the standard JSON auth handshake.
 */
function handleVncWS(ws, url, deps) {
  const { requireWsAuth, net, sessions, SESSION_TTL, VNC_RFB_PORT, log } = deps;

  // noVNC sends RFB data directly, not JSON auth messages.
  // Accept token via query param ?token=xxx for noVNC compatibility.
  const urlToken = url.searchParams.get('token');
  let authed = false;
  if (urlToken) {
    const entry = sessions.get(urlToken);
    if (entry && Date.now() - entry.time < SESSION_TTL) {
      entry.time = Date.now();
      authed = true;
    }
  }
  if (!authed) {
    requireWsAuth(ws, () => { setupVncProxy(ws, net, VNC_RFB_PORT, log); });
  } else {
    setupVncProxy(ws, net, VNC_RFB_PORT, log);
  }
}

/**
 * Set up a TCP-to-WebSocket proxy for VNC/RFB traffic.
 * Buffers messages until the TCP connection is established,
 * then bridges data bidirectionally with exponential backoff retry.
 */
function setupVncProxy(ws, net, VNC_RFB_PORT, log) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const msgBuffer = [];

  ws.on('message', (data) => {
    ws.isAlive = true;
    msgBuffer.push(data);
  });

  function connectToVnc(attempt) {
    const tcp = net.connect(VNC_RFB_PORT, 'localhost', () => {
      ws.removeAllListeners('message');

      ws.on('message', (data) => {
        try { tcp.write(Buffer.from(data)); } catch (e) {}
      });

      for (const buffered of msgBuffer) {
        try { tcp.write(Buffer.from(buffered)); } catch (e) {}
      }
      msgBuffer.length = 0;

      tcp.on('data', (data) => {
        try { ws.send(data); } catch (e) {}
      });

      tcp.on('end', () => {
        try { ws.close(); } catch (e) {}
      });

      tcp.on('error', () => {
        try { ws.close(); } catch (e) {}
      });

      ws.on('close', () => {
        try { tcp.end(); } catch (e) {}
      });

      ws.on('error', () => {
        try { tcp.end(); } catch (e) {}
      });
    });

    tcp.on('error', () => {
      if (attempt < 60) {
        const delay = Math.min(500 * Math.pow(1.5, attempt), 4000);
        setTimeout(() => connectToVnc(attempt + 1), delay);
      } else {
        try { ws.close(); } catch (e) {}
      }
    });
  }

  connectToVnc(0);
}

module.exports = handleVncWS;
