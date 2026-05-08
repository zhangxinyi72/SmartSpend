require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = Number(process.env.PORT || 3001);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'companydb';
const STATIC_ROOT = __dirname;
const PASSWORD_KEY_LENGTH = 64;
const HF_API_URL = process.env.HF_API_URL || 'https://router.huggingface.co/v1/chat/completions';
const HF_MODEL = String(process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct:fastest').trim();
const HF_FALLBACK_MODELS = String(
    process.env.HF_FALLBACK_MODELS || 'deepseek-ai/DeepSeek-V3-0324:fastest,deepseek-ai/DeepSeek-R1:fastest'
)
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
const HF_MAX_TOKENS = Number(process.env.HF_MAX_TOKENS || 500);
const CHAT_HISTORY_LIMIT = 8;
const DEFAULT_BUDGET_ALERT_THRESHOLD = Number(process.env.BUDGET_ALERT_THRESHOLD || 0.8);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false') === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const LEGACY_DATA_OWNER_EMAIL = normalizeEmail(process.env.LEGACY_DATA_OWNER_EMAIL || '');
const DEMO_EMAIL = 'demo@smartspend.com';
const REMOVE_DEMO_ARTIFACTS = String(process.env.REMOVE_DEMO_ARTIFACTS || 'false').toLowerCase() === 'true';
const PASSWORD_RESET_MAX_ATTEMPTS = readPositiveInt(process.env.PASSWORD_RESET_MAX_ATTEMPTS, 5);
const EXPENSE_SEARCH_MAX_LENGTH = readPositiveInt(process.env.EXPENSE_SEARCH_MAX_LENGTH, 80);
let indexesPromise = null;
let mailTransporter = null;

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error('Invalid JSON body'));
            }
        });

        req.on('error', error => {
            reject(error);
        });
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end(text);
}

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getIdFromPath(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    return parts[2] || null;
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeRegexLiteral(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatMemberSince(dateInput = new Date()) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function buildMemberStatus(memberSince) {
    return `SmartSpend Member since ${memberSince}`;
}

function getDefaultAccountSettings(user = {}) {
    return {
        emailVerified: Boolean(user.emailVerified),
        emailNotificationsEnabled: user.emailNotificationsEnabled !== false,
        budgetAlertsEnabled: user.budgetAlertsEnabled !== false,
        budgetAlertThreshold: Number(user.budgetAlertThreshold ?? DEFAULT_BUDGET_ALERT_THRESHOLD),
        verificationEmailSentAt: user.verificationEmailSentAt || null
    };
}

function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hashVerificationCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function getMonthFromDate(dateString) {
    return String(dateString || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function normalizeBudgetCategory(category) {
    const raw = String(category || '').trim().toLowerCase();
    if (!raw) return '';

    if (raw === 'food') return 'food & dining';
    if (raw === 'food & dining') return 'food & dining';

    if (raw === 'transport') return 'transportation';
    if (raw === 'transportation') return 'transportation';

    if (raw === 'health') return 'healthcare';
    if (raw === 'healthcare') return 'healthcare';

    return raw;
}

function getBudgetAlertLevel(spent, limit, threshold) {
    if (!limit || limit <= 0) {
        return null;
    }

    const ratio = Number(spent) / Number(limit);
    if (ratio >= 1) {
        return 100;
    }

    const thresholdPercent = Math.round(Number(threshold || DEFAULT_BUDGET_ALERT_THRESHOLD) * 100);
    return ratio >= Number(threshold || DEFAULT_BUDGET_ALERT_THRESHOLD) ? thresholdPercent : null;
}

function buildBudgetAlertHistoryKey(category, dateString, level) {
    return `${getMonthFromDate(dateString)}:${category}:${level}`;
}

function getMailTransporter() {
    if (!SMTP_HOST || !SMTP_FROM) {
        return null;
    }

    if (!mailTransporter) {
        mailTransporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: SMTP_USER && SMTP_PASS
                ? {
                    user: SMTP_USER,
                    pass: SMTP_PASS
                }
                : undefined
        });
    }

    return mailTransporter;
}

async function sendAppEmail({ to, subject, text, html }) {
    const transporter = getMailTransporter();

    if (!transporter) {
        throw createHttpError(500, 'Email delivery is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to your .env file.');
    }

    await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html
    });
}

function buildVerificationEmail(user, code) {
    const title = 'Verify your SmartSpend email';
    const intro = `Hi ${user.name || 'there'},`;
    const body = `Use this verification code to confirm your SmartSpend account email: ${code}`;
    const footer = `After verification, email notifications and budget alerts can be sent to ${user.email}.`;

    return {
        subject: title,
        text: `${intro}\n\n${body}\n\n${footer}\n\nSmartSpend`,
        html: `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a">
                <h2 style="margin:0 0 12px;color:#1c9a8a;">${title}</h2>
                <p>${intro}</p>
                <p>${body}</p>
                <div style="margin:20px 0;padding:16px 18px;border-radius:14px;background:#ecfbf8;font-size:28px;font-weight:800;letter-spacing:0.2em;width:fit-content;">
                    ${code}
                </div>
                <p>${footer}</p>
                <p style="color:#628094;font-size:14px;">SmartSpend</p>
            </div>
        `
    };
}

function buildPasswordResetEmail(user, code) {
    const title = 'Reset your SmartSpend password';
    const intro = `Hi ${user.name || 'there'},`;
    const body = `Use this 6-digit code to reset your SmartSpend password: ${code}`;
    const footer = 'This code expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.';

    return {
        subject: title,
        text: `${intro}\n\n${body}\n\n${footer}\n\nSign in again at ${APP_BASE_URL}/index.html\n\nSmartSpend`,
        html: `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a">
                <h2 style="margin:0 0 12px;color:#1c9a8a;">${title}</h2>
                <p>${intro}</p>
                <p>${body}</p>
                <div style="margin:20px 0;padding:16px 18px;border-radius:14px;background:#eefaf8;font-size:28px;font-weight:800;letter-spacing:0.2em;width:fit-content;">
                    ${code}
                </div>
                <p>${footer}</p>
                <p><a href="${APP_BASE_URL}/index.html" style="color:#1c9a8a;font-weight:700;">Return to SmartSpend sign in</a></p>
                <p style="color:#628094;font-size:14px;">SmartSpend</p>
            </div>
        `
    };
}

function buildTestEmail(user) {
    return {
        subject: 'SmartSpend email notifications are turned on',
        text: `Hi ${user.name || 'there'}, your SmartSpend email notifications are active. Future budget alerts will be sent to this address.`,
        html: `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a">
                <h2 style="margin:0 0 12px;color:#1c9a8a;">Email notifications are active</h2>
                <p>Hi ${user.name || 'there'},</p>
                <p>Your SmartSpend email notifications are turned on. Future budget alerts and account emails will be sent here.</p>
                <p style="color:#628094;font-size:14px;">SmartSpend</p>
            </div>
        `
    };
}

