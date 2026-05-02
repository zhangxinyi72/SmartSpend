import { getBudgets, saveBudget, getExpenses, deleteBudget } from './api.js';
import {
    CATEGORIES, getCategoryColor, getCategoryIcon,
    formatCurrency, getCurrentMonthLabel, requireAuth, showToast
} from './utils.js';

if (!requireAuth()) {
    throw new Error('Authentication required');
}

let _budgets = [];
let _plannerSuggestions = [];

// ─── PROGRESS BAR HELPERS ──────────────────────────────────────
function getBarClass(pct) {
    if (pct >= 100) return 'progress-bar-fill--red progress-bar-fill--pulse';
    if (pct >= 60)  return 'progress-bar-fill--yellow';
    return 'progress-bar-fill--green';
}

function getPctClass(pct) {
    if (pct >= 100) return 'budget-card__pct--red';
    if (pct >= 60)  return 'budget-card__pct--yellow';
    return 'budget-card__pct--green';
}

// ─── HEALTH CARD ───────────────────────────────────────────────
function renderHealthCard(budgets, expenses = []) {
    const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
    const now = new Date();
    const totalSpent  = expenses
        .filter(e => {
            const [y, m] = String(e.date || '').split('-').map(Number);
            return y === now.getFullYear() && m === now.getMonth() + 1;
        })
        .reduce((s, e) => s + Number(e.amount || 0), 0);
    const remaining   = totalBudget - totalSpent;
    const pct         = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

    document.getElementById('health-budget').textContent    = formatCurrency(totalBudget);
    document.getElementById('health-spent').textContent     = formatCurrency(totalSpent);
    document.getElementById('health-remaining').textContent = formatCurrency(Math.abs(remaining));

    const bar = document.getElementById('health-bar');
    bar.style.width = `${pct.toFixed(1)}%`;
    bar.className   = 'progress-bar-fill ' + getBarClass(pct);

    const mobileBudget = document.getElementById('mobile-health-budget');
    const mobileSpent = document.getElementById('mobile-health-spent');
    const mobileRemaining = document.getElementById('mobile-health-remaining');
    const mobileUsedPct = document.getElementById('mobile-health-used-pct');
    if (mobileBudget && mobileSpent && mobileRemaining && mobileUsedPct) {
        mobileBudget.textContent = formatCurrency(totalBudget);
        mobileSpent.textContent = formatCurrency(totalSpent);
        mobileRemaining.textContent = formatCurrency(Math.max(remaining, 0));
        mobileUsedPct.textContent = `${pct.toFixed(0)}%`;
    }
}

// ─── SAVINGS PLANNER HELPERS ───────────────────────────────────
async function getLastMonthExpenses() {
    const expenses = await getExpenses();

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetYear = lastMonth.getFullYear();
    const targetMonth = lastMonth.getMonth() + 1;

    return expenses.filter(e => {
        const [y, m] = e.date.split('-').map(Number);
        return y === targetYear && m === targetMonth;
    });
}

