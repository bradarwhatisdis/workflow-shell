const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const QUICK_ACTIONS_PATH = path.join(REPO_ROOT, 'quick_actions.json');

const VENDOR_DIR = path.join(__dirname, 'node_modules');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Derive workspace dynamically: WORKSPACE_DIR env var > HOME/work > cwd
const HOME = process.env.HOME || require('os').homedir();
const WORKSPACE = process.env.WORKSPACE_DIR || path.join(HOME, 'work');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Serve xterm.js and addon from node_modules
app.use('/vendor/xterm', express.static(path.join(VENDOR_DIR, 'xterm')));
app.use('/vendor/xterm-addon-fit', express.static(path.join(VENDOR_DIR, 'xterm-addon-fit')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSafePath(reqPath) {
  if (!reqPath) return path.resolve(WORKSPACE);
  // Normalize: strip leading slash for safe joining
  const clean = reqPath.startsWith('/') ? reqPath.slice(1) : reqPath;
  const fullPath = path.resolve(WORKSPACE, clean || '.');
  if (!fullPath.startsWith(path.resolve(WORKSPACE))) return null;
  return fullPath;
}

// ─── File Manager API ──────────────────────────────────────────────────────

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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/file', (req, res) => {
  try {
    const filePath = getSafePath(req.query.path);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, name: path.basename(filePath) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', (req, res) => {
  try {
    const uploadDir = getSafePath(req.body.path || '/');
    if (!uploadDir) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => cb(null, file.originalname),
    });
    const upload = multer({ storage }).single('file');
    upload(req, res, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, filename: req.file.originalname });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download', (req, res) => {
  try {
    const filePath = getSafePath(req.query.path);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────

app.get('/api/cwd', (req, res) => {
  res.json({ cwd: WORKSPACE });
});

// ─── Quick Actions API ─────────────────────────────────────────────────────

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
    execSync('git add quick_actions.json', { cwd: REPO_ROOT, stdio: 'pipe' });
    execSync('git commit -m "' + message.replace(/"/g, '\\"') + '"', { cwd: REPO_ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

app.get('/api/quick-actions', (req, res) => {
  try {
    const actions = readQuickActions();
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.status(500).json({ error: err.message });
  }
});

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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quick-actions/run', (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }
    const result = execSync(command, {
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

// ─── Terminal WebSocket ────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: WORKSPACE,
    env: { ...process.env, TERM: 'xterm-256color', HOME: '/home/runner' },
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'input') ptyProcess.write(msg.data);
      else if (msg.type === 'resize') ptyProcess.resize(msg.cols, msg.rows);
    } catch (e) { /* ignore malformed messages */ }
  });

  ptyProcess.onData((data) => {
    try { ws.send(JSON.stringify({ type: 'output', data })); } catch (e) {}
  });

  ptyProcess.onExit(() => {
    try { ws.send(JSON.stringify({ type: 'exit' })); } catch (e) {}
    try { ws.close(); } catch (e) {}
  });

  ws.on('close', () => {
    try { ptyProcess.kill(); } catch (e) {}
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log('workflow-shell running on port ' + PORT);
  console.log('Workspace: ' + WORKSPACE);
});