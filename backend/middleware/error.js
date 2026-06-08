'use strict';

/**
 * Safe error handler for Workflow Shell.
 *
 * Extracted from server.js (lines 304–307).
 * Logs the full error server-side and returns a generic 500 to the client.
 */

const { log } = require('../services/logger');

module.exports = function safeError(err, res) {
  log('error', '[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
};
