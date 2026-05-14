// ─── Terminal Setup ────────────────────────────────────

(function() {
  var Terminal = window.Terminal;
  var FitAddon = window.FitAddon;

  if (!Terminal) {
    console.error('xterm.js not loaded. Run: cd backend && npm install');
    return;
  }

  var term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
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

  // Try different FitAddon constructors (CDN UMD vs ES module)
  var fitAddon;
  if (FitAddon && FitAddon.FitAddon) {
    fitAddon = new FitAddon.FitAddon();
  } else if (FitAddon) {
    fitAddon = new FitAddon();
  } else {
    // Fallback: use internal fit handler
    fitAddon = { fit: function() {} };
    term.fit = function() {
      // Manual resize to container
      var cols = Math.max(40, Math.floor((term.element.offsetWidth - 10) / 9));
      var rows = Math.max(20, Math.floor((term.element.offsetHeight - 4) / 19));
      term.resize(cols, rows);
    };
    console.warn('FitAddon not found, using manual fit fallback');
  }
  if (fitAddon.fit) term.loadAddon(fitAddon);

  var container = document.getElementById('terminal-container');
  if (!container) {
    console.error('Terminal container #terminal-container not found');
    return;
  }
  term.open(container);

  // Initial fit
  setTimeout(function() {
    try { term.fit(); } catch(e) { console.warn('FitAddon error:', e); }
  }, 50);

  // ─── WebSocket Connection ──────────────────────────

  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var ws = new WebSocket(protocol + '//' + location.host);

  var termReady = false;
  var buffer = [];

  ws.onopen = function() {
    termReady = true;
    for (var i = 0; i < buffer.length; i++) {
      ws.send(JSON.stringify(buffer[i]));
    }
    buffer = [];
    term.focus();
    try { term.fit(); } catch(e) {}
  };

  ws.onmessage = function(event) {
    var msg = JSON.parse(event.data);
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
    var msg = { type: 'input', data: data };
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

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      try { term.fit(); } catch(e) {}
      if (termReady && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }, 100);
  });

  // ─── Focus terminal on click ────────────────────────

  container.addEventListener('click', function() { term.focus(); });

})();