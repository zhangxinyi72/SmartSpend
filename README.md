# SmartSpend

**SmartSpend** is an **AI-assisted personal finance** web app for students and young professionals. It combines expense logging, category budgets, analytics, spending “stories” and nudges (`js/insight-engine.js`), and an optional Hugging Face–powered chat assistant. The UI follows a Figma-driven, card-based layout with responsive breakpoints and a clear light/dark theme system (`css/pro-upgrade.css`).

---

## Table of contents

1. [Positioning and differentiation](#positioning-and-differentiation)  
2. [Rubric alignment (course)](#rubric-alignment-course)  
3. [Feature summary](#feature-summary)  
4. [Tech stack](#tech-stack)  
5. [Project structure](#project-structure)  
6. [Code organization](#code-organization)  
7. [Quick start](#quick-start)  
8. [Setup and configuration](#setup-and-configuration)  
9. [npm scripts](#npm-scripts)  
10. [Demo user seeding](#demo-user-seeding)  
11. [Seed JSON files (`expenses_seed.json`, `budgets_seed.json`)](#seed-json-files-expenses_seedjson-budgets_seedjson)  
12. [Main pages (local URLs)](#main-pages-local-urls)  
13. [Key modules](#key-modules)  
14. [REST API overview](#rest-api-overview)  
15. [Database schema](#database-schema)  
16. [Back end, inserts, and security](#back-end-inserts-and-security)  
17. [Technical architecture](#technical-architecture)  
18. [Cloud deployment (Vercel + Render)](#cloud-deployment-vercel--render)  
19. [Dataset (Kaggle)](#dataset-kaggle)  
20. [UI, responsiveness, and accessibility notes](#ui-responsiveness-and-accessibility-notes)  
21. [Manual testing checklist](#manual-testing-checklist)  
22. [Presentation and demo](#presentation-and-demo)  
23. [Future enhancements](#future-enhancements)  
24. [Submission checklist](#submission-checklist)  

---

## Positioning and differentiation

**Tagline:** SmartSpend helps users understand *why* they spend, not only *where*.

| Theme | Description |
| --- | --- |
| Spending story | Turns recent expenses into a short narrative |
| Behavior nudges | Highlights patterns (e.g. frequent food spend) |
| Budget forecasting | Signals whether the user is on track for the month |
| Action-oriented analytics | Charts plus suggested next steps |
| Theme system | Distinct light vs. dark palettes (`css/pro-upgrade.css`) |

---

## Rubric alignment (course)

| Rubric area | How this repo addresses it |
| --- | --- |
| Code organization | Separate `css/`, `js/`, HTML pages; server in `app.js`; bootstrap in `start-smartspend.cjs`; optional seed in `scripts/` |
| HTML/CSS | Multi-page app, semantic controls, responsive layouts, Figma-aligned workflow |
| JavaScript | Page scripts + `js/api.js`, `js/utils.js`, shared theme/chat/insight modules |
| Node.js & database | Native HTTP server in `app.js`, MongoDB via official driver, REST JSON APIs, `insertOne` on register/expense/budget |
| Documentation | This file: install, env vars, scripts, modules, API, schema, deployment |

---

## Feature summary

- **Auth:** register, login, logout, bearer sessions, password reset via email code  
- **Profile & account:** editable profile, email verification, notification and budget-alert toggles, test email  
- **Expenses:** CRUD, filters (category, dates, search)  
- **Budgets:** per-category limits, spend vs. limit, threshold alerts (email when configured)  
- **Analytics:** summary metrics, category breakdown, six-month trend (Chart.js from CDN)  
- **AI:** `/api/chat` → Hugging Face chat completions  
- **UX:** day/night theme, mobile-friendly navigation, insight layer on analytics  

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Front end | HTML5, CSS3, vanilla JavaScript (ES modules) |
| Charts | Chart.js (CDN) |
| Back end | Node.js (CommonJS); **`app.js`** uses native **`http`**, **`fs`**, **`path`**, **`crypto`**, **`mongodb`**, **`nodemailer`**, **`dotenv`** |
| Start/bootstrap | **`start-smartspend.cjs`** loads `.env`, validates cloud/local Mongo usage on Render, then **`require('./app.js')`** |
| Database | MongoDB (driver: `mongodb`) — collections `users`, `expenses`, `budgets` |
| AI | Hugging Face Router / Chat Completions API |
| Email | Nodemailer + SMTP (e.g. Gmail App Password) |
| Optional hosting | Static UI on **Vercel** (`vercel.json` rewrites `/api/*`), API on **Render**, DB on **MongoDB Atlas** |

---

## Project structure

```text
SmartSpend/
├── app.js                    # HTTP server, static files, REST API, MongoDB, email, chat
├── start-smartspend.cjs      # Env load + Mongo checks; then loads app.js (used by npm start)
├── package.json
├── package-lock.json
├── vercel.json               # Optional: proxy /api/* to Render backend
├── .env.example              # Template only — copy to .env (never commit real secrets)
├── README.md
├── expenses_seed.json        # Sample expense rows (submission/demo reference; not auto-imported)
├── budgets_seed.json         # Sample budget rows (submission/demo reference; not auto-imported)
│
├── scripts/
│   └── seed-demo-user.cjs    # Creates/updates demo user (npm run seed:demo)
│
├── index.html                # Sign in
├── register.html
├── home.html                 # Dashboard
├── expense.html
├── budget.html
├── analytics.html
├── account.html
│
├── css/
│   ├── main.css
│   ├── login.css
│   ├── dashboard.css
│   ├── expense.css
│   ├── budget.css
│   ├── analytics.css
│   ├── account.css
│   └── pro-upgrade.css       # Professional theme overrides, glass cards, dark/light
│
└── js/
    ├── api.js                # Fetch wrapper for all /api routes
    ├── utils.js
    ├── theme.js
    ├── login.js
    ├── register.js
    ├── dashboard.js
    ├── expense.js
    ├── budget.js
    ├── analytics.js
    ├── charts.js
    ├── account.js
    ├── chatbot.js
    └── insight-engine.js     # Spending story, nudges, forecast helpers
```

There is **no** committed `assets/` folder in this tree; add images under a folder of your choice and reference them from HTML/CSS if needed.

---

## Code organization

- **HTML:** one page per major flow; shared patterns for nav and layout.  
- **CSS:** global tokens and layout in `main.css` / `login.css`; page-specific files; `pro-upgrade.css` for the upgraded visual system.  
- **JS:** `api.js` centralizes API calls; each page has a matching script; `insight-engine.js` supports analytics narrative features.  
- **Server:** all HTTP routing and DB access live in **`app.js`** (no Express router in use).  

---

## Quick start

```bash
git clone <your-repo-url>
cd SmartSpend
npm install
cp .env.example .env    # edit MONGO_URL, secrets, PORT if needed
npm start
```

Open **http://localhost:3001/** unless you set **`PORT`** otherwise (`app.js` defaults to **3001**).

---

## Setup and configuration

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create **`.env`** from **`.env.example`**. Important groups:

| Group | Purpose |
| --- | --- |
| `MONGO_URL`, `DB_NAME` | MongoDB connection (local or Atlas) |
| `PORT` | HTTP port (default **3001** if unset) |
| `APP_BASE_URL` | Absolute base URL for links (local or deployed) |
| `HF_*` | Hugging Face chat (required for `/api/chat`) |
| `SMTP_*` | Email: verification, reset, notifications, budget alerts |
| `BUDGET_ALERT_THRESHOLD`, `LEGACY_DATA_OWNER_EMAIL` | Alerts and optional legacy data migration hooks |

**Security:** never commit **`.env`** or real tokens. For coursework ZIP submission, include **`.env.example`** only.

### 3. MongoDB

Run MongoDB locally **or** use **MongoDB Atlas**. **`start-smartspend.cjs`** warns or exits on Render if `MONGO_URL` still points to localhost.

### 4. Start the server

```bash
npm start
```

This runs **`node start-smartspend.cjs`**, which configures dotenv and then loads **`app.js`**.

---

## npm scripts

| Script | Command | Description |
| --- | --- | --- |
| **Start server** | `npm start` | `node start-smartspend.cjs` → `app.js` |
| **Seed demo user** | `npm run seed:demo` | Upserts demo user in `users` (requires `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` in `.env`) |

---

## Demo user seeding

After **`MONGO_URL`** and **`DB_NAME`** match your database, set in **`.env`**:

- `DEMO_USER_EMAIL`
- `DEMO_USER_PASSWORD`
- Optional: `DEMO_USER_NAME`

Then:

```bash
npm run seed:demo
```

The script **`scripts/seed-demo-user.cjs`** hashes the password with **`crypto.scryptSync`** (same family of approach as the app) and upserts the user document so you can sign in immediately on local or cloud.

---

## Seed JSON files (`expenses_seed.json`, `budgets_seed.json`)

These files are **reference / submission artifacts** for demo and grading. They are **not** automatically imported by `npm start` or a bundled script.

- **Runtime data entry:** users add expenses and budgets through the **REST API** (and registration creates users). **`app.js`** performs **`insertOne`** for new expenses and budgets as documented below.  
- **Bulk demo load:** you may import the JSON manually (mongoimport, Compass, or a one-off script) if you need the exact Kaggle-derived rows in the database.

---

## Main pages (local URLs)

Replace port if **`PORT`** ≠ `3001`.

| URL | Page |
| --- | --- |
| `http://localhost:3001/` | Sign in (`index.html`) |
| `http://localhost:3001/register.html` | Register |
| `http://localhost:3001/home.html` | Dashboard |
| `http://localhost:3001/expense.html` | Expenses |
| `http://localhost:3001/budget.html` | Budgets |
| `http://localhost:3001/analytics.html` | Analytics |
| `http://localhost:3001/account.html` | Account & email settings |

---

## Key modules

| File | Responsibility |
| --- | --- |
| `start-smartspend.cjs` | Dotenv, Mongo URL sanity checks (especially on Render), then load `app.js` |
| `app.js` | Static hosting, REST API, MongoDB operations, SMTP, Hugging Face proxy |
| `scripts/seed-demo-user.cjs` | Create/update seeded demo user credentials |
| `js/api.js` | Front-end API client for all `/api/*` routes |
| `js/utils.js` | Auth helpers, redirects, formatting, toasts, password visibility |
| `js/theme.js` | Light/dark theme |
| `js/login.js` / `js/register.js` | Sign-in and registration flows |
| `js/dashboard.js` | Dashboard data and recent expenses |
| `js/expense.js` | Expense CRUD and filters |
| `js/budget.js` | Budget CRUD and threshold UX |
| `js/analytics.js` | Analytics loading and interactions |
| `js/charts.js` | Chart.js wiring |
| `js/insight-engine.js` | Spending story, nudges, forecast-style helpers |
| `js/account.js` | Profile, verification, notifications, logout |
| `js/chatbot.js` | Chat UI |

---

## REST API overview

### Authentication and profile

| Method | Route | Auth |
| --- | --- | --- |
| `POST` | `/api/register` | No |
| `POST` | `/api/login` | No |
| `POST` | `/api/password-reset/request` | No |
| `POST` | `/api/password-reset/confirm` | No |
| `POST` | `/api/logout` | Yes |
| `GET` | `/api/profile` | Yes |
| `PUT` | `/api/profile` | Yes |

### Account settings and email

| Method | Route | Auth |
| --- | --- | --- |
| `GET` | `/api/account-settings` | Yes |
| `PUT` | `/api/account-settings` | Yes |
| `POST` | `/api/account-settings/send-verification-email` | Yes |
| `POST` | `/api/account-settings/verify-email` | Yes |
| `POST` | `/api/account-settings/test-email` | Yes |

### Expenses

| Method | Route | Auth |
| --- | --- | --- |
| `GET` | `/api/expenses` | Yes |
| `POST` | `/api/expenses` | Yes |
| `PUT` | `/api/expenses/:id` | Yes |
| `DELETE` | `/api/expenses/:id` | Yes |

`GET /api/expenses` query params: `category`, `startDate`, `endDate`, `search`.

### Budgets

| Method | Route | Auth |
| --- | --- | --- |
| `GET` | `/api/budgets` | Yes |
| `POST` | `/api/budgets` | Yes |
| `DELETE` | `/api/budgets/:id` | Yes |

### Analytics

| Method | Route | Auth |
| --- | --- | --- |
| `GET` | `/api/analytics/summary` | Yes |
| `GET` | `/api/analytics/six-month-trend` | Yes |

### AI chat

| Method | Route | Auth |
| --- | --- | --- |
| `POST` | `/api/chat` | Yes |

Health check (typical for Render): **`GET /healthz`**.

---

## Database schema

### `users`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Primary key |
| `name`, `email` | String | Email unique, lowercased |
| `passwordSalt`, `passwordHash` | String | `scrypt`-based hashing |
| `phone`, `location` | String | Optional profile |
| `memberSince`, `memberStatus` | String | Display |
| `emailVerified` | Boolean | |
| `emailNotificationsEnabled`, `budgetAlertsEnabled` | Boolean | |
| `budgetAlertThreshold` | Number | 0–1 |
| `verificationCodeHash`, `verificationCodeExpiresAt`, `verificationEmailSentAt` | String | Email verification |
| `passwordResetCodeHash`, `passwordResetCodeExpiresAt`, `passwordResetRequestedAt` | String | Password reset |
| `budgetAlertHistory` | Object | Deduping alert sends |
| `created_at`, `updated_at`, `last_login_at` | String | ISO timestamps |
| `sessionTokenHash` | String | SHA-256 of active session token |

### `expenses`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | |
| `userId` | String | Owner |
| `amount` | Number | |
| `category` | String | |
| `description` | String | Optional |
| `date` | String | `YYYY-MM-DD` |
| `created_at` | String | ISO |

### `budgets`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | |
| `userId` | String | |
| `category` | String | |
| `monthly_limit` | Number | |
| `created_at` | String | ISO |

---

## Back end, inserts, and security

- **Validation** on write routes; JSON errors with appropriate HTTP status codes.  
- **Auth:** bearer token; only a **hash** of the session token is stored on the user document.  
- **Multi-tenant safety:** expense and budget queries filter by **`userId`**.  
- **Passwords:** never plain text; hashed with **`crypto.scryptSync`** and per-user salt.  
- **Node.js inserts (course requirement):**  
  - `POST /api/register` → **`users.insertOne`**  
  - `POST /api/expenses` → **`expenses.insertOne`**  
  - `POST /api/budgets` → **`budgets.insertOne`** for a new category, or **`updateOne`** if that category already exists for the user  

Email and chat paths fail gracefully when SMTP or Hugging Face is misconfigured.

---

## Technical architecture

```text
Browser (HTML / CSS / JS)
        |
        v
start-smartspend.cjs  -->  app.js (HTTP + static + /api/*)
        |                      |
        |                      +--> MongoDB
        |                      +--> Hugging Face (chat)
        |                      +--> SMTP (Nodemailer)
        v
Environment: .env (dotenv)
```

Typical request: UI calls **`js/api.js`** → **`fetch('/api/...')`** → **`app.js`** → MongoDB / external services → JSON response.

---

## Cloud deployment (Vercel + Render)

1. **Render:** Web service, **`npm install`** / **`npm start`**, set all env vars (especially **`MONGO_URL`** not localhost). Verify **`GET /healthz`**.  
2. **Vercel:** Deploy static files; edit **`vercel.json`** so rewrites point to your Render URL.  
3. Optional: in the browser, `localStorage.setItem('SMARTSPEND_API_BASE_URL', 'https://your-render-host')` if you bypass rewrites.

---

## Dataset (Kaggle)

Demo expense shaping is described in the original data README notes. Source reference:

- [Kaggle: Personal Expense Analysis / Budget Prediction](https://www.kaggle.com/code/alhamdulliah123/personal-expense-analysis-budget-prediction-usin/input)

Cleaned demo ranges and category alignment are reflected in **`expenses_seed.json`** / **`budgets_seed.json`** and in-app analytics windows.

---

## UI, responsiveness, and accessibility notes

- Figma-aligned dashboard and budgeting flows; sidebar on desktop, bottom nav patterns on small screens.  
- Responsive breakpoints in page CSS; theme variables for spacing and color.  
- **Limitations:** advanced a11y (full keyboard paths, ARIA everywhere) is left as future work—see [Future enhancements](#future-enhancements).

---

## Manual testing checklist

- [ ] Register and log in  
- [ ] Forgot password → email code → reset  
- [ ] Profile update on Account  
- [ ] Verification email + 6-digit code  
- [ ] Notification test email  
- [ ] Budget alert when crossing threshold (with SMTP + verified email as required by app logic)  
- [ ] Add / edit / delete expense  
- [ ] Create budgets and see progress  
- [ ] Analytics charts load  
- [ ] Chat returns responses (HF token set)  
- [ ] Theme toggle  
- [ ] Logout redirects protected routes  

---

## Presentation and demo

**Suggested demo flows (3+ interactive areas):**

1. Auth + account (sign-in, optional reset, verification)  
2. Expense + budget (add expense, show dashboard/budget impact)  
3. Analytics + AI (charts + chat or insight copy)

**Slides:** map sections [Positioning](#positioning-and-differentiation), [Tech stack](#tech-stack), [Technical architecture](#technical-architecture), [REST API](#rest-api-overview) + [Database schema](#database-schema), [Manual testing checklist](#manual-testing-checklist), and challenges/enhancements.

---

## Dependencies (`package.json`)

Declared npm packages:

| Package | Notes |
| --- | --- |
| `mongodb` | Database driver (**used** in `app.js`) |
| `nodemailer` | Email (**used** in `app.js`) |
| `dotenv` | Environment loading (**used** in `app.js` and seed script) |
| `bcrypt`, `cors`, `express`, `jsonwebtoken` | Listed in `package.json` but **not imported by `app.js`** at present; safe to remove in a cleanup pass if unused |

Runtime modules in **`app.js`** also include Node core: **`http`**, **`fs`**, **`path`**, **`crypto`**.

---

## Future enhancements

- Optional CSV/JSON **import** endpoint for bulk expenses  
- Stronger accessibility and automated tests  
- Remove unused npm dependencies if confirmed unused  
- CI lint/test pipeline  

---

## Submission checklist

**Coding implementation ZIP**

- [ ] All source: `.html`, `css/`, `js/`, `app.js`, `start-smartspend.cjs`, `scripts/`, `package.json`, `package-lock.json`  
- [ ] `vercel.json` if graders should reproduce proxy setup  
- [ ] `README.md` (this file)  
- [ ] `.env.example` only — **not** real `.env`  
- [ ] `expenses_seed.json`, `budgets_seed.json` as sample data reference  
- [ ] Optional: any images/media **you reference** from the site  
- [ ] Exclude `node_modules/` (run `npm install` after unzip)  

**Presentation (if required by course)**

- [ ] Slide deck / PDF / Figma link per instructor instructions  
- [ ] Live demo of core flows  

---

*README revised to match the repository layout and `package.json` scripts as of project snapshot; default HTTP port **3001** per `app.js`.*
