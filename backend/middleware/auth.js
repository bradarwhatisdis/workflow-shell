'use strict';

/**
 * Authentication middleware for Workflow Shell.
 *
 * Extracted from server.js (lines 101–125).
 * Factory pattern: accepts config and sessions map, returns middleware.
 */

module.exports = function authMiddlewareFactory(opts) {
  const {
    AUTH_ENABLED = false,
    sessions = new Map(),
    SESSION_TTL = 5 * 60 * 1000,
    PUBLIC_PATHS = [],
  } = opts || {};

  function isPublicPath(p) {
    if (PUBLIC_PATHS.includes(p)) return true;
    if (p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/vendor/')) return true;
    return false;
  }

  function authMiddleware(req, res, next) {
    if (!AUTH_ENABLED) return next();
    if (isPublicPath(req.path)) return next();

    const token = req.headers['x-session-token'];
    if (token) {
      const entry = sessions.get(token);
      if (entry) {
        if (Date.now() - entry.time < SESSION_TTL) {
          entry.time = Date.now();
          return next();
        }
        sessions.delete(token);
      }
    }

    res.status(401).json({ error: 'Authentication required' });
  }

  return { authMiddleware, isPublicPath };
};
