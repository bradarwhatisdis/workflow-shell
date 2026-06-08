/**
 * File system helper service.
 * Extracted from server.js — path resolution, symlink handling, security checks.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { WORKSPACE } = require('../config');

// ── State ──

let RESOLVED_WORKSPACE = null;

// ── Path Resolution ──

function resolveSymlinks(p) {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    const parent = path.dirname(p);
    if (parent === p) return p;
    try {
      const resolvedParent = fs.realpathSync(parent);
      return path.join(resolvedParent, path.basename(p));
    } catch (e2) {
      return null;
    }
  }
}

function getResolvedWorkspace() {
  if (RESOLVED_WORKSPACE) return RESOLVED_WORKSPACE;
  RESOLVED_WORKSPACE = resolveSymlinks(path.resolve(WORKSPACE));
  return RESOLVED_WORKSPACE;
}

function getSafePath(reqPath) {
  if (!reqPath) return path.resolve(WORKSPACE);
  const clean = reqPath.startsWith('/') ? reqPath.slice(1) : reqPath;
  const fullPath = path.resolve(WORKSPACE, clean || '.');
  const resolvedWorkspace = getResolvedWorkspace();
  if (!resolvedWorkspace) return null;
  const resolvedPath = resolveSymlinks(fullPath);
  if (!resolvedPath || !resolvedPath.startsWith(resolvedWorkspace)) return null;
  return resolvedPath;
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[/\\]/g, '_');
}

// ── Network Security ──

function isPrivateIP(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 198 && parts[1] === 18) return true;
  return false;
}

async function isPrivateHostname(hostname) {
  try {
    const { address } = await dns.promises.lookup(hostname, { verbatim: false });
    return isPrivateIP(address);
  } catch (e) {
    return true;
  }
}

module.exports = {
  resolveSymlinks,
  getResolvedWorkspace,
  getSafePath,
  sanitizeFilename,
  isPrivateIP,
  isPrivateHostname,
};
