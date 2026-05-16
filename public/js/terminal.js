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
    fontSize: 16,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    allowTransparency: true,
    theme: {
      background: '#000000',
      foreground: '#e0e0e0',
      cursor: '#ffffff',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(255,255,255,0.12)',
      black: '#222222',
      red: '#e03030',
      green: '#1a8a5a',
      yellow: '#bb8800',
      blue: '#3080cc',
      magenta: '#888888',
      cyan: '#666666',
      white: '#cccccc',
      brightBlack: '#444444',
      brightRed: '#e05050',
      brightGreen: '#2aaa6a',
      brightYellow: '#ddaa00',
      brightBlue: '#4090dd',
      brightMagenta: '#aaaaaa',
      brightCyan: '#888888',
      brightWhite: '#ffffff',
    },
  });

  var fitAddon;
  if (FitAddon && FitAddon.FitAddon) {
    fitAddon = new FitAddon.FitAddon();
  } else if (FitAddon) {
    fitAddon = new FitAddon();
  } else {
    fitAddon = { activate: function() {}, dispose: function() {} };
    console.warn('FitAddon not found, using manual fit fallback');
  }

  var origFit = fitAddon.fit ? fitAddon.fit.bind(fitAddon) : null;
  fitAddon.fit = function() {
    if (origFit) {
      try { origFit(); return; } catch(e) {}
    }
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

  var ws = null, termReady = false, buffer = [];

  function connectWs() {
    try { fitAddon.fit(); } catch(e) {}
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var token = localStorage.getItem('wfs-session-token') || '';
    var wsUrl = protocol + '//' + location.host;
    var p = [];
    if (token) p.push('token=' + encodeURIComponent(token));
    p.push('cols=' + term.cols);
    p.push('rows=' + term.rows);
    wsUrl += '?' + p.join('&');

    ws = new WebSocket(wsUrl);
    termReady = false;

    ws.onopen = function() {
      termReady = true;
      for (var i = 0; i < buffer.length; i++) ws.send(JSON.stringify(buffer[i]));
      buffer = [];
      term.focus();
    };

    ws.onmessage = function(event) {
      var msg = JSON.parse(event.data);
      if (msg.type === 'output') term.write(msg.data);
      else if (msg.type === 'exit') term.write('\r\n[Session ended]\r\n');
    };

    ws.onclose = function() {
      termReady = false;
      term.write('\r\n[Disconnected. Reconnecting in 3s...]\r\n');
      setTimeout(connectWs, 3000);
    };
  }

  // Connect after a short delay so the DOM is settled
  setTimeout(connectWs, 150);

  // ─── Terminal Input ────────────────────────────────

  term.onData(function(data) {
    if (termReady && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: data }));
    } else {
      buffer.push({ type: 'input', data: data });
    }
  });

  term.onResize(function(size) {
    if (termReady && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
    }
  });

  // ─── Window resize ─────────────────────────────────

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      try { fitAddon.fit(); } catch(e) {}
      if (termReady && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }, 100);
  });

  // ─── Keyboard shortcuts ────────────────────────────

  container.addEventListener('keydown', function(e) {
    // Ctrl+Shift+C → copy selection
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      if (term.hasSelection()) {
        document.execCommand('copy');
        e.preventDefault();
        return;
      }
    }
    // Ctrl+Shift+V → paste
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      navigator.clipboard.readText().then(function(text) {
        if (termReady && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: text }));
        }
      });
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+X, Ctrl+Shift+E, etc → send to terminal as regular input
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
      // Let these pass through to the terminal
      return;
    }
  });

  // ─── Focus on click ────────────────────────────────

  container.addEventListener('click', function() { term.focus(); });

  // ─── Expose command sender ─────────────────────────

  window.sendToTerminal = function(data) {
    var msg = { type: 'input', data: data + '\n' };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

})();