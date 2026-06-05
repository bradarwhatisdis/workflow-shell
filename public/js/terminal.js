// ─── Terminal Setup ────────────────────────────────────

(function() {
  var Terminal = window.Terminal;
  var FitAddon = window.FitAddon;

  if (!Terminal) {
    console.error('xterm.js not loaded. Run: cd backend && npm install');
    return;
  }

  var themePresets = {
    default: { background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26', black: '#1d202f', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6', brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5' },
    light: { background: '#ffffff', foreground: '#1a1a2e', cursor: '#1a1a2e', cursorAccent: '#ffffff', black: '#333333', red: '#cc3333', green: '#228833', yellow: '#ccaa22', blue: '#3366cc', magenta: '#8833cc', cyan: '#228899', white: '#cccccc', brightBlack: '#666666', brightRed: '#cc5555', brightGreen: '#44aa55', brightYellow: '#ddbb33', brightBlue: '#5577dd', brightMagenta: '#aa55dd', brightCyan: '#44aabb', brightWhite: '#eeeeee' },
    dracula: { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#6272a4', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#8fa4d4', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff' },
    monokai: { background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#272822', black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75', blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2', brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5' },
    solarized: { background: '#002b36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002b36', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5', brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900', brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#d33682', brightCyan: '#2aa198', brightWhite: '#fdf6e3' },
  };

  var savedTheme = localStorage.getItem('wfs-terminal-theme') || 'default';
  var initialTheme = themePresets[savedTheme] || themePresets.default;

  var term = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
    fontSize: 18,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    allowTransparency: true,
    theme: initialTheme,
  });

  window.term = term;

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

  var ws = null, termReady = false, buffer = [], reconnectAttempt = 0;

  function connectWs() {
    try { fitAddon.fit(); } catch(e) {}
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var token = localStorage.getItem('wfs-session-token') || '';
    var wsUrl = protocol + '//' + location.host;
    wsUrl += '?cols=' + term.cols + '&rows=' + term.rows;

    ws = new WebSocket(wsUrl);
    termReady = false;

    ws.onopen = function() {
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token: token }));
      }
      reconnectAttempt = 0;
      for (var i = 0; i < buffer.length; i++) ws.send(JSON.stringify(buffer[i]));
      buffer = [];
      term.focus();
    };

    ws.onmessage = function(event) {
      var msg = JSON.parse(event.data);
      if (msg.type === 'output') {
        if (!termReady) termReady = true;
        term.write(msg.data);
        if (typeof showProcessIndicator === 'function') showProcessIndicator();
      } else if (msg.type === 'exit') {
        term.write('\r\n[Session ended]\r\n');
      }
    };

    ws.onclose = function() {
      termReady = false;
      var delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
      reconnectAttempt++;
      term.write('\r\n[Disconnected. Reconnecting in ' + (delay / 1000) + 's...]\r\n');
      setTimeout(connectWs, delay);
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
        navigator.clipboard.writeText(term.getSelection()).catch(function() {
          document.execCommand('copy');
        });
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