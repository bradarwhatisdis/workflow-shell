/**
 * Structured Logger service.
 * Extracted from server.js log() function.
 */
'use strict';

const { LOG_LEVELS, LOG_LEVEL } = require('../config');

function log(level, ...args) {
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prefix = '[' + ts + '] [' + level.toUpperCase() + ']';
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

module.exports = { log };
