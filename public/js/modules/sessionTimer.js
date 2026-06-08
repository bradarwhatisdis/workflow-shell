/**
 * Session timer — displays elapsed time (MM:SS) and info tooltip.
 */
import { formatTime } from './utils.js';

/** Start the session timer and wire tooltip events */
export function initSessionTimer() {
  var sessionStart = Date.now();
  var timerDisplay = document.getElementById('timer-display');
  var timerInfoBtn = document.getElementById('timer-info-btn');
  if (!timerDisplay || !timerInfoBtn) return;

  var timerTooltip = null;

  // Update every second
  setInterval(function() {
    var elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    timerDisplay.textContent = formatTime(elapsed);
  }, 1000);

  // Tooltip toggle
  timerInfoBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (timerTooltip && timerTooltip.classList.contains('visible')) {
      timerTooltip.classList.remove('visible');
      return;
    }
    if (!timerTooltip) {
      timerTooltip = document.createElement('div');
      timerTooltip.className = 'timer-tooltip';
      timerTooltip.innerHTML =
        '<h4><i class="fas fa-clock"></i> Session Timeout</h4>' +
        '<p>This timer tracks how long this workflow shell has been running. The session token expires after 5 minutes of inactivity.</p>' +
        '<div class="timer-tip-row"><span class="timer-tip-label">Session TTL</span><span class="timer-tip-value">5 min (idle)</span></div>' +
        '<div class="timer-tip-row"><span class="timer-tip-label">Session renews</span><span class="timer-tip-value">On each request</span></div>';
      document.body.appendChild(timerTooltip);
    }
    var rect = timerInfoBtn.getBoundingClientRect();
    timerTooltip.style.left = Math.max(10, rect.right - 280) + 'px';
    timerTooltip.style.top = (rect.bottom + 8) + 'px';
    timerTooltip.classList.add('visible');
  });

  // Hide tooltip on outside click
  document.addEventListener('click', function(e) {
    if (timerTooltip && !e.target.closest('.session-timer')) {
      timerTooltip.classList.remove('visible');
    }
  });
}
