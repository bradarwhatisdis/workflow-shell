const express = require('express');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const multer = require('multer');
const { execFileSync, execSync, spawnSync, spawn } = require('child_process');

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

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60 * 1000;
const loginAttempts = new Map();

function generateToken() {
  return 'sess_' + crypto.randomBytes(24).toString('hex');
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (now - entry.time >= SESSION_TTL) sessions.delete(token);
  }
}, 5 * 60 * 1000);

const PUBLIC_PATHS = ['/login.html', '/api/login', '/api/logout', '/favicon.ico'];
function isPublicPath(p) {
  if (PUBLIC_PATHS.includes(p)) return true;
  if (p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/vendor/')) return true;
  return false;
}

function authMiddleware(req, res, next) {
  if (!AUTH_ENABLED) return next();
  if (isPublicPath(req.path)) return next();

  const token = req.headers['x-session-token'] || req.query.token;
  if (token) {
    const entry = sessions.get(token);
    if (entry) {
      if (Date.now() - entry.time < SESSION_TTL) {
        entry.time = Date.now();
        return next();
      }
      sessions.delete(token);
    }
  }

  res.status(401).json({ error: 'Authentication required' });
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);
// Serve xterm.js and addon from node_modules
app.use('/vendor/xterm', express.static(path.join(VENDOR_DIR, 'xterm')));
app.use('/vendor/xterm-addon-fit', express.static(path.join(VENDOR_DIR, 'xterm-addon-fit')));

// Serve noVNC client files (auto-download if missing)
const NOVNC_DIR = '/opt/novnc';
(function ensureNovnc() {
  if (fs.existsSync(NOVNC_DIR + '/core/rfb.js')) {
    app.use('/novnc', express.static(NOVNC_DIR));
    console.log('noVNC served from ' + NOVNC_DIR);
    return;
  }
  console.log('noVNC not found at ' + NOVNC_DIR + ' — attempting to download...');
  try {
    const tmp = '/tmp/novnc-repo';
    spawnSync('rm', ['-rf', tmp]);
    spawnSync('git', ['clone', '--depth', '1', 'https://github.com/novnc/noVNC.git', tmp], { stdio: 'pipe', timeout: 30000 });
    spawnSync('mkdir', ['-p', path.dirname(NOVNC_DIR)]);
    spawnSync('mv', [tmp, NOVNC_DIR], { stdio: 'pipe' });
    spawnSync('rm', ['-rf', tmp]);
    if (fs.existsSync(NOVNC_DIR + '/core/rfb.js')) {
      app.use('/novnc', express.static(NOVNC_DIR));
      console.log('noVNC downloaded and served from ' + NOVNC_DIR);
    } else {
      console.log('noVNC download failed — Desktop tab unavailable');
    }
  } catch (e) {
    console.log('noVNC download error: ' + e.message);
  }
})();

// ─── VNC / Install State ──────────────────────────────────────────

const INSTALL_SCRIPT = path.join(__dirname, '..', 'scripts', 'install-xfce.sh');
const VNC_RFB_PORT = 5901;
const installState = {
  running: false,
  done: false,
  logs: [],
  listeners: [],
  vncProcesses: [],
};

// ─── File Watcher ────────────────────────────────────────────────

const watchClients = new Set();
let fileWatcher = null;

function startFileWatcher() {
  try { if (fileWatcher) fileWatcher.close(); } catch (e) {}

  if (!fs.existsSync(WORKSPACE)) {
    console.warn('Workspace not found, file watcher disabled');
    return;
  }

  let debounceTimer;
  try {
    fileWatcher = chokidar.watch(WORKSPACE, {
      ignored: /(^|[/\\])\..|node_modules/,
      persistent: true,
      ignoreInitial: true,
    });

    const notify = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const msg = JSON.stringify({ type: 'change' });
        watchClients.forEach(ws => {
          try { ws.send(msg); } catch (e) {}
        });
      }, 200);
    };

    fileWatcher.on('add', notify);
    fileWatcher.on('change', notify);
    fileWatcher.on('unlink', notify);
    fileWatcher.on('addDir', notify);
    fileWatcher.on('unlinkDir', notify);

    console.log('File watcher started on ' + WORKSPACE);
  } catch (e) {
    console.warn('File watcher error:', e.message);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

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

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSafePath(reqPath) {
  if (!reqPath) return path.resolve(WORKSPACE);
  const clean = reqPath.startsWith('/') ? reqPath.slice(1) : reqPath;
  const fullPath = path.resolve(WORKSPACE, clean || '.');
  if (!fullPath.startsWith(path.resolve(WORKSPACE))) return null;
  return fullPath;
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[/\\]/g, '_');
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

const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = getSafePath(req.body.path || '/') || WORKSPACE;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname)),
  }),
}).single('file');

