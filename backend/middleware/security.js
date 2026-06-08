'use strict';

/**
 * Security headers middleware for Workflow Shell.
 *
 * Extracted from server.js (lines 132–139).
 * Sets strict security headers on every response.
 */

module.exports = function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-src 'self';"
  );
  next();
};
