// ─── Graceful Shutdown ────────────────────────────────────────────────

/**
 * Perform a graceful shutdown of the server.
 * Stops VNC, closes the file watcher, clears the heartbeat interval,
 * terminates all WebSocket clients, closes the HTTP server,
 * and force-exits after 5 seconds if shutdown hangs.
 */
module.exports = function (reason, deps) {
  const { stopVNCServer, fileWatcher, heartbeatTimer, wss, server, log } = deps;

  log('info', 'Shutting down: ' + reason);
  stopVNCServer();
  if (fileWatcher) { try { fileWatcher.close(); } catch (e) {} }
  clearInterval(heartbeatTimer);
  wss.clients.forEach(ws => { try { ws.terminate(); } catch (e) {} });
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};
