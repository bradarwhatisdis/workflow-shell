(function() {
  var resizer = document.getElementById('resizer');
  var filePane = document.getElementById('file-pane');
  var mainContainer = document.querySelector('.main-container');

  if (!resizer || !filePane || !mainContainer) return;

  var isResizing = false;
  var startX = 0;
  var startWidth = 0;
  var isMobile = window.innerWidth <= 768;

  function initPaneWidth() {
    if (isMobile) return;
    var saved = localStorage.getItem('wfs-pane-width');
    if (saved) {
      var w = parseInt(saved, 10);
      if (w >= 200 && w <= 600) {
        filePane.style.width = w + 'px';
        filePane.style.minWidth = w + 'px';
        filePane.style.flex = 'none';
      }
    }
  }

  initPaneWidth();

  function onStart(e) {
    isResizing = true;
    startX = e.clientX || e.touches[0].clientX;
    startWidth = filePane.offsetWidth;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function onMove(e) {
    if (!isResizing) return;
    var clientX = e.clientX || (e.touches && e.touches[0].clientX);
    if (!clientX) return;
    var dx = clientX - startX;
    var maxWidth = mainContainer.offsetWidth - 250;
    var newWidth = Math.max(180, Math.min(startWidth + dx, maxWidth));
    filePane.style.width = newWidth + 'px';
    filePane.style.minWidth = newWidth + 'px';
    filePane.style.flex = 'none';
  }

  function onEnd() {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (!isMobile) {
      localStorage.setItem('wfs-pane-width', filePane.offsetWidth);
    }
  }

  resizer.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);

  resizer.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      isMobile = window.innerWidth <= 768;
      if (isMobile) {
        filePane.style.width = '';
        filePane.style.minWidth = '';
        filePane.style.flex = '';
      } else {
        var saved = localStorage.getItem('wfs-pane-width');
        if (saved) {
          filePane.style.width = saved + 'px';
          filePane.style.minWidth = saved + 'px';
          filePane.style.flex = 'none';
        }
      }
    }, 200);
  });
})();

document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
  overlay.addEventListener('mousedown', function(e) {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

var closeDebounce = {};
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (closeDebounce.escape) return;
    closeDebounce.escape = true;
    setTimeout(function() { closeDebounce.escape = false; }, 100);
    document.querySelectorAll('.modal-overlay.active').forEach(function(m) {
      m.classList.remove('active');
    });
  }
});

console.log('Workflow Shell loaded');