/** Email when total spending this month crosses threshold vs sum of all category budgets (single alert path). */
function buildBudgetAlertEmail({ user, totalSpent, totalBudget, thresholdLevel, remaining, monthKey }) {
    const monthLabel = new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    return {
        subject: `SmartSpend alert: total monthly spending is at ${thresholdLevel}% of all budgets`,
        text: `Hi ${user.name || 'there'}, in ${monthLabel} your total spending ($${formatUsd(totalSpent)}) reached ${thresholdLevel}% relative to your combined monthly budgets ($${formatUsd(totalBudget)}). Remaining vs total budgets: $${formatUsd(remaining)}.`,
        html: `
            <div style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#0f172a">
                <h2 style="margin:0 0 12px;color:#1c9a8a;">Overall monthly budget alert</h2>
                <p>Hi ${user.name || 'there'},</p>
                <p>In <strong>${monthLabel}</strong>, your <strong>total spending</strong> vs <strong>sum of all category budgets</strong> reached <strong>${thresholdLevel}%</strong>.</p>
                <ul style="padding-left:18px;">
                    <li>Total spent this month: <strong>$${formatUsd(totalSpent)}</strong></li>
                    <li>Sum of monthly budgets: <strong>$${formatUsd(totalBudget)}</strong></li>
                    <li>Remaining (budget − spent): <strong>$${formatUsd(remaining)}</strong></li>
                </ul>
                <p>This includes spending in every category. Open SmartSpend to review expenses and budgets.</p>
                <p><a href="${APP_BASE_URL}/budget.html" style="color:#1c9a8a;font-weight:700;">Open Budget Planner</a></p>
            </div>
        `
    };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
    const calculatedHash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH);
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (calculatedHash.length !== storedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(calculatedHash, storedBuffer);
}

function createSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function formatUsd(amount) {
    return Number(amount || 0).toFixed(2);
}

function normalizeChatHistory(messages) {
    if (!Array.isArray(messages)) {
        return [];
    }

    return messages
        .filter(message => message && ['user', 'assistant'].includes(message.role))
        .map(message => ({
            role: message.role,
            content: String(message.content || '').trim()
        }))
        .filter(message => message.content)
        .slice(-CHAT_HISTORY_LIMIT);
}

/** Supports Mongo docs using monthly_limit, monthlyLimit, or limit */
function readBudgetMonthlyLimit(budget) {
    if (!budget || typeof budget !== 'object') {
        return 0;
    }
    const raw = budget.monthly_limit ?? budget.monthlyLimit ?? budget.limit;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

function buildChatSnapshot(expenses, budgets) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const currentMonthExpenses = expenses.filter(expense => {
        const [expenseYear, expenseMonth] = String(expense.date || '').split('-').map(Number);
        return expenseYear === year && expenseMonth === month;
    });

    const totalSpent = currentMonthExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const totalBudget = budgets.reduce((sum, budget) => sum + readBudgetMonthlyLimit(budget), 0);

    const categoryTotals = {};
    currentMonthExpenses.forEach(expense => {
        categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + Number(expense.amount || 0);
    });

    const topCategories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category, total]) => ({
            category,
            total: Number(total.toFixed(2))
        }));

    const recentExpenses = expenses.slice(0, 5).map(expense => ({
        date: expense.date,
        category: expense.category,
        amount: Number(Number(expense.amount || 0).toFixed(2)),
        description: expense.description || ''
    }));

    const budgetStatus = budgets.map(budget => {
        const spent = currentMonthExpenses
            .filter(expense => expense.category === budget.category)
            .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        const monthlyLimit = readBudgetMonthlyLimit(budget);

        return {
            category: budget.category,
            monthly_limit: Number(monthlyLimit.toFixed(2)),
            spent: Number(spent.toFixed(2)),
            remaining: Number((monthlyLimit - spent).toFixed(2))
        };
    });

    return {
        totalSpent: Number(totalSpent.toFixed(2)),
        totalBudget: Number(totalBudget.toFixed(2)),
        remainingBudget: Number((totalBudget - totalSpent).toFixed(2)),
        topCategories,
        recentExpenses,
        budgetStatus
    };
}

function buildChatSystemPrompt({ user, pageContext, snapshot }) {
    const currentPage = pageContext?.title || pageContext?.path || 'SmartSpend';
    const pageHeading = pageContext?.heading || 'Not provided';

    return [
        'You are SmartSpend AI, an in-app assistant for a student-friendly personal finance dashboard.',
        'Your job is to help users understand this website, navigate pages, and interpret their own finance data.',
        `Current signed-in user: ${user.name} (${user.email}).`,
        `Current page: ${currentPage}.`,
        `Current page heading: ${pageHeading}.`,
        'Website areas:',
        '- Dashboard: overview of total spent, total budget, remaining budget, and recent expenses.',
        '- Expense: add, edit, or delete a single expense entry.',
        '- Analytics: category spending breakdown and six-month trend charts.',
        '- Budget: create category limits and generate savings suggestions.',
        '- Account: update profile details and log out.',
        'User finance snapshot for this conversation:',
        `- Current month total spent (USD): ${formatUsd(snapshot.totalSpent)}`,
        `- Current month total budget (USD): ${formatUsd(snapshot.totalBudget)}`,
        `- Current month remaining budget (USD): ${formatUsd(snapshot.remainingBudget)}`,
        `- Top categories this month: ${snapshot.topCategories.length ? JSON.stringify(snapshot.topCategories) : 'No spending data yet.'}`,
        `- Recent expenses: ${snapshot.recentExpenses.length ? JSON.stringify(snapshot.recentExpenses) : 'No expenses recorded yet.'}`,
        `- Budget status: ${snapshot.budgetStatus.length ? JSON.stringify(snapshot.budgetStatus) : 'No budgets created yet.'}`,
        'Rules for your replies:',
        '- Keep answers concise, warm, and specific to SmartSpend.',
        '- If the user asks about the current page, explain what they can do on that page.',
        '- If the user asks for spending or budget advice, use the provided data snapshot.',
        '- If data is unavailable, say that clearly instead of inventing details.',
        '- Do not claim you changed any database records or settings from chat.',
        '- Give educational budgeting guidance, not legal, tax, or professional financial advice.'
    ].join('\n');
}

