/**
 * Desktop / VNC module — installation progress, WebSocket management, and VNC probing.
 */
'use strict';

import { getSessionToken } from './api.js';
import { escapeHtml, formatTime } from './utils.js';

/** Guard to prevent duplicate installation attempts. */
let desktopActivated = false;

/** WebSocket reference for the install service. */
let installWs = null;

// ─── Desktop Activation ────────────────────────────────────────────────────

/**
 * Activate the desktop install flow: connect to /install/ WebSocket,
 * manage progress UI, probe VNC on completion, and handle retry.
 */
function activateDesktop() {
  if (desktopActivated) return;
  desktopActivated = true;

  var logContent = document.getElementById('install-log-content');
  var installView = document.getElementById('desktop-install');
  var dot = document.getElementById('desktop-dot');
  var statusText = document.getElementById('desktop-status-text');
  var progressFill = document.getElementById('install-progress-fill');
  var progressLabel = document.getElementById('install-progress-label');
  var elapsedEl = document.getElementById('install-elapsed');
  var retryBtn = document.getElementById('install-retry-btn');
  var subtitle = document.getElementById('install-subtitle');
  var installStart = Date.now();
  var elapsedTimer = null;
  var currentStep = 0;
  var totalSteps = 4;

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Update the status indicator dot and text.
   * @param {'connecting'|'connected'|'error'} state
   * @param {string} msg
   */
  function setStatus(state, msg) {
    dot.className = 'status-dot ' + state;
    statusText.textContent = msg;
  }

  /** Update the elapsed time display. */
  function updateElapsed() {
    var sec = Math.floor((Date.now() - installStart) / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    elapsedEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  /**
   * Append text to the install log and parse step markers.
   * @param {string} text
   */
  function appendLog(text) {
    logContent.textContent += text;
    logContent.scrollTop = logContent.scrollHeight;
    // Parse step markers from install script output
    var stepMatch = text.match(/\[(\d+)\/(\d+)\]/);
    if (stepMatch) {
      currentStep = parseInt(stepMatch[1], 10);
      totalSteps = parseInt(stepMatch[2], 10);
      var pct = Math.round((currentStep / totalSteps) * 100);
      if (progressFill) progressFill.style.width = Math.min(pct, 95) + '%';
      var stepNames = ['', 'Updating packages', 'Installing desktop', 'Setting up VNC', 'Finalizing'];
      var name = stepNames[currentStep] || 'Installing...';
      if (progressLabel) progressLabel.textContent = name;
      if (subtitle) subtitle.textContent = 'Step ' + currentStep + ' of ' + totalSteps + ': ' + name;
    }
    if (text.indexOf('[DONE]') !== -1) {
      if (progressFill) progressFill.style.width = '100%';
      if (progressLabel) progressLabel.textContent = 'Installation complete';
      if (subtitle) subtitle.textContent = 'Starting desktop...';
    }
    if (text.indexOf('[ERROR]') !== -1) {
      if (progressFill) progressFill.style.background = 'var(--danger)';
      if (progressLabel) progressLabel.textContent = 'Failed';
      if (retryBtn) retryBtn.style.display = 'inline-flex';
    }
  }

  // ── VNC Probe ──────────────────────────────────────────────────────────
  /**
   * Probe the VNC endpoint repeatedly until the desktop is ready or max retries exhausted.
   */
  function probeVnc() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var token = getSessionToken();
    var testUrl = protocol + '//' + location.host + '/vnc/?token=' + encodeURIComponent(token || '');
    var retries = 0;
    var maxRetries = 90;
    var retryDelay = 3000;
    var probeStart = Date.now();

    function setProbeStatus(msg) {
      setStatus('connecting', msg);
      if (subtitle) subtitle.textContent = msg;
    }

    function attempt() {
      var elapsedProbe = Math.floor((Date.now() - probeStart) / 1000);
      var pct = Math.min(95 + Math.round((retries / maxRetries) * 5), 99);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressLabel) progressLabel.textContent = 'Waiting for VNC (' + (retries + 1) + '/' + maxRetries + ')';
      if (elapsedEl) elapsedEl.textContent = formatTime(Math.floor((Date.now() - installStart) / 1000));
      setProbeStatus('Starting desktop... (' + (retries + 1) + '/' + maxRetries + ')');
      var testWs = new WebSocket(testUrl);
      var done = false;

      function fail() {
        if (done) return;
        done = true;
        testWs.close();
        retries++;
        if (retries < maxRetries) {
          appendLog('[Desktop not ready yet, retrying in ' + (retryDelay / 1000) + 's...]\n');
          setTimeout(attempt, retryDelay / 2);
        } else {
          appendLog('\n[Desktop is not available after ' + maxRetries + ' attempts.]\n');
          setStatus('error', 'Desktop unavailable');
          if (progressLabel) progressLabel.textContent = 'Failed';
          if (subtitle) subtitle.textContent = 'Desktop failed to start. Click Retry.';
          if (retryBtn) retryBtn.style.display = 'inline-flex';
          desktopActivated = false;
        }
      }

      function succeed() {
        if (done) return;
        done = true;
        testWs.close();
        clearInterval(elapsedTimer);
        setStatus('connected', 'Desktop ready');
        if (progressFill) progressFill.style.width = '100%';
        if (progressLabel) progressLabel.textContent = 'Desktop ready';
        if (subtitle) subtitle.textContent = 'Desktop is running!';
        appendLog('[Desktop connection established]\n');
        installView.style.display = 'none';
        var openBtn = document.getElementById('desktop-open-tab');
        openBtn.style.display = 'inline-flex';
        openBtn.click();
      }

      testWs.onmessage = function() { succeed(); };
      testWs.onerror = function() { fail(); };
      testWs.onclose = function() { fail(); };
    }

    attempt();
  }

  // ── Connect to Install WebSocket ───────────────────────────────────────

  setStatus('connecting', 'Installing desktop...');
  appendLog('Connecting to installation service...\n');
  updateElapsed();
  elapsedTimer = setInterval(updateElapsed, 1000);

  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var token = getSessionToken();
  var url = protocol + '//' + location.host + '/install/';

  installWs = new WebSocket(url);
  installWs.onopen = function() {
    if (token) installWs.send(JSON.stringify({ type: 'auth', token: token }));
  };

  installWs.onmessage = function(event) {
    var msg = JSON.parse(event.data);
    if (msg.type === 'log') {
      appendLog(msg.data);
    }
  };

  installWs.onclose = function() {
    clearInterval(elapsedTimer);
    setStatus('connecting', 'Checking installation status...');
    appendLog('\n[Connection closed. Checking if desktop is ready...]\n');

    setTimeout(function() {
      probeVnc();
    }, 1000);
  };

  installWs.onerror = function() {
    clearInterval(elapsedTimer);
    appendLog('\n[Failed to connect to installation service]\n');
    setStatus('error', 'Connection failed');
    if (progressLabel) progressLabel.textContent = 'Connection failed';
    if (retryBtn) retryBtn.style.display = 'inline-flex';
    desktopActivated = false;
  };

  // ── Retry button ───────────────────────────────────────────────────────
  if (retryBtn) {
    retryBtn.addEventListener('click', function() {
      retryBtn.style.display = 'none';
      if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.background = '';
      }
      if (progressLabel) progressLabel.textContent = 'Starting...';
      if (elapsedEl) elapsedEl.textContent = '—';
      if (subtitle) subtitle.textContent = 'Xfce desktop is being installed on the server. This may take 1-3 minutes...';
      desktopActivated = false;
      if (installWs) { try { installWs.close(); } catch (e) {} }
      logContent.textContent = 'Restarting installation...\n';
      activateDesktop();
    });
  }
}

// ─── Event Wiring ──────────────────────────────────────────────────────────

/**
 * Wire desktop-related UI events.
 */
function initDesktopEvents() {
  // ── Pane tab click for desktop ─────────────────────────────────────────
  var desktopTab = document.querySelector('.pane-tab[data-tab="desktop"]');
  if (desktopTab) {
    desktopTab.addEventListener('click', function() {
      activateDesktop();
    });
  }

  // ── Desktop open tab button ────────────────────────────────────────────
  var openTabBtn = document.getElementById('desktop-open-tab');
  if (openTabBtn) {
    openTabBtn.addEventListener('click', function() {
      var token = getSessionToken();
      var wsPath = token ? 'vnc/?token=' + encodeURIComponent(token) : 'vnc/';
      var params = new URLSearchParams({
        host: location.hostname,
        port: location.protocol === 'https:' ? 443 : 80,
        path: wsPath,
        encrypt: location.protocol === 'https:' ? 1 : 0,
        autoconnect: 1,
        reconnect: 5,
      });
      window.open('/novnc/vnc.html?' + params.toString(), '_blank');
    });
  }
}

export { activateDesktop, initDesktopEvents };
