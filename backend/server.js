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
const WORKSPACE = process.env.WORKSPACE_DIR || path.join(process.env.HOME || '/home/runner', 'work');

// ─── Authentication (session token based) ────────────────────────────────

const AUTH_USER = process.env.USERNAME || '';
const AUTH_PASS = process.env.PASSWORD || '';
const AUTH_ENABLED = !!(AUTH_USER && AUTH_PASS);
const SESSION_TTL = 5 * 60 * 1000;
const sessions = new Map();
let sessionId = 0;

function now() { return new Date().toISOString().slice(11, 19); }
function DBG(...args) { console.error('[auth]', ...args); }

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'sess_' + token;
}

const PUBLIC_PATHS = ['/login.html', '/api/login', '/favicon.ico'];
function isPublicPath(p) {
  if (PUBLIC_PATHS.includes(p)) return true;
  if (p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/vendor/')) return true;
  return false;
}

function authMiddleware(req, res, next) {
  DBG('[auth] --> ' + req.method + ' ' + req.path + ' (query: ' + JSON.stringify(req.query) + ')');
  if (!AUTH_ENABLED) { DBG('[auth] auth disabled, pass through'); return next(); }
  if (isPublicPath(req.path)) { DBG('[auth] public path, pass through'); return next(); }

  const token = req.headers['x-session-token'] || req.query.token;
  if (token) {
    DBG('[auth] token present: ' + token.slice(0, 12) + '...');
    const entry = sessions.get(token);
    if (entry) {
      const age = Date.now() - entry.time;
      DBG('[auth] session found, age=' + age + 'ms, ttl=' + SESSION_TTL + 'ms');
      if (age < SESSION_TTL) {
        entry.time = Date.now();
        DBG('[auth] session VALID, granted access');
        return next();
      }
      DBG('[auth] session EXPIRED (age=' + age + 'ms), deleting');
      sessions.delete(token);
    } else {
      DBG('[auth] session NOT FOUND in map (map size=' + sessions.size + ')');
    }
  } else {
    DBG('[auth] NO token in header or query');
  }

  DBG('[auth] --> 401 UNAUTHORIZED');
  res.status(401).json({ error: 'Authentication required' });
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);
// Serve xterm.js and addon from node_modules
app.use('/vendor/xterm', express.static(path.join(VENDOR_DIR, 'xterm')));
app.use('/vendor/xterm-addon-fit', express.static(path.join(VENDOR_DIR, 'xterm-addon-fit')));

// ─── Login ────────────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  DBG('[auth] POST /api/login user=' + (username || '(empty)') + ' auth=' + AUTH_ENABLED);
  if (!AUTH_ENABLED) {
    DBG('[auth] login: auth disabled, returning empty token');
    return res.json({ token: '' });
  }
  if (username === AUTH_USER && password === AUTH_PASS) {
    const token = generateToken();
    sessions.set(token, { time: Date.now() });
    DBG('[auth] login SUCCESS, generated token=' + token + ', session count=' + sessions.size);
    res.json({ token });
  } else {
    DBG('[auth] login FAILED (bad creds)');
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

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

// ─── System Stats API ─────────────────────────────────────────────────────

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
    res.status(500).json({ error: err.message });
  }
});

// ─── Git Status API ─────────────────────────────────────────────────────────

app.get('/api/git-status', (req, res) => {
  try {
    let branch = '', changes = [], log = [];
    try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim(); } catch (e) { branch = '(not a git repo)'; }
    try {
      const raw = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
      if (raw) changes = raw.split('\n').map(l => ({ status: l.slice(0,2), file: l.slice(3) }));
    } catch (e) {}
    try {
      const raw = execSync('git log --oneline -10', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
      if (raw) log = raw.split('\n').map(l => { const s = l.indexOf(' '); return { hash: l.slice(0, s), message: l.slice(s + 1) }; });
    } catch (e) {}
    res.json({ branch, changes, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── File Tree API ──────────────────────────────────────────────────────────

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
    res.status(500).json({ error: err.message });
  }
});

// ─── Search in Files API ─────────────────────────────────────────────────────

app.get('/api/search', (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ results: [] });
    const safeQuery = q.replace(/["'`$]/g, '\\$&');
    const output = execSync('grep -rn --binary-files=without-match "' + safeQuery + '" . 2>/dev/null | head -50', {
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
    res.status(500).json({ error: err.message });
  }
});

// ─── File Move API ───────────────────────────────────────────────────────────

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
    res.status(500).json({ error: err.message });
  }
});

// ─── Archive API ──────────────────────────────────────────────────────────────

app.post('/api/archive', (req, res) => {
  try {
    const { paths, name } = req.body || {};
    if (!paths || !paths.length) return res.status(400).json({ error: 'paths array required' });
    const archiveName = (name || 'archive') + '.zip';
    const archivePath = path.join(WORKSPACE, archiveName);
    const safePaths = paths.map(p => getSafePath(p)).filter(Boolean);
    const relPaths = safePaths.map(p => path.relative(WORKSPACE, p));
    const cmd = 'cd ' + WORKSPACE + ' && zip -r ' + archiveName + ' ' + relPaths.map(p => '"' + p.replace(/"/g, '\\"') + '"').join(' ');
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    res.json({ success: true, file: archiveName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/extract', (req, res) => {
  try {
    const { path: archiveRel } = req.body || {};
    if (!archiveRel) return res.status(400).json({ error: 'path required' });
    const archivePath = getSafePath(archiveRel);
    if (!archivePath || !fs.existsSync(archivePath)) return res.status(404).json({ error: 'Archive not found' });
    const dest = path.dirname(archivePath);
    execSync('cd "' + dest + '" && unzip -o "' + path.basename(archivePath) + '"', { stdio: 'pipe', timeout: 30000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Kill API ──────────────────────────────────────────────────────────────

app.post('/api/kill', (req, res) => {
  res.json({ success: true, message: 'Shutting down workflow shell...' });
  console.log('Kill requested - shutting down...');
  setTimeout(() => {
    try { execSync('pkill -9 -f "a.pinggy" 2>/dev/null; pkill -9 -f "ssh.*pinggy" 2>/dev/null; exit 0', { stdio: 'ignore' }); } catch (e) {}
    try { execSync('pkill -9 -f "node backend/server" 2>/dev/null; exit 0', { stdio: 'ignore' }); } catch (e) {}
    process.exit(1);
  }, 1000);
});

// ─── Terminal WebSocket ────────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  if (AUTH_ENABLED) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const token = params.get('token');
    DBG('[auth] WS connect token=' + (token ? token.slice(0,12)+'...' : 'NONE') + ' sessions=' + sessions.size);
    if (!token || !sessions.has(token) || Date.now() - sessions.get(token).time >= SESSION_TTL) {
      DBG('[auth] WS REJECTED');
      ws.close(4001, 'Authentication required');
      return;
    }
    DBG('[auth] WS ACCEPTED');
    sessions.get(token).time = Date.now();
  }

  const ptyCols = parseInt(params.get('cols'), 10) || 80;
  const ptyRows = parseInt(params.get('rows'), 10) || 30;
  const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: ptyCols,
    rows: ptyRows,
    cwd: WORKSPACE,
    env: { ...process.env, TERM: 'xterm-256color' },
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
  console.log('DEBUG=' + (process.env.DEBUG || ''));
  console.log('AUTH_ENABLED=' + AUTH_ENABLED + ' USER=' + AUTH_USER + ' PASS=' + (AUTH_PASS ? '***' : '(empty)'));
  console.log('SESSION_TTL=' + SESSION_TTL + 'ms sessions=' + sessions.size);
});