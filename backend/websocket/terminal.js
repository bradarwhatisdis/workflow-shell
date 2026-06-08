// ─── Terminal WebSocket ──────────────────────────────────────────

/**
 * Handle a terminal WebSocket connection.
 * Spawns a PTY (node-pty) bash session, relays input/output,
 * handles resize events, and cleans up on disconnect.
 */
module.exports = function (ws, url, deps) {
  const { requireWsAuth, pty, WORKSPACE, log } = deps;
  const params = url.searchParams;
  const ptyCols = parseInt(params.get('cols'), 10) || 80;
  const ptyRows = parseInt(params.get('rows'), 10) || 30;

  requireWsAuth(ws, () => {
    const ptyProcess = pty.spawn('/bin/bash', [], {
      name: 'xterm-256color',
      cols: ptyCols,
      rows: ptyRows,
      cwd: WORKSPACE,
      env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'input') ptyProcess.write(msg.data);
        else if (msg.type === 'resize') ptyProcess.resize(msg.cols, msg.rows);
      } catch (e) {
        log('warn', 'WS message error:', e.message);
      }
    });

    ptyProcess.onData((data) => {
      try { ws.send(JSON.stringify({ type: 'output', data })); } catch (e) {
        log('warn', 'WS send error:', e.message);
      }
    });

    ptyProcess.onExit(() => {
      try { ws.send(JSON.stringify({ type: 'exit' })); } catch (e) {
        log('warn', 'WS send error:', e.message);
      }
      try { ws.close(); } catch (e) {}
    });

    ws.on('close', () => {
      try { ptyProcess.kill(); } catch (e) {}
    });
  });
};
