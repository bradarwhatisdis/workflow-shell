'use strict';

/**
 * Quick Actions API routes for Workflow Shell.
 *
 * CRUD for quick action definitions (persisted to quick_actions.json)
 * and execution of arbitrary commands via bash.
 *
 * Signature: module.exports = function(app, deps) { ... }
 *   deps.QUICK_ACTIONS_PATH    - string, path to quick_actions.json
 *   deps.REPO_ROOT             - string, git repository root
 *   deps.safeError             - (err, res) => void
 *   deps.quickActionsRateLimiter - (req) => boolean
 *   deps.log                   - (level, ...args) => void
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

module.exports = function quickActionsRoutes(app, {
  QUICK_ACTIONS_PATH,
  REPO_ROOT,
  safeError,
  quickActionsRateLimiter,
  log,
}) {
  // ─── Internal Helpers ─────────────────────────────────────────

  function readQuickActions() {
    if (!fs.existsSync(QUICK_ACTIONS_PATH)) return [];
    const raw = fs.readFileSync(QUICK_ACTIONS_PATH, 'utf-8');
    return JSON.parse(raw);
  }

  function writeQuickActions(actions) {
    fs.writeFileSync(QUICK_ACTIONS_PATH, JSON.stringify(actions, null, 2) + '\n', 'utf-8');
  }

  function gitCommitAndPush(message) {
    try {
      execFileSync('git', ['add', 'quick_actions.json'], { cwd: REPO_ROOT, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', message], { cwd: REPO_ROOT, stdio: 'pipe' });
      execFileSync('git', ['push'], { cwd: REPO_ROOT, stdio: 'pipe' });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── Routes ───────────────────────────────────────────────────

  // GET /api/quick-actions — list all quick actions
  app.get('/api/quick-actions', (req, res) => {
    try {
      const actions = readQuickActions();
      res.json({ actions });
    } catch (err) {
      safeError(err, res);
    }
  });

  // POST /api/quick-actions — create a new quick action
  app.post('/api/quick-actions', (req, res) => {
    try {
      const { command_name, command_description, command } = req.body;
      if (!command_name || !command) {
        return res.status(400).json({ error: 'command_name and command are required' });
      }
      const actions = readQuickActions();
      actions.push({
        Command_Name: command_name,
        Command_Description: command_description || '',
        Command: command,
      });
      writeQuickActions(actions);
      const pushed = gitCommitAndPush('Add quick action: ' + command_name);
      res.json({ success: true, actions, pushed });
    } catch (err) {
      safeError(err, res);
    }
  });

  // DELETE /api/quick-actions — delete a quick action by name
  app.delete('/api/quick-actions', (req, res) => {
    try {
      const { command_name } = req.body;
      if (!command_name) {
        return res.status(400).json({ error: 'command_name is required' });
      }
      let actions = readQuickActions();
      const filtered = actions.filter(a => a.Command_Name !== command_name);
      if (filtered.length === actions.length) {
        return res.status(404).json({ error: 'Quick action not found' });
      }
      writeQuickActions(filtered);
      const pushed = gitCommitAndPush('Remove quick action: ' + command_name);
      res.json({ success: true, actions: filtered, pushed });
    } catch (err) {
      safeError(err, res);
    }
  });

  // POST /api/quick-actions/run — execute a quick action command
  app.post('/api/quick-actions/run', (req, res) => {
    try {
      const { command } = req.body;
      if (!command) {
        return res.status(400).json({ error: 'command is required' });
      }

      log('info', '[QUICK_ACTION] Executing command:', command);

      if (!quickActionsRateLimiter(req)) {
        return res.status(429).json({ error: 'Too many requests. Please wait.' });
      }

      const result = execFileSync('/bin/bash', ['-c', command], {
        cwd: REPO_ROOT,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
      });
      res.json({ success: true, output: result });
    } catch (err) {
      const output = err.stdout || '';
      const errorOutput = err.stderr || err.message;
      res.json({ success: false, output, error: errorOutput, exitCode: err.status || 1 });
    }
  });
};
