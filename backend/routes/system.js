'use strict';

/**
 * System and Git status routes for Workflow Shell.
 *
 * Provides system stats (disk, memory, CPU, uptime), git status,
 * and a simple health-check endpoint.
 *
 * Signature: module.exports = function(app, deps) { ... }
 *   deps.child_process - Node child_process module (provides execSync)
 *   deps.safeError     - (err, res) => void
 *   deps.log           - (level, ...args) => void
 *   deps.WORKSPACE     - string, workspace root path
 */

const path = require('path');
const { REPO_ROOT } = require('../config');

module.exports = function systemRoutes(app, {
  child_process,
  safeError,
  log,
  WORKSPACE,
}) {
  const { execSync } = child_process;

  // ─────────────────────────────────────────────────────────────────
  // GET /api/system-stats — disk, memory, CPU, uptime
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/system-stats', (req, res) => {
    try {
      const disk = execSync('df -h / | tail -1', { encoding: 'utf-8' }).trim().split(/\s+/);
      const mem = execSync('free -h | grep Mem', { encoding: 'utf-8' }).trim().split(/\s+/);
      const load = execSync('cat /proc/loadavg', { encoding: 'utf-8' }).trim().split(/\s+/);
      const uptime = execSync('uptime -p', { encoding: 'utf-8' }).trim().replace('up ', '');
      const procs = execSync('ps aux --no-headers | wc -l', { encoding: 'utf-8' }).trim();
      res.json({
        disk: { filesystem: disk[0], size: disk[1], used: disk[2], avail: disk[3], usePercent: disk[4], mount: disk[5] },
        memory: { total: mem[1], used: mem[2], free: mem[3], shared: mem[4] || '-', buffCache: mem[5] || '-', avail: mem[6] || '-' },
        load: { '1min': load[0], '5min': load[1], '15min': load[2] },
        uptime,
        processes: parseInt(procs, 10),
      });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /api/git-status — branch, changes, recent commits
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/git-status', (req, res) => {
    try {
      let branch = '', changes = [], logEntries = [];
      try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim(); } catch (e) { branch = '(not a git repo)'; }
      try {
        const raw = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        if (raw) changes = raw.split('\n').map(l => ({ status: l.slice(0, 2), file: l.slice(3) }));
      } catch (e) {}
      try {
        const raw = execSync('git log --oneline -10', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        if (raw) logEntries = raw.split('\n').map(l => { const s = l.indexOf(' '); return { hash: l.slice(0, s), message: l.slice(s + 1) }; });
      } catch (e) {}
      res.json({ branch, changes, log: logEntries });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /api/cwd — health check returning workspace path
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/cwd', (req, res) => {
    res.json({ cwd: WORKSPACE });
  });
};
