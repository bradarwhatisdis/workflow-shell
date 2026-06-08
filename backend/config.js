/**
 * Centralized configuration for Workflow Shell backend.
 * All environment variables, paths, and constants live here.
 */
'use strict';

const path = require('path');
const fs = require('fs');

// ── Paths ──
const REPO_ROOT     = path.resolve(__dirname, '..');
const QUICK_ACTIONS_PATH = path.join(REPO_ROOT, 'quick_actions.json');
const VENDOR_DIR    = path.join(__dirname, 'node_modules');
const REPO_DIR      = REPO_ROOT;

// ── Server ──
const PORT          = process.env.PORT || 8080;
const WORKSPACE     = process.env.WORKSPACE_DIR
  || path.join(process.env.HOME || '/home/runner', 'work');

// ── Auth ──
const AUTH_USER      = process.env.USERNAME || '';
const AUTH_PASS      = process.env.PASSWORD || '';
const AUTH_ENABLED   = !!(AUTH_USER && AUTH_PASS);
const SESSION_TTL    = 5 * 60 * 1000; // 5 min
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS    = 60 * 1000; // 1 min

const PUBLIC_PATHS = [
  '/api/login',
  '/api/logout',
  '/api/cwd',
  '/api/tunnel-url',
  '/favicon.ico',
  '/login.html',
  '/js/',
  '/css/',
  '/vendor/',
];

// ── Logging ──
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL  = (process.env.LOG_LEVEL || 'info').toLowerCase();

// ── VNC / Desktop ──
const NOVNC_DIR       = '/opt/novnc';
const INSTALL_SCRIPT   = path.join(__dirname, '..', 'scripts', 'install-desktop.sh');
const VNC_RFB_PORT     = 5901;

// ── Updates ──
const UPDATE_POLL_INTERVAL = 10000; // 10s

// ── WebSocket ──
const WS_HEARTBEAT_INTERVAL = 30000; // 30s

// ── Private IP ranges ──
const PRIVATE_RANGES = [
  { start: '10.0.0.0',   end: '10.255.255.255' },
  { start: '172.16.0.0',  end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0',   end: '127.255.255.255' },
];

// ── Resolved workspace (lazy cache) ──
let _resolvedWorkspace = null;

function resolveSymlinks(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

function getResolvedWorkspace() {
  if (_resolvedWorkspace) return _resolvedWorkspace;
  const r = resolveSymlinks(WORKSPACE);
  if (r) _resolvedWorkspace = r;
  return r;
}

module.exports = {
  // Paths
  REPO_ROOT,
  QUICK_ACTIONS_PATH,
  VENDOR_DIR,
  REPO_DIR,
  // Server
  PORT,
  WORKSPACE,
  // Auth
  AUTH_USER,
  AUTH_PASS,
  AUTH_ENABLED,
  SESSION_TTL,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_WINDOW_MS,
  PUBLIC_PATHS,
  // Logging
  LOG_LEVELS,
  LOG_LEVEL,
  // VNC
  NOVNC_DIR,
  INSTALL_SCRIPT,
  VNC_RFB_PORT,
  // Updates
  UPDATE_POLL_INTERVAL,
  // WebSocket
  WS_HEARTBEAT_INTERVAL,
  // Helpers
  resolveSymlinks,
  getResolvedWorkspace,
  // Networks
  PRIVATE_RANGES,
};
