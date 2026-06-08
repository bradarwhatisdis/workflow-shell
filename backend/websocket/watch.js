// ─── Watch WebSocket ────────────────────────────────────────────

/**
 * Handle a file-change watch WebSocket connection.
 * Adds the client to the watchClients Set so it receives
 * file change notifications, and removes it on close/error.
 */
module.exports = function (ws, url, deps) {
  const { requireWsAuth, watchClients } = deps;

  requireWsAuth(ws, () => {
    watchClients.add(ws);
    ws.on('close', () => watchClients.delete(ws));
    ws.on('error', () => watchClients.delete(ws));
  });
};
