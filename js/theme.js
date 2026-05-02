const THEME_KEY = 'smartspendTheme';
const DEFAULT_THEME = 'night';

function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'day' || stored === 'night' ? stored : DEFAULT_THEME;
}

function applyTheme(theme) {
  const resolvedTheme = theme === 'day' ? 'day' : 'night';
  document.documentElement.dataset.theme = resolvedTheme;
  localStorage.setItem(THEME_KEY, resolvedTheme);
  window.dispatchEvent(new CustomEvent('smartspend:themechange', {
    detail: { theme: resolvedTheme }
  }));
}

function getToggleMeta(theme) {
  if (theme === 'day') {
    return {
      nextTheme: 'night',
      label: 'Dark mode',
      badge: 'Dark'
    };
  }

  return {
    nextTheme: 'day',
    label: 'Day mode',
    badge: 'AM'
  };
}

function initThemeToggle() {
  if (document.querySelector('.theme-toggle-shell')) {
    return;
  }

  const shell = document.createElement('div');
  shell.className = 'theme-toggle-shell';
  shell.innerHTML = `
    <button class="theme-toggle" type="button">
      <span class="theme-toggle__badge" aria-hidden="true"></span>
      <span class="theme-toggle__label"></span>
    </button>
  `;

  const button = shell.querySelector('.theme-toggle');
  const badge = shell.querySelector('.theme-toggle__badge');
  const label = shell.querySelector('.theme-toggle__label');
  const POS_KEY = 'smartspendThemeTogglePos';
  let dragging = false;
  let moved = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let rafId = 0;
  let pendingX = 0;
  let pendingY = 0;

  function render() {
    const currentTheme = getStoredTheme();
    const meta = getToggleMeta(currentTheme);

    shell.dataset.theme = currentTheme;
    badge.textContent = meta.badge;
    label.textContent = meta.label;
    button.setAttribute('aria-label', `Switch to ${meta.label.toLowerCase()}`);
    button.dataset.nextTheme = meta.nextTheme;
  }

  button.addEventListener('click', () => {
    if (moved) {
      moved = false;
      return;
    }
    applyTheme(button.dataset.nextTheme || DEFAULT_THEME);
    render();
  });

  function savePosition(left, top) {
    localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
  }

  function applySavedPosition() {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    try {
      const pos = JSON.parse(raw);
      if (typeof pos.left === 'number' && typeof pos.top === 'number') {
        shell.style.left = `${pos.left}px`;
        shell.style.top = `${pos.top}px`;
        shell.style.right = 'auto';
      }
    } catch {
      // ignore invalid saved position
    }
  }

  function startDrag(clientX, clientY, nextPointerId = null) {
    const rect = shell.getBoundingClientRect();
    dragging = true;
    moved = false;
    pointerId = nextPointerId;
    startX = clientX;
    startY = clientY;
    originLeft = rect.left;
    originTop = rect.top;
    shell.classList.add('theme-toggle-shell--draggable');
  }

  function flushMove() {
    rafId = 0;
    const dx = pendingX - startX;
    const dy = pendingY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      moved = true;
    }
    const nextLeft = Math.min(
      window.innerWidth - shell.offsetWidth - 6,
      Math.max(6, originLeft + dx)
    );
    const nextTop = Math.min(
      window.innerHeight - shell.offsetHeight - 6,
      Math.max(6, originTop + dy)
    );
    shell.style.left = `${nextLeft}px`;
    shell.style.top = `${nextTop}px`;
    shell.style.right = 'auto';
  }

  function moveDrag(clientX, clientY) {
    if (!dragging) return;
    pendingX = clientX;
    pendingY = clientY;
    if (!rafId) {
      rafId = requestAnimationFrame(flushMove);
    }
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    pointerId = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    shell.classList.remove('theme-toggle-shell--draggable');
    const rect = shell.getBoundingClientRect();
    savePosition(rect.left, rect.top);
  }

  shell.addEventListener('pointerdown', event => {
    startDrag(event.clientX, event.clientY, event.pointerId);
  });
  window.addEventListener('pointermove', event => {
    if (!dragging) return;
    if (pointerId != null && event.pointerId !== pointerId) return;
    moveDrag(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', event => {
    if (pointerId != null && event.pointerId !== pointerId) return;
    endDrag();
  });
  window.addEventListener('pointercancel', endDrag);

  document.body.appendChild(shell);
  applySavedPosition();
  render();
}

document.documentElement.dataset.theme = getStoredTheme();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeToggle, { once: true });
} else {
  initThemeToggle();
}
