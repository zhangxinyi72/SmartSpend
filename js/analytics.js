import { getAnalyticsSummary, getAnalyticsByCategory, getSixMonthTrend } from './api.js';
import { CATEGORIES, escapeHtml, formatCurrency, getCategoryColor, requireAuth, showToast } from './utils.js';
import { renderPieChart, renderBarChart, renderLineChart } from './charts.js';

if (!requireAuth()) {
    throw new Error('Authentication required');
}

let currentPeriod = 30;
let currentCategory = '';
const isMobileView = () => window.matchMedia('(max-width: 900px)').matches;

async function loadData(period) {
    const [summary, byCategory, trend] = await Promise.all([
        getAnalyticsSummary(period),
        getAnalyticsByCategory(period),
        getSixMonthTrend(),
    ]);

    const normalizedSummary = {
        total_spent: Number(summary.total_spent ?? summary.total ?? 0),
        avg_per_transaction: Number(summary.avg_per_transaction ?? summary.average ?? 0),
        transaction_count: Number(summary.transaction_count ?? summary.count ?? 0),
        top_category: summary.top_category ?? summary.topCategory ?? '—',
    };

    const categoryData = (currentCategory
        ? byCategory.filter(item => item.category === currentCategory)
        : byCategory
    ).map((item) => ({
        ...item,
        total: Number(item.total ?? item.amount ?? item.value ?? 0),
        color: getCategoryColor(item.category)
    }));
    const totalForView = categoryData.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const topCategory = categoryData[0]?.category || normalizedSummary.top_category || '—';
    const avgForView = currentCategory
        ? totalForView / Math.max(normalizedSummary.transaction_count || 1, 1)
        : normalizedSummary.avg_per_transaction;

    // Summary stats
    document.getElementById('stat-total').textContent = formatCurrency(currentCategory ? totalForView : normalizedSummary.total_spent);
    document.getElementById('stat-avg').textContent   = formatCurrency(avgForView);
    document.getElementById('stat-top').textContent   = topCategory;

    if (categoryData.length === 0) {
        document.getElementById('pie-legend').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📊</div>
        <div class="empty-state__text">No data for this period</div>
      </div>`;
        return;
    }

    // Charts — pie click navigates to dashboard filtered by category
    renderPieChart('pie-chart', categoryData, {
        onClick: (category) => {
            window.location.href = `home.html?category=${encodeURIComponent(category)}`;
        },
    });
    if (isMobileView()) {
        const trendTitle = document.getElementById('trend-chart-title');
        if (trendTitle) trendTitle.textContent = 'Category Totals';
        renderBarChart('trend-chart', categoryData);
    } else {
        const trendTitle = document.getElementById('trend-chart-title');
        if (trendTitle) trendTitle.textContent = '6-Month Spending Trend';
        renderLineChart('trend-chart', trend);
    }

    // Legend below pie chart
    const total = categoryData.reduce((s, d) => s + d.total, 0);
    document.getElementById('pie-legend').innerHTML = categoryData.map(d => `
    <div class="pie-legend__item">
      <span class="pie-legend__dot" style="background:${d.color}"></span>
      <span class="pie-legend__label">${escapeHtml(d.category)}</span>
      <span class="pie-legend__amount">${formatCurrency(d.total)}</span>
      <span class="pie-legend__pct">${total > 0 ? ((d.total / total) * 100).toFixed(1) : 0}%</span>
    </div>`).join('');
}

function initMobileFilters() {
    const categorySelect = document.getElementById('analytics-filter-category');
    const periodSelect = document.getElementById('analytics-filter-period');
    if (!categorySelect || !periodSelect) return;

    categorySelect.innerHTML = '<option value="">All</option>' +
        CATEGORIES.map(category => `<option value="${category}">${category}</option>`).join('');
    periodSelect.value = String(currentPeriod);

    categorySelect.addEventListener('change', async () => {
        currentCategory = categorySelect.value;
        try {
            await loadData(currentPeriod);
        } catch (err) {
            console.error(err);
            showToast('Failed to load analytics', 'error');
        }
    });

    periodSelect.addEventListener('change', async () => {
        currentPeriod = Number(periodSelect.value || 30);
        try {
            await loadData(currentPeriod);
        } catch (err) {
            console.error(err);
            showToast('Failed to load analytics', 'error');
        }
    });
}

// Period toggle
document.getElementById('period-toggle').addEventListener('click', async e => {
    const btn = e.target.closest('.period-toggle__btn');
    if (!btn) return;
    const period = parseInt(btn.dataset.period, 10);
    if (period === currentPeriod) return;

    document.querySelectorAll('.period-toggle__btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = period;

    try {
        await loadData(period);
    } catch (err) {
        console.error(err);
        showToast('Failed to load analytics', 'error');
    }
});

initMobileFilters();

loadData(currentPeriod).catch(err => {
    console.error(err);
    showToast('Failed to load analytics', 'error');
});
