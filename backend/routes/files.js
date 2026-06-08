'use strict';

/**
 * File Manager API routes for Workflow Shell.
 *
 * CRUD operations on files and directories, plus upload/download,
 * archive/extract, move, directory tree, and full-text search.
 *
 * Signature: module.exports = function(app, deps) { ... }
 *   deps.getSafePath          - (reqPath) => string|null, resolves + validates paths
 *   deps.sanitizeFilename     - (name) => string, removes path separators
 *   deps.isPrivateHostname    - (hostname) => Promise<boolean>, DNS/SSRF check
 *   deps.safeError            - (err, res) => void, logs + returns 500
 *   deps.uploadMiddleware     - (getSafePath) => multer middleware factory
 *   deps.log                  - (level, ...args) => void
 *   deps.WORKSPACE            - string, resolved workspace root path
 *   deps.getResolvedWorkspace - () => string, workspace with symlinks resolved
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

module.exports = function filesRoutes(app, {
  getSafePath,
  sanitizeFilename,
  isPrivateHostname,
  safeError,
  uploadMiddleware,
  log,
  WORKSPACE,
  getResolvedWorkspace,
}) {
  // Create multer upload middleware using the factory and safe-path resolver
  const upload = uploadMiddleware(getSafePath);

  // ─────────────────────────────────────────────────────────────────
  // GET /api/files — list directory contents
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/files', (req, res) => {
    try {
      const dir = getSafePath(req.query.path);
      if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return res.status(404).json({ error: 'Directory not found' });
      }
      const items = fs.readdirSync(dir, { withFileTypes: true });
      const files = items.map(item => {
        const full = path.join(dir, item.name);
        const stat = fs.statSync(full);
        return {
          name: item.name,
          isDirectory: stat.isDirectory(),
          size: stat.isFile() ? stat.size : 0,
          modified: stat.mtime.toISOString(),
        };
      });
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      const relPath = path.relative(WORKSPACE, dir);
      res.json({ path: relPath === '' ? '/' : '/' + relPath, items: files });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /api/file — read file content
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/file', (req, res) => {
    try {
      const filePath = getSafePath(req.query.path);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return res.status(404).json({ error: 'File not found' });
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content, name: path.basename(filePath) });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // PUT /api/file — create or update file (or directory with _isDir)
  // ─────────────────────────────────────────────────────────────────
  app.put('/api/file', (req, res) => {
    try {
      const filePath = getSafePath(req.query.path);
      if (!filePath) return res.status(400).json({ error: 'Invalid path' });

      if (req.body._isDir) {
        if (!fs.existsSync(filePath)) fs.mkdirSync(filePath, { recursive: true });
        return res.json({ success: true });
      }

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, req.body.content || '', 'utf-8');
      res.json({ success: true });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // DELETE /api/file — delete file or directory
  // ─────────────────────────────────────────────────────────────────
  app.delete('/api/file', (req, res) => {
    try {
      const filePath = getSafePath(req.query.path);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /api/download — download file (binary)
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/download', (req, res) => {
    try {
      const filePath = getSafePath(req.query.path);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.download(filePath);
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // POST /api/upload — multipart file upload
  // ─────────────────────────────────────────────────────────────────
  app.post('/api/upload', (req, res) => {
    upload(req, res, (err) => {
      if (err) return safeError(err, res);
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      res.json({ success: true, filename: req.file.filename });
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // POST /api/upload/url — fetch file from URL with private IP check
  // ─────────────────────────────────────────────────────────────────
  app.post('/api/upload/url', async (req, res) => {
    try {
      const { url, path: targetPath } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing url' });
      const uploadDir = getSafePath(targetPath || '/');
      if (!uploadDir) return res.status(400).json({ error: 'Invalid path' });
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const urlObj = new URL(url);
      if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
        return res.status(400).json({ error: 'Invalid protocol' });
      }

      if (await isPrivateHostname(urlObj.hostname)) {
        return res.status(400).json({ error: 'URL points to private or invalid network' });
      }

      const fileName = sanitizeFilename(path.basename(urlObj.pathname) || 'download');
      const filePath = path.join(uploadDir, fileName);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return res.status(400).json({ error: 'Failed to fetch URL: ' + response.status });
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      res.json({ success: true, filename: fileName });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // POST /api/file/move — rename or move file/directory
  // ─────────────────────────────────────────────────────────────────
  app.post('/api/file/move', (req, res) => {
    try {
      const { from, to } = req.body || {};
      if (!from || !to) return res.status(400).json({ error: 'from and to paths required' });
      const src = getSafePath(from);
      const dst = getSafePath(to);
      if (!src || !dst) return res.status(400).json({ error: 'Invalid paths' });
      if (!fs.existsSync(src)) return res.status(404).json({ error: 'Source not found' });
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(src, dst);
      res.json({ success: true });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // POST /api/archive — create .zip archive from selected paths
  // ─────────────────────────────────────────────────────────────────
  app.post('/api/archive', (req, res) => {
    try {
      const { paths, name } = req.body || {};
      if (!paths || !paths.length) return res.status(400).json({ error: 'paths array required' });
      const archiveName = (name || 'archive') + '.zip';
      const safePaths = paths.map(p => getSafePath(p)).filter(Boolean);
      const relPaths = safePaths.map(p => path.relative(WORKSPACE, p));
      execFileSync('zip', ['-r', archiveName, ...relPaths], { cwd: WORKSPACE, stdio: 'pipe', timeout: 30000 });
      res.json({ success: true, file: archiveName });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // POST /api/extract — extract .zip archive (with Zip Slip prevention)
  // ─────────────────────────────────────────────────────────────────
  app.post('/api/extract', (req, res) => {
    try {
      const { path: archiveRel } = req.body || {};
      if (!archiveRel) return res.status(400).json({ error: 'path required' });
      const archivePath = getSafePath(archiveRel);
      if (!archivePath || !fs.existsSync(archivePath)) return res.status(404).json({ error: 'Archive not found' });
      const dest = path.dirname(archivePath);

      // List entries and validate paths before extracting (Zip Slip prevention)
      const listing = execFileSync('unzip', ['-Z1', path.basename(archivePath)], { cwd: dest, encoding: 'utf-8', timeout: 10000 }).trim();
      if (listing) {
        const entries = listing.split('\n').filter(Boolean);
        for (const entry of entries) {
          const resolved = path.resolve(dest, entry);
          if (!resolved.startsWith(path.resolve(dest))) {
            return res.status(400).json({ error: 'Archive contains invalid path entries' });
          }
        }
      }

      execFileSync('unzip', ['-o', path.basename(archivePath)], { cwd: dest, stdio: 'pipe', timeout: 30000 });
      res.json({ success: true });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /api/files/tree — get directory tree (depth ≤ 3)
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/files/tree', (req, res) => {
    try {
      const dir = getSafePath(req.query.path);
      if (!dir) return res.status(400).json({ error: 'Invalid path' });
      function buildTree(dirPath, depth) {
        if (depth > 3) return [];
        try {
          const items = fs.readdirSync(dirPath, { withFileTypes: true });
          return items
            .filter(item => !item.name.startsWith('.'))
            .map(item => {
              const full = path.join(dirPath, item.name);
              const stat = fs.statSync(full);
              const entry = { name: item.name, isDirectory: stat.isDirectory() };
              if (entry.isDirectory) entry.children = buildTree(full, depth + 1);
              return entry;
            });
        } catch (e) { return []; }
      }
      const tree = buildTree(dir, 0);
      const relPath = path.relative(WORKSPACE, dir);
      res.json({ path: relPath === '' ? '/' : '/' + relPath, tree });
    } catch (err) {
      safeError(err, res);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /api/search — full-text grep search across workspace
  // ─────────────────────────────────────────────────────────────────
  app.get('/api/search', (req, res) => {
    try {
      const q = req.query.q;
      if (!q || q.length < 2) return res.json({ results: [] });
      const output = execFileSync('grep', ['-rn', '--binary-files=without-match', q, '.'], {
        cwd: WORKSPACE, encoding: 'utf-8', maxBuffer: 1024 * 512, timeout: 10000,
      }).trim();
      if (!output) return res.json({ results: [] });
      const results = output.split('\n').filter(Boolean).map(line => {
        const first = line.indexOf(':');
        const second = line.indexOf(':', first + 1);
        if (first === -1 || second === -1) return null;
        return { file: line.slice(0, first), line: parseInt(line.slice(first + 1, second), 10), match: line.slice(second + 1).trim() };
      }).filter(Boolean);
      res.json({ results });
    } catch (err) {
      if (err.status === 1) return res.json({ results: [] });
      safeError(err, res);
    }
  });
};