app.post('/api/upload', (req, res) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true, filename: req.file.filename });
  });
});

app.post('/api/upload/url', async (req, res) => {
  try {
    const { url, path: targetPath } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    const uploadDir = getSafePath(targetPath || '/');
    if (!uploadDir) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const urlObj = new URL(url);
    const fileName = sanitizeFilename(path.basename(urlObj.pathname) || 'download');
    const filePath = path.join(uploadDir, fileName);

    const response = await fetch(url);
    if (!response.ok) return res.status(400).json({ error: 'Failed to fetch URL: ' + response.status });
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    res.json({ success: true, filename: fileName });
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
    execFileSync('git', ['add', 'quick_actions.json'], { cwd: REPO_ROOT, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', message], { cwd: REPO_ROOT, stdio: 'pipe' });
    execFileSync('git', ['push'], { cwd: REPO_ROOT, stdio: 'pipe' });
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
    execFileSync('zip', ['-r', archiveName, ...relPaths], { cwd: WORKSPACE, stdio: 'pipe', timeout: 30000 });
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
    execFileSync('unzip', ['-o', path.basename(archivePath)], { cwd: dest, stdio: 'pipe', timeout: 30000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Kill API ──────────────────────────────────────────────────────────────

function startVNCServer() {
  try { spawnSync('pkill', ['-f', 'Xvfb.*:1']); } catch (e) {}
  try { spawnSync('pkill', ['-f', 'x11vnc.*5901']); } catch (e) {}
  try { spawnSync('pkill', ['-f', '(xfce4-session|xfwm4|xfdesktop|xfce4-panel)']); } catch (e) {}
  try { spawnSync('pkill', ['-f', 'dbus-daemon.*:1']); } catch (e) {}

  const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1280x720x24'], { stdio: 'pipe' });
  xvfb.stderr.on('data', (d) => console.error('[xvfb]', d.toString().trim()));
  installState.vncProcesses.push(xvfb);

  const dbusEnv = {};
  try {
    const dbusLaunch = spawnSync('dbus-launch');
    dbusLaunch.stdout.toString().split('\n').forEach(function(line) {
      var idx = line.indexOf('=');
      if (idx > 0) dbusEnv[line.substring(0, idx)] = line.substring(idx + 1);
    });
    console.log('[dbus] session bus started: ' + (dbusEnv.DBUS_SESSION_BUS_ADDRESS || '(none)'));
  } catch (e) {
    console.error('[dbus] failed to start: ' + e.message);
  }

  var desktopEnv = { ...process.env, DISPLAY: ':1', ...dbusEnv };

  function spawnDesktop(name, args, delay) {
    setTimeout(function() {
      var proc = spawn(name, args, { stdio: 'pipe', env: desktopEnv });
      proc.stderr.on('data', function(d) { console.error('[' + name + ']', d.toString().trim()); });
      proc.on('exit', function(code) { console.log('[' + name + '] exited with code ' + code); });
      installState.vncProcesses.push(proc);
      console.log('[' + name + '] started');
    }, delay);
  }

  // Start desktop components in sequence: wm → panel → desktop
  spawnDesktop('xfwm4', ['--display', ':1'], 2000);
  spawnDesktop('xfce4-panel', [], 3000);
  spawnDesktop('xfdesktop', [], 4000);

  // Start x11vnc after all desktop components are up
  setTimeout(function() {
    const vnc = spawn('x11vnc', [
      '-display', ':1', '-forever', '-shared',
      '-rfbport', String(VNC_RFB_PORT), '-nopw',
    ], { stdio: 'pipe' });
    vnc.stderr.on('data', (d) => console.error('[x11vnc]', d.toString().trim()));
    vnc.on('exit', (code) => console.log('[x11vnc] exited with code ' + code));
    installState.vncProcesses.push(vnc);
    console.log('VNC server started on port ' + VNC_RFB_PORT);
  }, 6000);
}

function stopVNCServer() {
  installState.vncProcesses.forEach(p => { try { p.kill(); } catch (e) {} });
  installState.vncProcesses = [];
  try { spawnSync('pkill', ['-f', 'Xvfb.*:1']); } catch (e) {}
  try { spawnSync('pkill', ['-f', 'x11vnc.*5901']); } catch (e) {}
  try { spawnSync('pkill', ['-f', '(xfce4-session|xfwm4|xfdesktop|xfce4-panel)']); } catch (e) {}
}

app.post('/api/update', (req, res) => {
  res.json({ success: true, message: 'Pulling latest code and restarting server...' });
  console.log('Update requested - pulling and restarting...');
  stopVNCServer();
  fs.writeFileSync('/tmp/workflow-restart-flag', '');
  setImmediate(() => process.exit(0));
});

app.post('/api/kill', (req, res) => {
  res.json({ success: true, message: 'Shutting down workflow shell...' });
  console.log('Kill requested - shutting down...');
  stopVNCServer();
  setImmediate(() => process.exit(0));
});

// ─── WebSocket Router ────────────────────────────────────────────────────

function wsAuth(ws, url) {
  if (!AUTH_ENABLED) return true;
  const token = url.searchParams.get('token');
  if (token) {
    const entry = sessions.get(token);
    if (entry && Date.now() - entry.time < SESSION_TTL) {
      entry.time = Date.now();
      return true;
    }
    if (entry) sessions.delete(token);
  }
  ws.close(4001, 'Authentication required');
  return false;
}

function wsOriginCheck(ws, req) {
  const origin = req.headers.origin;
  if (!origin || !AUTH_ENABLED) return true;
  try {
    const originHost = new URL(origin).host;
    const serverHost = req.headers.host;
    if (originHost === serverHost || originHost.endsWith('.trycloudflare.com')) return true;
  } catch (e) {}
  ws.close(4001, 'Origin not allowed');
  return false;
}

const WS_HEARTBEAT_INTERVAL = 30000;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (!wsOriginCheck(ws, req)) return;
  if (!wsAuth(ws, url)) return;

  if (pathname === '/install') return handleInstallWS(ws, url);
  if (pathname === '/vnc') return handleVncWS(ws, url);
  if (pathname === '/watch') return handleWatchWS(ws, url);

  handleTerminalWS(ws, url);
});

// ─── Terminal WebSocket ──────────────────────────────────────────

function handleTerminalWS(ws, url) {
  const params = url.searchParams;
  const ptyCols = parseInt(params.get('cols'), 10) || 80;
  const ptyRows = parseInt(params.get('rows'), 10) || 30;
  const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: ptyCols,
    rows: ptyRows,
    cwd: WORKSPACE,
    env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
  });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'input') ptyProcess.write(msg.data);
      else if (msg.type === 'resize') ptyProcess.resize(msg.cols, msg.rows);
    } catch (e) {
      console.warn('WS message error:', e.message);
    }
  });

  ptyProcess.onData((data) => {
    try { ws.send(JSON.stringify({ type: 'output', data })); } catch (e) {
      console.warn('WS send error:', e.message);
    }
  });

  ptyProcess.onExit(() => {
    try { ws.send(JSON.stringify({ type: 'exit' })); } catch (e) {
      console.warn('WS send error:', e.message);
    }
    try { ws.close(); } catch (e) {}
  });

  ws.on('close', () => {
    try { ptyProcess.kill(); } catch (e) {}
  });
}

