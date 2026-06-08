/**
 * Update checking service.
 * Extracted from server.js — git-based update polling for auto-update mechanism.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { REPO_DIR } = require('../config');

// ── State ──

let updateStatus = {
  currentCommit: '',
  pending: [],
  count: 0,
  lastChecked: null,
};

// ── Functions ──

function runGit(args) {
  try { return execSync('git ' + args, { cwd: REPO_DIR, timeout: 15000, encoding: 'utf8' }).trim(); }
  catch (e) { return ''; }
}

function checkForUpdates() {
  var current = runGit('rev-parse HEAD');
  if (!current) return;
  updateStatus.currentCommit = current.substring(0, 7);

  runGit('fetch origin --quiet');

  var branch = runGit('rev-parse --abbrev-ref HEAD');
  var remoteBranch = 'origin/' + branch;
  var newHashes = runGit('rev-list HEAD..' + remoteBranch + ' --reverse');
  if (!newHashes) {
    updateStatus.pending = [];
    updateStatus.count = 0;
    updateStatus.lastChecked = new Date().toISOString();
    return;
  }

  updateStatus.pending = newHashes.split('\n').filter(Boolean).map(function(hash) {
    return {
      hash: hash.substring(0, 7),
      message: runGit('log --format=%s -1 ' + hash),
      files: (runGit('show --name-only --format="" ' + hash) || '').split('\n').filter(Boolean),
    };
  });
  updateStatus.count = updateStatus.pending.length;
  updateStatus.lastChecked = new Date().toISOString();
}

module.exports = { updateStatus, runGit, checkForUpdates };
