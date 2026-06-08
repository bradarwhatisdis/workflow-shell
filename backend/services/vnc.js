/**
 * VNC server management service.
 * Extracted from server.js — start/stop VNC server with Xvfb, fluxbox, x11vnc.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const { VNC_RFB_PORT, INSTALL_SCRIPT } = require('../config');

// ── State ──

const installState = {
  running: false,
  done: false,
  logs: [],
  listeners: [],
  vncProcesses: [],
};

// ── Functions ──

function startVNCServer() {
  try { spawnSync('pkill', ['-f', 'Xvfb.*:1']); } catch (e) {}
  try { spawnSync('pkill', ['-f', 'x11vnc.*5901']); } catch (e) {}
  try { spawnSync('pkill', ['-f', '(fluxbox|fbpager)']); } catch (e) {}
  try { spawnSync('pkill', ['-f', 'dbus-daemon.*:1']); } catch (e) {}

  const xvfb = spawn('Xvfb', [':1', '-screen', '0', '1280x720x24', '+extension', 'GLX'], { stdio: 'pipe' });
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
  var osHome = require('os').userInfo().homedir;
  console.log('[desktop] process.env.HOME=' + process.env.HOME + ', os.userInfo().homedir=' + osHome + ', uid=' + process.getuid());
  desktopEnv.HOME = osHome;

  function spawnDesktop(name, args, delay) {
    setTimeout(function() {
      var proc = spawn(name, args, { stdio: 'pipe', env: desktopEnv });
      proc.stderr.on('data', function(d) { console.error('[' + name + ']', d.toString().trim()); });
      proc.on('exit', function(code) { console.log('[' + name + '] exited with code ' + code); });
      installState.vncProcesses.push(proc);
      console.log('[' + name + '] started');
    }, delay);
  }

  // Start fluxbox window manager (lightweight, no D-Bus needed)
  spawnDesktop('fluxbox', [], 2000);

  // Start x11vnc after display is ready
  setTimeout(function() {
    const vnc = spawn('x11vnc', [
      '-display', ':1', '-forever', '-shared',
      '-rfbport', String(VNC_RFB_PORT), '-nopw',
      '-bg', '-o', '/tmp/x11vnc.log',
      '-nowf', '-norc',
    ], { stdio: 'pipe' });
    vnc.stderr.on('data', (d) => console.error('[x11vnc]', d.toString().trim()));
    vnc.on('exit', (code) => console.log('[x11vnc] exited with code ' + code));
    installState.vncProcesses.push(vnc);
    console.log('VNC server started on port ' + VNC_RFB_PORT);
  }, 8000);
}

function stopVNCServer() {
  installState.vncProcesses.forEach(p => { try { p.kill(); } catch (e) {} });
  installState.vncProcesses = [];
  try { spawnSync('pkill', ['-f', 'Xvfb.*:1']); } catch (e) {}
  try { spawnSync('pkill', ['-f', 'x11vnc.*5901']); } catch (e) {}
  try { spawnSync('pkill', ['-f', '(fluxbox|fbpager)']); } catch (e) {}
}

module.exports = { installState, startVNCServer, stopVNCServer };
