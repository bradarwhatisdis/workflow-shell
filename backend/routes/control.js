'use strict';

/**
 * Control routes for Workflow Shell.
 *
 * Server lifecycle management: update status polling, server restarts,
 * and graceful shutdown (kill).
 *
 * Signature: module.exports = function(app, deps) { ... }
 *   deps.killRateLimiter   - (req) => boolean, rate-limits kill requests
 *   deps.gracefulShutdown  - (reason) => void, triggers graceful shutdown
 *   deps.updateStatus      - object, current update check state
 *   deps.safeError         - (err, res) => void
 *   deps.log               - (level, ...args) => void
 */

const fs = require('fs');

module.exports = function controlRoutes(app, {
  killRateLimiter,
  gracefulShutdown,
  updateStatus,
  safeError,
  log,
}) {
  // GET /api/update-status — return current update polling state
  app.get('/api/update-status', function(req, res) {
    res.json(updateStatus);
  });

  // POST /api/update — trigger pull + restart
  app.post('/api/update', function(req, res) {
    res.json({ success: true, message: 'Pulling latest code and restarting server...' });
    log('info', 'Update requested - pulling and restarting...');
    fs.writeFileSync('/tmp/workflow-restart-flag', '');
    setImmediate(function() { gracefulShutdown('update'); });
  });

  // POST /api/kill — terminate server gracefully (rate-limited)
  app.post('/api/kill', (req, res) => {
    if (!killRateLimiter(req)) {
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }
    res.json({ success: true, message: 'Shutting down workflow shell...' });
    log('info', 'Kill requested - shutting down...');
    setImmediate(() => gracefulShutdown('kill'));
  });
};
