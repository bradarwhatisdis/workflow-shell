// ─── Pane Resizer ─────────────────────────────────────

export function initPaneResizer() {
  const resizer = document.getElementById('resizer');
  const filePane = document.getElementById('file-pane');
  const mainContainer = document.querySelector('.bento-grid');

  if (!resizer || !filePane || !mainContainer) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  let isMobile = window.innerWidth <= 768;

  function initPaneWidth() {
    if (isMobile) return;
    const saved = localStorage.getItem('wfs-pane-width');
    if (saved) {
      const w = parseInt(saved, 10);
      if (w >= 200 && w <= 600) {
        filePane.style.width = w + 'px';
        filePane.style.minWidth = w + 'px';
        filePane.style.flex = 'none';
        resizer.style.left = w + 'px';
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
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    if (!clientX) return;
    const dx = clientX - startX;
    const maxWidth = mainContainer.offsetWidth - 250;
    const newWidth = Math.max(180, Math.min(startWidth + dx, maxWidth));
    filePane.style.width = newWidth + 'px';
    filePane.style.minWidth = newWidth + 'px';
    filePane.style.flex = 'none';
    resizer.style.left = newWidth + 'px';
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

  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      isMobile = window.innerWidth <= 768;
      if (isMobile) {
        filePane.style.width = '';
        filePane.style.minWidth = '';
        filePane.style.flex = '';
      } else {
        const saved = localStorage.getItem('wfs-pane-width');
        if (saved) {
          filePane.style.width = saved + 'px';
          filePane.style.minWidth = saved + 'px';
          filePane.style.flex = 'none';
        }
      }
    }, 200);
  });
}

// ─── Modal Overlay Click-to-Close ─────────────────────

export function initModalOverlayClose() {
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}
