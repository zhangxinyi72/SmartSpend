import { getExpenses, createExpense, updateExpense, deleteExpense, getBudgets } from './api.js';
import {
  CATEGORIES, CATEGORY_COLORS, CATEGORY_ICONS,
  formatCurrency, getCategoryColor, todayISO, getQueryParam, requireAuth, showToast
} from './utils.js';

if (!requireAuth()) {
  throw new Error('Authentication required');
}

let editId           = null;
let selectedCategory = null;

// ─── CATEGORY GRID ─────────────────────────────────────────────
function buildCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = CATEGORIES.map(cat => {
    const color = CATEGORY_COLORS[cat];
    const icon  = CATEGORY_ICONS[cat];
    return `
      <button
        type="button"
        class="category-btn"
        data-category="${cat}"
        style="--cat-color:${color}"
        title="${cat}"
      >
        <span class="category-btn__icon">${icon}</span>
        ${cat}
      </button>`;
  }).join('');

  grid.querySelectorAll('.category-btn').forEach(btn =>
    btn.addEventListener('click', () => selectCategory(btn.dataset.category))
  );

  const mobileSelect = document.getElementById('input-category-mobile');
  if (mobileSelect) {
    mobileSelect.innerHTML = '<option value="">Select category</option>' +
      CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    mobileSelect.addEventListener('change', () => {
      selectCategory(mobileSelect.value || null);
    });
  }
}

function selectCategory(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.category-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.category === cat)
  );
  const mobileSelect = document.getElementById('input-category-mobile');
  if (mobileSelect && mobileSelect.value !== (cat || '')) {
    mobileSelect.value = cat || '';
  }
  hideError('category');
}

async function renderRecentExpensesMobile() {
  const list = document.getElementById('recent-expense-list-mobile');
  if (!list) return;

  try {
    const expenses = await getExpenses();
    const latest = expenses.slice(0, 5);

    if (!latest.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state__text">No expenses yet</div></div>';
      return;
    }

    list.innerHTML = latest.map(item => `
      <div class="expense-recent-mobile__item">
        <div>
          <div class="expense-recent-mobile__name">${item.description || item.category}</div>
          <div class="expense-recent-mobile__meta">
            <span class="category-tag" style="--tag-color:${getCategoryColor(item.category)}">${item.category}</span>
            <span>${item.date}</span>
          </div>
        </div>
        <div class="expense-recent-mobile__amount">${formatCurrency(item.amount)}</div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="empty-state"><div class="empty-state__text">Unable to load recent expenses</div></div>';
  }
}

// ─── VALIDATION ────────────────────────────────────────────────
function showError(field, msg) {
  const el = document.getElementById(`error-${field}`);
  if (el) { if (msg) el.textContent = msg; el.classList.add('visible'); }
  document.getElementById(`input-${field}`)?.classList.add('form-input--error');
}

function hideError(field) {
  document.getElementById(`error-${field}`)?.classList.remove('visible');
  document.getElementById(`input-${field}`)?.classList.remove('form-input--error');
}

function validate() {
  let ok = true;
  if (!selectedCategory)                         { showError('category');  ok = false; } else { hideError('category'); }
  const amt = parseFloat(document.getElementById('input-amount').value);
  if (isNaN(amt) || amt <= 0)                    { showError('amount');    ok = false; } else { hideError('amount'); }
  if (!document.getElementById('input-date').value) { showError('date'); ok = false; } else { hideError('date'); }
  return ok;
}

// ─── SUBMIT ────────────────────────────────────────────────────
document.getElementById('expense-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) return;

  const btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const data = {
    amount:      parseFloat(document.getElementById('input-amount').value),
    category:    selectedCategory,
    date:        document.getElementById('input-date').value,
    description: document.getElementById('input-desc').value.trim(),
  };

  try {
    if (editId) {
      await updateExpense(editId, data);
      showToast('Expense updated');
      setTimeout(() => location.href = 'home.html', 700);
    } else {
      await createExpense(data);

      // Check if this expense pushed any budget over the limit
      await checkBudgetOverage(data);

      setTimeout(() => location.href = 'home.html', 900);
    }
  } catch (err) {
    console.error(err);
    showToast('Something went wrong', 'error');
    btn.disabled    = false;
    btn.textContent = editId ? 'Save Changes' : 'Add Expense';
  }
});

// ─── BUDGET OVER-LIMIT CHECK ───────────────────────────────────
async function checkBudgetOverage(data) {
  try {
    const budgets = await getBudgets();
    const budget  = budgets.find(b => b.category === data.category);
    if (budget && budget.spent > budget.monthly_limit) {
      const overage = budget.spent - budget.monthly_limit;
      showToast(`⚠️ ${data.category} budget exceeded by ${formatCurrency(overage)}`, 'error');
    } else {
      showToast('Expense added');
    }
  } catch {
    showToast('Expense added');
  }
}

// ─── DELETE ────────────────────────────────────────────────────
document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!editId) return;
  const btn = document.getElementById('delete-btn');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';
  try {
    await deleteExpense(editId);
    showToast('Expense deleted', 'error');
    setTimeout(() => location.href = 'home.html', 700);
  } catch (err) {
    console.error(err);
    showToast('Delete failed', 'error');
    btn.disabled    = false;
    btn.textContent = 'Delete Expense';
  }
});

// ─── INIT ──────────────────────────────────────────────────────
async function init() {
  buildCategoryGrid();
  document.getElementById('input-date').value = todayISO();
  await renderRecentExpensesMobile();

  const idParam = getQueryParam('id');
  if (idParam) {
    editId = idParam;
    document.getElementById('page-title').textContent  = 'Edit Expense';
    document.getElementById('submit-btn').textContent  = 'Save Changes';
    document.getElementById('delete-zone').style.display = 'block';

    const expenses = await getExpenses();
    const expense  = expenses.find(e => e.id === editId);
    if (!expense) { showToast('Expense not found', 'error'); return; }

    selectCategory(expense.category);
    document.getElementById('input-amount').value = expense.amount.toFixed(2);
    document.getElementById('input-date').value   = expense.date;
    document.getElementById('input-desc').value   = expense.description || '';
  }
}

// Format amount on blur
document.getElementById('input-amount').addEventListener('blur', function() {
  const v = parseFloat(this.value);
  if (!isNaN(v) && v > 0) { this.value = v.toFixed(2); hideError('amount'); }
});

init().catch(console.error);
