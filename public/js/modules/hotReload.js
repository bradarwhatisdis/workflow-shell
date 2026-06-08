/**
 * Hot-reload via WebSocket — listens for file changes and refreshes the file list.
 */
import { getSessionToken } from './api.js';
import { state } from './state.js';

var _loadDir = null;

/** Connect to /watch/ WebSocket, reload on file changes, reconnect on close/error */
export function initHotReload(loadDir) {
  _loadDir = loadDir;

  function connectWatch() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var token = getSessionToken();
    var wsUrl = protocol + '//' + location.host + '/watch/';
    var ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = function() {
        if (token) ws.send(JSON.stringify({ type: 'auth', token: token }));
      };
      ws.onmessage = function() {
        if (_loadDir) _loadDir(state.currentPath);
      };
      ws.onclose = function() {
        setTimeout(connectWatch, 3000);
      };
      ws.onerror = function() {
        setTimeout(connectWatch, 5000);
      };
    } catch (e) {
      setTimeout(connectWatch, 5000);
    }
  }

  connectWatch();
}
