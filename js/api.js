import { clearAuthSession, getStoredToken, getCategoryColor } from './utils.js';

/**
 * If the page is opened on a real device or production host, ignore API base URLs
 * that point at localhost/127.0.0.1 (often left in localStorage from dev).
 * Otherwise the phone would call its own "localhost" and not share DB/API with desktop.
 */
function shouldIgnoreLocalhostApiOverride(urlStr) {
    const locHost = window.location.hostname;
    const onLocalPage =
        locHost === 'localhost' ||
        locHost === '127.0.0.1' ||
        locHost === '[::1]';
    if (onLocalPage) {
        return false;
    }
    try {
        const u = new URL(urlStr, window.location.origin);
        const h = u.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch {
        return false;
    }
}

/** 与 Vercel `vercel.json` 里 /api 代理到同一台后端，保证手机与电脑用同一套 API/数据库 */
const DEFAULT_PRODUCTION_API_BASE = 'https://smartspend-ccwe.onrender.com';
const API_BASE_OVERRIDE_STORAGE_KEY = 'SMARTSPEND_API_BASE_URL';

let apiBaseQueryChecked = false;

function isLocalhostHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isPrivateIpv4Hostname(hostname) {
    const parts = String(hostname || '').split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }

    return (
        parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168)
    );
}

function isLocalDevelopmentPage() {
    const { protocol, hostname } = window.location;
    return protocol === 'file:' || isLocalhostHostname(hostname) || isPrivateIpv4Hostname(hostname);
}

function removeStoredApiBaseOverride() {
    try {
        window.localStorage?.removeItem(API_BASE_OVERRIDE_STORAGE_KEY);
    } catch {
        // ignore
    }
}

