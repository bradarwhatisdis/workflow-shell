/**
 * Frontend utility functions for Workflow Shell.
 * Pure functions with no side effects on import.
 */

export function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function joinPath(base, name) {
  if (base === '/') return '/' + name;
  return base + '/' + name;
}

export function dirname(p) {
  if (!p || p === '/') return '/';
  p = p.replace(/\/+$/, '');
  var i = p.lastIndexOf('/');
  if (i === -1) return '.';
  if (i === 0) return '/';
  return p.substring(0, i);
}

export function basename(p) {
  if (!p || p === '/') return '';
  p = p.replace(/\/+$/, '');
  var i = p.lastIndexOf('/');
  return i === -1 ? p : p.substring(i + 1);
}

export function getExtension(name) {
  var i = name.lastIndexOf('.');
  return i > 0 ? name.substring(i + 1).toLowerCase() : '';
}

export function getFileIcon(name, isDir) {
  if (isDir) return 'fa-folder';
  var ext = getExtension(name);
  var map = {
    sh: 'fa-file-lines sh', py: 'fa-file-code py', js: 'fa-file-code js',
    ts: 'fa-file-code ts', jsx: 'fa-file-code js', tsx: 'fa-file-code ts',
    css: 'fa-file-code css', scss: 'fa-file-code css', less: 'fa-file-code css',
    html: 'fa-file-code html', htm: 'fa-file-code html',
    json: 'fa-file-code json', yml: 'fa-file-code yml', yaml: 'fa-file-code yaml',
    xml: 'fa-file-code', svg: 'fa-file-code html',
    md: 'fa-file-lines md', mdx: 'fa-file-lines md',
    txt: 'fa-file-lines txt', log: 'fa-file-lines log',
    png: 'fa-file-image image', jpg: 'fa-file-image image', jpeg: 'fa-file-image image',
    gif: 'fa-file-image image', webp: 'fa-file-image image', ico: 'fa-file-image image',
    pdf: 'fa-file-pdf', zip: 'fa-file-zipper', tar: 'fa-file-zipper',
    gz: 'fa-file-zipper', rar: 'fa-file-zipper', '7z': 'fa-file-zipper',
    exe: 'fa-gear', deb: 'fa-gear', rpm: 'fa-gear',
    conf: 'fa-file-lines', cfg: 'fa-file-lines', ini: 'fa-file-lines',
    env: 'fa-file-lines', gitignore: 'fa-file-lines',
  };
  return map[ext] || 'fa-file';
}

export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024;
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

export function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  var now = new Date();
  var diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
