// ─── Resizable Panes ───────────────────────────────────────
(function() {
  const resizer = document.getElementById('resizer');
  const filePane = document.getElementById('file-pane');
  const mainContainer = document.querySelector('.main-container');

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', function(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = filePane.offsetWidth;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(220, Math.min(startWidth + dx, mainContainer.offsetWidth - 300));
    filePane.style.width = newWidth + 'px';
    filePane.style.minWidth = newWidth + 'px';
    filePane.style.flex = 'none';
  });

  document.addEventListener('mouseup', function() {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  resizer.addEventListener('touchstart', function(e) {
    isResizing = true;
    startX = e.touches[0].clientX;
    startWidth = filePane.offsetWidth;
    resizer.classList.add('active');
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (!isResizing) return;
    const dx = e.touches[0].clientX - startX;
    const newWidth = Math.max(220, Math.min(startWidth + dx, mainContainer.offsetWidth - 300));
    filePane.style.width = newWidth + 'px';
    filePane.style.minWidth = newWidth + 'px';
    filePane.style.flex = 'none';
  }, { passive: false });

  document.addEventListener('touchend', function() {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('active');
  });
})();

// ─── Close modals on overlay click ────────────────────────
document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

// ─── Escape key to close modals ────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(function(m) {
      m.classList.remove('active');
    });
  }
});