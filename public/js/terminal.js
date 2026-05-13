// ─── Terminal Setup ────────────────────────────────────

(function() {
  const Terminal = window.Terminal;
  const FitAddon = window.FitAddon;

  if (!Terminal || !FitAddon) {
    console.error('xterm.js or FitAddon not loaded');
    return;
  }

  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 10000,
    theme: {
      background: '#0f1117',
      foreground: '#e2e4e9',
      cursor: '#7c5cfc',
      selectionBackground: 'rgba(124, 92, 252, 0.3)',
      black: '#484f58',
      red: '#f0504d',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39d353',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#7ee787',
      brightWhite: '#f0f6fc',
    },
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById('terminal-container');
  term.open(container);
  fitAddon.fit();

  // ─── WebSocket Connection ──────────────────────────

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(protocol + '//' + location.host);

  let termReady = false;
  const buffer = [];

  ws.onopen = function() {
    termReady = true;
    buffer.forEach(function(msg) { ws.send(JSON.stringify(msg)); });
    buffer.length = 0;
    term.focus();
    fitAddon.fit();
  };

  ws.onmessage = function(event) {
    const msg = JSON.parse(event.data);
    if (msg.type === 'output') {
      term.write(msg.data);
    } else if (msg.type === 'exit') {
      term.write('\r\n[Session ended]\r\n');
    }
  };

  ws.onclose = function() {
    term.write('\r\n[Connection closed. Reconnecting...]\r\n');
    setTimeout(function() { location.reload(); }, 3000);
  };

  // ─── Terminal → Server ─────────────────────────────

  term.onData(function(data) {
    const msg = { type: 'input', data: data };
    if (termReady) {
      ws.send(JSON.stringify(msg));
    } else {
      buffer.push(msg);
    }
  });

  term.onResize(function(size) {
    if (termReady && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
    }
  });

  // ─── Fit on resize ─────────────────────────────────

  window.addEventListener('resize', function() {
    try { fitAddon.fit(); } catch(e) {}
    if (termReady && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  });

  // ─── Focus terminal on click ────────────────────────

  container.addEventListener('click', function() { term.focus(); });

})();