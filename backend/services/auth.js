/**
 * Authentication service.
 * Extracted from server.js — session token management, login rate limiting.
 */
'use strict';

const crypto = require('crypto');
const { SESSION_TTL, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } = require('../config');

// ── State ──

const sessions = new Map();
const loginAttempts = new Map();

// Periodic session cleanup (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (now - entry.time >= SESSION_TTL) sessions.delete(token);
  }
}, 5 * 60 * 1000);

// ── Functions ──

function generateToken() {
  return 'sess_' + crypto.randomBytes(24).toString('hex');
}

function loginRateLimit(req) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now - entry.window > LOGIN_WINDOW_MS) {
    entry = { count: 0, window: now };
    loginAttempts.set(ip, entry);
  }
  entry.count++;
  return entry.count <= MAX_LOGIN_ATTEMPTS;
}

module.exports = { sessions, loginAttempts, generateToken, loginRateLimit };