function isAllowedApiBaseOverride(urlStr) {
    try {
        const url = new URL(urlStr, window.location.origin);
        if (!['http:', 'https:'].includes(url.protocol)) {
            return false;
        }

        if (url.origin === window.location.origin) {
            return true;
        }

        if (url.origin === new URL(DEFAULT_PRODUCTION_API_BASE).origin) {
            return true;
        }

        const overrideHost = url.hostname;
        if ((isLocalhostHostname(overrideHost) || isPrivateIpv4Hostname(overrideHost)) && isLocalDevelopmentPage()) {
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

/** 在地址栏用一次，例如 &apiBase=http%3A%2F%2F192.168.1.10%3A3001  让手机与电脑用同一本机/局域网后端 */
function applyApiBaseQueryOnce() {
    if (apiBaseQueryChecked) {
        return;
    }
    apiBaseQueryChecked = true;
    try {
        const raw = new URLSearchParams(window.location.search).get('apiBase');
        if (!raw) {
            return;
        }
        const v = raw.trim();
        if (v && isAllowedApiBaseOverride(v)) {
            window.localStorage.setItem(API_BASE_OVERRIDE_STORAGE_KEY, v);
        } else if (v) {
            removeStoredApiBaseOverride();
            console.warn('Ignored untrusted SmartSpend API base override.');
        }

        if (v) {
            const u = new URL(window.location.href);
            u.searchParams.delete('apiBase');
            window.history.replaceState(
                null,
                '',
                `${u.pathname}${u.search}${u.hash}` || u.pathname
            );
        }
    } catch {
        // ignore
    }
}

function getBaseUrl() {
    if (typeof window === 'undefined') {
        return '';
    }
    applyApiBaseQueryOnce();

    const configuredBaseUrl = String(
        window.__SMARTSPEND_API_BASE_URL ||
        window.localStorage?.getItem(API_BASE_OVERRIDE_STORAGE_KEY) ||
        ''
    ).trim();

    if (configuredBaseUrl) {
        const normalized = configuredBaseUrl.replace(/\/+$/, '');
        if (shouldIgnoreLocalhostApiOverride(normalized)) {
            removeStoredApiBaseOverride();
        } else if (!isAllowedApiBaseOverride(normalized)) {
            removeStoredApiBaseOverride();
            console.warn('Ignored untrusted SmartSpend API base override.');
        } else {
            return normalized;
        }
    }

    const { protocol, hostname, port, origin } = window.location;
    const isLocalHost =
        hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const isSmartSpendServer =
        isLocalHost && (port === '3000' || port === '3001');

    if (isSmartSpendServer) {
        return '';
    }

    if (protocol === 'file:') {
        // 手机/桌面直接打开 file:// 时「localhost:3001」是设备自己，应连生产 API
        return DEFAULT_PRODUCTION_API_BASE;
    }

    if (isLocalHost) {
        // Live Server 等本地静态端口：API 仍在本机（与 app.js 默认 PORT 一致）
        return 'http://localhost:3001';
    }

    // 手机通过 http://电脑局域网IP:5500 等访问：同源没有 /api，应指向同机 Node 端口
    if (port && !['80', '443', '3000', '3001'].includes(String(port))) {
        return `http://${hostname}:3001`;
    }

    return origin;
}

function getLoginUrl() {
    const b = getBaseUrl();
    return b ? `${b}/index.html` : '/index.html';
}

function getAuthHeaders(includeJson = false) {
    const headers = {};
    const token = getStoredToken();

    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

async function handleResponse(response, defaultMessage = 'Request failed') {
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message =
            (typeof data === 'object' && data?.error) ||
            (typeof data === 'string' && data) ||
            defaultMessage;

        if (
            response.status === 401 &&
            !window.location.pathname.endsWith('/index.html') &&
            !window.location.pathname.endsWith('/register.html')
        ) {
            clearAuthSession();
            window.location.href = getLoginUrl();
        }

        throw new Error(message);
    }

    return data;
}

function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function daysAgoDate(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
}



// ─── LOCAL DEMO FALLBACK ──────────────────────────────────────
// Allows the app to work from WebStorm / Live Server even when the Node + MongoDB backend is not running.
const DEMO_TOKEN = 'smartspend-local-demo-token';
const DEMO_USER = { id: 'local-demo-user', name: 'SmartSpend Demo', email: 'demo@smartspend.ai', email_verified: true };
function isNetworkError(error) { return error instanceof TypeError || /Failed to fetch|NetworkError|fetch/i.test(String(error?.message || error)); }
function makeId(prefix='local') { return prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2); }
function localRead(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function localWrite(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
function seedLocalExpenses() {
    const existing = localRead('smartspendLocalExpenses', null); if (existing) return existing;
    const categories = ['Food & Dining','Transportation','Shopping','Bills & Utilities','Entertainment','Healthcare'];
    const names = { 'Food & Dining':['Sweetgreen lunch','Coffee run','Late-night delivery','Campus cafe','Groceries'], Transportation:['Subway pass','Uber ride','NJ Transit','Bike rental'], Shopping:['Amazon order','Skincare refill','Study supplies','Clothing'], 'Bills & Utilities':['Phone bill','Spotify subscription','iCloud storage','Utilities'], Entertainment:['Movie ticket','Streaming subscription','Weekend activity'], Healthcare:['Pharmacy','Wellness visit','Gym pass'] };
    const base = { 'Food & Dining':18, Transportation:12, Shopping:42, 'Bills & Utilities':65, Entertainment:28, Healthcare:24 };
    const today = new Date(); const expenses = [];
    for (let i=0;i<60;i++) { const d = new Date(today); d.setDate(today.getDate()-i); const category = categories[i % categories.length]; const amount = Number((base[category] + ((i*7)%31) + (category === 'Food & Dining' && i < 12 ? 8 : 0)).toFixed(2)); const date = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); expenses.push({ _id: makeId('expense'), id: makeId('expense'), amount, category, description: names[category][i % names[category].length], date, created_at: new Date().toISOString() }); }
    return localWrite('smartspendLocalExpenses', expenses);
}
function seedLocalBudgets() { const existing = localRead('smartspendLocalBudgets', null); if (existing) return existing; return localWrite('smartspendLocalBudgets', [ { _id:'budget-food', id:'budget-food', category:'Food & Dining', monthly_limit:420 }, { _id:'budget-transport', id:'budget-transport', category:'Transportation', monthly_limit:180 }, { _id:'budget-shopping', id:'budget-shopping', category:'Shopping', monthly_limit:260 }, { _id:'budget-bills', id:'budget-bills', category:'Bills & Utilities', monthly_limit:520 }, { _id:'budget-entertainment', id:'budget-entertainment', category:'Entertainment', monthly_limit:160 }, { _id:'budget-healthcare', id:'budget-healthcare', category:'Healthcare', monthly_limit:120 } ]); }
function filterLocalExpenses(filters = {}) { let expenses = seedLocalExpenses(); if (filters.category) expenses = expenses.filter(e => e.category === filters.category); if (filters.startDate) expenses = expenses.filter(e => e.date >= filters.startDate); if (filters.endDate) expenses = expenses.filter(e => e.date <= filters.endDate); if (filters.search) { const q = String(filters.search).toLowerCase(); expenses = expenses.filter(e => (e.category + ' ' + e.description).toLowerCase().includes(q)); } return expenses.sort((a,b) => b.date.localeCompare(a.date)); }
function localSummary(period = 30) {
    const recent = getRecentExpensesLocal(seedLocalExpenses(), period);
    const total = recent.reduce((sum,e)=>sum + Number(e.amount || 0), 0);
    const by = {};
    recent.forEach(e => by[e.category] = (by[e.category] || 0) + Number(e.amount || 0));
    const topCategory = Object.entries(by).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'No activity';
    const average = recent.length ? total / recent.length : 0;
    return {
        total_spent: total,
        avg_per_transaction: average,
        transaction_count: recent.length,
        top_category: topCategory,
        total,
        average,
        count: recent.length,
        topCategory,
        period
    };
}
function localSixMonthTrend() {
    const expenses = seedLocalExpenses();
    const now = new Date();
    const out=[];
    for (let i=5;i>=0;i--) {
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
        const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
        const label = d.toLocaleDateString('en-US',{month:'short'});
        const total = expenses.filter(e => e.date.startsWith(key)).reduce((s,e)=>s+Number(e.amount || 0),0);
        out.push({ label, month: label, total });
    }
    return out;
}
function localChatReply(message) {
    const summary = localSummary(30);
    const reply = 'Local data mode: Top Category is ' + summary.top_category + ' because it has the largest total spending in the last 30 days. This fallback is calculated from localStorage demo expenses. To use the full API coach, run npm start and open http://localhost:3001.';
    return { reply, source: 'local-calculated-fallback', received: message };
}

// ─── AUTH / USER ──────────────────────────────────────────────

export async function registerUser({ name, email, password }) {
    try {
        const response = await fetch(`${getBaseUrl()}/api/register`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ name, email, password }) });
        return await handleResponse(response, 'Registration failed');
    } catch (error) {
        if (!isNetworkError(error)) throw error;
        const user = { ...DEMO_USER, name: name || 'SmartSpend User', email, id: makeId('user') };
        localWrite('smartspendLocalUser', user); seedLocalExpenses(); seedLocalBudgets();
        return { user, token: DEMO_TOKEN, mode: 'local-demo' };
    }
}