// ─── Install WebSocket ───────────────────────────────────────────

function handleInstallWS(ws, url) {
  const send = (text) => {
    try { ws.send(JSON.stringify({ type: 'log', data: text })); } catch (e) {}
  };

  const broadcast = (text) => {
    installState.logs.push(text);
    installState.listeners.forEach(fn => fn(text));
  };

  const listener = (text) => send(text);
  installState.listeners.push(listener);

  for (const line of installState.logs) send(line);

  if (installState.done) {
    send('[DONE]\n');
    ws.close();
    installState.listeners = installState.listeners.filter(l => l !== listener);
    return;
  }

  if (installState.running) {
    send('[STATUS] Installation already in progress...\n');
    ws.on('close', () => {
      installState.listeners = installState.listeners.filter(l => l !== listener);
    });
    return;
  }

  installState.running = true;
  send('[STATUS] Starting installation...\n');

  const proc = spawn('bash', [INSTALL_SCRIPT], { stdio: ['ignore', 'pipe', 'pipe'] });

  const onData = (data) => {
    const text = data.toString();
    send(text);
    broadcast(text);
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('exit', (code) => {
    installState.running = false;
    installState.done = true;

    if (code === 0) {
      const msg = '\n[STATUS] Installation complete! Starting desktop...\n';
      send(msg);
      broadcast(msg);
      startVNCServer();
      send('[VNC_READY]\n');
    } else {
      const msg = '\n[STATUS] Installation failed (exit code ' + code + ')\n';
      send(msg);
      broadcast(msg);
    }

    ws.close();
    installState.listeners = installState.listeners.filter(l => l !== listener);
  });

  ws.on('close', () => {
    installState.listeners = installState.listeners.filter(l => l !== listener);
  });
}

// ─── VNC WebSocket Proxy ─────────────────────────────────────────

function handleVncWS(ws, url) {
  const msgBuffer = [];

  ws.on('message', (data) => {
    msgBuffer.push(data);
  });

  function connectToVnc(attempt) {
    const tcp = net.connect(VNC_RFB_PORT, 'localhost', () => {
      ws.removeAllListeners('message');

      ws.on('message', (data) => {
        try { tcp.write(Buffer.from(data)); } catch (e) {}
      });

      for (const buffered of msgBuffer) {
        try { tcp.write(Buffer.from(buffered)); } catch (e) {}
      }
      msgBuffer.length = 0;

      tcp.on('data', (data) => {
        try { ws.send(data); } catch (e) {}
      });

      tcp.on('end', () => {
        try { ws.close(); } catch (e) {}
      });

      tcp.on('error', () => {
        try { ws.close(); } catch (e) {}
      });

      ws.on('close', () => {
        try { tcp.end(); } catch (e) {}
      });

      ws.on('error', () => {
        try { tcp.end(); } catch (e) {}
      });
    });

    tcp.on('error', () => {
      if (attempt < 60) {
        const delay = Math.min(500 * Math.pow(1.5, attempt), 4000);
        setTimeout(() => connectToVnc(attempt + 1), delay);
      } else {
        try { ws.close(); } catch (e) {}
      }
    });
  }

  connectToVnc(0);
}

// ─── Watch WebSocket ────────────────────────────────────────────

function handleWatchWS(ws, url) {
  watchClients.add(ws);
  ws.on('close', () => watchClients.delete(ws));
  ws.on('error', () => watchClients.delete(ws));
}

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (e) {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, WS_HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

// ─── Start ─────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log('workflow-shell running on port ' + PORT);
  console.log('Workspace: ' + WORKSPACE);
  startFileWatcher();
});