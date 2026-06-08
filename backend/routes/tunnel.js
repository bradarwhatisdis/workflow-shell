'use strict';

/**
 * Tunnel URL routes for Workflow Shell.
 *
 * Allows external scripts (e.g., run.sh) to set the public tunnel URL
 * so the frontend can display connection information.
 *
 * Signature: module.exports = function(app, { tunnelUrl, log }) { ... }
 */

module.exports = function tunnelRoutes(app, { log }) {
  let tunnelUrl = '';

  // POST /api/tunnel-url — set tunnel URL (called by run.sh after discovering URL)
  app.post('/api/tunnel-url', (req, res) => {
    const { url } = req.body || {};
    if (url) {
      tunnelUrl = url;
      log('info', 'Tunnel URL set: ' + tunnelUrl);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Missing url' });
    }
  });

  // GET /api/tunnel-url — return current tunnel URL
  app.get('/api/tunnel-url', (req, res) => {
    res.json({ url: tunnelUrl });
  });
};
