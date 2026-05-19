import { getExpenses, getBudgets } from './api.js';
import { escapeHtml, formatCurrency, requireAuth } from './utils.js';

const dayMs = 24 * 60 * 60 * 1000;

const parseDate = (value) => {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const sum = (items) => items.reduce((total, item) => total + Number(item.amount || 0), 0);
const safeDiv = (a, b) => b ? a / b : 0;
const signedPct = (value) => `${value >= 0 ? '+' : ''}${Math.round(value)}%`;
const signedMoney = (value) => `${value >= 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;

function between(expenses, start, end) {
  return expenses.filter((expense) => {
    const d = parseDate(expense.date);
    return d >= start && d <= end;
  });
}

function lastNDays(expenses, days, offsetDays = 0) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - offsetDays);
  const start = new Date(end.getTime() - (days - 1) * dayMs);
  start.setHours(0, 0, 0, 0);
  return between(expenses, start, end);
}

function byCategory(expenses, mode = 'amount') {
  const map = new Map();
  expenses.forEach((expense) => {
    const category = expense.category || 'Other';
    const value = mode === 'count' ? 1 : Number(expense.amount || 0);
    map.set(category, (map.get(category) || 0) + value);
  });
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function calculateChangeDriver(currentExpenses, previousExpenses) {
  const current = new Map(byCategory(currentExpenses).map((item) => [item.category, item.total]));
  const previous = new Map(byCategory(previousExpenses).map((item) => [item.category, item.total]));
  const categories = new Set([...current.keys(), ...previous.keys()]);

  const rows = [...categories].map((category) => {
    const currentTotal = current.get(category) || 0;
    const previousTotal = previous.get(category) || 0;
    const delta = currentTotal - previousTotal;
    const pctChange = previousTotal > 0 ? (delta / previousTotal) * 100 : (currentTotal > 0 ? 100 : 0);
    return { category, currentTotal, previousTotal, delta, pctChange };
  }).sort((a, b) => b.delta - a.delta);

  const positiveDriver = rows.find((item) => item.delta > 0);
  const fallback = byCategory(currentExpenses)[0];
  return positiveDriver || {
    category: fallback?.category || 'No spending yet',
    currentTotal: fallback?.total || 0,
    previousTotal: 0,
    delta: 0,
    pctChange: 0,
    isStable: true,
  };
}

function getMonthToDate(expenses) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return between(expenses, start, end);
}

function getMonthProjection(monthToDateTotal) {
  const now = new Date();
  const dayOfMonth = Math.max(now.getDate(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return monthToDateTotal / dayOfMonth * daysInMonth;
}

function buildInsight(expenses, budgets) {
  const recent7 = lastNDays(expenses, 7);
  const previous7 = lastNDays(expenses, 7, 7);
  const recent30 = lastNDays(expenses, 30);
  const previous30 = lastNDays(expenses, 30, 30);
  const monthToDate = getMonthToDate(expenses);

  const total7 = sum(recent7);
  const totalPrev7 = sum(previous7);
  const total30 = sum(recent30);
  const totalPrev30 = sum(previous30);
  const weeklyChange = totalPrev7 > 0 ? ((total7 - totalPrev7) / totalPrev7) * 100 : 0;
  const monthlyChange = totalPrev30 > 0 ? ((total30 - totalPrev30) / totalPrev30) * 100 : 0;

  const topCategory = byCategory(recent30)[0] || { category: 'No spending yet', total: 0 };
  const changeDriver = calculateChangeDriver(recent30, previous30);
  const highFrequency = byCategory(recent30, 'count')[0] || { category: 'No activity', total: 0 };

  const totalBudget = budgets.reduce((acc, item) => acc + Number(item.monthly_limit || 0), 0);
  const monthToDateTotal = sum(monthToDate);
  const projectedMonth = getMonthProjection(monthToDateTotal);
  const projectedBudgetUsed = safeDiv(projectedMonth, totalBudget) * 100;
  const projectedRemaining = totalBudget - projectedMonth;
  const avgTxn = safeDiv(total30, recent30.length);

  const largestTxn = [...recent30].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const anomaly = largestTxn && avgTxn > 0 && Number(largestTxn.amount) > avgTxn * 1.8 ? largestTxn : null;

  let tone = 'good';
  let headline = 'Your spending is currently within a manageable range.';
  if (projectedBudgetUsed >= 100) {
    tone = 'risk';
    headline = 'You are projected to exceed your monthly budget.';
  } else if (changeDriver.delta > 75 || monthlyChange >= 25) {
    tone = 'risk';
    headline = `${changeDriver.category} is the biggest change driver this month.`;
  } else if (projectedBudgetUsed >= 80) {
    tone = 'info';
    headline = 'You are close to your monthly comfort zone.';
  }

  const categorySentence = `${topCategory.category} is your top category because it has the largest spending share in the last 30 days: ${formatCurrency(topCategory.total)}.`;
  const driverSentence = changeDriver.delta > 0
    ? `${changeDriver.category} is the change driver because it increased by ${signedMoney(changeDriver.delta)} versus the previous 30 days.`
    : `No category increased versus the previous 30 days, so the pattern is stable. The largest current category is ${topCategory.category}.`;

  const nextAction = projectedBudgetUsed >= 100
    ? `Pause discretionary ${changeDriver.category} purchases until the next budget reset.`
    : changeDriver.delta > 0
      ? `Review repeat ${changeDriver.category} transactions first, because this is where spending changed the most.`
      : `Keep monitoring ${topCategory.category}; it is your largest category, but it is not currently accelerating.`;

  return { tone, headline, topCategory, changeDriver, highFrequency, total7, total30, weeklyChange, monthlyChange, monthToDateTotal, projectedMonth, projectedBudgetUsed, projectedRemaining, avgTxn, anomaly, categorySentence, driverSentence, nextAction, transactionCount: recent30.length };
}

function renderHome(insight) {
  const page = document.querySelector('.page-content');
  if (!page) return;
  const toneClass = `pro-nudge--${insight.tone}`;
  const driverValue = insight.changeDriver.delta > 0
    ? `${insight.changeDriver.category} (${signedMoney(insight.changeDriver.delta)})`
    : 'Stable';
  const safeHeadline = escapeHtml(insight.headline);
  const safeCategorySentence = escapeHtml(insight.categorySentence);
  const safeDriverSentence = escapeHtml(insight.driverSentence);
  const safeTopCategory = escapeHtml(insight.topCategory.category);
  const safeDriverValue = escapeHtml(driverValue);
  const safeHighFrequencyCategory = escapeHtml(insight.highFrequency.category);
  const safeNextAction = escapeHtml(insight.nextAction);
  const safeAnomalyDescription = insight.anomaly
    ? escapeHtml(insight.anomaly.description || insight.anomaly.category)
    : '';
  const html = `
    <section class="pro-insight-grid" aria-label="SmartSpend analytical overview">
      <article class="pro-insight-card">
        <div class="pro-eyebrow">Data-driven Spending Story</div>
        <h2 class="pro-insight-title">${safeHeadline}</h2>
        <p class="pro-insight-copy">${safeCategorySentence} ${safeDriverSentence}</p>
        <div class="pro-metric-strip">
          <div class="pro-metric"><div class="pro-metric__label">7-day spend</div><div class="pro-metric__value">${formatCurrency(insight.total7)}</div></div>
          <div class="pro-metric"><div class="pro-metric__label">Top category</div><div class="pro-metric__value">${safeTopCategory}</div></div>
          <div class="pro-metric"><div class="pro-metric__label">Change driver</div><div class="pro-metric__value">${safeDriverValue}</div></div>
        </div>
      </article>
      <aside class="pro-insight-card">
        <div class="pro-eyebrow">Behavior Nudges</div>
        <div class="pro-nudge-list">
          <div class="pro-nudge ${toneClass}"><strong>Budget forecast:</strong> ${insight.projectedRemaining >= 0 ? `${formatCurrency(insight.projectedRemaining)} projected left this month.` : `${formatCurrency(Math.abs(insight.projectedRemaining))} projected over budget.`}</div>
          <div class="pro-nudge pro-nudge--info"><strong>Frequency signal:</strong> ${safeHighFrequencyCategory} has ${Math.round(insight.highFrequency.total)} transactions in the last 30 days.</div>
          <div class="pro-nudge pro-nudge--good"><strong>Next best action:</strong> ${safeNextAction}</div>
          ${insight.anomaly ? `<div class="pro-nudge pro-nudge--info"><strong>Unusual transaction:</strong> ${safeAnomalyDescription} was ${formatCurrency(insight.anomaly.amount)}, above your 30-day average.</div>` : ''}
        </div>
      </aside>
    </section>
  `;

  const existing = document.querySelector('.pro-insight-grid');
  if (existing) {
    existing.outerHTML = html;
  } else {
    page.insertAdjacentHTML('afterbegin', html);
  }
}

function renderAnalytics(insight) {
  const actionCard = document.querySelector('.analytics-action-card');
  if (!actionCard || document.querySelector('.pro-analytics-story')) return;
  const driverChange = insight.changeDriver.delta > 0
    ? `${signedMoney(insight.changeDriver.delta)} / ${signedPct(insight.changeDriver.pctChange)}`
    : 'Stable';
  const safeTopCategory = escapeHtml(insight.topCategory.category);
  const safeChangeDriver = escapeHtml(
    insight.changeDriver.delta > 0 ? insight.changeDriver.category : 'Stable'
  );
  const safeDriverChange = escapeHtml(driverChange);
  actionCard.insertAdjacentHTML('beforebegin', `
    <section class="pro-insight-card pro-analytics-story">
      <div class="pro-eyebrow">How to read this page</div>
      <h2 class="pro-insight-title">Top Category and Change Driver are not the same thing.</h2>
      <p class="pro-insight-copy"><strong>Top Category</strong> means the category with the largest total spend in the selected period. <strong>Change Driver</strong> means the category that increased the most versus the previous equal-length period.</p>
      <div class="pro-metric-strip">
        <div class="pro-metric"><div class="pro-metric__label">Top category</div><div class="pro-metric__value">${safeTopCategory}</div></div>
        <div class="pro-metric"><div class="pro-metric__label">Change driver</div><div class="pro-metric__value">${safeChangeDriver}</div></div>
        <div class="pro-metric"><div class="pro-metric__label">Driver change</div><div class="pro-metric__value">${safeDriverChange}</div></div>
      </div>
    </section>
  `);
}

async function initInsightEngine() {
  if (!requireAuth()) return;
  const path = window.location.pathname;

  const refreshInsight = async () => {
    const [expenses, budgets] = await Promise.all([getExpenses(), getBudgets()]);
    const insight = buildInsight(expenses, budgets);

    if (path.endsWith('/home.html') || path === '/' || path.endsWith('/')) {
      renderHome(insight);
    }
    if (path.endsWith('/analytics.html')) {
      renderAnalytics(insight);
    }
  };

  await refreshInsight();

  // Keep recommendations fresh as data changes over time.
  if (path.endsWith('/home.html') || path === '/' || path.endsWith('/')) {
    setInterval(() => {
      refreshInsight().catch((error) => console.error('Insight refresh failed', error));
    }, 15000);

    window.addEventListener('focus', () => {
      refreshInsight().catch((error) => console.error('Insight refresh failed', error));
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        refreshInsight().catch((error) => console.error('Insight refresh failed', error));
      }
    });
  }
}

initInsightEngine().catch((error) => console.error('Insight engine failed', error));
