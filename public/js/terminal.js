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
    cursorStyle: 'bar',
    scrollback: 10000,
    theme: {
      background: '#050813',
      foreground: '#e2e8f0',
      cursor: '#06d6a0',
      cursorAccent: '#050813',
      selectionBackground: 'rgba(139, 92, 246, 0.25)',
      black: '#2d3748',
      red: '#fc5a5a',
      green: '#06d6a0',
      yellow: '#eab308',
      blue: '#60a5fa',
      magenta: '#a78bfa',
      cyan: '#22d3ee',
      white: '#c8d0e0',
      brightBlack: '#4a5568',
      brightRed: '#ff7b7b',
      brightGreen: '#4ade80',
      brightYellow: '#facc15',
      brightBlue: '#93bbfd',
      brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9',
      brightWhite: '#f1f5f9',
    },
  });

  // Build fit addon — try multiple constructor patterns
  var fitAddon;
  if (FitAddon && FitAddon.FitAddon) {
    fitAddon = new FitAddon.FitAddon();
  } else if (FitAddon) {
    fitAddon = new FitAddon();
  } else {
    // Manual fit fallback if FitAddon unavailable
    fitAddon = { activate: function() {}, dispose: function() {} };
    console.warn('FitAddon not found, using manual fit fallback');
  }

  // Always attach our own fit function so we control the logic
  var origFit = fitAddon.fit ? fitAddon.fit.bind(fitAddon) : null;
  fitAddon.fit = function() {
    var cols, rows;
    if (origFit) {
      try {
        origFit();
        return;
      } catch(e) {
        // fall through to manual fit
      }
    }
    // Manual calculation
    cols = Math.max(40, Math.floor((term.element.offsetWidth - 14) / 9));
    rows = Math.max(10, Math.floor((term.element.offsetHeight - 4) / 19));
    try { term.resize(cols, rows); } catch(e) {}
  };
  term.loadAddon(fitAddon);

  var container = document.getElementById('terminal-container');
  if (!container) {
    console.error('Terminal container #terminal-container not found');
    return;
  }
  term.open(container);

  // Initial fit after render
  setTimeout(function() {
    try { fitAddon.fit(); } catch(e) { console.warn('fit error:', e); }
  }, 100);

  // ─── WebSocket Connection ──────────────────────────

  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var token = localStorage.getItem('wfs-session-token') || '';
  var wsUrl = protocol + '//' + location.host;
  if (token) wsUrl += '?token=' + encodeURIComponent(token);
  var ws = new WebSocket(wsUrl);

  var termReady = false;
  var buffer = [];

  ws.onopen = function() {
    termReady = true;
    for (var i = 0; i < buffer.length; i++) {
      ws.send(JSON.stringify(buffer[i]));
    }
    buffer = [];
    term.focus();
    try { fitAddon.fit(); } catch(e) {}
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

  // ─── Fit on window resize ──────────────────────────

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      try { fitAddon.fit(); } catch(e) {}
      if (termReady && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }, 100);
  });

  // ─── Focus terminal on click ────────────────────────

  container.addEventListener('click', function() { term.focus(); });

  // ─── Expose command sender for Quick Actions ────────

  window.sendToTerminal = function(data) {
    var msg = { type: 'input', data: data + '\n' };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

})();