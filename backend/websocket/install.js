// ─── Install WebSocket ───────────────────────────────────────────

const { spawn } = require('child_process');

/**
 * Handle a desktop installation WebSocket connection.
 * Streams install script logs to the client, rebroadcasts to all
 * listeners, and starts the VNC server on completion.
 */
module.exports = function (ws, url, deps) {
  const { requireWsAuth, installState, startVNCServer, INSTALL_SCRIPT, log } = deps;

  requireWsAuth(ws, () => {
    const send = (text) => {
      try { ws.send(JSON.stringify({ type: 'log', data: text })); } catch (e) {}
    };

    const broadcast = (text) => {
      installState.logs.push(text);
      installState.listeners.forEach(fn => fn(text));
    };

    const listener = (text) => send(text);
    installState.listeners.push(listener);

    for (const line of installState.logs) send(line);

    if (installState.done) {
      send('[DONE]\n');
      ws.close();
      installState.listeners = installState.listeners.filter(l => l !== listener);
      return;
    }

    if (installState.running) {
      send('[STATUS] Installation already in progress...\n');
      ws.on('close', () => {
        installState.listeners = installState.listeners.filter(l => l !== listener);
      });
      return;
    }

    installState.running = true;
    send('[STATUS] Starting installation...\n');

    const proc = spawn('bash', [INSTALL_SCRIPT], { stdio: ['ignore', 'pipe', 'pipe'] });

    const onData = (data) => {
      const text = data.toString();
      send(text);
      broadcast(text);
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('exit', (code) => {
      installState.running = false;
      installState.done = true;

      if (code === 0) {
        const msg = '\n[STATUS] Installation complete! Starting desktop...\n';
        send(msg);
        broadcast(msg);
        startVNCServer();
        send('[VNC_READY]\n');
      } else {
        const msg = '\n[STATUS] Installation failed (exit code ' + code + ')\n';
        send(msg);
        broadcast(msg);
      }

      ws.close();
      installState.listeners = installState.listeners.filter(l => l !== listener);
    });

    ws.on('close', () => {
      installState.listeners = installState.listeners.filter(l => l !== listener);
    });
  });
};