function summarizeCategories(expenses) {
    const totals = {};

    expenses.forEach(expense => {
        totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
    });

    const totalSpent = Object.values(totals).reduce((sum, value) => sum + value, 0);

    const sorted = Object.entries(totals)
        .map(([category, total]) => ({
            category,
            total,
            percentage: totalSpent > 0 ? (total / totalSpent) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

    return { totalSpent, sorted };
}

function generateSuggestedBudgets(monthlyTarget, sortedCategories) {
    if (!_budgets.length) return [];

    const spendMap = new Map(sortedCategories.map((item) => [item.category, item.total]));
    const budgetMap = new Map(_budgets.map((b) => [b.category, b]));

    // Every category that has a budget row — reductions scale with last month's spend in that category
    const rows = _budgets.map((b) => ({
        category: b.category,
        total: spendMap.get(b.category) || 0
    }));

    const spendAmongBudgets = rows.reduce((sum, row) => sum + row.total, 0);
    const n = rows.length;

    return rows.map((row) => {
        const currentBudget = budgetMap.get(row.category).monthly_limit;
        let reduction;
        if (spendAmongBudgets > 0) {
            reduction = monthlyTarget * (row.total / spendAmongBudgets);
        } else if (n > 0) {
            // No spending last month in any budgeted category: split the saving target evenly
            reduction = monthlyTarget / n;
        } else {
            reduction = 0;
        }

        const suggestedLimit = Math.max(
            Math.round(currentBudget * 0.5 * 100) / 100,
            Math.round((currentBudget - reduction) * 100) / 100
        );

        return {
            category: row.category,
            currentLimit: currentBudget,
            suggestedLimit,
            reduction: Math.round(reduction * 100) / 100,
            percentage:
                spendAmongBudgets > 0 ? (row.total / spendAmongBudgets) * 100 : n > 0 ? 100 / n : 0
        };
    });
}

function buildSuggestionList(suggestions) {
    if (!suggestions.length) {
        return '<p>No suggested budget adjustments are available.</p>';
    }

    return `
    <div class="suggestion-list">
      ${suggestions.map(item => `
        <div class="suggestion-item">
          <strong>${item.category}</strong>: ${formatCurrency(item.currentLimit)} → ${formatCurrency(item.suggestedLimit)}
        </div>
      `).join('')}
    </div>
  `;
}

function buildSavingsAdvice(sortedCategories, monthlyTarget, suggestions, mode = 'monthly', totalGoal = null, months = null) {
    if (!sortedCategories.length) {
        return `
      <p>No previous month data is available yet.</p>
      <p>You can still start by setting a conservative monthly budget.</p>
    `;
    }

    const top1 = sortedCategories[0];
    const top2 = sortedCategories[1];

    return `
    ${mode === 'goal'
        ? `<p><strong>Total goal:</strong> ${formatCurrency(totalGoal)}</p>
         <p><strong>Target period:</strong> ${months} month(s)</p>`
        : ''}
    <p><strong>Suggested monthly saving target:</strong> ${formatCurrency(monthlyTarget)}</p>
    <p>Your highest spending category last month was <strong>${top1.category}</strong> (${top1.percentage.toFixed(1)}%).</p>
    ${top2 ? `<p>Another area to watch is <strong>${top2.category}</strong> (${top2.percentage.toFixed(1)}%).</p>` : ''}
    <p>Recommended budget adjustments:</p>
    ${buildSuggestionList(suggestions)}
  `;
}

function syncPlannerModeUI() {
    const mode = document.getElementById('saving-plan-type').value;
    const monthlyGroup = document.getElementById('monthly-plan-group');
    const goalGroup = document.getElementById('goal-plan-group');
    const calcBtn = document.getElementById('saving-plan-calc-btn');
    const result = document.getElementById('saving-plan-result');
    const applyBtn = document.getElementById('saving-plan-apply-btn');

    if (mode === 'goal') {
        monthlyGroup.hidden = true;
        goalGroup.hidden = false;
        calcBtn.textContent = 'Generate Plan';
        result.innerHTML = 'Enter a goal amount and period to generate a monthly saving plan.';
    } else {
        monthlyGroup.hidden = false;
        goalGroup.hidden = true;
        calcBtn.textContent = 'Calculate Plan';
        result.innerHTML = "Set a target to see a suggested plan based on last month's spending.";
    }

    _plannerSuggestions = [];
    applyBtn.disabled = true;
}

async function handleSavingPlan() {
    const mode = document.getElementById('saving-plan-type').value;
    const monthlyInput = document.getElementById('monthly-saving-goal');
    const amountInput = document.getElementById('goal-saving-amount');
    const monthsInput = document.getElementById('goal-saving-months');
    const result = document.getElementById('saving-plan-result');
    const applyBtn = document.getElementById('saving-plan-apply-btn');

    let monthlyTarget;
    let totalGoal = null;
    let months = null;

    if (mode === 'goal') {
        totalGoal = parseFloat(amountInput.value);
        months = parseInt(monthsInput.value, 10);
        if (!totalGoal || totalGoal <= 0) {
            showToast('Enter a valid saving goal', 'error');
            return;
        }
        monthlyTarget = totalGoal / months;
    } else {
        monthlyTarget = parseFloat(monthlyInput.value);
        if (!monthlyTarget || monthlyTarget <= 0) {
            showToast('Enter a valid monthly saving target', 'error');
            return;
        }
    }

    const lastMonthExpenses = await getLastMonthExpenses();
    const { sorted } = summarizeCategories(lastMonthExpenses);
    _plannerSuggestions = generateSuggestedBudgets(monthlyTarget, sorted);
    result.innerHTML = buildSavingsAdvice(sorted, monthlyTarget, _plannerSuggestions, mode, totalGoal, months);
    applyBtn.disabled = _plannerSuggestions.length === 0;
}

async function applySuggestedBudgets(suggestions, applyBtn) {
    if (!suggestions.length) {
        showToast('No suggested budgets to apply', 'error');
        return;
    }

    const ok = window.confirm(
        'Apply suggested limits? This will overwrite the monthly limit for each listed category in your database. ' +
            'Spending amounts do not change your limits by themselves — only this action, Edit/Save, or Add Budget does.'
    );
    if (!ok) {
        return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying…';

    try {
        await Promise.all(
            suggestions.map(item => saveBudget(item.category, item.suggestedLimit))
        );

        _plannerSuggestions = [];
        document.getElementById('saving-plan-apply-btn').disabled = true;

        await reload();
        showToast('Suggested budgets applied');
    } catch (err) {
        console.error(err);
        showToast('Failed to apply suggested budgets', 'error');
    } finally {
        applyBtn.textContent = 'Apply Suggested Budgets';
        applyBtn.disabled = false;
    }
}

// ─── BUDGET CARD ───────────────────────────────────────────────
function renderBudgetCard(b) {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const color  = getCategoryColor(b.category);
    const icon   = getCategoryIcon(b.category);
    const spent  = b.spent || 0;
    const pct    = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
    const over   = pct >= 100;
    const barCls = getBarClass(pct);
    const pctCls = getPctClass(pct);
    const barW   = Math.min(pct, 100).toFixed(1);

    return `
    <div class="budget-card ${over ? 'budget-card--over' : ''}" id="budget-card-${b.id}" data-id="${b.id}">
      <div class="budget-card__header">
        <div class="budget-card__icon" style="background:${color}1A">${icon}</div>
        <span class="budget-card__name">
          ${b.category}
          ${over ? '<span class="budget-card__over-badge">Over budget!</span>' : ''}
        </span>
        <div class="budget-card__actions">
          <button class="budget-card__edit-btn" data-id="${b.id}" type="button">${isMobile ? 'Save' : 'Edit'}</button>
          <button class="budget-card__remove-btn" data-id="${b.id}" type="button">Remove</button>
        </div>
      </div>

      <div class="budget-card__amounts">
        <span>${formatCurrency(spent)} <span style="opacity:0.6">/ ${formatCurrency(b.monthly_limit)}</span></span>
        <span class="budget-card__pct ${pctCls}">${pct.toFixed(0)}%</span>
      </div>

      <div class="progress-bar-wrap">
        <div class="progress-bar-fill ${barCls}" style="width:${barW}%"></div>
      </div>

      <div class="budget-edit-form" id="edit-form-${b.id}">
        <input
          class="budget-edit-input"
          id="edit-input-${b.id}"
          type="number"
          min="1"
          value="${b.monthly_limit}"
          placeholder="New limit"
        />
        <button class="budget-save-btn" data-id="${b.id}" data-cat="${b.category}" type="button">Save</button>
      </div>
    </div>`;
}

function renderAllCards(budgets) {
    const container = document.getElementById('budget-cards-list');
    if (budgets.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💰</div>
        <div class="empty-state__text">No budgets set yet. Add one below!</div>
      </div>`;
        return;
    }
    container.innerHTML = budgets.map(renderBudgetCard).join('');
    attachCardListeners();
}

function attachCardListeners() {
    document.querySelectorAll('.budget-card__edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id   = btn.dataset.id;
            const form = document.getElementById(`edit-form-${id}`);
            const open = form.classList.contains('visible');
            document.querySelectorAll('.budget-edit-form').forEach(f => f.classList.remove('visible'));
            if (!open) form.classList.add('visible');
        });
    });

    document.querySelectorAll('.budget-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cat = btn.dataset.cat;
            const val = parseFloat(document.getElementById(`edit-input-${btn.dataset.id}`).value);
            if (!val || val <= 0) {
                showToast('Enter a valid limit', 'error');
                return;
            }

            btn.disabled    = true;
            btn.textContent = '…';
            try {
                await saveBudget(cat, val);
                showToast('Budget saved');
                await reload();
            } catch (err) {
                console.error(err);
                showToast('Save failed', 'error');
                btn.disabled    = false;
                btn.textContent = 'Save';
            }
        });
    });

    document.querySelectorAll('.budget-card__remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            btn.disabled = true;
            btn.textContent = '…';

            try {
                await deleteBudget(id);
                showToast('Budget category removed');
                await reload();
            } catch (err) {
                console.error(err);
                showToast('Remove failed', 'error');
                btn.disabled = false;
                btn.textContent = 'Remove';
            }
        });
    });
}

async function reload() {
    const [budgets, expenses] = await Promise.all([getBudgets(), getExpenses()]);
    _budgets = budgets;
    renderHealthCard(_budgets, expenses);
    renderAllCards(_budgets);
    updateAddCategoryOptions();
}

// ─── ADD BUDGET ────────────────────────────────────────────────
document.getElementById('toggle-add-budget-btn').addEventListener('click', () => {
    const btn = document.getElementById('toggle-add-budget-btn');
    if (btn.disabled) return;
    document.getElementById('add-budget-form').classList.toggle('visible');
});

function updateAddCategoryOptions() {
    const used      = new Set(_budgets.map(b => b.category));
    const available = CATEGORIES.filter(c => !used.has(c));
    const sel       = document.getElementById('add-budget-category');
    const toggleBtn = document.getElementById('toggle-add-budget-btn');
    const saveBtn   = document.getElementById('add-budget-save-btn');
    const note      = document.getElementById('add-budget-note');
    const form      = document.getElementById('add-budget-form');

    if (available.length === 0) {
        sel.innerHTML = '<option value="">All categories already have budgets</option>';
        sel.disabled = true;
        saveBtn.disabled = true;
        toggleBtn.disabled = true;
        toggleBtn.textContent = '✓ All Categories Added';
        note.textContent = 'All available categories already have budgets set.';
        form.classList.remove('visible');
        return;
    }

    sel.disabled = false;
    saveBtn.disabled = false;
    toggleBtn.disabled = false;
    toggleBtn.textContent = '➕ Add Budget Category';
    note.textContent = '';
    sel.innerHTML = '<option value="">Select category…</option>' +
        available.map(c => `<option value="${c}">${c}</option>`).join('');
}

document.getElementById('add-budget-save-btn').addEventListener('click', async () => {
    const cat = document.getElementById('add-budget-category').value;
    const lim = parseFloat(document.getElementById('add-budget-limit').value);
    if (!cat) { showToast('Select a category', 'error'); return; }
    if (!lim || lim <= 0) { showToast('Enter a valid limit', 'error'); return; }

    const btn = document.getElementById('add-budget-save-btn');
    btn.disabled = true;
    btn.textContent = '…';

    try {
        await saveBudget(cat, lim);
        showToast('Budget saved');
        document.getElementById('add-budget-form').classList.remove('visible');
        document.getElementById('add-budget-limit').value = '';
        await reload();
    } catch (err) {
        console.error(err);
        showToast('Save failed', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
    }
});

// ─── INIT ──────────────────────────────────────────────────────
async function init() {
    document.getElementById('budget-month-label').textContent = getCurrentMonthLabel();
    await reload();

    const planType = document.getElementById('saving-plan-type');
    planType.addEventListener('change', syncPlannerModeUI);

    document.getElementById('saving-plan-calc-btn')
        .addEventListener('click', handleSavingPlan);

    document.getElementById('saving-plan-apply-btn')
        .addEventListener('click', async e => {
            await applySuggestedBudgets(_plannerSuggestions, e.currentTarget);
        });

    syncPlannerModeUI();
}

init().catch(err => {
    console.error(err);
    showToast('Failed to load budgets', 'error');
});
