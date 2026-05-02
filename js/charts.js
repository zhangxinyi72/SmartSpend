// ─── CHART.JS WRAPPERS ────────────────────────────────────────
// Requires Chart.js loaded via CDN in the HTML before this module runs.

let _pieChart = null;
let _barChart = null;
let _lineChart = null;

/**
 * Initialize or update the doughnut (pie) chart.
 * @param {string} canvasId
 * @param {Array<{ category, total, percentage, color }>} data
 * @param {{ onClick?: (category: string) => void }} [opts]
 */
export function renderPieChart(canvasId, data, opts = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_pieChart) {
        _pieChart.data.labels                    = data.map(d => d.category);
        _pieChart.data.datasets[0].data          = data.map(d => d.total);
        _pieChart.data.datasets[0].backgroundColor = data.map(d => d.color);
        _pieChart.update({ duration: 400 });
        return;
    }

    _pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.category),
            datasets: [{
                data:            data.map(d => d.total),
                backgroundColor: data.map(d => d.color),
                borderColor:     '#ffffff',
                borderWidth:     2.5,
                hoverOffset:     10,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17,24,39,0.9)',
                    padding: 10,
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: ctx => {
                            const val   = ctx.parsed;
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct   = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                            return `  $${val.toFixed(2)}  (${pct}%)`;
                        },
                    },
                },
            },
            onClick: opts.onClick
                ? (_evt, elements) => {
                    if (elements.length > 0) {
                        const category = _pieChart.data.labels[elements[0].index];
                        opts.onClick(category);
                    }
                }
                : undefined,
            animation: { animateScale: true, animateRotate: true, duration: 500 },
        },
    });
}

/**
 * Initialize or update the horizontal/vertical bar chart.
 * @param {string} canvasId
 * @param {Array<{ category, total, color }>} data
 */
export function renderBarChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_barChart) {
        _barChart.data.labels                      = data.map(d => d.category);
        _barChart.data.datasets[0].data            = data.map(d => d.total);
        _barChart.data.datasets[0].backgroundColor = data.map(d => d.color + 'CC');
        _barChart.data.datasets[0].borderColor     = data.map(d => d.color);
        _barChart.update({ duration: 400 });
        return;
    }

    _barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.category),
            datasets: [{
                label: 'Spent',
                data:            data.map(d => d.total),
                backgroundColor: data.map(d => d.color + 'CC'),
                borderColor:     data.map(d => d.color),
                borderWidth:     1.5,
                borderRadius:    8,
                borderSkipped:   false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17,24,39,0.9)',
                    padding: 10,
                    callbacks: { label: ctx => `  $${ctx.parsed.y.toFixed(2)}` },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10, weight: '600' },
                        maxRotation: 30,
                        color: '#6B7280',
                        callback: function(val) {
                            const lbl = this.getLabelForValue(val);
                            return lbl.length > 9 ? lbl.substring(0, 9) + '…' : lbl;
                        },
                    },
                },
                y: {
                    grid: { color: '#F3F4F6', lineWidth: 1 },
                    ticks: {
                        font: { size: 11 },
                        color: '#6B7280',
                        callback: v => `$${v}`,
                    },
                    beginAtZero: true,
                },
            },
            animation: { duration: 400 },
        },
    });
}

/**
 * Initialize or update the 6-month spending trend line chart.
 * @param {string} canvasId
 * @param {Array<{ label, total }>} data
 */
export function renderLineChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_lineChart) {
        _lineChart.data.labels = data.map(d => d.label || d.month || d.date || '');
        _lineChart.data.datasets[0].data = data.map(d => d.total);
        _lineChart.update({ duration: 400 });
        return;
    }

    _lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.label || d.month || d.date || ''),
            datasets: [{
                label: 'Monthly Spending',
                data: data.map(d => d.total),
                borderColor: '#6f4ef6',
                backgroundColor: 'rgba(111, 78, 246, 0.12)',
                tension: 0.35,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17,24,39,0.9)',
                    padding: 10,
                    callbacks: {
                        label: ctx => `  $${ctx.parsed.y.toFixed(2)}`
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#6B7280',
                        font: { size: 11, weight: '600' },
                    },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#F3F4F6' },
                    ticks: {
                        color: '#6B7280',
                        callback: value => `$${value}`,
                    },
                },
            },
            animation: { duration: 500 },
        },
    });
}

/**
 * Destroy all chart instances (useful for SPA navigation).
 */
export function destroyCharts() {
    if (_pieChart) { _pieChart.destroy(); _pieChart = null; }
    if (_barChart) { _barChart.destroy(); _barChart = null; }
    if (_lineChart) { _lineChart.destroy(); _lineChart = null; }
}