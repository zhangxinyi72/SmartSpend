import { getExpenses, getBudgets } from './api.js';
import {
  escapeHtml, formatCurrency, formatDateShort, getCategoryColor, getCategoryIcon,
  getCurrentMonthLabel, getFirstName, getQueryParam, getStoredUser, requireAuth, showToast
} from './utils.js';

if (!requireAuth()) {
  throw new Error('Authentication required');
}

let _allExpenses = [];
let _activeCategory = null;

async function init() {
  const storedUser = getStoredUser();
  const welcomeText = document.getElementById('welcomeText');
  const mobileUserName = document.getElementById('home-mobile-user-name');
  const mobileUserAvatar = document.querySelector('.home-mobile-user__avatar');
  if (storedUser && welcomeText) {
    welcomeText.textContent = 'Welcome to SmartSpend';
  }

  if (storedUser && mobileUserName) {
    mobileUserName.textContent = storedUser.name || getFirstName(storedUser.name);
  }

  if (storedUser && mobileUserAvatar) {
    mobileUserAvatar.textContent = '👤';
  }

  document.getElementById('month-label').textContent = getCurrentMonthLabel();

  // Check for category filter from analytics pie-click
  _activeCategory = getQueryParam('category') || null;

  const [expenses, budgets] = await Promise.all([getExpenses(), getBudgets()]);
  _allExpenses = expenses;

  // Current month totals (using all expenses, not filtered view)
  const now = new Date();
  const monthExpenses = expenses.filter(e => {
    const [y, m] = String(e.date || '').split('-').map(Number);
    return y === now.getFullYear() && m === now.getMonth() + 1;
  });

  const totalSpent  = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const remaining   = totalBudget - totalSpent;

  document.getElementById('stat-spent').textContent    = formatCurrency(totalSpent);
  document.getElementById('stat-budget').textContent   = formatCurrency(totalBudget);
  document.getElementById('stat-remaining').textContent = formatCurrency(Math.abs(remaining));

  const remainingCard = document.getElementById('stat-remaining-card');
  if (remaining < 0) {
    remainingCard.classList.remove('summary-card--green');
    remainingCard.classList.add('summary-card--red');
  }

  // Update remaining trend label
  const pctLeft = totalBudget > 0 ? Math.round((remaining / totalBudget) * 100) : 0;
  const pctEl = document.getElementById('stat-remaining-pct');
  if (pctEl) {
    pctEl.textContent = remaining < 0
      ? `${Math.abs(pctLeft)}% over budget`
      : `${pctLeft}% of budget left`;
  }

  // Filter chip
  renderFilterChip();

  // Expense list (filtered or recent 5)
  renderExpenseList();
}

function renderFilterChip() {
  const wrap = document.getElementById('filter-chip-wrap');
  if (!_activeCategory) {
    wrap.innerHTML = '';
    document.getElementById('expenses-list-title').textContent = 'Recent Expenses';
    return;
  }
  const color = getCategoryColor(_activeCategory);
  const safeCategory = escapeHtml(_activeCategory);
  wrap.innerHTML = `
    <button class="filter-chip" id="clear-filter-btn">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
      ${safeCategory}
      <span class="filter-chip__x">✕</span>
    </button>`;
  document.getElementById('expenses-list-title').textContent = `${_activeCategory}`;
  document.getElementById('clear-filter-btn').addEventListener('click', () => {
    window.location.href = 'home.html';
  });
}

function renderExpenseList() {
  const container = document.getElementById('recent-expenses-list');
  let list;

  if (_activeCategory) {
    list = _allExpenses.filter(e => e.category === _activeCategory).slice(0, 20);
  } else {
    list = _allExpenses.slice(0, 5);
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🧾</div>
        <div class="empty-state__text">No expenses found${_activeCategory ? ' for this category' : ''}.</div>
      </div>`;
    return;
  }

  container.innerHTML = list.map(e => {
    const color = getCategoryColor(e.category);
    const icon  = getCategoryIcon(e.category);
    const description = escapeHtml(e.description || e.category);
    const category = escapeHtml(e.category);
    const href = `expense.html?id=${encodeURIComponent(String(e.id || ''))}`;
    return `
      <div class="expense-row"
           style="--row-color:${color}"
           data-href="${escapeHtml(href)}">
        <div class="expense-row__icon" style="background:${color}18">
          ${icon}
        </div>
        <div class="expense-row__info">
          <div class="expense-row__desc">${description}</div>
          <div class="expense-row__date">
            <span class="category-tag" style="--tag-color:${color}">${category}</span>
            &nbsp;${formatDateShort(e.date)}
          </div>
        </div>
        <div class="expense-row__amount">−${formatCurrency(e.amount)}</div>
      </div>`;
  }).join('');
  container.querySelectorAll('.expense-row[data-href]').forEach(row => {
    row.addEventListener('click', () => {
      window.location.href = row.dataset.href;
    });
  });
}

init().catch(err => {
  console.error(err);
  showToast('Failed to load data', 'error');
});