function extractChatText(payload) {
    if (Array.isArray(payload?.choices)) {
        const combined = payload.choices
            .map(choice => {
                const content = choice?.message?.content;
                if (typeof content === 'string') {
                    return content;
                }

                if (Array.isArray(content)) {
                    return content
                        .map(item => item?.text || item?.content || '')
                        .filter(Boolean)
                        .join('\n');
                }

                return '';
            })
            .filter(content => content.trim())
            .join('\n')
            .trim();

        if (combined) {
            return combined;
        }
    }

    return '';
}

function isUnsupportedHfModelError(message) {
    return /not supported by any provider you have enabled/i.test(message) ||
        /requested model .* is not supported/i.test(message);
}

function getHfChatModels() {
    return [...new Set([HF_MODEL, ...HF_FALLBACK_MODELS])];
}

async function requestHuggingFaceResponse(messages) {
    if (!process.env.HF_TOKEN) {
        throw createHttpError(500, 'Chatbot is not configured. Add HF_TOKEN to your .env file and restart the server.');
    }

    const models = getHfChatModels();
    let lastError = null;

    for (const model of models) {
        const response = await fetch(HF_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.HF_TOKEN}`
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: HF_MAX_TOKENS,
                stream: false,
                temperature: 0.6
            })
        });

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            const errorMessage =
                data?.error?.message ||
                data?.error ||
                data?.message ||
                'Failed to get a response from Hugging Face.';

            lastError = createHttpError(
                response.status >= 400 && response.status < 500 ? response.status : 502,
                String(errorMessage)
            );

            if (isUnsupportedHfModelError(errorMessage) && model !== models[models.length - 1]) {
                console.warn(`HF model "${model}" is unavailable for this token/provider setup. Trying fallback model.`);
                continue;
            }

            if (isUnsupportedHfModelError(errorMessage)) {
                throw createHttpError(
                    400,
                    `None of the configured Hugging Face models are available for this token/provider setup. Tried: ${models.join(', ')}. Update HF_MODEL or HF_FALLBACK_MODELS in .env.`
                );
            }

            throw lastError;
        }

        const text = extractChatText(data);
        if (!text) {
            throw createHttpError(502, 'Hugging Face returned an empty response.');
        }

        return { reply: text, model };
    }

    throw lastError || createHttpError(502, 'No supported Hugging Face chat model is available right now.');
}

function serializeExpense(expense) {
    return {
        id: expense._id.toString(),
        amount: Number(expense.amount),
        category: expense.category,
        description: expense.description || '',
        date: expense.date,
        created_at: expense.created_at
    };
}

function serializeBudget(budget, spent = 0) {
    return {
        id: budget._id.toString(),
        category: budget.category,
        monthly_limit: readBudgetMonthlyLimit(budget),
        spent: Number(spent),
        created_at: budget.created_at
    };
}

function serializeUser(user) {
    const memberSince = user.memberSince || formatMemberSince(user.created_at);
    const accountSettings = getDefaultAccountSettings(user);

    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        location: user.location || '',
        memberSince,
        memberStatus: user.memberStatus || buildMemberStatus(memberSince),
        accountSettings,
        created_at: user.created_at,
        last_login_at: user.last_login_at || null
    };
}

function getMonthRange() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    return {
        startDate: `${year}-${month}-01`,
        endDate: `${year}-${month}-31`
    };
}

function getContentType(filePath) {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function removeDemoArtifacts(db) {
    const usersCollection = db.collection('users');
    const expensesCollection = db.collection('expenses');
    const budgetsCollection = db.collection('budgets');

    const demoUser = await usersCollection.findOne({ email: DEMO_EMAIL });
    if (!demoUser) {
        return;
    }

    const userId = demoUser._id.toString();
    const [expenseResult, budgetResult, userResult] = await Promise.all([
        expensesCollection.deleteMany({ userId }),
        budgetsCollection.deleteMany({ userId }),
        usersCollection.deleteOne({ _id: demoUser._id })
    ]);

    console.log(`Removed demo artifacts: ${expenseResult.deletedCount} expenses, ${budgetResult.deletedCount} budgets, ${userResult.deletedCount} user`);
}

async function findPrimaryUser(db) {
    const usersCollection = db.collection('users');

    if (LEGACY_DATA_OWNER_EMAIL) {
        const preferredUser = await usersCollection.findOne({ email: LEGACY_DATA_OWNER_EMAIL });
        if (preferredUser) {
            return preferredUser;
        }
    }

    return await usersCollection.findOne(
        { email: { $ne: DEMO_EMAIL } },
        { sort: { created_at: 1, _id: 1 } }
    );
}

async function migrateLegacyFinanceData(db) {
    const primaryUser = await findPrimaryUser(db);

    if (!primaryUser) {
        console.log('No primary user found for legacy data migration.');
        return null;
    }

    const userId = primaryUser._id.toString();
    const expensesCollection = db.collection('expenses');
    const budgetsCollection = db.collection('budgets');
    const legacyFilter = {
        $or: [
            { userId: { $exists: false } },
            { userId: null },
            { userId: '' }
        ]
    };

    const [expenseResult, budgetResult] = await Promise.all([
        expensesCollection.updateMany(legacyFilter, { $set: { userId } }),
        budgetsCollection.updateMany(legacyFilter, { $set: { userId } })
    ]);

    console.log(`Primary data owner: ${primaryUser.email}`);
    console.log(`Migrated legacy records: ${expenseResult.modifiedCount} expenses, ${budgetResult.modifiedCount} budgets`);
    return primaryUser;
}

async function initializeApp() {
    const client = await MongoClient.connect(MONGO_URL);

    try {
        const db = client.db(DB_NAME);
        await db.command({ ping: 1 });
        await ensureIndexes(db);
        if (REMOVE_DEMO_ARTIFACTS) {
            await removeDemoArtifacts(db);
        }
        await migrateLegacyFinanceData(db);
        console.log(`Connected to MongoDB database "${DB_NAME}" at ${MONGO_URL}`);
    } finally {
        await client.close();
    }
}

async function ensureIndexes(db) {
    if (!indexesPromise) {
        indexesPromise = Promise.all([
            db.collection('users').createIndex({ email: 1 }, { unique: true }),
            db.collection('expenses').createIndex({ userId: 1, date: -1 }),
            db.collection('budgets').createIndex({ userId: 1, category: 1 }, { unique: true })
        ]);
    }

    await indexesPromise;
}

async function resolveStaticFile(pathname) {
    const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const normalizedPath = path.normalize(requestedPath);

    if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        return null;
    }

    let filePath = path.join(STATIC_ROOT, normalizedPath);

    try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
    } catch (error) {
        if (!path.extname(filePath)) {
            const htmlPath = `${filePath}.html`;
            try {
                await fs.promises.stat(htmlPath);
                filePath = htmlPath;
            } catch {
                return null;
            }
        } else {
            return null;
        }
    }

    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(STATIC_ROOT);

    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
        return null;
    }

    return resolvedPath;
}

async function serveStaticFile(pathname, res) {
    const filePath = await resolveStaticFile(pathname);

    if (!filePath) {
        sendText(res, 404, 'Not Found');
        return;
    }

    const data = await fs.promises.readFile(filePath);
    res.writeHead(200, {
        'Content-Type': getContentType(filePath)
    });
    res.end(data);
}

async function getAuthenticatedUser(req, usersCollection) {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
        throw createHttpError(401, 'Authentication required');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        throw createHttpError(401, 'Authentication required');
    }

    const user = await usersCollection.findOne({
        sessionTokenHash: hashToken(token)
    });

    if (!user) {
        throw createHttpError(401, 'Session expired. Please sign in again.');
    }

    return user;
}

/**
 * When total spending for a month drops below the alert threshold, remove aggregate (__ALL__) dedupe keys
 * for that month so the next time spending crosses 80%/100% again the user gets another email.
 */
async function clearAggregateBudgetAlertHistoryIfBelowThreshold({
    user,
    monthKey,
    usersCollection,
    expensesCollection,
    budgetsCollection
}) {
    const freshUser = await usersCollection.findOne({ _id: user._id });
    if (!freshUser) {
        return;
    }

    const settings = getDefaultAccountSettings(freshUser);
    const userId = user._id.toString();
    const startDate = `${monthKey}-01`;
    const endDate = `${monthKey}-31`;

    const budgets = await budgetsCollection.find({ userId }).toArray();
    const totalBudget = budgets.reduce((sum, b) => sum + readBudgetMonthlyLimit(b), 0);
    if (totalBudget <= 0) {
        return;
    }

    const monthExpenses = await expensesCollection
        .find({
            userId,
            date: { $gte: startDate, $lte: endDate }
        })
        .toArray();

    const totalSpent = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const level = getBudgetAlertLevel(totalSpent, totalBudget, settings.budgetAlertThreshold);

    if (level !== null) {
        return;
    }

    const history =
        freshUser.budgetAlertHistory && typeof freshUser.budgetAlertHistory === 'object'
            ? { ...freshUser.budgetAlertHistory }
            : {};
    const prefix = `${monthKey}:__ALL__:`;
    let changed = false;

    for (const key of Object.keys(history)) {
        if (key.startsWith(prefix)) {
            delete history[key];
            changed = true;
        }
    }

    if (!changed) {
        return;
    }

    await usersCollection.updateOne(
        { _id: user._id },
        {
            $set: {
                budgetAlertHistory: history,
                updated_at: new Date().toISOString()
            }
        }
    );
}

/**
 * Budget alert email only when TOTAL spending this month vs SUM of all category monthly_limits
 * crosses the configured threshold (default 80%) or 100%. All expense categories count toward total spent.
 */
async function maybeSendBudgetAlert({ user, expense, usersCollection, expensesCollection, budgetsCollection }) {
    const freshUser = await usersCollection.findOne({ _id: user._id });
    if (!freshUser) {
        return;
    }

    const settings = getDefaultAccountSettings(freshUser);

    if (!settings.emailVerified || !settings.emailNotificationsEnabled || !settings.budgetAlertsEnabled) {
        return;
    }

    const userId = user._id.toString();
    const monthKey = getMonthFromDate(expense.date);
    const startDate = `${monthKey}-01`;
    const endDate = `${monthKey}-31`;

    const budgets = await budgetsCollection.find({ userId }).toArray();
    const totalBudget = budgets.reduce((sum, b) => sum + readBudgetMonthlyLimit(b), 0);
    if (totalBudget <= 0) {
        return;
    }

    const monthExpenses = await expensesCollection
        .find({
            userId,
            date: { $gte: startDate, $lte: endDate }
        })
        .toArray();

    const totalSpent = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const thresholdLevel = getBudgetAlertLevel(totalSpent, totalBudget, settings.budgetAlertThreshold);

    if (!thresholdLevel) {
        return;
    }

    const history =
        freshUser.budgetAlertHistory && typeof freshUser.budgetAlertHistory === 'object'
            ? freshUser.budgetAlertHistory
            : {};
    const historyKey = buildBudgetAlertHistoryKey('__ALL__', expense.date, thresholdLevel);

    if (history[historyKey]) {
        return;
    }

    const remaining = totalBudget - totalSpent;
    const email = buildBudgetAlertEmail({
        user: freshUser,
        totalSpent,
        totalBudget,
        thresholdLevel,
        remaining,
        monthKey
    });

    await sendAppEmail({
        to: freshUser.email,
        subject: email.subject,
        text: email.text,
        html: email.html
    });

    const updatedHistory = {
        ...history,
        [historyKey]: new Date().toISOString()
    };

    await usersCollection.updateOne(
        { _id: user._id },
        {
            $set: {
                budgetAlertHistory: updatedHistory,
                updated_at: new Date().toISOString()
            }
        }
    );
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    if (req.method === 'GET' && pathname === '/healthz') {
        sendJson(res, 200, { ok: true, service: 'smartspend-api' });
        return;
    }

    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
        serveStaticFile(pathname, res).catch(error => {
            sendText(res, 500, error.message || 'Failed to load page');
        });
        return;
    }

    (async () => {
        const client = await MongoClient.connect(MONGO_URL);

        try {
            const db = client.db(DB_NAME);
            const usersCollection = db.collection('users');
            const expensesCollection = db.collection('expenses');
            const budgetsCollection = db.collection('budgets');
            await ensureIndexes(db);

            if (req.method === 'POST' && pathname === '/api/register') {
                const body = await readRequestBody(req);
                const name = String(body.name || '').trim();
                const email = normalizeEmail(body.email);
                const password = String(body.password || '');

                if (!name || !email || !password) {
                    sendJson(res, 400, { error: 'Name, email, and password are required' });
                    return;
                }

                if (!isValidEmail(email)) {
                    sendJson(res, 400, { error: 'Please enter a valid email address' });
                    return;
                }

                if (password.length < 8) {
                    sendJson(res, 400, { error: 'Password must be at least 8 characters long' });
                    return;
                }

                const existingUser = await usersCollection.findOne({ email });
                if (existingUser) {
                    sendJson(res, 409, { error: 'An account with this email already exists' });
                    return;
                }

                const { salt, hash } = hashPassword(password);
                const sessionToken = createSessionToken();
                const memberSince = formatMemberSince(new Date());
                const nowIso = new Date().toISOString();

                const newUser = {
                    name,
                    email,
                    passwordSalt: salt,
                    passwordHash: hash,
                    phone: '',
                    location: '',
                    memberSince,
                    memberStatus: buildMemberStatus(memberSince),
                    created_at: nowIso,
                    updated_at: nowIso,
                    last_login_at: nowIso,
                    emailVerified: false,
                    emailNotificationsEnabled: true,
                    budgetAlertsEnabled: true,
                    budgetAlertThreshold: DEFAULT_BUDGET_ALERT_THRESHOLD,
                    verificationCodeHash: null,
                    verificationCodeExpiresAt: null,
                    verificationEmailSentAt: null,
                    passwordResetCodeHash: null,
                    passwordResetCodeExpiresAt: null,
                    passwordResetRequestedAt: null,
                    budgetAlertHistory: {},
                    sessionTokenHash: hashToken(sessionToken)
                };

                let result;

                try {
                    result = await usersCollection.insertOne(newUser);
                } catch (error) {
                    if (error.code === 11000) {
                        sendJson(res, 409, { error: 'An account with this email already exists' });
                        return;
                    }

                    throw error;
                }

                sendJson(res, 201, {
                    message: 'Account created successfully',
                    token: sessionToken,
                    user: serializeUser({
                        _id: result.insertedId,
                        ...newUser
                    })
                });
            }

            else if (req.method === 'POST' && pathname === '/api/login') {
                const body = await readRequestBody(req);
                const email = normalizeEmail(body.email);
                const password = String(body.password || '');

                if (!email || !password) {
                    sendJson(res, 400, { error: 'Email and password are required' });
                    return;
                }

                const user = await usersCollection.findOne({ email });
                if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
                    sendJson(res, 401, { error: 'Invalid email or password' });
                    return;
                }

                const sessionToken = createSessionToken();
                const nowIso = new Date().toISOString();

                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            sessionTokenHash: hashToken(sessionToken),
                            last_login_at: nowIso,
                            updated_at: nowIso
                        }
                    }
                );

                const refreshedUser = await usersCollection.findOne({ _id: user._id });

                sendJson(res, 200, {
                    message: 'Login successful',
                    token: sessionToken,
                    user: serializeUser(refreshedUser)
                });
            }

            else if (req.method === 'POST' && pathname === '/api/password-reset/request') {
                const body = await readRequestBody(req);
                const email = normalizeEmail(body.email);

                if (!email) {
                    sendJson(res, 400, { error: 'Email is required' });
                    return;
                }

                if (!isValidEmail(email)) {
                    sendJson(res, 400, { error: 'Please enter a valid email address' });
                    return;
                }

                const user = await usersCollection.findOne({ email });
                const message = 'If an account with that email exists, a password reset code has been sent.';

                if (!user) {
                    sendJson(res, 200, { message });
                    return;
                }

                const code = generateVerificationCode();
                const nowIso = new Date().toISOString();
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                const emailPayload = buildPasswordResetEmail(user, code);

                await sendAppEmail({
                    to: user.email,
                    subject: emailPayload.subject,
                    text: emailPayload.text,
                    html: emailPayload.html
                });

                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            passwordResetCodeHash: hashVerificationCode(code),
                            passwordResetCodeExpiresAt: expiresAt,
                            passwordResetRequestedAt: nowIso,
                            passwordResetAttemptCount: 0,
                            updated_at: nowIso
                        }
                    }
                );

                sendJson(res, 200, { message });
            }

            else if (req.method === 'POST' && pathname === '/api/password-reset/confirm') {
                const body = await readRequestBody(req);
                const email = normalizeEmail(body.email);
                const code = String(body.code || '').trim();
                const newPassword = String(body.newPassword || '');

                if (!email || !code || !newPassword) {
                    sendJson(res, 400, { error: 'Email, reset code, and new password are required' });
                    return;
                }

                if (!isValidEmail(email)) {
                    sendJson(res, 400, { error: 'Please enter a valid email address' });
                    return;
                }

                if (newPassword.length < 8) {
                    sendJson(res, 400, { error: 'Password must be at least 8 characters long' });
                    return;
                }

                const user = await usersCollection.findOne({ email });
                const invalidCodeMessage = 'That reset code is invalid or has expired. Please request a new code.';

                if (!user || !user.passwordResetCodeHash || !user.passwordResetCodeExpiresAt) {
                    sendJson(res, 400, { error: invalidCodeMessage });
                    return;
                }

                if (new Date(user.passwordResetCodeExpiresAt) < new Date()) {
                    sendJson(res, 400, { error: invalidCodeMessage });
                    return;
                }

                const nowIso = new Date().toISOString();
                const attemptReservation = await usersCollection.updateOne(
                    {
                        _id: user._id,
                        passwordResetCodeHash: user.passwordResetCodeHash,
                        passwordResetCodeExpiresAt: user.passwordResetCodeExpiresAt,
                        $or: [
                            { passwordResetAttemptCount: { $exists: false } },
                            { passwordResetAttemptCount: { $lt: PASSWORD_RESET_MAX_ATTEMPTS } }
                        ]
                    },
                    {
                        $inc: { passwordResetAttemptCount: 1 },
                        $set: { updated_at: nowIso }
                    }
                );

                if (attemptReservation.matchedCount !== 1) {
                    sendJson(res, 400, { error: 'Too many invalid reset attempts. Please request a new code.' });
                    return;
                }

                if (hashVerificationCode(code) !== user.passwordResetCodeHash) {
                    const updatedUser = await usersCollection.findOne({ _id: user._id });
                    const attemptCount = Number(updatedUser?.passwordResetAttemptCount || 0);

                    if (attemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) {
                        await usersCollection.updateOne(
                            { _id: user._id },
                            {
                                $set: {
                                    updated_at: nowIso
                                },
                                $unset: {
                                    passwordResetCodeHash: '',
                                    passwordResetCodeExpiresAt: '',
                                    passwordResetRequestedAt: ''
                                }
                            }
                        );
                    }

                    sendJson(res, 400, { error: invalidCodeMessage });
                    return;
                }

                const { salt, hash } = hashPassword(newPassword);
                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            passwordSalt: salt,
                            passwordHash: hash,
                            updated_at: new Date().toISOString()
                        },
                        $unset: {
                            sessionTokenHash: '',
                            passwordResetCodeHash: '',
                            passwordResetCodeExpiresAt: '',
                            passwordResetRequestedAt: '',
                            passwordResetAttemptCount: ''
                        }
                    }
                );

                sendJson(res, 200, { message: 'Password updated successfully. Please sign in with your new password.' });
            }

            else if (req.method === 'POST' && pathname === '/api/logout') {
                const user = await getAuthenticatedUser(req, usersCollection);

                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $unset: {
                            sessionTokenHash: ''
                        },
                        $set: {
                            updated_at: new Date().toISOString()
                        }
                    }
                );

                sendJson(res, 200, { success: true });
            }

            else if (req.method === 'GET' && pathname === '/api/profile') {
                const user = await getAuthenticatedUser(req, usersCollection);
                sendJson(res, 200, serializeUser(user));
            }

            else if (req.method === 'PUT' && pathname === '/api/profile') {
                const currentUser = await getAuthenticatedUser(req, usersCollection);
                const body = await readRequestBody(req);

                const name = String(body.name ?? currentUser.name).trim();
                const email = normalizeEmail(body.email ?? currentUser.email);
                const phone = String(body.phone ?? currentUser.phone ?? '').trim();
                const location = String(body.location ?? currentUser.location ?? '').trim();
                const memberSince = String(body.memberSince ?? currentUser.memberSince ?? '').trim() || currentUser.memberSince;

                if (!name || !email) {
                    sendJson(res, 400, { error: 'Name and email are required' });
                    return;
                }

                if (!isValidEmail(email)) {
                    sendJson(res, 400, { error: 'Please enter a valid email address' });
                    return;
                }

                const existingUser = await usersCollection.findOne({
                    email,
                    _id: { $ne: currentUser._id }
                });

                if (existingUser) {
                    sendJson(res, 409, { error: 'That email is already being used by another account' });
                    return;
                }

                const updatedFields = {
                    name,
                    email,
                    phone,
                    location,
                    memberSince,
                    memberStatus: buildMemberStatus(memberSince),
                    updated_at: new Date().toISOString()
                };

                if (email !== currentUser.email) {
                    updatedFields.emailVerified = false;
                    updatedFields.verificationCodeHash = null;
                    updatedFields.verificationCodeExpiresAt = null;
                    updatedFields.verificationEmailSentAt = null;
                    updatedFields.passwordResetCodeHash = null;
                    updatedFields.passwordResetCodeExpiresAt = null;
                    updatedFields.passwordResetRequestedAt = null;
                }

                await usersCollection.updateOne(
                    { _id: currentUser._id },
                    { $set: updatedFields }
                );

                const updatedUser = await usersCollection.findOne({ _id: currentUser._id });
                sendJson(res, 200, serializeUser(updatedUser));
            }

            else if (req.method === 'GET' && pathname === '/api/account-settings') {
                const user = await getAuthenticatedUser(req, usersCollection);
                sendJson(res, 200, getDefaultAccountSettings(user));
            }

            else if (req.method === 'PUT' && pathname === '/api/account-settings') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const body = await readRequestBody(req);
                const currentSettings = getDefaultAccountSettings(user);
                const nextSettings = {
                    emailNotificationsEnabled: body.emailNotificationsEnabled == null
                        ? currentSettings.emailNotificationsEnabled
                        : Boolean(body.emailNotificationsEnabled),
                    budgetAlertsEnabled: body.budgetAlertsEnabled == null
                        ? currentSettings.budgetAlertsEnabled
                        : Boolean(body.budgetAlertsEnabled),
                    budgetAlertThreshold: body.budgetAlertThreshold == null
                        ? currentSettings.budgetAlertThreshold
                        : Number(body.budgetAlertThreshold)
                };

                if (!Number.isFinite(nextSettings.budgetAlertThreshold) || nextSettings.budgetAlertThreshold <= 0 || nextSettings.budgetAlertThreshold > 1) {
                    sendJson(res, 400, { error: 'Budget alert threshold must be between 0 and 1' });
                    return;
                }

                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            emailNotificationsEnabled: nextSettings.emailNotificationsEnabled,
                            budgetAlertsEnabled: nextSettings.budgetAlertsEnabled,
                            budgetAlertThreshold: nextSettings.budgetAlertThreshold,
                            updated_at: new Date().toISOString()
                        }
                    }
                );

                const updatedUser = await usersCollection.findOne({ _id: user._id });
                sendJson(res, 200, {
                    message: 'Account settings updated',
                    settings: getDefaultAccountSettings(updatedUser),
                    user: serializeUser(updatedUser)
                });
            }

            else if (req.method === 'POST' && pathname === '/api/account-settings/send-verification-email') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const code = generateVerificationCode();
                const nowIso = new Date().toISOString();
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                const email = buildVerificationEmail(user, code);

                await sendAppEmail({
                    to: user.email,
                    subject: email.subject,
                    text: email.text,
                    html: email.html
                });

                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            verificationCodeHash: hashVerificationCode(code),
                            verificationCodeExpiresAt: expiresAt,
                            verificationEmailSentAt: nowIso,
                            updated_at: nowIso
                        }
                    }
                );

                const refreshedUser = await usersCollection.findOne({ _id: user._id });
                sendJson(res, 200, {
                    message: `Verification email sent to ${user.email}`,
                    settings: getDefaultAccountSettings(refreshedUser),
                    user: serializeUser(refreshedUser)
                });
            }

            else if (req.method === 'POST' && pathname === '/api/account-settings/verify-email') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const body = await readRequestBody(req);
                const code = String(body.code || '').trim();

                if (!code) {
                    sendJson(res, 400, { error: 'Verification code is required' });
                    return;
                }

                if (!user.verificationCodeHash || !user.verificationCodeExpiresAt) {
                    sendJson(res, 400, { error: 'Please request a verification email first' });
                    return;
                }

                if (new Date(user.verificationCodeExpiresAt) < new Date()) {
                    sendJson(res, 400, { error: 'This verification code has expired. Please request a new email.' });
                    return;
                }

                if (hashVerificationCode(code) !== user.verificationCodeHash) {
                    sendJson(res, 400, { error: 'That verification code is not correct' });
                    return;
                }

                await usersCollection.updateOne(
                    { _id: user._id },
                    {
                        $set: {
                            emailVerified: true,
                            updated_at: new Date().toISOString()
                        },
                        $unset: {
                            verificationCodeHash: '',
                            verificationCodeExpiresAt: ''
                        }
                    }
                );

                const refreshedUser = await usersCollection.findOne({ _id: user._id });
                sendJson(res, 200, {
                    message: 'Email verified successfully',
                    settings: getDefaultAccountSettings(refreshedUser),
                    user: serializeUser(refreshedUser)
                });
            }

            else if (req.method === 'POST' && pathname === '/api/account-settings/test-email') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const settings = getDefaultAccountSettings(user);

                if (!settings.emailVerified) {
                    sendJson(res, 400, { error: 'Verify your email before sending a test message' });
                    return;
                }

                if (!settings.emailNotificationsEnabled) {
                    sendJson(res, 400, { error: 'Turn on email notifications before sending a test email' });
                    return;
                }

                const email = buildTestEmail(user);
                await sendAppEmail({
                    to: user.email,
                    subject: email.subject,
                    text: email.text,
                    html: email.html
                });

                sendJson(res, 200, { message: `Test email sent to ${user.email}` });
            }

            else if (req.method === 'POST' && pathname === '/api/chat') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const body = await readRequestBody(req);
                const message = String(body.message || '').trim();
                const history = normalizeChatHistory(body.messages);
                const pageContext = {
                    path: String(body.page?.path || '').trim().slice(0, 120),
                    title: String(body.page?.title || '').trim().slice(0, 120),
                    heading: String(body.page?.heading || '').trim().slice(0, 160)
                };

                if (!message) {
                    sendJson(res, 400, { error: 'A chat message is required' });
                    return;
                }

                if (message.length > 1500) {
                    sendJson(res, 400, { error: 'Please keep your message under 1500 characters' });
                    return;
                }

                const userId = user._id.toString();
                const expenses = await expensesCollection
                    .find({ userId })
                    .sort({ date: -1, _id: -1 })
                    .limit(40)
                    .toArray();
                const budgets = await budgetsCollection
                    .find({ userId })
                    .sort({ category: 1 })
                    .toArray();

                const snapshot = buildChatSnapshot(expenses, budgets);
                const systemPrompt = buildChatSystemPrompt({ user, pageContext, snapshot });
                const chatResult = await requestHuggingFaceResponse([
                    { role: 'system', content: systemPrompt },
                    ...history,
                    { role: 'user', content: message }
                ]);

                sendJson(res, 200, {
                    reply: chatResult.reply,
                    model: chatResult.model
                });
            }

            else if (req.method === 'GET' && pathname === '/api/expenses') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const filters = { userId: user._id.toString() };
                const category = requestUrl.searchParams.get('category');
                const startDate = requestUrl.searchParams.get('startDate');
                const endDate = requestUrl.searchParams.get('endDate');
                const search = requestUrl.searchParams.get('search');

                if (category) filters.category = category;

                if (startDate || endDate) {
                    filters.date = {};
                    if (startDate) filters.date.$gte = startDate;
                    if (endDate) filters.date.$lte = endDate;
                }

                if (search) {
                    const searchTerm = String(search).trim();
                    if (searchTerm.length > EXPENSE_SEARCH_MAX_LENGTH) {
                        sendJson(res, 400, { error: `Search must be ${EXPENSE_SEARCH_MAX_LENGTH} characters or fewer` });
                        return;
                    }

                    if (searchTerm) {
                        const escapedSearch = escapeRegexLiteral(searchTerm);
                        filters.$or = [
                            { description: { $regex: escapedSearch, $options: 'i' } },
                            { category: { $regex: escapedSearch, $options: 'i' } }
                        ];
                    }
                }

                const expenses = await expensesCollection
                    .find(filters)
                    .sort({ date: -1, _id: -1 })
                    .toArray();

                sendJson(res, 200, expenses.map(serializeExpense));
            }

            else if (req.method === 'POST' && pathname === '/api/expenses') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const body = await readRequestBody(req);

                if (body.amount == null || !body.category || !body.date) {
                    sendJson(res, 400, { error: 'Missing required fields' });
                    return;
                }

                const newExpense = {
                    userId: user._id.toString(),
                    amount: Number(body.amount),
                    category: body.category,
                    description: body.description || '',
                    date: body.date,
                    created_at: new Date().toISOString()
                };

                const result = await expensesCollection.insertOne(newExpense);

                try {
                    await clearAggregateBudgetAlertHistoryIfBelowThreshold({
                        user,
                        monthKey: getMonthFromDate(newExpense.date),
                        usersCollection,
                        expensesCollection,
                        budgetsCollection
                    });
                    await maybeSendBudgetAlert({
                        user,
                        expense: newExpense,
                        usersCollection,
                        expensesCollection,
                        budgetsCollection
                    });
                } catch (error) {
                    console.error('Budget alert email failed:', error.message || error);
                }

                sendJson(res, 201, serializeExpense({
                    _id: result.insertedId,
                    ...newExpense
                }));
            }

            else if (req.method === 'PUT' && pathname.startsWith('/api/expenses/')) {
                const user = await getAuthenticatedUser(req, usersCollection);
                const expenseId = getIdFromPath(pathname);

                if (!expenseId || !ObjectId.isValid(expenseId)) {
                    sendJson(res, 400, { error: 'Valid expense ID is required' });
                    return;
                }

                const body = await readRequestBody(req);
                const updateData = {};

                if (body.amount != null) updateData.amount = Number(body.amount);
                if (body.category != null) updateData.category = body.category;
                if (body.description != null) updateData.description = body.description;
                if (body.date != null) updateData.date = body.date;

                if (Object.keys(updateData).length === 0) {
                    sendJson(res, 400, { error: 'No fields to update' });
                    return;
                }

                const objectId = new ObjectId(expenseId);
                const existingExpense = await expensesCollection.findOne({
                    _id: objectId,
                    userId: user._id.toString()
                });

                if (!existingExpense) {
                    sendJson(res, 404, { error: 'Expense not found' });
                    return;
                }

                const result = await expensesCollection.updateOne(
                    { _id: objectId, userId: user._id.toString() },
                    { $set: updateData }
                );

                const updatedExpense = await expensesCollection.findOne({
                    _id: objectId,
                    userId: user._id.toString()
                });

                try {
                    const oldMonthKey = getMonthFromDate(existingExpense.date);
                    const newMonthKey = getMonthFromDate(updatedExpense.date);
                    if (oldMonthKey !== newMonthKey) {
                        await clearAggregateBudgetAlertHistoryIfBelowThreshold({
                            user,
                            monthKey: oldMonthKey,
                            usersCollection,
                            expensesCollection,
                            budgetsCollection
                        });
                    }
                    await clearAggregateBudgetAlertHistoryIfBelowThreshold({
                        user,
                        monthKey: newMonthKey,
                        usersCollection,
                        expensesCollection,
                        budgetsCollection
                    });
                    await maybeSendBudgetAlert({
                        user,
                        expense: updatedExpense,
                        usersCollection,
                        expensesCollection,
                        budgetsCollection
                    });
                } catch (error) {
                    console.error('Budget alert email failed:', error.message || error);
                }

                sendJson(res, 200, serializeExpense(updatedExpense));
            }

            else if (req.method === 'DELETE' && pathname.startsWith('/api/expenses/')) {
                const user = await getAuthenticatedUser(req, usersCollection);
                const expenseId = getIdFromPath(pathname);

                if (!expenseId || !ObjectId.isValid(expenseId)) {
                    sendJson(res, 400, { error: 'Valid expense ID is required' });
                    return;
                }

                const objectId = new ObjectId(expenseId);
                const existingExpense = await expensesCollection.findOne({
                    _id: objectId,
                    userId: user._id.toString()
                });

                if (!existingExpense) {
                    sendJson(res, 404, { error: 'Expense not found' });
                    return;
                }

                await expensesCollection.deleteOne({
                    _id: objectId,
                    userId: user._id.toString()
                });

                try {
                    await clearAggregateBudgetAlertHistoryIfBelowThreshold({
                        user,
                        monthKey: getMonthFromDate(existingExpense.date),
                        usersCollection,
                        expensesCollection,
                        budgetsCollection
                    });
                } catch (error) {
                    console.error('Budget alert history sync failed:', error.message || error);
                }

                sendJson(res, 200, { success: true });
            }

            else if (req.method === 'GET' && pathname === '/api/budgets') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const userId = user._id.toString();
                const budgets = await budgetsCollection.find({ userId }).sort({ category: 1 }).toArray();
                const { startDate, endDate } = getMonthRange();

                const currentMonthExpenses = await expensesCollection.find({
                    userId,
                    date: { $gte: startDate, $lte: endDate }
                }).toArray();

                const spentByNormalizedCategory = new Map();
                currentMonthExpenses.forEach(expense => {
                    const key = normalizeBudgetCategory(expense.category);
                    spentByNormalizedCategory.set(
                        key,
                        (spentByNormalizedCategory.get(key) || 0) + Number(expense.amount)
                    );
                });

                const budgetsWithSpent = budgets.map(budget => {
                    const spent = spentByNormalizedCategory.get(
                        normalizeBudgetCategory(budget.category)
                    ) || 0;

                    return serializeBudget(budget, spent);
                });

                sendJson(res, 200, budgetsWithSpent);
            }

            else if (req.method === 'POST' && pathname === '/api/budgets') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const userId = user._id.toString();
                const body = await readRequestBody(req);

                const limitFromBody = body.monthly_limit ?? body.monthlyLimit;
                if (!body.category || limitFromBody == null) {
                    sendJson(res, 400, { error: 'Missing required fields' });
                    return;
                }

                const nextLimit = Number(limitFromBody);
                if (!Number.isFinite(nextLimit) || nextLimit < 0) {
                    sendJson(res, 400, { error: 'Invalid monthly_limit' });
                    return;
                }

                const existingBudget = await budgetsCollection.findOne({
                    userId,
                    category: body.category
                });

                if (existingBudget) {
                    await budgetsCollection.updateOne(
                        { _id: existingBudget._id },
                        {
                            $set: {
                                monthly_limit: nextLimit
                            }
                        }
                    );

                    const updatedBudget = await budgetsCollection.findOne({
                        _id: existingBudget._id
                    });

                    sendJson(res, 200, serializeBudget(updatedBudget));
                    return;
                }

                const newBudget = {
                    userId,
                    category: body.category,
                    monthly_limit: nextLimit,
                    created_at: new Date().toISOString()
                };

                const result = await budgetsCollection.insertOne(newBudget);

                sendJson(res, 201, serializeBudget({
                    _id: result.insertedId,
                    ...newBudget
                }));
            }

            else if (req.method === 'DELETE' && pathname.startsWith('/api/budgets/')) {
                const user = await getAuthenticatedUser(req, usersCollection);
                const budgetId = getIdFromPath(pathname);

                if (!budgetId || !ObjectId.isValid(budgetId)) {
                    sendJson(res, 400, { error: 'Valid budget ID is required' });
                    return;
                }

                const result = await budgetsCollection.deleteOne({
                    _id: new ObjectId(budgetId),
                    userId: user._id.toString()
                });

                if (result.deletedCount === 0) {
                    sendJson(res, 404, { error: 'Budget not found' });
                    return;
                }

                sendJson(res, 200, { success: true });
            }

            else if (req.method === 'GET' && pathname === '/api/analytics/summary') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const period = Number(requestUrl.searchParams.get('period') || 30);
                const cutoff = new Date();

                cutoff.setHours(0, 0, 0, 0);
                cutoff.setDate(cutoff.getDate() - period);

                const allExpenses = await expensesCollection.find({
                    userId: user._id.toString()
                }).toArray();

                const recentExpenses = allExpenses.filter(expense => new Date(expense.date) >= cutoff);

                const total_spent = recentExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
                const transaction_count = recentExpenses.length;
                const avg_per_transaction = transaction_count > 0 ? total_spent / transaction_count : 0;

                const byCategory = {};
                recentExpenses.forEach(expense => {
                    byCategory[expense.category] = (byCategory[expense.category] || 0) + Number(expense.amount);
                });

                const top_category =
                    Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

                sendJson(res, 200, {
                    total_spent,
                    avg_per_transaction,
                    top_category,
                    transaction_count
                });
            }

            else if (req.method === 'GET' && pathname === '/api/analytics/six-month-trend') {
                const user = await getAuthenticatedUser(req, usersCollection);
                const allExpenses = await expensesCollection.find({
                    userId: user._id.toString()
                }).toArray();

                const now = new Date();
                const result = [];

                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const year = d.getFullYear();
                    const month = d.getMonth() + 1;

                    const total = allExpenses
                        .filter(expense => {
                            const [y, m] = expense.date.split('-').map(Number);
                            return y === year && m === month;
                        })
                        .reduce((sum, expense) => sum + Number(expense.amount), 0);

                    result.push({
                        label: d.toLocaleDateString('en-US', { month: 'short' }),
                        total
                    });
                }

                sendJson(res, 200, result);
            }

            else {
                sendJson(res, 404, { error: 'Route not found' });
            }
        } catch (error) {
            const statusCode = error.statusCode || 500;
            sendJson(res, statusCode, { error: error.message || 'Internal server error' });
        } finally {
            await client.close();
        }
    })().catch(error => {
        sendJson(res, 500, { error: error.message || 'Database connection failed' });
    });
});

initializeApp()
    .then(() => {
        server
            .listen(PORT, () => {
                console.log(`Server is running at http://localhost:${PORT}`);
            })
            .on('error', err => {
                if (err && err.code === 'EADDRINUSE') {
                    console.error(
                        `[SmartSpend] Port ${PORT} is already in use. Another process (often an older \`node app.js\` or \`npm start\`) is listening.\n` +
                            `  • Stop it:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN   then   kill <PID>\n` +
                            `  • Or use a different port:  PORT=3002 npm start`
                    );
                    process.exit(1);
                }
                throw err;
            });
    })
    .catch(error => {
        console.error(`Failed to start SmartSpend: ${error.message || error}`);
        process.exit(1);
    });
