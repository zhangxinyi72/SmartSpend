// ─── UTILS ────────────────────────────────────────────────────

const LOGIN_PATH = '/index.html';
const HOME_PATH = '/home.html';

/** Primary budget/expense picker categories (order preserved). */
export const CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Healthcare'
];

/**
 * Colors for UI + charts. Extra keys (Food, Transport, Rent, …) keep analytics slices distinct
 * when legacy/seed data uses mixed category names.
 */
export const CATEGORY_COLORS = {
  'Food & Dining': '#7C3AED',
  Food: '#A855F7',
  Transportation: '#65A30D',
  Transport: '#0EA5E9',
  Shopping: '#F97316',
  'Bills & Utilities': '#6366F1',
  Utilities: '#2563EB',
  Entertainment: '#EC4899',
  Healthcare: '#0F766E',
  Health: '#14B8A6',
  Rent: '#E11D48'
};

export const CATEGORY_ICONS = {
  'Food & Dining': '🍽️',
  Food: '🍽️',
  Transportation: '🚗',
  Transport: '🚗',
  Shopping: '🛍️',
  'Bills & Utilities': '⚡',
  Utilities: '💡',
  Entertainment: '🎬',
  Healthcare: '💊',
  Health: '💊',
  Rent: '🏠'
};

/** Lowercase lookup so any spelling variant gets a stable, distinct color. */
const CATEGORY_COLOR_BY_LOWER = {
  'food & dining': CATEGORY_COLORS['Food & Dining'],
  food: CATEGORY_COLORS.Food,
  transport: CATEGORY_COLORS.Transport,
  transportation: CATEGORY_COLORS.Transportation,
  shopping: CATEGORY_COLORS.Shopping,
  'bills & utilities': CATEGORY_COLORS['Bills & Utilities'],
  bills: CATEGORY_COLORS['Bills & Utilities'],
  utilities: CATEGORY_COLORS.Utilities,
  entertainment: CATEGORY_COLORS.Entertainment,
  healthcare: CATEGORY_COLORS.Healthcare,
  health: CATEGORY_COLORS.Health,
  rent: CATEGORY_COLORS.Rent
};

export function getStoredUser() {
  const raw = localStorage.getItem('smartspendUser');
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return localStorage.getItem('smartspendToken') || '';
}

export function saveAuthSession({ user, token }) {
  if (user) {
    localStorage.setItem('smartspendUser', JSON.stringify(user));
  }

  if (token) {
    localStorage.setItem('smartspendToken', token);
  }
}

export function clearAuthSession() {
  localStorage.removeItem('smartspendUser');
  localStorage.removeItem('smartspendToken');
  localStorage.removeItem('smartspendProfile');
}

export function redirectToLogin() {
  window.location.href = LOGIN_PATH;
}

export function redirectToHome() {
  window.location.href = HOME_PATH;
}

export function requireAuth() {
  if (!getStoredUser() || !getStoredToken()) {
    redirectToLogin();
    return false;
  }

  return true;
}

export function redirectIfAuthenticated() {
  if (getStoredUser() && getStoredToken()) {
    redirectToHome();
    return true;
  }

  return false;
}

export function initPasswordToggles(root = document) {
  root.querySelectorAll('[data-password-toggle]').forEach(button => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';

    button.addEventListener('click', () => {
      const inputId = button.dataset.passwordToggle;
      const input = root.getElementById
        ? root.getElementById(inputId)
        : document.getElementById(inputId);

      if (!input) return;

      const shouldShow = input.type === 'password';
      input.type = shouldShow ? 'text' : 'password';
      button.textContent = shouldShow ? 'Hide' : 'Show';
      button.setAttribute('aria-pressed', String(shouldShow));
    });
  });
}

export function getFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

/**
 * Format a number as currency string: $1,234.56
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format ISO date string (YYYY-MM-DD) to readable format: Mar 21, 2026
 */
export function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format ISO date string for short display: Mar 21
 */
export function formatDateShort(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get a Date for N days ago from today
 */
export function getDaysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Returns today's date as YYYY-MM-DD
 */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns a color hex for a given category (distinct hues for Transport vs Transportation, Utilities vs Bills, etc.).
 */
export function getCategoryColor(category) {
  const key = String(category || '')
    .trim()
    .toLowerCase();
  if (key && CATEGORY_COLOR_BY_LOWER[key]) {
    return CATEGORY_COLOR_BY_LOWER[key];
  }
  if (key && CATEGORY_COLORS[category.trim()]) {
    return CATEGORY_COLORS[category.trim()];
  }
  return '#94A3B8';
}

/**
 * Returns an icon emoji for a given category
 */
export function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || '💸';
}

/**
 * Escape untrusted text before interpolating it into HTML templates.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Show a toast notification (success or error)
 * @param {string} message
 * @param {'success'|'error'} type
 */
export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = `${type === 'success' ? '✓' : '✕'} ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Parse a URL query param by name
 */
export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Get the current month as "Month YYYY" e.g. "March 2026"
 */
export function getCurrentMonthLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
