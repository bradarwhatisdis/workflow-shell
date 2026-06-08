/**
 * Rate limiter service.
 * Extracted from server.js — generic IP-based rate limiter factory.
 */
'use strict';

function createRateLimiter(maxAttempts, windowMs) {
  const attempts = new Map();
  return (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let entry = attempts.get(ip);
    if (!entry || now - entry.window > windowMs) {
      entry = { count: 0, window: now };
      attempts.set(ip, entry);
    }
    entry.count++;
    return entry.count <= maxAttempts;
  };
}

const killRateLimiter = createRateLimiter(3, 60000);
const quickActionsRateLimiter = createRateLimiter(30, 60000);

module.exports = { createRateLimiter, killRateLimiter, quickActionsRateLimiter };
