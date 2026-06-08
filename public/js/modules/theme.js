/**
 * Theme toggle (dark/light) and terminal theme sync.
 */
import { toast } from './toast.js';

/** Apply the selected terminal theme to the xterm.js instance */
export function applyTerminalTheme(theme) {
  var presets = window.termThemePresets;
  if (!presets) return;
  var t = presets[theme] || presets.default;
  if (typeof term !== 'undefined' && term) {
    try { term.setOption('theme', t); } catch (e) { /* ignore */ }
  }
}

/** Wire #theme-toggle button and initialise theme from localStorage */
export function initThemeToggle() {
  var themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  var currentTheme = localStorage.getItem('wfs-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  themeToggle.innerHTML = '<i class="fas fa-' + (currentTheme === 'dark' ? 'sun' : 'moon') + '"></i>';

  themeToggle.addEventListener('click', function() {
    var theme = document.documentElement.getAttribute('data-theme');
    var newTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('wfs-theme', newTheme);
    themeToggle.innerHTML = '<i class="fas fa-' + (newTheme === 'dark' ? 'sun' : 'moon') + '"></i>';
    toast(newTheme === 'light' ? 'Light theme' : 'Dark theme', 'fa-palette', 'var(--accent)');

    // Sync terminal theme after theme change
    setTimeout(function() {
      applyTerminalTheme(localStorage.getItem('wfs-terminal-theme') || 'default');
    }, 100);
  });
}
