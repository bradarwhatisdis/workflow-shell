'use strict';

/**
 * Authentication routes for Workflow Shell.
 *
 * Login with username/password credentials, returns a session token.
 * Logout invalidates the token.
 *
 * Signature: module.exports = function(app, deps) { ... }
 *   deps.sessions         - Map of active session tokens
 *   deps.generateToken    - () => string, creates new session token
 *   deps.loginRateLimit   - (req) => boolean, rate-limits login attempts
 *   deps.AUTH_ENABLED     - boolean, whether auth is configured
 *   deps.AUTH_USER        - string, configured username
 *   deps.AUTH_PASS        - string, configured password
 *   deps.log              - (level, ...args) => void
 */

module.exports = function authRoutes(app, {
  sessions,
  generateToken,
  loginRateLimit,
  AUTH_ENABLED,
  AUTH_USER,
  AUTH_PASS,
  log,
}) {
  // POST /api/login — authenticate and return session token
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!AUTH_ENABLED) return res.json({ token: '' });

    if (!loginRateLimit(req)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }

    if (username === AUTH_USER && password === AUTH_PASS) {
      const token = generateToken();
      sessions.set(token, { time: Date.now() });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // POST /api/logout — delete session token
  app.post('/api/logout', (req, res) => {
    const token = req.headers['x-session-token'];
    if (token) sessions.delete(token);
    res.json({ success: true });
  });
};