export async function loginUser(email, password) {
    try {
        const response = await fetch(`${getBaseUrl()}/api/login`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ email, password }) });
        return await handleResponse(response, 'Login failed');
    } catch (error) {
        if (!isNetworkError(error)) throw error;
        const user = localRead('smartspendLocalUser', { ...DEMO_USER, email: email || DEMO_USER.email });
        seedLocalExpenses(); seedLocalBudgets();
        return { user, token: DEMO_TOKEN, mode: 'local-demo' };
    }
}

export async function requestPasswordReset(email) {
    try { const response = await fetch(`${getBaseUrl()}/api/password-reset/request`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ email }) }); return await handleResponse(response, 'Failed to send reset email'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { message: 'Local demo mode: use any 6-digit code to continue.' }; }
}

export async function confirmPasswordReset({ email, code, newPassword }) {
    try { const response = await fetch(`${getBaseUrl()}/api/password-reset/confirm`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ email, code, newPassword }) }); return await handleResponse(response, 'Failed to reset password'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { message: 'Local demo password updated.' }; }
}

export async function logoutUser() {
    try { const response = await fetch(`${getBaseUrl()}/api/logout`, { method: 'POST', headers: getAuthHeaders() }); return await handleResponse(response, 'Logout failed'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { message: 'Logged out locally.' }; }
}

export async function getProfile() {
    try { const response = await fetch(`${getBaseUrl()}/api/profile`, { headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to load profile'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { user: localRead('smartspendLocalUser', DEMO_USER) }; }
}

export async function updateProfile(data) {
    try { const response = await fetch(`${getBaseUrl()}/api/profile`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify(data) }); return await handleResponse(response, 'Failed to update profile'); }
    catch (error) { if (!isNetworkError(error)) throw error; const user = { ...localRead('smartspendLocalUser', DEMO_USER), ...data }; localWrite('smartspendLocalUser', user); return { user, message: 'Profile updated locally.' }; }
}

export async function getAccountSettings() {
    try { const response = await fetch(`${getBaseUrl()}/api/account-settings`, { headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to load account settings'); }
    catch (error) { if (!isNetworkError(error)) throw error; return localRead('smartspendLocalSettings', { budget_alerts: true, weekly_digest: true, currency: 'USD' }); }
}

export async function updateAccountSettings(data) {
    try { const response = await fetch(`${getBaseUrl()}/api/account-settings`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify(data) }); return await handleResponse(response, 'Failed to update account settings'); }
    catch (error) { if (!isNetworkError(error)) throw error; return localWrite('smartspendLocalSettings', data); }
}

export async function sendVerificationEmail() {
    try { const response = await fetch(`${getBaseUrl()}/api/account-settings/send-verification-email`, { method: 'POST', headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to send verification email'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { message: 'Local demo mode: verification email simulated.' }; }
}

export async function verifyEmailCode(code) {
    try { const response = await fetch(`${getBaseUrl()}/api/account-settings/verify-email`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ code }) }); return await handleResponse(response, 'Failed to verify email'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { message: 'Email verified locally.' }; }
}

export async function sendTestEmail() {
    try { const response = await fetch(`${getBaseUrl()}/api/account-settings/test-email`, { method: 'POST', headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to send test email'); }
    catch (error) { if (!isNetworkError(error)) throw error; return { message: 'Local demo mode: test email simulated.' }; }
}

export async function sendChatMessage({ message, messages = [], page = {} }) {
    try { const response = await fetch(`${getBaseUrl()}/api/chat`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ message, messages, page }) }); return await handleResponse(response, 'Failed to send chat message'); }
    catch (error) { if (!isNetworkError(error)) throw error; return localChatReply(message); }
}

// ─── EXPENSES ─────────────────────────────────────────────────

export async function getExpenses(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.append('category', filters.category);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.search) params.append('search', filters.search);
    try {
        const response = await fetch(`${getBaseUrl()}/api/expenses?${params.toString()}`, { headers: getAuthHeaders() });
        return await handleResponse(response, 'Failed to fetch expenses');
    } catch (error) {
        if (!isNetworkError(error)) throw error;
        return filterLocalExpenses(filters);
    }
}

export async function createExpense(data) {
    try { const response = await fetch(`${getBaseUrl()}/api/expenses`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify(data) }); return await handleResponse(response, 'Failed to create expense'); }
    catch (error) { if (!isNetworkError(error)) throw error; const expenses = seedLocalExpenses(); const item = { ...data, amount: Number(data.amount), _id: makeId('expense'), id: makeId('expense'), created_at: new Date().toISOString() }; expenses.unshift(item); localWrite('smartspendLocalExpenses', expenses); return item; }
}

export async function updateExpense(id, data) {
    try { const response = await fetch(`${getBaseUrl()}/api/expenses/${id}`, { method: 'PUT', headers: getAuthHeaders(true), body: JSON.stringify(data) }); return await handleResponse(response, 'Failed to update expense'); }
    catch (error) { if (!isNetworkError(error)) throw error; const expenses = seedLocalExpenses().map(e => (e._id === id || e.id === id) ? { ...e, ...data, amount: Number(data.amount ?? e.amount) } : e); localWrite('smartspendLocalExpenses', expenses); return expenses.find(e => e._id === id || e.id === id); }
}

export async function deleteExpense(id) {
    try { const response = await fetch(`${getBaseUrl()}/api/expenses/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to delete expense'); }
    catch (error) { if (!isNetworkError(error)) throw error; localWrite('smartspendLocalExpenses', seedLocalExpenses().filter(e => e._id !== id && e.id !== id)); return { message: 'Expense deleted locally.' }; }
}

// ─── BUDGETS ──────────────────────────────────────────────────

export async function getBudgets() {
    try { const response = await fetch(`${getBaseUrl()}/api/budgets`, { headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to fetch budgets'); }
    catch (error) { if (!isNetworkError(error)) throw error; return seedLocalBudgets(); }
}

export async function saveBudget(category, monthly_limit) {
    try { const response = await fetch(`${getBaseUrl()}/api/budgets`, { method: 'POST', headers: getAuthHeaders(true), body: JSON.stringify({ category, monthly_limit }) }); return await handleResponse(response, 'Failed to save budget'); }
    catch (error) { if (!isNetworkError(error)) throw error; let budgets = seedLocalBudgets(); const existing = budgets.find(b => b.category === category); if (existing) existing.monthly_limit = Number(monthly_limit); else budgets.push({ _id: makeId('budget'), id: makeId('budget'), category, monthly_limit: Number(monthly_limit) }); localWrite('smartspendLocalBudgets', budgets); return budgets.find(b => b.category === category); }
}

export async function deleteBudget(id) {
    try { const response = await fetch(`${getBaseUrl()}/api/budgets/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to delete budget'); }
    catch (error) { if (!isNetworkError(error)) throw error; localWrite('smartspendLocalBudgets', seedLocalBudgets().filter(b => b._id !== id && b.id !== id)); return { message: 'Budget deleted locally.' }; }
}

// ─── ANALYTICS ────────────────────────────────────────────────

function getRecentExpensesLocal(expenses, period) {
    const cutoff = daysAgoDate(period);
    return expenses.filter(e => parseDate(e.date) >= cutoff);
}

export async function getAnalyticsSummary(period = 30) {
    try { const response = await fetch(`${getBaseUrl()}/api/analytics/summary?period=${period}`, { headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to fetch analytics summary'); }
    catch (error) { if (!isNetworkError(error)) throw error; return localSummary(period); }
}

export async function getAnalyticsByCategory(period = 30) {
    const expenses = await getExpenses();
    const recent = getRecentExpensesLocal(expenses, period);
    const total = recent.reduce((sum, e) => sum + Number(e.amount), 0);

    const byCategory = {};
    recent.forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
    });

    return Object.entries(byCategory)
        .map(([category, catTotal]) => ({
            category,
            total: catTotal,
            percentage: total > 0 ? (catTotal / total) * 100 : 0,
            color: getCategoryColor(category)
        }))
        .sort((a, b) => b.total - a.total);
}

export async function getAnalyticsOverTime(period = 30) {
    const expenses = await getExpenses();
    const recent = getRecentExpensesLocal(expenses, period);

    const byDate = {};
    recent.forEach(e => {
        byDate[e.date] = (byDate[e.date] || 0) + Number(e.amount);
    });

    const result = [];
    for (let i = period - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        result.push({ date: key, total: byDate[key] || 0 });
    }

    return result;
}

export async function getSixMonthTrend() {
    try { const response = await fetch(`${getBaseUrl()}/api/analytics/six-month-trend`, { headers: getAuthHeaders() }); return await handleResponse(response, 'Failed to fetch six month trend'); }
    catch (error) { if (!isNetworkError(error)) throw error; return localSixMonthTrend(); }
}

/** Debug: after `import { getBaseUrl } from './js/api.js'` in console, call `getBaseUrl()` to verify API host. */
export { getBaseUrl };
