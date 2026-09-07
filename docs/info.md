# LABMON — Complete Project Understanding

> A beginner-friendly, senior-developer-style walkthrough of **everything** this project does and **why** it does it that way.
>
> This report is generated from the **actual code** in this repository. Where the roadmap docs (`backend/Readme.md`) and the code disagree, the **code wins** and this report follows the code. Anything that could not be confirmed from the code is called out explicitly.

---

## 1. Project Overview

### One-line explanation

> LABMON is a website + small background program that keeps a live "health card" for every computer in a college's labs and lets anyone report a broken PC and follow the complaint as it climbs the chain of people responsible for fixing it.

### 30-second explanation

Colleges have hundreds of lab PCs spread across departments. Nobody really knows, at any moment, which PC has which CPU/RAM/disk, what software is installed, whether it is still under warranty, or which "dead stock number" (the college's asset tag) it carries. And when a PC breaks, a student has to physically find the right staff member and hope it gets escalated if it is not fixed.

LABMON fixes both problems:

1. A **tiny Python program** (`agent/collector.py`) runs on each lab PC, reads its hardware and installed software, and sends that to a central server. The server keeps a **digital health card** per PC.
2. A **public web page** lets anyone (no login) type a PC's dead stock number, describe the problem, and get a **tracking token**. The complaint automatically starts at the **Lab Incharge**, and staff can **escalate** it up a fixed chain — Lab Incharge → HOD → Dean Infrastructure — or **resolve** it. The reporter can check status any time using their token.

### Technical explanation

LABMON is a **MERN-style system** made of **three independently deployed runtimes**:

| Runtime | Folder | Tech | Job |
|---|---|---|---|
| **Backend API** | `backend/` | Node.js + Express 5 + Mongoose (MongoDB) | REST API: auth, PC health cards, complaints, departments |
| **Frontend SPA** | `frontend/` | React 19 + Vite + React Router 7 + axios | Staff dashboards + public complaint pages |
| **Collector agent** | `agent/` | Python 3 + `psutil` + `requests` | Per-PC hardware/software collector that POSTs to the backend |

There is **no shared package / monorepo tooling**. Each folder has its own `package.json` (or `requirements.txt`) and is installed and run on its own.

Key architectural traits, all confirmed in code:

- **Layered backend**: `route → middleware → controller → service → Mongoose model`. Controllers are thin; business logic lives in services.
- **JWT auth with httpOnly cookies** (access + refresh token, refresh-token rotation, hashed refresh token stored in DB).
- **Role-based + department-scoped authorization**, centralized in one file (`src/utils/scope.js`).
- **OTP email verification** on registration (bcrypt-hashed OTP, CSPRNG, attempt lockout, resend cooldown).
- **Zod request validation** + **express-rate-limit** on public/sensitive routes.
- **Consistent response envelope** via `ApiResponse` / `ApiError` wrapper classes and one Express error middleware.

---

## 2. Problem Being Solved

| Pain today | LABMON's answer |
|---|---|
| No central inventory of lab PC specs; audits are manual spreadsheets | The collector agent auto-syncs CPU/RAM/disk/OS/software per PC into a DB-backed **health card** |
| Nobody tracks warranty status per machine | `Pc.warranty.status` (`Active` / `Expired`) + expiry date on the health card, searchable |
| Students can't easily report a broken PC and it "disappears" if ignored | **Public, login-free complaint form** returns a **tracking token**; complaint auto-starts at Lab Incharge |
| No accountability / escalation path | Fixed escalation chain **Lab Incharge → HOD → Dean Infra**, enforced server-side; every action recorded in a `history[]` audit trail |
| Staff of one department seeing/altering another department's complaints | **Department-scoped access**: everyone is locked to their own department except `admin` and `deanInfra` |
| Finding "which PCs have an i5 / 16GB / MATLAB / expired warranty" | **PC search page** with regex filters on every config field + warranty status |

---

## 3. Target Users

1. **Any student or lab user (no account)** — raises a complaint about a specific PC, tracks it by token.
2. **Lab Incharge** — sees their department's whole complaint queue; can escalate to HOD or resolve; can search PCs and view health cards.
3. **HOD (Head of Department)** — sees only complaints **currently escalated to HOD level** within their department; can escalate to Dean Infra or resolve.
4. **Dean Infrastructure** — sees only complaints **currently at Dean level**, across **all** departments (not department-scoped); can only **resolve** (top of the chain, cannot escalate further).
5. **Admin** — role exists in the enum and is unscoped for reads, but there is **no admin UI and no admin CRUD endpoints** yet (see gaps). Anyone can currently self-register as admin.
6. **The lab PC itself** — runs the Python agent (currently unauthenticated) to keep its own health card fresh.

---

## 4. Main Features

### 4.1 PC config sync (health card) — the agent

- **What it does**: Collects this PC's CPU (with marketing name like "Intel Core i7-9700K"), RAM, disk size, OS string, and an allow-listed set of installed software (Windows only, via the registry). POSTs `{ deadStockNo, config, [department], [lab] }` to `POST /api/v1/pc/sync`.
- **Why it exists**: Keeps the digital health card accurate without manual data entry.
- **Who uses it**: Runs on each lab PC (scheduled task / manual run).
- **Code involved**:
  - Agent: `agent/collector.py` (`collect_cpu`, `collect_ram`, `collect_disk`, `collect_os`, `collect_software`, `build_payload`, `sync`)
  - Backend: `pc.route.js` `POST /sync` → `pcSyncLimiter` → `validate(syncPcSchema)` → `pc.controller.js#syncPc` → `pc.service.js#syncPcConfig`
  - DB: `Pc` collection (embedded `config` subdocument), plus `Dept` and `Lab` (auto-created labs)
- **Internally**:
  1. Agent reads hardware, builds JSON, POSTs it.
  2. `syncPcConfig` builds a **field-by-field `$set`** (`config.cpu`, `config.ram`, …) so a partial payload never wipes other fields, and always sets `config.lastSyncedAt`.
  3. If a `Pc` with that `deadStockNo` exists → update its config (touch `department`/`lab` only if explicitly supplied).
  4. If it does not exist → first-time **provisioning**: requires `department` **and** `lab` names; resolves department name → ObjectId, upserts the lab, creates the `Pc` with `warranty.status: "Active"`.

```
Lab PC ──(python collector.py)──▶ POST /api/v1/pc/sync
                                    │
                        rate limit + Zod validate
                                    │
                        syncPcConfig(payload)
                          ├─ exists?  → $set config.* fields
                          └─ new?     → resolve dept, upsert lab, create Pc
                                    │
                              Pc document updated ──▶ 200 { pc }
```

### 4.2 Public complaint submission

- **What**: Unauthenticated form: dead stock number + description + name + contact → creates a `Complaint`, returns an 8-character `token` (via `nanoid`).
- **Why**: Lowers the barrier to reporting; the token replaces "having an account".
- **Who**: Any lab user.
- **Frontend**: `features/public-complaint/RaiseComplaintPage.jsx` (also calls `GET /pc/lookup/:deadStockNo` on blur to confirm the PC and show its department/lab before submit).
- **Backend**: `complaint.route.js` `POST /` → `complaintLimiter` → `validate(raiseComplaintSchema)` → `complaint.controller.js#raiseComplaint` → `complaint.service.js#createComplaint`.
- **DB**: reads `Pc` (to copy `department` + `lab` onto the complaint), writes `Complaint`.
- **Internally**: finds the PC by `deadStockNo`; if none → `404 "PC not found"`. Otherwise creates the complaint with `status: Open`, `currentLevel: labIncharge`, and a first `history` entry `{ level: labIncharge, action: "created", by: null }`.

### 4.3 Complaint tracking (public)

- **What**: `GET /api/v1/complaint/track/:token` returns a **trimmed** view: `token, status, currentLevel, description, createdAt` only.
- **Frontend**: `features/public-complaint/TrackComplaintPage.jsx`.
- **Why the trim**: A public token holder should not see internal fields (history, staff identities, IDs).

### 4.4 Staff authentication (register → verify OTP → login)

- **Register** (`POST /auth/register`): create account (role + optional department **name**, resolved to a `Dept` ObjectId), bcrypt-hash password via a `pre("save")` hook, generate a 6-digit OTP, bcrypt-hash it onto the user, email the plaintext.
- **Verify email** (`POST /auth/verify-email`): compare OTP hash; wrong guesses increment `otpAttempts` and lock out after `OTP_MAX_ATTEMPTS` (default 5); on success set `isEmailVerified = true`.
- **Resend OTP** (`POST /auth/resend-otp`): re-issue, guarded by a `lastOtpSentAt` cooldown (`OTP_RESEND_COOLDOWN_SECONDS`, default 60s) + rate limiter.
- **Login** (`POST /auth/login`): password check → must be verified → issue **access** + **refresh** JWTs as httpOnly cookies; store a **SHA-256-then-bcrypt hash** of the refresh token on the user. **No login-time OTP** (that step was removed).
- **Frontend**: `features/auth/AuthPage.jsx` + `OtpVerification.jsx`; session state in `app/providers/AuthProvider.jsx`.

### 4.5 Complaint dashboard (list / escalate / resolve)

- **List** (`GET /api/v1/complaint`): scoped per role by `buildComplaintScope` (see §7 / §9). Sorted newest first, with `lab`, `department`, and `history.by` populated.
- **Escalate** (`PATCH /:id/escalate`): allowed roles `labIncharge`, `hod`. Server checks: not resolved, same department (`assertDepartmentAccess`), `user.role === complaint.currentLevel`, and there **is** a next level. Moves `currentLevel` and `status` forward, pushes a `history` entry.
- **Resolve** (`PATCH /:id/resolve`): allowed roles `labIncharge`, `hod`, `deanInfra`. Server checks: not already resolved, same department, `user.role === complaint.currentLevel`. Sets `status: Resolved`, pushes history with optional `remarks` as `note`.
- **Frontend**: `features/complaints/ComplaintsDashboard.jsx` (shared by `LabInchargeHome`, `HodHome`, `DeanInfraHome`), with `Donut.jsx` stats, `ComplaintDetailModal.jsx`, `ResolveComplaintModal.jsx`. Dean Infra never sees an "Escalate" button (`canEscalate` excludes `DEAN_INFRA`) and gets an extra **Department** column.

### 4.6 PC search + health card modal

- **Search** (`GET /api/v1/pc/search`): auth + `roleCheck(LAB_INCHARGE, HOD, DEAN_INFRA)` + `deptScope`. Case-insensitive regex filters on `deadStockNo`, `config.cpu/ram/disk/os/software`, exact `warranty.status`, exact `lab` id. Department scope is merged in from `req.scope`.
- **Health card** (`POST /api/v1/pc/:id/health-card`): auth + `roleCheck(... , ADMIN)` + params validation + `deptScope`. Pure read (it's a `POST` only for historical reasons — see §10 caveats). Used by the modal's "Refresh" button.
- **Public lookup** (`GET /api/v1/pc/lookup/:deadStockNo`): no auth; returns `deadStockNo` + populated `department`/`lab` name only. Feeds the raise-complaint form's inline confirmation.
- **Frontend**: `features/laboratories/LaboratoriesPage.jsx` → `features/pc-search/PcSearchPage.jsx` + `PcHealthCardModal.jsx`.

### 4.7 Department list

- `GET /api/v1/dept` (no auth): `name` + `code`, sorted by name. Feeds the sign-up form's department dropdown.

### 4.8 Stub / not-yet-built

- `features/equipment/EquipmentPage.jsx`, `features/inventory/InventoryPage.jsx`, `features/requests/RequestsPage.jsx` — placeholder components (just a heading).
- Admin CRUD for Dept/Lab/User/Pc, dashboard aggregation endpoints, deployment automation — **not implemented**.

---

## 5. Technology Stack

### Backend

#### Node.js (runtime)
- **Where**: everything under `backend/`. `"type": "module"` → native ES modules (`import`/`export`).
- **Why**: One language (JS) across backend and frontend; huge ecosystem; non-blocking I/O suits an API that is mostly waiting on MongoDB and SMTP.
- **Without it**: You'd pick another runtime (Python/Go/Java) and lose the shared-language benefit with the React frontend.
- **Communicates**: Runs the Express app; talks to MongoDB via Mongoose and to Gmail SMTP via Nodemailer.

#### Express 5 (`express`)
- **Where**: `src/app.js` creates the app; `src/routes/*` define routers mounted at `/api/v1/<resource>`.
- **Why**: Gives a structured way to receive HTTP requests, run an ordered **middleware chain** (helmet → cors → json parser → cookie parser → logger → routers → error handler), map URLs to handlers, and send responses. Express 5 also auto-forwards rejected promises from async handlers to the error middleware (the project still wraps handlers in `asyncHandler` for safety/clarity).
- **Without it**: You'd hand-roll routing, body parsing, and middleware ordering on Node's raw `http` module.
- **Communicates**: Receives requests from the frontend/agent, calls controllers, returns JSON.

#### MongoDB + Mongoose 9 (`mongoose`)
- **Where**: `src/config/db.config.js` connects; `src/models/*` define schemas; services call model methods.
- **Why MongoDB**: The core entities (a `Pc` with an embedded `config` + `warranty`; a `Complaint` with an embedded `history[]` audit trail and `raisedBy`) are **document-shaped** — you almost always want the whole document at once, and the shape evolves. Storing `config`/`warranty`/`history` as embedded sub-documents avoids joins.
- **Why Mongoose (ODM)**: Adds schemas, types, `required`/`enum`/custom validators, `unique` indexes, `timestamps`, middleware hooks (`pre("save")` for password hashing), instance methods (`comparePassword`), and `populate()` to resolve `ObjectId` references — none of which the raw MongoDB driver gives you.
- **Without it**: You'd validate and shape every document by hand and manually manage indexes.
- **Communicates**: Services import models (`User`, `Pc`, `Complaint`, `Dept`, `Lab`) and call `.find`, `.create`, `.findOneAndUpdate`, `.populate`, etc.

#### jsonwebtoken (`jsonwebtoken`)
- **Where**: `src/utils/tokenGeneration.js` signs; `src/middlewares/auth.middleware.js` verifies; `src/services/auth.service.js` verifies refresh tokens.
- **Why**: Stateless auth — the server can trust a request by verifying a signature, without a session store lookup on every call. Access token carries `{ id, role, department }` so `roleCheck` and `deptScope` work off the token alone.
- **Without it**: You'd need server-side sessions (a session collection / Redis) and a lookup per request.
- **Tradeoff (in code today)**: `req.user` comes straight from the JWT for its whole 15-minute life — role/department changes and logout don't invalidate an already-issued **access** token (only the refresh token is revocable).

#### bcrypt (`bcrypt`)
- **Where**: `user.model.js` `pre("save")` hashes passwords; `src/utils/otp.js` hashes OTPs; `auth.service.js` hashes refresh tokens (after SHA-256, because bcrypt silently truncates input at 72 bytes and JWTs are longer).
- **Why**: Slow, salted one-way hashing so a DB leak doesn't expose passwords/OTPs.
- **Without it**: Plaintext or fast-hash secrets — catastrophic on a leak.

#### Zod (`zod`)
- **Where**: `src/validators/*.js` schemas + `src/middlewares/validate.middleware.js`.
- **Why**: Reject malformed request **shape/type** early with a consistent `400 "Validation failed"` + `[{ field, message }]` list, before any DB work. Also normalizes input (`trim`, `toLowerCase`) and **replaces `req[target]` with the parsed data**.
- **Without it**: Every service would re-check types, and bad input could reach Mongoose as confusing cast errors.

#### express-rate-limit (`express-rate-limit`)
- **Where**: `src/middlewares/rateLimiter.js` — `loginLimiter`, `otpVerifyLimiter`, `otpResendLimiter`, `complaintLimiter`, `pcSyncLimiter`.
- **Why**: Throttle brute-force / flooding on public, auth-free endpoints. Disabled under `NODE_ENV=test`.
- **Without it**: Unlimited password/OTP guessing and complaint/sync spam.
- **Limitation (in code)**: keyed by IP; no `app.set("trust proxy")`; login has no *per-account* lockout (only per-IP).

#### helmet (`helmet`)
- **Where**: `app.use(helmet())` first in `app.js`.
- **Why**: Sets safe HTTP response headers (e.g. `X-Content-Type-Options`, `X-DNS-Prefetch-Control`, HSTS, hides `X-Powered-By`).

#### cors (`cors`)
- **Where**: `app.js`, `origin: process.env.CORS_ORIGIN || "http://localhost:5173"`, `credentials: true`.
- **Why**: The browser blocks cross-origin requests by default. The SPA runs on a different origin (`:5173`) than the API (`:8000`), and needs to send cookies, so CORS must explicitly allow that one origin **and** credentials.

#### cookie-parser (`cookie-parser`)
- **Where**: `app.js`; used by `auth.middleware.js` (`req.cookies.accessToken`) and `auth.controller.js` (`req.cookies.refreshToken`).
- **Why**: Parses the `Cookie` header into `req.cookies` so the auth cookies are readable.

#### morgan (`morgan`)
- **Where**: `app.use(morgan("dev"))`.
- **Why**: One-line request logging in dev (`GET /api/v1/complaint 200 12ms`). Not a structured production logger.

#### nodemailer (`nodemailer`)
- **Where**: `src/utils/mailer.js`.
- **Why**: Sends OTP emails via Gmail SMTP. If `SMTP_HOST` is unset (local/test) it **logs the OTP to the console** instead, and always emits an in-process `otpEvents` `"otp"` event so tests can read the code without a mailbox.

#### nanoid (`nanoid`)
- **Where**: `complaint.service.js` — `nanoid(8)` for the public complaint `token`.
- **Why**: Short, URL-safe, collision-resistant random ID; friendlier than a 24-char ObjectId for a human to copy.

#### validator (`validator`)
- **Where**: `user.model.js` — `validate: (v) => validator.isEmail(v)` on `email`.
- **Why**: Schema-level email format check as a second line after Zod.

#### dotenv (`dotenv`)
- **Where**: `server.js` (`import "dotenv/config"`); test files call `dotenv.config()`.
- **Why**: Loads `backend/.env` into `process.env` so secrets/config aren't hard-coded.

#### nodemon (dev), Prettier (formatting)
- `nodemon` restarts the server on file change (`npm run dev`). Prettier (`.prettierrc`) is the formatter; there is **no ESLint** on the backend.

#### Node's built-in test runner (`node --test`)
- **Where**: `src/tests/*.test.js`; `npm test`.
- **Why**: Zero-dependency integration tests. They boot the **real** Express app in-process (`app.listen(0)`), hit it with `fetch`, and talk to the **real** `MONGO_URL` (no in-memory Mongo), cleaning up created docs in an `after()` hook. Access tokens are minted directly with `generateAccessToken` to skip the OTP/login flow.

### Frontend

#### React 19 (`react`, `react-dom`)
- **Where**: all of `frontend/src`. Function components + hooks (`useState`, `useEffect`, `useMemo`, `useContext`).
- **Why**: Declarative UI; component reuse (`ComplaintsDashboard` shared by 3 role homes; `DetailModal` shared by 3 modals).

#### Vite 8 (`vite`, `@vitejs/plugin-react`)
- **Where**: `vite.config.js`; `npm run dev` / `build` / `preview`.
- **Why**: Fast dev server with HMR; small production build. `import.meta.env.VITE_*` for build-time config.

#### React Router 7 (`react-router-dom`)
- **Where**: `app/App.jsx` (`BrowserRouter`), `app/routes.jsx` (`Routes`/`Route`), `components/common/ProtectedRoute.jsx`.
- **Why**: Client-side routing for a single-page app; role-gated routes.

#### axios (`axios`)
- **Where**: `src/services/apiClient.js` (one configured instance) + the per-feature `*Service.js` files.
- **Why over `fetch`**: interceptors. A **request** interceptor attaches `Authorization: Bearer <localStorage accessToken>` as a fallback; a **response** interceptor catches a `401`, calls `POST /auth/refresh-token` **once** (shared promise so concurrent 401s don't all refresh), and retries the original request. `withCredentials: true` sends the httpOnly cookies.

#### oxlint (`oxlint`)
- **Where**: `npm run lint`. A fast Rust-based linter; the frontend's only lint step (also run in CI).

#### No state-management library
- `src/store/` is an empty placeholder. Global state = one React context (`AuthProvider`). Everything else is local component state.

### Agent

#### Python 3, `psutil`, `requests`, `winreg` (stdlib, Windows-only)
- `psutil`: CPU count/frequency, total RAM, disk size — cross-platform.
- `winreg`: reads the Windows registry for the marketing CPU name and the installed-software list (Uninstall keys). On non-Windows it's `None` and `collect_software()` returns `[]`.
- `requests`: POSTs the JSON payload to `/api/v1/pc/sync` with a 30s timeout and `raise_for_status()`.
- `argparse`: `--dead-stock`, `--department`, `--lab`, `--dry-run` flags; otherwise prompts on stdin.

### CI

#### GitHub Actions (`.github/workflows/ci.yml`)
- On push/PR to `main`: a **backend** job (spins up a `mongo:7` service container, `npm ci`, `npm test` with `NODE_ENV=test` and CI env vars) and a **frontend** job (`npm ci`, `npm run lint`, `npm run build`). Node 22 on both.

---

## 6. Project / Folder Structure

```
labmon/
├── CLAUDE.md                 # repo guidance (architecture summary)
├── .github/workflows/ci.yml  # CI: backend tests + frontend lint/build
│
├── agent/                    # ── RUNTIME 3: Python collector ──
│   ├── collector.py          # main script: collect + POST to /pc/sync
│   ├── measure_payload.py    # helper (payload size measurement, untracked)
│   └── requirements.txt      # psutil, requests
│
├── backend/                  # ── RUNTIME 1: Express API ──
│   ├── server.js             # entry: load env → connectDB() → app.listen
│   ├── .env                  # secrets/config (PORT, MONGO_URL, JWT_*, SMTP_*)
│   ├── seed.js / seedDepartments.js   # one-off DB seeding scripts
│   ├── scripts/              # ops scripts (Atlas IP allowlist, PC updates)
│   ├── docs/                 # the authoritative backend reference docs
│   └── src/
│       ├── app.js            # build Express app: middleware + routers + error handler
│       ├── config/
│       │   ├── constants.js  # ROLES, COMPLAINT_STATUS, NEXT_LEVEL, OTP_* — single source of truth
│       │   └── db.config.js  # mongoose.connect()
│       ├── routes/           # URL → middleware chain → controller  (auth, pc, complaint, dept)
│       ├── middlewares/      # auth, roleCheck, deptScope, validate, rateLimiter, error
│       ├── controllers/      # thin HTTP layer: call a service, wrap the result in ApiResponse
│       ├── services/         # ALL business logic + all DB access
│       ├── models/           # Mongoose schemas: user, department, lab, pc, complaint
│       ├── validators/       # Zod schemas (auth, complaint, pc, common)
│       ├── utils/            # ApiError, ApiResponse, asyncHandler, tokenGeneration,
│       │                     #   otp, mailer, scope
│       └── tests/            # node --test integration tests
│
└── frontend/                 # ── RUNTIME 2: React SPA ──
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx          # ReactDOM.createRoot → <App/>
        ├── app/
        │   ├── App.jsx       # <BrowserRouter><AuthProvider><AppRoutes/>
        │   ├── routes.jsx    # all <Route>s, wrapped in <ProtectedRoute> where needed
        │   └── providers/AuthProvider.jsx   # user/setUser/loading context; rehydrate via GET /me
        ├── constants/        # roles.js, routes.js  (hand-mirrored from backend enums)
        ├── services/         # apiClient.js (axios instance) + one file per resource
        ├── hooks/useAuth.js  # useContext(AuthContext)
        ├── components/common/ # ProtectedRoute, DetailModal, OtpInput
        ├── features/         # one folder per screen area (auth, complaints, pc-search,
        │                     #   public-complaint, lab-incharge, hod, dean-infra,
        │                     #   laboratories, equipment*, inventory*, requests*)  (* = stub)
        ├── utils/formatDate.js
        └── store/            # EMPTY placeholder (no Redux/Zustand)
```

### What belongs where (backend)

| Folder | Put here | Do NOT put here |
|---|---|---|
| `routes/` | URL path + which middleware runs + which controller | Business logic, DB queries |
| `middlewares/` | Cross-cutting request gates (auth, roles, scope, validation, rate limit, error shaping) | Feature-specific logic |
| `controllers/` | Read `req`, call **one** service function, return `new ApiResponse(...)` | DB access, validation rules, escalation rules |
| `services/` | All business rules + all Mongoose calls; throw `ApiError` on failure | `req`/`res` objects (services take plain args, return plain data) |
| `models/` | Schema fields, types, validators, indexes, hooks, instance methods | HTTP concerns |
| `validators/` | Zod shape/type schemas | Semantic checks that need the DB ("already verified") — those stay in services |
| `utils/` | Small reusable helpers with no `req`/`res` | Route wiring |
| `config/` | Constants + connection setup | Anything request-scoped |

### Folder relationships

`server.js` → `app.js` → `routes/*` → (`middlewares/*`) → `controllers/*` → `services/*` → `models/*` → MongoDB. `utils/*` and `config/*` are imported wherever needed. `validators/*` are consumed only by `validate.middleware.js`.

---

## 7. System Architecture

The architecture that **actually exists**:

```
┌─────────────┐        ┌──────────────────────────────────────────────┐
│  Lab PC     │        │                 BROWSER (SPA)                │
│  agent      │        │  React 19 + React Router + AuthProvider       │
│ collector.py│        │  features/* screens → services/*Service.js    │
└──────┬──────┘        └───────────────────┬──────────────────────────┘
       │ HTTP POST                          │ axios (apiClient.js)
       │ /pc/sync                           │ withCredentials + Bearer fallback
       │                                    │ 401 → refresh once → retry
       ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       EXPRESS APP  (src/app.js)                       │
│  helmet → cors(credentials) → express.json → cookieParser → morgan   │
│                                                                      │
│   /api/v1/auth   /api/v1/pc   /api/v1/complaint   /api/v1/dept       │
│        │              │              │                 │             │
│        ▼  ROUTE LAYER (routes/*.js): path + middleware order         │
│        ▼  MIDDLEWARE: rateLimiter → validate(zod) → auth(jwt)        │
│                       → roleCheck(...roles) → deptScope(req.scope)   │
│        ▼  CONTROLLER (controllers/*.js): call service, wrap result   │
│        ▼  SERVICE (services/*.js): business rules + scope.js checks  │
│        ▼  MODEL (models/*.js): Mongoose schema                       │
│        ▼  ERROR MIDDLEWARE (error.middleware.js): ApiError → JSON    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Mongoose
                                ▼
                    ┌───────────────────────┐        ┌──────────────┐
                    │   MongoDB (Atlas)     │        │ Gmail SMTP   │
                    │ users, depts, labs,   │        │ (nodemailer) │
                    │ pcs, complaints       │        │ OTP emails   │
                    └───────────────────────┘        └──────────────┘
```

### Layer-by-layer

| Layer | What it is | Why it exists | Enters | Leaves | Why not elsewhere |
|---|---|---|---|---|---|
| **Frontend SPA** | React app in the browser | Human-facing UI; keeps the API pure JSON | User clicks/typing | HTTP requests via axios | Rendering in the API would couple UI to transport |
| **App middleware** (`app.js`) | helmet, cors, json/urlencoded, cookie-parser, morgan | Every request needs the same security headers, CORS, parsed body/cookies, logging | Raw HTTP | `req` with `body`, `cookies` populated | Per-route duplication would be error-prone |
| **Route layer** | `routes/*.js` | Declares *only* the URL and the exact middleware order per endpoint | Parsed request | Calls the next middleware/controller | Keeps wiring readable and in one place per resource |
| **Middleware (per route)** | `rateLimiter`, `validate`, `auth`, `roleCheck`, `deptScope` | Reusable gates: throttle, shape-check, identify user, check role, compute department filter | `req` | `req.user`, `req.scope`, normalized `req.body` — or a thrown `ApiError` | Putting these in controllers = copy-paste in every handler |
| **Controller** | `controllers/*.js`, wrapped in `asyncHandler` | Translate HTTP ↔ service call; nothing else | `req` | `res.status(x).json(new ApiResponse(...))` | Mixing business logic here makes it un-testable without HTTP |
| **Service** | `services/*.js` | The actual rules: escalation chain, provisioning, OTP lifecycle, scoping; all DB calls | plain args (`req.body`, `req.user`, ids) | plain data, or `throw new ApiError(status, msg)` | Controllers change with transport; rules shouldn't |
| **Model** | `models/*.js` | Schema, validation, indexes, hooks, methods | `.create` / `.find` args | Mongoose documents | Central schema = one place to change a field |
| **Error middleware** | `error.middleware.js` | One consistent error JSON shape; hides internals on unknown errors | thrown error via `next(err)` | `{ success:false, statusCode, message, errors }` | Per-handler try/catch would drift in format |

---

## 8. Database Architecture

### Technology

**MongoDB** (a document database — data is JSON-like "documents" grouped into "collections"), accessed through **Mongoose 9** (an ODM — Object-Document Mapper — that adds schemas, validation, and helpers on top of the raw driver). Connection string is `MONGO_URL` (a MongoDB Atlas cluster).

### Beginner concepts (used throughout)

| Term | Meaning in this project |
|---|---|
| **Schema** | The rules for a document's shape — `new mongoose.Schema({...})`. E.g. `userSchema` says `email` is a required, unique, lowercase, valid-email string. |
| **Model** | A constructor built from a schema: `mongoose.model("User", userSchema)`. You call `User.find(...)`, `User.create(...)`. |
| **Document** | One record — one row-equivalent — an instance of a model. |
| **Collection** | The bucket of documents. Mongoose pluralizes the model name: `User` → `users`, `Pc` → `pcs`, `Complaint` → `complaints`, `Dept` → `depts`, `Lab` → `labs`. |
| **ObjectId** | MongoDB's 24-hex-char unique id (`_id`). Also used as a **foreign-key-style reference** to another document. |
| **Reference (`ref`)** | A field of type `ObjectId` with `ref: "Dept"` means "this stores the `_id` of a `Dept` document". |
| **`populate()`** | Follow a reference and swap the id for the real document (or selected fields), e.g. `.populate("department", "name")`. |
| **Embedded / subdocument** | A nested object stored **inside** the parent document (not a separate collection). E.g. `Pc.config`, `Pc.warranty`, `Complaint.history[]`, `Complaint.raisedBy`. |
| **`timestamps: true`** | Mongoose auto-adds and maintains `createdAt` and `updatedAt`. Every schema here uses it. |
| **Index** | A lookup structure that makes queries on a field fast. `unique: true` is an index that also forbids duplicates. |
| **`select: false`** | Field is **not** returned by default; you must ask for it with `.select("+field")`. Used for OTP fields. |

### Collections and fields

#### `users` (`user.model.js`)

| Field | Type | Rules / default | Notes |
|---|---|---|---|
| `name` | String | required | |
| `email` | String | required, **unique**, lowercase, trim, `validator.isEmail` | login identity |
| `department` | ObjectId → `Dept` | default `null` | `null` for `deanInfra` / `admin` |
| `password` | String | required | bcrypt-hashed by `pre("save")` when modified |
| `role` | String | required, enum `admin \| labIncharge \| hod \| deanInfra` | drives authz |
| `refreshToken` | String | — | stores **SHA-256→bcrypt hash** of the current refresh JWT; cleared on logout |
| `isEmailVerified` | Boolean | default `false` | login is blocked until `true` |
| `otp` | String | `select:false` | bcrypt hash of the 6-digit code |
| `otpExpiry` | Date | `select:false` | now + 10 min |
| `otpPurpose` | String | `select:false`, enum `emailVerification` | |
| `otpAttempts` | Number | default `0`, `select:false` | wrong-guess counter; lockout at `OTP_MAX_ATTEMPTS` |
| `lastOtpSentAt` | Date | `select:false` | resend-cooldown anchor |
| `createdAt`,`updatedAt` | Date | auto | |

Instance method: `comparePassword(plain)` → `bcrypt.compare`. Hook: `pre("save")` hashes `password` (salt rounds 10) only if modified.

#### `depts` (`department.model.js`)

| Field | Type | Rules |
|---|---|---|
| `name` | String | required, **unique**, trim |
| `code` | String | required, trim, uppercase |
| timestamps | Date | auto |

The fixed list of departments (seeded). Users, labs, PCs, and complaints all reference a `Dept`.

#### `labs` (`lab.model.js`)

| Field | Type | Rules |
|---|---|---|
| `name` | String | required, trim |
| `department` | ObjectId → `Dept` | required |
| `incharge` | ObjectId → `User` | optional |
| timestamps | Date | auto |

Labs are **ad-hoc**: `pc.service.js#resolveOrCreateLabId` **upserts** a lab by `{ name, department }` during a PC sync, so a lab is auto-created the first time a PC in it is provisioned. (No unique index on `name` — uniqueness is only "as used" via the upsert filter.)

#### `pcs` (`pc.model.js`)

| Field | Type | Rules / default |
|---|---|---|
| `deadStockNo` | String | required, **unique** — the natural key the agent and complaints use |
| `department` | ObjectId → `Dept` | required |
| `lab` | ObjectId → `Lab` | required |
| `warranty.status` | String | enum `Active \| Expired`, default `Active` |
| `warranty.expiryDate` | Date | optional |
| `purchaseDate` | Date | optional |
| `config.cpu / ram / disk / os` | String | optional — written by the agent |
| `config.software` | [String] | optional — allow-listed installed apps |
| `config.lastSyncedAt` | Date | set on every sync |
| timestamps | Date | auto |

Indexes: `{ department: 1, lab: 1 }` (compound, for scoped listing/search) and `{ "warranty.status": 1 }` (for warranty filtering). `warranty` and `config` are **embedded** — never separate collections.

#### `complaints` (`complaint.model.js`)

| Field | Type | Rules / default |
|---|---|---|
| `token` | String | required, **unique** — `nanoid(8)`, the public tracking id |
| `pc` | ObjectId → `Pc` | required |
| `department` | ObjectId → `Dept` | required — **copied from the PC at creation** |
| `lab` | ObjectId → `Lab` | required — copied from the PC |
| `description` | String | required (Zod: 1–2000 chars) |
| `raisedBy.name` | String | required — embedded |
| `raisedBy.contact` | String | required — embedded (phone or email) |
| `status` | String | enum `Open \| Escalated_HOD \| Escalated_Dean \| Resolved`, default `Open` |
| `currentLevel` | String | enum = roles minus `admin`, default `labIncharge` |
| `history[]` | subdocs | `{ level, action, by → User, at (default now), note }` — append-only audit trail |
| timestamps | Date | auto |

### Why this design

- **Embed `config`, `warranty`, `history`, `raisedBy`**: they're always read with their parent, they don't need their own queries, and embedding avoids joins. `history` is naturally append-only and bounded (a handful of entries per complaint).
- **Reference `department` / `lab` / `pc` / `by`**: these are **shared, independently-managed** entities. A department's name can change in one place; a complaint just holds its id.
- **Denormalize `department` + `lab` onto `Complaint`** (copied from the PC at creation): complaint queries filter by department constantly (department scoping), and a PC's department rarely changes. This trades a tiny write-time copy for scope filters that don't need a `Pc` lookup/join.
- **`deadStockNo` as the natural key on `Pc`**: it's the identifier printed on the machine and known to students and the agent, so it's `unique` and used directly in lookups.

---

## 9. Database Relationships

```
                         ┌───────────┐
                         │   Dept    │  (fixed, seeded list)
                         └─────┬─────┘
        ┌──────────────┬───────┼────────────────┬───────────────┐
        │ 1..*         │ 1..*  │ 1..*           │ 1..*          │
        ▼              ▼       ▼                ▼               ▼
   ┌─────────┐    ┌─────────┐  (User.department)          ┌───────────┐
   │  User   │    │   Lab   │◀── incharge (0..1) ── User  │ Complaint │
   │ role,   │    │ name,   │                             │ token,    │
   │ dept    │    │ dept    │                             │ status,   │
   └─────────┘    └────┬────┘                             │ level,    │
                       │ 1..*                             │ history[] │
                       ▼                                  └─────┬─────┘
                  ┌─────────┐   1 ── raised about ── 1..*       │
                  │   Pc    │◀─────────────────────────────────┘
                  │ deadSt. │
                  │ config  │  (embedded)
                  │ warranty│  (embedded)
                  └─────────┘
```

**One-to-many (parent → children by reference):**
- `Dept` 1 → `*` `User` (`User.department`; `null` for `deanInfra`/`admin`)
- `Dept` 1 → `*` `Lab` (`Lab.department`, required)
- `Dept` 1 → `*` `Pc` (`Pc.department`, required)
- `Dept` 1 → `*` `Complaint` (`Complaint.department`, copied from the PC)
- `Lab` 1 → `*` `Pc` (`Pc.lab`, required)
- `Pc` 1 → `*` `Complaint` (`Complaint.pc`, required)
- `User` 1 → `*` `Complaint.history[].by` (who performed each action; `null` for the public "created" entry)

**Zero-or-one:**
- `Lab.incharge` → `User` (optional; the lab's responsible Lab Incharge)

**One-to-one / embedded (no separate collection):**
- `Pc` — `config` (1 embedded doc), `warranty` (1 embedded doc)
- `Complaint` — `raisedBy` (1 embedded doc), `history` (array of embedded docs)

**No many-to-many** relationships exist in the code.

**Why reference instead of duplicate**: departments and labs are edited/managed on their own and read by name in the UI via `populate("department"/"lab", "name")`. Duplicating the name onto every child would mean updating hundreds of documents on a rename. The **one deliberate exception** is `Complaint.department`/`lab`, denormalized from the PC for fast, join-free department scoping.

---

## 10. API Architecture

Base path: **`/api/v1`**. Every response is a JSON envelope:

- Success: `{ statusCode, data, message, success: true }` (from `ApiResponse`)
- Error: `{ success: false, statusCode, message, errors: [...] }` (from `error.middleware.js`)

### Endpoint table

| Method | Endpoint | Purpose | Auth | Request body / params | Success data | DB operation |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | Create account + send OTP | **none** | `{ name, email, password, role, department? (name) }` | user (no password) | `User.findOne`, `Dept.findOne`, `User.create`, save OTP |
| POST | `/auth/verify-email` | Verify email via OTP | none (rate-limited, Zod) | `{ email, otp (6 digits) }` | user | `User.findOne(+otp...)`, `user.save` |
| POST | `/auth/resend-otp` | Re-send OTP | none (rate-limited, cooldown, Zod) | `{ email, purpose }` | `{ email }` | `User.findOne`, `user.save` |
| POST | `/auth/login` | Password login → set cookies | none (rate-limited, Zod) | `{ email, password }` | `{ user }` (+ `accessToken`/`refreshToken` cookies) | `User.findOne`, `comparePassword`, `user.save` (store RT hash), `populate` |
| POST | `/auth/refresh-token` | Rotate both tokens | refresh cookie | — | `{}` (+ new cookies) | `jwt.verify`, `User.findById`, compare RT hash, `user.save` |
| POST | `/auth/logout` | Clear session | **access** (cookie/Bearer) | — | `{}` (cookies cleared) | `User.findById`, unset `refreshToken` |
| GET | `/auth/me` | Rehydrate session on load | access | — | `{ user }` (dept populated) | `User.findById().populate` |
| POST | `/pc/sync` | Agent pushes PC config | **none** (rate-limited, Zod) | `{ deadStockNo, department?, lab?, config? }` | pc | `Pc.findOne`, `Pc.findOneAndUpdate` or `Pc.create`; `Dept.findOne`, `Lab.findOneAndUpdate` (upsert) |
| GET | `/pc/lookup/:deadStockNo` | Public PC existence + dept/lab | **none** | param `deadStockNo` | pc (deadStockNo + dept/lab names) | `Pc.findOne().select().populate` |
| GET | `/pc/search` | Filtered PC search | access + `roleCheck(LI,HOD,DEAN)` + `deptScope` | query: `deadStockNo,cpu,ram,disk,os,software,warrantyStatus,lab` | pc[] | `Pc.find(filter).populate` |
| POST | `/pc/:id/health-card` | Full health card (read) | access + `roleCheck(LI,HOD,DEAN,ADMIN)` + params Zod + `deptScope` | param `id` (ObjectId) | pc (dept+lab populated) | `Pc.findOne({_id, ...scope}).populate` |
| POST | `/complaint` | Raise a complaint | **none** (rate-limited, Zod) | `{ deadStockNo, description, raisedBy:{name,contact} }` | complaint (incl. `token`) | `Pc.findOne`, `Complaint.create` |
| PATCH | `/complaint/:id/escalate` | Move up one level | access + `roleCheck(LI,HOD)` + params Zod | param `id` | complaint (populated) | `Complaint.findById`, `complaint.save`, `populate` |
| PATCH | `/complaint/:id/resolve` | Mark resolved | access + `roleCheck(LI,HOD,DEAN)` + params Zod + body Zod | param `id`, `{ remarks? }` | complaint (populated) | `Complaint.findById`, `complaint.save`, `populate` |
| GET | `/complaint/track/:token` | Public status by token | **none** | param `token` | complaint (5 fields only) | `Complaint.findOne({token}).select` |
| GET | `/complaint` | Role-scoped complaint list | access | — | complaint[] | `Complaint.find(scope).sort().populate×3` |
| GET | `/dept` | Department dropdown data | **none** | — | dept[] (`name`,`code`) | `Dept.find().select().sort` |

### Lifecycle example — `POST /api/v1/complaint`

- **What POST means**: "create a new resource on the server." Used here because a complaint is created (not read/replaced).
- **Frontend sends**: `RaiseComplaintPage.jsx` → `complaintService.raiseComplaint(payload)` → `apiClient.post('/complaint', { deadStockNo, description, raisedBy:{name,contact} })`.
- **Express receives**: `express.json()` parses the body; router `complaint.route.js` matches `POST /`.
- **Middleware runs**: `complaintLimiter` (max 20/hour/IP, skipped in tests) → `validate(raiseComplaintSchema)` (Zod: non-empty trimmed `deadStockNo`, `description` 1–2000, `raisedBy.name`/`contact` non-empty; replaces `req.body` with parsed data).
- **Controller**: `complaint.controller.js#raiseComplaint` (in `asyncHandler`) calls `createComplaint(req.body)`.
- **Service**: `complaint.service.js#createComplaint` — `Pc.findOne({ deadStockNo })`; if missing → `throw new ApiError(404, "PC not found")`. Else `nanoid(8)` token, `Complaint.create({ token, pc, department: pc.department, lab: pc.lab, description, raisedBy, status: Open, currentLevel: labIncharge, history:[{level:labIncharge, action:"created", by:null}] })`.
- **DB**: one read (`pcs`), one insert (`complaints`).
- **Response**: `201` + `new ApiResponse(201, complaint, "Complaint raised successfully")`.
- **On failure**: any `ApiError` → `error.middleware.js` → `{ success:false, statusCode, message, errors }`. Unknown errors → `500 "Internal Server Error"` (logged server-side).
- **Frontend**: reads `res.data.data.token`, shows it as the tracking token.

---

## 11. API Design Principles

**Followed:**
- **REST-ish resource URLs** under a version prefix (`/api/v1/...`): `auth`, `pc`, `complaint`, `dept`.
- **HTTP methods carry intent**: `GET` reads, `POST` creates, `PATCH` partial state change (escalate/resolve).
- **Status codes**: `200` ok, `201` created, `400` validation/bad state, `401` unauthenticated, `403` wrong role/department/level, `404` not found, `409` duplicate email, `429` rate-limited / OTP lockout, `500` unknown.
- **Consistent envelope** for success and error.
- **Route params** for identity (`/:id`, `/:token`, `/:deadStockNo`); **query params** for search filters (`/pc/search?cpu=i5`).
- **Auth via cookie or `Authorization: Bearer`** header (both accepted).
- **Validation at the edge** (Zod) + **semantic checks** in services.
- **Least-exposure reads**: `/complaint/track/:token` and `/pc/lookup` `.select(...)` only safe fields.

**Questionable / inconsistent (confirmed in code):**
- **`POST /pc/:id/health-card` for a pure read** — should be `GET`. The frontend deliberately calls it as `POST` to match; noted as intentional-for-now in `pcService.js`.
- **No pagination / sorting controls** on `GET /complaint` or `/pc/search` — they return the full scoped set (only `sort({createdAt:-1})` server-side).
- **No filtering params** on `GET /complaint` (the dashboard filters client-side).
- **`/auth/register` has no rate limiter and no access control** (see §16) while every other auth route has both.
- **`/auth/refresh-token` has no rate limiter** unlike its siblings.
- **Version is in the path only** (`/api/v1`) — fine, but there's just one version and no deprecation story.

---

## 12. Authentication & Authorization

### What is authentication?
Proving **who** you are. Here: presenting a valid, unexpired **access token** (signed JWT) that the server issued after a correct password + verified email.

### What is authorization?
Deciding **what** an authenticated user may do. Here: two checks — **role** (`roleCheck(...roles)`) and **department/level scope** (`deptScope` middleware + `scope.js` helpers in services).

### What is a JWT? (from zero)
A JSON Web Token is three base64url parts joined by dots: **header** (algorithm), **payload** (claims — here `{ id, role, department }` for the access token, `{ userId }` for the refresh token, plus `iat`/`exp`), and **signature** (HMAC of header+payload using a server secret). Anyone can *read* the payload; only the server can *forge* a valid signature. So the server trusts a token purely by re-computing the signature with its secret (`JWT_ACCESS_TOKEN` / `JWT_REFRESH_TOKEN`) — no DB lookup needed to authenticate.

- **Access token**: short-lived (`JWT_ACCESS_EXPIRY`, `.env` = `15m`). Sent on every request. Carries the authz claims.
- **Refresh token**: long-lived (`JWT_REFRESH_EXPIRY` = `7d`). Only used against `/auth/refresh-token`. A **SHA-256→bcrypt hash** of it is stored on `User.refreshToken` so it can be **revoked** (logout) and **rotated** (each refresh issues a brand-new pair and overwrites the stored hash).

### The actual login flow

```
AuthPage.jsx  ──POST /auth/login { email, password }──▶  loginLimiter → validate(loginSchema)
                                                          │
                                                   loginUser(email,password)  [auth.service.js]
                                                     User.findOne({email})            → 401 if none
                                                     user.comparePassword(password)   → 401 if wrong
                                                     user.isEmailVerified?            → 403 if false
                                                     accessToken  = generateAccessToken(user)   {id,role,department}
                                                     refreshToken = generateRefreshToken(user)  {userId}
                                                     user.refreshToken = bcrypt(sha256(refreshToken))
                                                     user.save(); user.populate("department","name")
                                                          │
   auth.controller.js#login:  res.cookie("accessToken", ...httpOnly, sameSite:strict, maxAge=parseExpiryToMs(JWT_ACCESS_EXPIRY))
                              res.cookie("refreshToken", ...same options, maxAge=7d)
                              .json(ApiResponse(200, { user }, "Login successful"))
                                                          │
   AuthPage.jsx:  setUser(res.data.data.user); navigate(HOME_ROUTE_BY_ROLE[user.role])
```

Cookie options (`auth.controller.js`): `httpOnly: true` (JS can't read them → XSS can't steal the token), `secure: NODE_ENV==="production"` (HTTPS-only in prod), `sameSite: "strict"` (not sent on cross-site requests → CSRF mitigation), `maxAge` derived from the JWT expiry string via `parseExpiryToMs`.

### Protected-request flow

```
apiClient request → cookies auto-sent (withCredentials); + "Authorization: Bearer <localStorage.accessToken>" if present
        ▼
auth.middleware.js#auth:  token = Bearer header ?? req.cookies.accessToken
                          no token           → 401 "Authentication required"
                          jwt.verify(token, JWT_ACCESS_TOKEN)  → 401 "Invalid or expired token" on failure
                          req.user = decoded  ({ id, role, department, iat, exp })
        ▼
roleCheck(...allowed):  allowed.includes(req.user.role) ? next() : 403
        ▼
deptScope:  req.scope = buildDepartmentScope(req.user)   // {} for admin/deanInfra, else { department: user.department }
        ▼
controller → service (service may also call assertDepartmentAccess / buildComplaintScope)
```

### Refresh-on-401 (frontend, `apiClient.js`)
On a `401` that isn't from an auth endpoint and hasn't already been retried: call `POST /auth/refresh-token` **once** (a module-level shared promise dedupes concurrent 401s), then replay the original request. If refresh fails, reject so the caller can bounce to `/login`.

### Session rehydration (`AuthProvider.jsx`)
On app mount, call `GET /auth/me`. If the access cookie is still valid, the user object comes back and `setUser` restores the in-memory session after a hard refresh. `ProtectedRoute` renders `null` while `loading`, redirects to `/login` if `!user`, and redirects if `user.role` isn't in `allowedRoles`.

### Authorization rules, precisely (`src/utils/scope.js`)

- `isDeptUnscoped(user)` = role is `admin` **or** `deanInfra`.
- `buildDepartmentScope`: `{}` (see all) if unscoped, else `{ department: user.department }`.
- `assertDepartmentAccess(user, dept, msg)`: throws `403` unless unscoped or `dept === user.department`. Used by escalate/resolve.
- `buildComplaintScope(user)` for `GET /complaint`:
  - `admin` → `{}` (everything)
  - `deanInfra` → `{ currentLevel: "deanInfra" }` (only complaints sitting at their level, **all departments**)
  - `hod` → `{ department: user.department, currentLevel: "hod" }`
  - `labIncharge` → `{ department: user.department }` (their department's whole queue)
- Escalate/resolve additionally require `user.role === complaint.currentLevel` (only the level currently holding the complaint can act).

### Security notes on the auth design (from code + `backend/docs/known-issues.md`)
- **Access tokens are not revoked on logout** — only the refresh token is. A stolen access token works until it expires (~15 min).
- **`req.user` is never re-checked against the DB mid-session** — a role/department change has no effect until the token expires.
- **Login brute-force protection is per-IP only** (no per-account lockout, unlike OTP verify).
- **No `trust proxy`** set — IP-keyed limiters misbehave behind a proxy.

---

## 13. Middleware

> **Analogy**: middleware is a line of checkpoints between the building entrance (the request arriving) and the office you want to reach (the controller). Each checkpoint can wave you through (`next()`), stamp your badge (`req.user = ...`), or turn you away (`throw new ApiError`).

### App-level (run for every request, in `app.js` order)
1. **`helmet()`** — sets protective response headers.
2. **`cors({ origin, credentials:true })`** — allows the one SPA origin to call the API with cookies; blocks all others.
3. **`express.json({limit:"10mb"})` / `express.urlencoded`** — parse the request body into `req.body`.
4. **`cookieParser()`** — parse `Cookie` header into `req.cookies`.
5. **`morgan("dev")`** — log the request line.
6. *(routers)*
7. **`errorHandler`** — last; converts thrown errors to the standard JSON error shape.

### Route-level (per endpoint)

| Middleware | File | Does | On failure | Used by |
|---|---|---|---|---|
| **rate limiters** | `rateLimiter.js` | Count requests per IP per window; block over the cap. Skipped when `NODE_ENV=test`. | `429` `{success:false,...}` | login, verify-email, resend-otp, complaint create, pc sync |
| **`validate(schema, target)`** | `validate.middleware.js` | `schema.safeParse(req[target])`; on success overwrite `req[target]` with parsed/normalized data | `400 "Validation failed"` + `[{field,message}]` | login, verify-email, resend-otp, pc sync, `:id` params, complaint create/resolve |
| **`auth`** | `auth.middleware.js` | Read Bearer/cookie token, `jwt.verify`, set `req.user = decoded` | `401` (missing or invalid/expired) | logout, me, pc search, health-card, complaint escalate/resolve/list |
| **`roleCheck(...roles)`** | `roleCheck.middleware.js` | Allow only if `req.user.role` is in the list | `403 "You do not have permission..."` | pc search, health-card, complaint escalate/resolve |
| **`deptScope`** | `deptScope.middleware.js` | `req.scope = buildDepartmentScope(req.user)` (a Mongo filter fragment) | — (never throws) | pc search, health-card |

### The error middleware (`error.middleware.js`)
Signature `(err, req, res, next)` — Express treats a 4-arg function as an error handler. If `err instanceof ApiError` → respond with its `statusCode`, `message`, `errors`. Otherwise `console.error(err)` and return a generic `500` (so stack traces/internal messages never leak to clients).

---

## 14. Request Lifecycle (worked examples)

### A. Agent syncs a PC — `POST /api/v1/pc/sync`

```
collector.py: build_payload() → requests.post(SYNC_ENDPOINT, json=payload, timeout=30)
      ▼
express.json parses body
      ▼
pc.route.js  POST /sync
      ├─ pcSyncLimiter            (≤30/min/IP; skipped in tests)
      └─ validate(syncPcSchema)   (deadStockNo required; department/lab optional strings; config = record)
      ▼
pc.controller.js#syncPc → syncPcConfig(req.body)
      ▼
pc.service.js#syncPcConfig
      ├─ build configSet: { "config.cpu": ..., "config.ram": ..., ..., "config.lastSyncedAt": now }
      ├─ Pc.findOne({ deadStockNo })
      │     exists → (optionally resolveDepartmentId / resolveOrCreateLabId) → Pc.findOneAndUpdate($set configSet)
      │     none   → require department + lab → resolveDepartmentId → resolveOrCreateLabId → Pc.create({...})
      ▼
controller: res.status(200).json(new ApiResponse(200, pc, "PC config updated"))
      ▼
collector.py: response.raise_for_status(); print("Sync successful:", result)
```
Failure modes: Zod `400`; unknown `deadStockNo` with no `department` → `404 "PC not found. Check dead stock number."`; provisioning without `lab` → `400`; unknown department name → `404`; over the rate limit → `429`.

### B. Staff escalates a complaint — `PATCH /api/v1/complaint/:id/escalate`

```
ComplaintsDashboard.jsx: handleEscalate(id) → complaintService.escalateComplaint(id)
      → apiClient.patch(`/complaint/${id}/escalate`)  (cookies + Bearer fallback sent)
      ▼
complaint.route.js  PATCH /:id/escalate
      ├─ auth                         (req.user = { id, role, department })
      ├─ roleCheck(LAB_INCHARGE, HOD) (deanInfra rejected here → 403)
      └─ validate(objectIdParamSchema, "params")   (24-hex id or 400)
      ▼
complaint.controller.js#escalateComplaint → escalateComplaintService(req.params.id, req.user)
      ▼
complaint.service.js#escalateComplaint
      ├─ Complaint.findById(id)                       → 404 if none
      ├─ status === Resolved                          → 400
      ├─ assertDepartmentAccess(user, complaint.department)   → 403 if other department (non-unscoped)
      ├─ user.role === complaint.currentLevel         → 403 otherwise
      ├─ nextLevel = NEXT_LEVEL[currentLevel]         → 400 if none (deanInfra: top of chain)
      ├─ currentLevel = nextLevel; status = STATUS_FOR_LEVEL[nextLevel]
      ├─ history.push({ level: nextLevel, action:"escalated", by: user.id, at: now })
      └─ complaint.save(); complaint.populate([lab.name, department.name, history.by.name])
      ▼
controller: res.status(200).json(new ApiResponse(200, complaint, "Complaint escalated successfully"))
      ▼
dashboard: replaceComplaint(res.data.data)  → row re-renders with new status/level
```

### C. Hard refresh on a protected page — session rehydration

```
main.jsx → App.jsx: <BrowserRouter><AuthProvider><AppRoutes/>
      ▼
AuthProvider mount → getCurrentUser() → GET /auth/me   (accessToken cookie sent)
      ├─ cookie valid   → auth middleware sets req.user → getCurrentUser(id) → User.findById().populate("department","name")
      │                    → 200 { user } → setUser(user); loading=false
      └─ cookie expired → 401 → apiClient response interceptor → POST /auth/refresh-token
             ├─ refresh cookie valid → new cookies → retry GET /auth/me → 200 → setUser
             └─ refresh invalid      → reject → catch → setUser(null); loading=false
      ▼
ProtectedRoute: loading ? null : !user ? <Navigate to="/login"> : role allowed ? children : <Navigate to="/login">
```

### D. Login (see the diagram in §12).

### E. Public complaint (see §10 lifecycle example).

---

## 15. Important User Workflows

### Workflow 1 — Report a broken PC (public)
```
USER opens "/" (RaiseComplaintPage)
  ▼ types dead stock no., tabs out
FRONTEND  GET /pc/lookup/DS-1023  →  shows "✓ PC found — Department: … · Lab: …"
  ▼ fills description, name, contact → Submit
API  POST /complaint  → complaintLimiter → Zod → createComplaint
DB   Pc.findOne(deadStockNo);  Complaint.create(status=Open, level=labIncharge, history=[created])
RESPONSE  201 { token: "aB3xQ9kL", ... }
UI   shows the token: "Save this token to track your complaint"
```

### Workflow 2 — Track a complaint (public)
```
USER opens "/track-complaint", enters token → Check Status
API  GET /complaint/track/aB3xQ9kL  → Complaint.findOne({token}).select("token status currentLevel description createdAt")
UI   shows Status ("Escalated to HOD"), Current Level ("HOD"), Description, Raised On
```

### Workflow 3 — Staff onboarding
```
USER (staff) Sign Up tab → name/email/password/role/department → Sign Up
API  POST /auth/register → User.create → issueOtp → email 6-digit code (or console log in dev)
UI   switches to OTP step (OtpVerification.jsx, auto-submits at 6 digits)
API  POST /auth/verify-email → compareOtp → isEmailVerified=true
UI   "Email verified. You can now sign in." → Login tab
API  POST /auth/login → cookies set → setUser → navigate to role home
```

### Workflow 4 — Triage a complaint (Lab Incharge)
```
USER logs in → /lab-incharge (ComplaintsDashboard, role=labIncharge)
API  GET /complaint → buildComplaintScope → { department: <mine> } → list (newest first)
UI   stat cards (Total/Open/Escalated/Resolved) + Donut charts + table
USER clicks a row → ComplaintDetailModal → "Escalate" or "Resolve"
API  PATCH /complaint/:id/escalate   (→ HOD / Escalated_HOD)
     or PATCH /complaint/:id/resolve { remarks }  (→ Resolved, remark stored in history.note)
UI   row updates in place (replaceComplaint)
```

### Workflow 5 — Find PCs / view a health card
```
USER (any staff role) → /laboratories → PcSearchPage
API  GET /pc/search  (auth + roleCheck + deptScope; initial call with no filters)
USER types "i5" in CPU, "16" in RAM, picks Warranty = Expired → Search
API  GET /pc/search?cpu=i5&ram=16&warrantyStatus=Expired → regex filters + scope
USER clicks a PC row → PcHealthCardModal → "Refresh"
API  POST /pc/:id/health-card → full card (dept/lab populated); modal + table row updated
```

### Workflow 6 — Escalation chain end to end
```
Open ──labIncharge escalate──▶ Escalated_HOD ──hod escalate──▶ Escalated_Dean ──deanInfra resolve──▶ Resolved
  └────────── any current-level incharge may resolve at any step (labIncharge/hod/deanInfra) ─────────┘
```

---

## 16. Error Handling

### Where errors originate
- **Validation** (`validate` middleware): `throw new ApiError(400, "Validation failed", [{field,message}])`.
- **Auth** (`auth` middleware): `throw new ApiError(401, ...)`.
- **Role** (`roleCheck`): `throw new ApiError(403, ...)`.
- **Services**: business-rule failures — `throw new ApiError(404 | 400 | 403 | 409 | 429, "message")`.
- **Mongoose**: schema/cast errors bubble up as generic `Error`.

### How an error travels
```
service throws ApiError
  ▼
controller is wrapped in asyncHandler → Promise.resolve(handler()).catch(next)   // forwards to Express
  ▼
error.middleware.js (registered last in app.js)
  ├─ err instanceof ApiError → res.status(err.statusCode).json({ success:false, statusCode, message, errors })
  └─ else                    → console.error(err); res.status(500).json({ ..., message:"Internal Server Error" })
```
`asyncHandler` (`utils/asyncHandler.js`) removes the need for `try/catch` in every controller. Express 5 also natively forwards async rejections, but the wrapper is kept for explicitness.

### Frontend error handling
- axios rejects on non-2xx; components read `err.response?.data?.message` and show it (`setError`, `setLoadError`, `setActionError`, `setResolveError`, `pcCheckError`).
- A `401` triggers the one-shot refresh-and-retry (`apiClient.js`); if that fails the promise rejects and the UI can redirect.
- `logout` deliberately swallows network errors — local session is cleared regardless.

### One real error flow
`labIncharge` in Dept A opens a complaint from Dept B and clicks Escalate → `PATCH /complaint/:id/escalate` → `auth` ok → `roleCheck(LI,HOD)` ok → service: `assertDepartmentAccess(user, complaint.department)` → `String(deptB) !== String(deptA)` and not unscoped → `throw new ApiError(403, "You are not authorized to escalate complaints outside your department")` → error middleware → `403 { success:false, message:"You are not authorized..." }` → dashboard sets `actionError` → red banner above the table.

---

## 17. Validation

Validation exists at **three layers** on purpose — each catches what the others structurally can't.

### Frontend (browser) — UX only, never trusted
- HTML `required`, `type="email"`, `rows`, `min`, `<select>` option lists.
- `AuthPage.jsx`: "Passwords do not match" before calling `register`.
- `OtpVerification.jsx`: auto-submits only at exactly 6 digits; resend disabled during a 30s cooldown.
- Purpose: instant feedback, fewer pointless requests. A user can bypass all of it with devtools/curl.

### Backend (Zod) — shape & type at the edge (`src/validators/`)
| Schema | Rules |
|---|---|
| `loginSchema` | `email` trimmed/lowercased/valid; `password` ≥ 1 |
| `verifyEmailSchema` | `email` valid; `otp` matches `/^\d{6}$/` |
| `resendOtpSchema` | `email` valid; `purpose` non-empty string (deliberately **not** an enum — the service throws its own "Invalid OTP purpose" so its message survives) |
| `raiseComplaintSchema` | `deadStockNo` non-empty; `description` 1–2000; `raisedBy.name`/`contact` non-empty |
| `resolveComplaintSchema` | `remarks` optional string ≤ 2000 |
| `syncPcSchema` | `deadStockNo` non-empty; `department`/`lab` optional non-empty strings; `config` optional `record(string, any)` |
| `objectIdParamSchema` | `id` matches `/^[0-9a-fA-F]{24}$/` |
- `validate` also **normalizes** (`req[target] = result.data` — trimmed/lowercased values flow onward).
- Semantic checks that need the DB stay in services: "User already exists" (`409`), "Email is already verified" (`400`), "OTP has expired" (`400`), "Invalid warrantyStatus" (`400`), "Invalid lab id" (`400`), escalation-level checks, etc.

### Database (Mongoose schema) — last line, structural integrity
- `required`, `enum` (`role`, `warranty.status`, `status`, `currentLevel`, `otpPurpose`), `unique` (`email`, `deadStockNo`, `complaint.token`, `dept.name`), `lowercase`/`trim`/`uppercase`, custom `validator.isEmail`.
- Guarantees hold even for writes from seed scripts or the agent that never pass through Zod.

### Why multiple layers
Frontend can be bypassed; Zod guards the HTTP boundary and gives friendly messages but doesn't know the DB; the schema enforces invariants for **every** write path (tests, seeds, agent, future admin tools).

---

## 18. Security

### IMPLEMENTED (verified in code)
- **Password hashing**: bcrypt (salt rounds 10) via `user.model.js` `pre("save")`; `comparePassword` uses `bcrypt.compare`. Passwords stripped from responses (`user.password = undefined`).
- **OTP hardening**: `crypto.randomInt` (CSPRNG) for the code; bcrypt-hashed at rest; 10-min expiry; `otpAttempts` lockout after `OTP_MAX_ATTEMPTS` (default 5); resend cooldown `OTP_RESEND_COOLDOWN_SECONDS` (default 60s) via `lastOtpSentAt`. Lockout/cooldown skipped under `NODE_ENV=test`.
- **JWT**: separate secrets for access/refresh; short access TTL (`15m`); refresh-token **rotation** on every `/refresh-token`; refresh token stored only as `SHA-256 → bcrypt` hash (SHA-256 first because bcrypt truncates at 72 bytes); logout unsets it.
- **Cookies**: `httpOnly` (blocks XSS token theft), `sameSite:"strict"` (CSRF mitigation), `secure` in production, `maxAge` derived from the configured expiry.
- **CORS**: single allowed origin from `CORS_ORIGIN`, `credentials:true`.
- **Helmet**: security response headers on every response.
- **Rate limiting**: login, verify-email, resend-otp, complaint create, pc sync.
- **Input validation**: Zod at the edge + schema enums/uniqueness.
- **NoSQL-injection resistance**: Zod forces `deadStockNo`/`email`/etc. to be **strings**, so `{ $ne: ... }`-style object payloads are rejected before reaching Mongoose; `searchPcs` builds `$regex` filters from `escapeRegex(String(value))` (regex metacharacters neutralized).
- **Authorization**: `roleCheck` + centralized department/level scoping (`scope.js`); `assertDepartmentAccess` on mutations; `getPcHealthCard` queries `{ _id, ...scope }` so an out-of-scope id returns `404`.
- **Least data exposure**: public track/lookup endpoints `.select(...)` minimal fields; OTP fields are `select:false`.
- **Secrets in env**: `.env` (git-ignored per `backend/.gitignore`), loaded via dotenv.
- **Body size cap**: `express.json({ limit: "10mb" })`.

### NOT IMPLEMENTED (confirmed gaps — `backend/docs/known-issues.md`)
- **`POST /pc/sync` has no device authentication** — anyone who can reach the server and knows/guesses a `deadStockNo` can overwrite a PC's config, or provision a brand-new PC by supplying an unused `deadStockNo` + real `department`/`lab` names. Rate-limited + Zod-validated, but that's not auth.
- **`POST /register` has no access control** — anyone can self-register as **`admin`**. Deliberately excluded from the hardening pass.
- **Access-token revocation on logout** — logout only clears the refresh token; the access token stays valid until it expires (~15 min).
- **Mid-session claim re-check** — `req.user` is the raw JWT payload; role/department edits or a future deactivation have no effect until expiry.
- **Per-account login lockout** — `loginLimiter` is per-IP only; distributed guessing across IPs isn't capped per account.
- **`trust proxy`** not configured — IP-keyed limiters are unreliable behind a proxy/load balancer.
- **`/auth/refresh-token` rate limiter** — missing (its siblings all have one).
- **`.env` currently contains real-looking secrets committed to the working tree** (`backend/.env` is present with a live MongoDB URI and SMTP app password). `.gitignore` should keep it out of git, but these values should be rotated and never shared. *(Observation from the file contents; this report does not reproduce them.)*
- **CSRF**: mitigated by `sameSite:strict` + the `Authorization` header path, but there's no explicit CSRF token; the public `POST` endpoints (`/complaint`, `/pc/sync`) are intentionally cookie-free so CSRF doesn't apply to them.
- **XSS**: React escapes rendered values by default and there's no `dangerouslySetInnerHTML` in the codebase; no server-side output sanitization is done (not needed for a JSON API).

### RECOMMENDED IMPROVEMENTS
1. Add an **agent device key / HMAC** to `/pc/sync` (per-PC secret or signed request).
2. Gate `/register` behind `auth + roleCheck(ADMIN)` (and seed the first admin).
3. Shorten access TTL further and/or add a **token version** claim checked against the DB; add a logout/blacklist for access tokens (or accept the 15-min window explicitly).
4. Add a **per-account failed-login counter** mirroring `otpAttempts`.
5. Set `app.set("trust proxy", 1)` (or the correct hop count) before deployment; add a limiter to `/refresh-token`.
6. Move `.env` secrets to a secret manager; rotate the committed MongoDB and SMTP credentials.
7. Add pagination to list endpoints to bound response size / query cost.

---

## 19. External Services

| Service | Why | Data sent | Data back | Called from | On failure | Key storage | Required? |
|---|---|---|---|---|---|---|---|
| **MongoDB Atlas** | Primary datastore | All queries/writes (users, depts, labs, pcs, complaints) | Documents | `src/config/db.config.js` + every service via Mongoose | `connectDB` `process.exit(1)` on startup failure; a mid-run failure surfaces as a `500` | `MONGO_URL` in `.env` (contains inline credentials) | **Yes** — nothing works without it |
| **Gmail SMTP** (via Nodemailer) | Deliver OTP emails for email verification | `to` address, subject, plaintext body containing the 6-digit OTP | SMTP send result | `src/utils/mailer.js#sendOtpEmail` (called by `issueOtp`) | If `SMTP_HOST` unset → logs the OTP to console and returns (no throw). If configured and `sendMail` throws → the error propagates and register/resend returns `500` | `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM` in `.env` | Only for the real register/verify flow; dev/test run without it |
| **GitHub Actions** | CI (tests, lint, build) on push/PR to `main` | Repo checkout | Pass/fail | `.github/workflows/ci.yml` | Red check on the PR | GitHub-managed; CI uses dummy `JWT_*` secrets inline in the workflow | No (dev-time only) |

The **agent** (`collector.py`) is not an external service to the backend — it's a first-party client that calls `POST /api/v1/pc/sync`. No payment, storage, caching (Redis), or third-party auth providers are used.

---

## 20. Environment Variables

> Values are **not** reproduced here. `backend/.env` is git-ignored (`backend/.gitignore`). Names and `parseExpiryToMs` format (`^\d+(s|m|h|d)$`) are from the code.

### Backend

| Variable | Purpose | Used where | Sensitive? |
|---|---|---|---|
| `PORT` | HTTP port to listen on | `server.js` | No |
| `MONGO_URL` | MongoDB connection string (with credentials) | `db.config.js`, test files | **Yes** |
| `CORS_ORIGIN` | Allowed browser origin (defaults to `http://localhost:5173`) | `app.js` | No |
| `JWT_ACCESS_TOKEN` | Secret for signing/verifying access tokens | `tokenGeneration.js`, `auth.middleware.js` | **Yes** |
| `JWT_ACCESS_EXPIRY` | Access token lifetime, e.g. `15m` | `tokenGeneration.js`, `auth.controller.js` (`parseExpiryToMs` → cookie `maxAge`) | No |
| `JWT_REFRESH_TOKEN` | Secret for signing/verifying refresh tokens | `tokenGeneration.js`, `auth.service.js` | **Yes** |
| `JWT_REFRESH_EXPIRY` | Refresh token lifetime, e.g. `7d` | same as above | No |
| `NODE_ENV` | `production` → `secure` cookies; `test` → disables rate limiters + OTP lockout/cooldown | `auth.controller.js`, `rateLimiter.js`, `auth.service.js`, `otp` | No |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | SMTP transport; if `SMTP_HOST` unset, mailer logs instead of sending | `mailer.js` | Host/port: low; overall: **Yes** |
| `SMTP_USER` / `SMTP_PASS` | SMTP auth (Gmail app password) | `mailer.js` | **Yes** |
| `MAIL_FROM` | `From:` header for OTP emails | `mailer.js` | No |
| `OTP_MAX_ATTEMPTS` | Wrong-OTP lockout threshold (default 5) | `config/constants.js` | No |
| `OTP_RESEND_COOLDOWN_SECONDS` | Min seconds between OTP resends (default 60) | `config/constants.js`, `auth.service.js` | No |
| `OTP_EXPIRY_MINUTES` | Referenced in `mailer.js` email text (default 10); expiry itself is the constant `OTP_EXPIRY_MINUTES = 10` | `mailer.js` | No |
| `RATE_LIMIT_*_WINDOW_MS` / `RATE_LIMIT_*_MAX` | Per-limiter overrides (login, otp-verify, otp-resend, complaint, pc-sync) | `rateLimiter.js` | No |

### Frontend (Vite — `import.meta.env`, baked in at build time)

| Variable | Purpose | Used where | Sensitive? |
|---|---|---|---|
| `VITE_API_BASE_URL` | API base (defaults to `http://localhost:8000/api/v1`) | `services/apiClient.js` | No (public by design) |

### Agent (`os.environ`)

| Variable | Purpose | Used where | Sensitive? |
|---|---|---|---|
| `LABMON_BACKEND_URL` | Backend base URL (defaults to `http://localhost:8000`) | `collector.py` | No |
| `LABMON_SOFTWARE_ALLOWLIST` | Comma-separated name substrings to report, or `all`/`*` for everything | `collector.py#_software_allowlist` | No |

**Why env vars**: secrets never touch source control; the same build runs against dev/CI/prod by changing values; `NODE_ENV` toggles safe-in-test vs strict-in-prod behavior.

---

## 21. Important Code Components

### `backend/src/app.js`
- **Responsibility**: assemble the Express app (middleware order + routers + error handler). No `listen` (that's `server.js`), which keeps it importable by tests.
- **Called by**: `server.js`, every test file.

### `backend/src/config/constants.js`
- **Responsibility**: single source of truth for `ROLES`, `COMPLAINT_STATUS`, the `NEXT_LEVEL` escalation lookup, `STATUS_FOR_LEVEL`, and OTP tunables.
- **Why**: change a role/status string once; models, services, middleware, and scope logic all import from here. The frontend hand-mirrors it in `constants/roles.js`.

### `backend/src/utils/scope.js`
- **Responsibility**: the one implementation of "admin/deanInfra unscoped, everyone else department-locked", plus `buildComplaintScope`'s per-level rules.
- **Functions**: `buildDepartmentScope(user)` (→ Mongo filter), `assertDepartmentAccess(user, dept, msg)` (→ throws 403), `buildComplaintScope(user)`.
- **Called by**: `deptScope` middleware, `complaint.service.js` (escalate/resolve/list). Previously three divergent copies — unified in a hardening pass.

### `backend/src/services/auth.service.js`
- **Responsibility**: the entire account lifecycle — `registerUser`, `verifyEmailOtp`, `resendOtp`, `loginUser`, `refreshAccessToken`, `logoutUser`, `getCurrentUser`.
- **Notable internals**: `issueOtp` (hash + expiry + reset attempts + email); `hashRefreshToken`/`compareRefreshToken` (SHA-256 then bcrypt — comment explains the 72-byte bcrypt truncation); rotation in `refreshAccessToken`; department **name → ObjectId** resolution in `registerUser`.
- **Calls**: `User`/`Dept` models, `tokenGeneration`, `otp`, `mailer`.

### `backend/src/services/complaint.service.js`
- **Responsibility**: complaint lifecycle + scoping. `createComplaint` (copies `department`/`lab` from the PC, seeds `history`), `escalateComplaint` (all the guard checks + `NEXT_LEVEL`/`STATUS_FOR_LEVEL` transition + history + populate), `resolveComplaint`, `trackComplaint` (field-limited), `getComplaints` (`buildComplaintScope` + triple `populate`).
- **Detail**: imports `lab.model.js` / `department.model.js` purely for side-effects so `populate("lab"/"department")` has the schemas registered.

### `backend/src/services/pc.service.js`
- **Responsibility**: `syncPcConfig` (partial `$set` config update vs first-time provisioning; `resolveDepartmentId`, `resolveOrCreateLabId` upsert), `getPcHealthCard` (scoped `findOne`), `lookupPcByDeadStockNo` (public, field-limited), `searchPcs` (regex filter builder + `escapeRegex`, warranty/lab exact filters, merges `req.scope`).

### `backend/src/middlewares/auth.middleware.js` / `roleCheck.middleware.js` / `deptScope.middleware.js`
- The three-step authorization spine: identify (`req.user`), gate by role, compute the department filter (`req.scope`).

### `backend/src/utils/asyncHandler.js`, `ApiError.js`, `ApiResponse.js`
- The response-shape contract: wrap handlers so throws reach the error middleware; one error class, one success class, one error middleware.

### `backend/src/models/complaint.model.js` & `pc.model.js`
- Where the domain shape lives: embedded `config`/`warranty`/`history`/`raisedBy`, the status/level enums (level enum explicitly excludes `admin`), and the `Pc` indexes.

### `frontend/src/services/apiClient.js`
- **Responsibility**: the single axios instance. Request interceptor adds the `Bearer` fallback from `localStorage`; response interceptor does the one-shot, de-duplicated **refresh-on-401-and-retry**, skipping auth endpoints.
- **Called by**: every `*Service.js`.

### `frontend/src/app/providers/AuthProvider.jsx` + `components/common/ProtectedRoute.jsx` + `hooks/useAuth.js`
- **Responsibility**: hold `{ user, setUser, loading }`; rehydrate from `GET /auth/me` on mount; gate routes by presence of `user` and by `allowedRoles`.

### `frontend/src/features/complaints/ComplaintsDashboard.jsx`
- **Responsibility**: the shared staff dashboard for all three roles. Derives `canAct` (`currentLevel === effectiveRole && status !== 'Resolved'`) and `canEscalate` (`canAct && role !== DEAN_INFRA`); computes stats with `useMemo`; client-side status filter + text search; escalate/resolve handlers that patch the row in place; logout that clears `localStorage` + context regardless of network result.

### `frontend/src/app/routes.jsx`
- **Responsibility**: the route map. `"/"` and `"/raise-complaint"` → public `RaiseComplaintPage`; `"/track-complaint"` public; `"/login"` → `AuthPage`; role homes and the shared tool pages wrapped in `<ProtectedRoute allowedRoles={[...]}>`; `"*"` → redirect to raise-complaint.

### `agent/collector.py`
- **Responsibility**: gather this PC's specs and POST them. `_collect_cpu_brand_windows` (registry `ProcessorNameString` so CPU search matches "i5"/"Ryzen"), `_clean_software_name` (locale-suffix strip + canonical casing), `_software_allowlist` (default = MS Office family), `build_payload`, `sync` (`raise_for_status`), `--dry-run` to print without POSTing.

---

## 22. Why These Technologies / Architectural Decisions?

Each item: **current approach → why it works → limitation → possible better approach.**

### Why MongoDB (not PostgreSQL)?
- **Why it works**: The hot entities are document-shaped and read whole — `Pc` with embedded `config`+`warranty`, `Complaint` with an embedded `history[]` trail. No multi-table joins in the read path; schema can evolve (`config` fields) without migrations.
- **Limitation**: No cross-document transactions used; referential integrity (`department` must exist) is enforced only in app code; ad-hoc aggregate reporting is weaker than SQL; the `lab` upsert can create near-duplicate labs if names vary ("Lab 1" vs "Lab-1").
- **Better**: PostgreSQL with `jsonb` for `config`/`history` would give FK constraints, transactions, and rich reporting while keeping the flexible bits — reasonable if admin CRUD and analytics grow.

### Why Express?
- **Why it works**: Minimal, ubiquitous, middleware model maps cleanly onto "gate the request in stages". Express 5 handles async errors.
- **Limitation**: No built-in structure — the layering is a **convention** the team must uphold; no DI, no schema-first routing.
- **Better**: NestJS (opinionated modules/DI/guards) or Fastify (faster, schema-based validation) if the team wants the structure enforced.

### Why the route → controller → service → model layering?
- **Why it works**: Business rules are testable without HTTP; controllers stay ~3 lines; swapping transport (GraphQL, a queue consumer) wouldn't touch services.
- **Limitation**: For truly trivial endpoints (`GET /dept`) it's ceremony — three files for one query.
- **Better**: Keep it; allow tiny endpoints to collapse controller+service when there's genuinely no logic.

### Why services own DB access (not controllers, not a separate repository layer)?
- **Why it works**: One place per feature to reason about reads/writes and invariants.
- **Limitation**: Services both decide rules **and** talk to Mongoose — harder to unit-test in isolation (tests here are integration tests against a real DB).
- **Better**: A thin repository layer between service and model if you want to mock the DB in unit tests.

### Why JWT (not server sessions)?
- **Why it works**: Stateless auth; `role`/`department` travel in the token so `roleCheck`/`deptScope` need no DB hit; refresh rotation limits replay.
- **Limitation**: Can't instantly revoke an access token; stale claims until expiry.
- **Better**: Short access TTL + a `tokenVersion` claim compared to `User.tokenVersion`, or a small Redis denylist for logout.

### Why httpOnly cookies **and** a localStorage Bearer fallback?
- **Why it works**: Cookies (httpOnly + sameSite) resist XSS token theft and are sent automatically; the Bearer fallback keeps non-browser clients / edge cases working.
- **Limitation**: Two code paths; anything in `localStorage` **is** XSS-readable, partly undercutting the cookie choice.
- **Better**: Commit to cookies only; drop the `localStorage` path unless a non-browser consumer truly needs it.

### Why refresh-token rotation + hashed storage?
- **Why it works**: A leaked-but-unused old refresh token stops working once the current one is redeemed; a DB leak doesn't expose usable refresh tokens (they're hashed).
- **Limitation**: No reuse-detection (a replayed old token just fails; it doesn't nuke the session as a breach signal).
- **Better**: Detect reuse of a rotated token and invalidate the whole chain.

### Why separate frontend / backend / agent (no monorepo tooling)?
- **Why it works**: Each deploys and scales independently; the agent has nothing to do with React; simplest possible setup for a student project.
- **Limitation**: `ROLES`/`COMPLAINT_STATUS` are **hand-duplicated** in `frontend/src/constants/roles.js` — they can silently drift from the backend enums.
- **Better**: A shared `packages/constants` (npm workspace) or generating the frontend constants from the backend file in CI.

### Why API versioning in the path (`/api/v1`)?
- **Why it works**: Cheap insurance — a breaking change can ship as `/api/v2` without disturbing existing clients (the agent, the SPA).
- **Limitation**: Only one version exists; no deprecation policy.
- **Better**: Fine as-is until a real v2 is needed.

### Why denormalize `department`/`lab` onto `Complaint`?
- **Why it works**: Department scoping filters complaints on every list call; copying the id at creation avoids a `Pc` join per query, and a PC's department almost never changes.
- **Limitation**: If a PC *is* reassigned to another department, old complaints keep the old department.
- **Better**: On PC reassignment, optionally backfill open complaints; or accept it as historically-correct.

### Why Zod at the edge but semantic checks in services?
- **Why it works**: Fast, uniform `400`s for malformed input; service messages ("already verified") stay authoritative and their exact text is relied on by the frontend/tests.
- **Limitation**: Some rules are effectively checked twice (shape in Zod, meaning in service).
- **Better**: Acceptable; could push more (e.g. `warrantyStatus` enum) into Zod.

### Why `node --test` against a real MongoDB (no in-memory Mongo, no supertest)?
- **Why it works**: Zero test deps; exercises the real driver/indexes; `after()` cleans up created docs by id.
- **Limitation**: Needs a reachable `MONGO_URL`; parallel runs against a shared DB could interfere; not hermetic.
- **Better**: `mongodb-memory-server` for isolation, or a disposable CI database per run (CI already uses a throwaway `labmon-ci` DB in a service container).

---

## 23. Strengths

1. **Clean, consistent layering** — routes/middleware/controllers/services/models, followed uniformly; controllers are genuinely thin.
2. **One response contract** — `ApiResponse` / `ApiError` / one error middleware; the frontend can always read `res.data.data` and `err.response.data.message`.
3. **Centralized rules** — `constants.js` for enums/transitions, `scope.js` for access control (explicitly de-duplicated from three earlier copies).
4. **Thoughtful auth details** — refresh rotation, hashed refresh token with a documented reason for the SHA-256 pre-hash, expiry-derived cookie `maxAge`, OTP CSPRNG + lockout + cooldown.
5. **Real security hardening pass** — Zod validation, rate limiting, regex-escaping in search, string-coercion blunting NoSQL injection, `roleCheck` added where it was missing.
6. **Escalation logic is correct and tested** — level/role/department guards, top-of-chain handling, and the subtle "hod/deanInfra only see complaints at their level" scoping all have integration tests.
7. **Good component reuse on the frontend** — one `ComplaintsDashboard` for three roles, one `DetailModal` for three modals.
8. **Sensible UX touches** — inline PC confirmation before submitting a complaint, auto-submitting OTP input, refresh-on-401 retry, session rehydration on reload.
9. **CI exists** — backend tests + frontend lint/build on every push/PR.
10. **The docs are honest** — `backend/docs/known-issues.md` tracks open gaps and what's already fixed.

---

## 24. Weaknesses

### Technical debt / shortcuts
- **`/pc/sync` is unauthenticated** — the single biggest gap; any reachable client can rewrite health cards or provision PCs.
- **`/register` is open to `admin` self-registration** and has no rate limiter.
- **Frontend enums are hand-copied** from the backend (`roles.js`) — drift risk with no guard.
- **`.env` with real-looking credentials is in the working tree** — should be rotated and kept only in a secret store.
- **`/pc/:id/health-card` is a `POST` for a read** — REST-incorrect; the frontend had to match it.
- **`lab` upsert has no unique index** — inconsistent lab names create duplicates.
- **Empty `store/` and stub pages** (`equipment`, `inventory`, `requests`) ship as dead routes.
- **`morgan("dev")` only** — no structured/persistent logging, no request IDs, no error tracking.
- **Tests need a live DB** and share it; not hermetic.

### Correctness / robustness
- **Access token can't be revoked**; **claims never re-checked** mid-session.
- **Per-IP-only login throttling**; no `trust proxy`, so limiters break behind a proxy.
- **No pagination** anywhere — `GET /complaint` and `/pc/search` grow unbounded.
- **`server.js`** logs and swallows a DB connection failure in the `.catch` (process keeps running with no DB) instead of exiting.
- **No transaction** around "create complaint" or "provision PC + upsert lab" (low risk at current scale).
- **`resolveOrCreateLabId` upsert** can race two first-time syncs of PCs in the same new lab (Mongo upsert mostly handles this, but there's no unique index to guarantee it).

### Scalability (10×–100× users / PCs)
- **List endpoints** return everything in scope → large payloads, slow queries, heavy React renders. **Needs pagination + server-side filtering** first.
- **Regex search** (`$regex`, case-insensitive, unanchored) can't use indexes well → full collection scans as `pcs` grows. Consider a text index or anchored prefixes.
- **`populate` fan-out** on `GET /complaint` (`lab`, `department`, `history.by`) is N extra queries per list; at scale, denormalize display names or batch.
- **Rate limiter is in-memory** — doesn't work across multiple backend instances; needs a shared store (Redis).
- **Single Mongo cluster, no caching layer** — read-heavy dashboards would benefit from caching department/lab lookups.
- **Agent has no backoff/jitter** — hundreds of PCs syncing on the same cron could thundering-herd `/pc/sync` (only the 30/min/IP limiter stands in the way, and they'd likely share an egress IP).

### Security (recap of §18 gaps)
Device auth for the agent; admin-gate `/register`; access-token revocation/short TTL + claim re-check; per-account login lockout; `trust proxy` + `/refresh-token` limiter; rotate committed secrets.

---

## 25. Improvements / Future Version

**Near term (correctness & security):**
1. Agent device key/HMAC on `/pc/sync`; seed an admin and gate `/register` with `roleCheck(ADMIN)`.
2. `app.set("trust proxy", ...)`; add a `/refresh-token` limiter; per-account failed-login counter.
3. Fix `server.js` to `process.exit(1)` on DB connect failure (or retry with backoff).
4. Make `/pc/:id/health-card` a `GET`; update `pcService.js`.
5. Unique index on `Lab { name, department }`.
6. Move secrets out of the repo; rotate the exposed MongoDB/SMTP credentials.

**Medium term (product & scale):**
7. Pagination + server-side filtering/sorting on `GET /complaint` and `/pc/search`; dashboard-summary endpoint so the frontend stops deriving stats from the full list.
8. Admin CRUD for Dept/Lab/User/Pc (the roadmap's missing phase).
9. Shared constants package (or CI check) so frontend/backend enums can't drift.
10. Structured logging (pino) + request IDs + an error tracker (Sentry).
11. Redis-backed rate limiting and lookup caching; run multiple backend instances behind a load balancer.
12. Email/notification on escalation so the next level knows without polling.
13. `mongodb-memory-server` (or per-run DB) for hermetic tests; add frontend component tests.

**Longer term:**
14. Reconsider PostgreSQL + `jsonb` if reporting/analytics and strict integrity become priorities.
15. Agent auto-scheduling + staggered sync windows + retry/backoff.
16. Warranty-expiry background job that flips `warranty.status` to `Expired` and alerts.

---

## 26. Beginner Glossary

- **API** — A contract for two programs to talk over HTTP: send a request to a URL, get structured data back.
- **REST** — A style of API where URLs name "resources" (`/complaint`) and HTTP verbs say what to do (`GET` read, `POST` create, `PATCH` modify).
- **Endpoint / route** — One `METHOD + URL` the server handles, e.g. `POST /api/v1/complaint`.
- **Middleware** — A function that runs in a chain before the final handler; can inspect/modify the request, stop it, or pass it on with `next()`.
- **Controller** — The thin function that reads the HTTP request, calls one service, and sends the HTTP response.
- **Service** — Where the real logic and database calls live; takes plain arguments, returns plain data, throws on failure.
- **Model** — A Mongoose object built from a schema; you call `.find`, `.create`, etc. on it.
- **Schema** — The declared shape and rules of a document (types, `required`, `enum`, `unique`).
- **Document** — One record in MongoDB (like a row).
- **Collection** — A group of documents (like a table).
- **ObjectId** — MongoDB's 24-hex-character unique identifier; also used to point from one document to another.
- **Reference (`ref`)** — A field holding another document's `ObjectId`.
- **`populate()`** — Replace a stored `ObjectId` with the actual (or partial) referenced document.
- **Embedded document / subdocument** — A nested object stored inside its parent, not in its own collection (`Pc.config`, `Complaint.history[]`).
- **Denormalization** — Deliberately copying a value into another document to avoid a join later (`Complaint.department`).
- **Index** — A data structure that speeds up queries on a field; `unique` indexes also forbid duplicates.
- **ODM (Object-Document Mapper)** — Library (Mongoose) that maps DB documents to typed objects with validation and helpers.
- **JWT (JSON Web Token)** — A signed token: `header.payload.signature`. The server verifies the signature to trust the payload without a DB lookup.
- **Access token** — Short-lived JWT sent on every request to prove who you are.
- **Refresh token** — Long-lived JWT used only to get a new access token when the old one expires.
- **Token rotation** — Issuing a brand-new refresh token every time one is used, so an old copy stops working.
- **httpOnly cookie** — A cookie JavaScript cannot read, so a script-injection attack can't steal it.
- **`sameSite: strict`** — The browser won't send this cookie on requests triggered by other sites (CSRF defense).
- **CORS** — Browser rule that blocks a page on origin A from calling API origin B unless B explicitly allows A.
- **CSRF** — Attack where another site makes your browser send an authenticated request using your cookies.
- **XSS** — Attack where malicious JavaScript runs on your page and can read anything the page's JS can.
- **bcrypt** — A deliberately slow, salted hashing function for passwords/secrets.
- **Salt** — Random data mixed into a hash so identical inputs don't produce identical hashes.
- **CSPRNG** — Cryptographically secure random number generator (`crypto.randomInt`), unpredictable unlike `Math.random()`.
- **OTP** — One-Time Password; here a 6-digit code emailed to verify an address.
- **Rate limiting** — Capping how many requests a client can make in a time window.
- **Zod** — A library to declare the expected shape of data and validate/parse it.
- **Validation** — Checking incoming data is well-formed and allowed before acting on it.
- **`asyncHandler`** — A wrapper that catches errors from an async controller and forwards them to the error middleware.
- **Error middleware** — The special 4-argument Express function that turns thrown errors into a consistent JSON response.
- **Envelope / response wrapper** — A fixed JSON shape around every response (`{ statusCode, data, message, success }`).
- **Escalation chain** — The fixed order a complaint moves through: Lab Incharge → HOD → Dean Infra.
- **Scope (department scope)** — A query filter that limits what a user can see/act on based on their department/role.
- **Dead stock number** — The college's physical asset tag on a PC; LABMON's natural key for a machine.
- **Health card** — The stored, agent-synced snapshot of a PC's specs, software, and warranty.
- **Provisioning** — Creating a PC record for the first time (needs department + lab), vs. just updating its config.
- **Upsert** — "Update if it exists, otherwise insert" — used to auto-create labs.
- **SPA (Single-Page Application)** — A web app where the browser loads one HTML shell and JavaScript swaps the views.
- **Interceptor (axios)** — A hook that runs on every request or response, used here for auth headers and refresh-on-401.
- **Context (React)** — A way to share state (the logged-in user) across components without passing props down every level.
- **Hook (React)** — A function like `useState`/`useEffect`/`useContext` that lets a component hold state or run side effects.
- **`populate` fan-out** — Extra queries Mongoose runs to resolve each referenced field.
- **Seed script** — A one-off program that inserts baseline data (departments) into the DB.
- **CI (Continuous Integration)** — Automation that runs tests/lint/build on every push so breakage is caught early.

---

## 27. The Entire Project in 10 Minutes

**1. What it does.** LABMON keeps a live digital "health card" for every lab PC in a college (CPU, RAM, disk, OS, installed software, warranty) and runs a public complaint system for broken PCs that automatically escalates Lab Incharge → HOD → Dean Infrastructure.

**2. Who uses it.** Students/lab users (no login, raise + track complaints by token); Lab Incharge, HOD, Dean Infra (staff dashboards, department-scoped); Admin (role exists, no UI yet); and each lab PC runs a Python agent.

**3. Main features.** PC config sync (agent → `POST /pc/sync`); public complaint create + token tracking; staff register/verify-OTP/login; complaint list/escalate/resolve with an audit `history[]`; PC search with regex filters + health-card modal; department list for the sign-up dropdown.

**4. Tech stack.** Backend: Node + Express 5 + Mongoose/MongoDB, JWT (jsonwebtoken), bcrypt, Zod, express-rate-limit, helmet, nodemailer, nanoid. Frontend: React 19 + Vite + React Router 7 + axios (no state library). Agent: Python + psutil + requests. CI: GitHub Actions (Mongo service container for backend tests; lint + build for frontend).

**5. Architecture.** `server.js` → `app.js` (helmet, cors-with-credentials, json, cookie-parser, morgan) → routers `/api/v1/{auth,pc,complaint,dept}` → per-route middleware (`rateLimiter → validate(zod) → auth(jwt) → roleCheck → deptScope`) → thin **controllers** → **services** (all logic + all DB) → Mongoose **models** → MongoDB. One **error middleware** turns thrown `ApiError`s into a consistent JSON shape; successes use `ApiResponse`.

**6. Database.** Collections: `users`, `depts`, `labs`, `pcs`, `complaints`. `Dept` 1→* Users/Labs/Pcs/Complaints; `Lab` 1→* Pcs (+ optional `incharge`); `Pc` 1→* Complaints. `Pc` embeds `config` + `warranty`; `Complaint` embeds `raisedBy` + an append-only `history[]`, and denormalizes `department`/`lab` from the PC for fast scoping. Keys: `email`, `deadStockNo`, `complaint.token`, `dept.name` are unique; `pcs` indexed on `{department,lab}` and `warranty.status`.

**7. APIs.** ~17 endpoints. Public: `POST /pc/sync`, `GET /pc/lookup/:dsn`, `POST /complaint`, `GET /complaint/track/:token`, `GET /dept`, plus `POST /auth/{register,verify-email,resend-otp,login,refresh-token}`. Protected: `GET /auth/me`, `POST /auth/logout`, `GET /pc/search`, `POST /pc/:id/health-card`, `PATCH /complaint/:id/{escalate,resolve}`, `GET /complaint`.

**8. Authentication.** Password login (email must be OTP-verified first) issues an **access** JWT (`{id,role,department}`, ~15m) and a **refresh** JWT (~7d) as httpOnly `sameSite:strict` cookies. The refresh token's SHA-256→bcrypt hash is stored on the user; every `/refresh-token` **rotates** both and overwrites the hash; logout clears it. `auth` middleware trusts the verified access token's payload as `req.user`. Frontend axios refreshes once on a 401 and retries. Authorization = `roleCheck(...roles)` + `scope.js` (admin/deanInfra unscoped; hod/deanInfra only see complaints at their own level).

**9. Key workflows.** Raise complaint → token; track by token; register → verify OTP → login → role home; Lab Incharge lists department queue → escalate/resolve (row updates in place); search PCs → open health card → refresh.

**10. Major decisions.** MongoDB because entities are document-shaped and read whole; strict route→controller→service→model layering so logic is transport-independent and testable; JWT for stateless auth with rotation for safety (accepting that access tokens aren't revocable for ~15m); centralized enums + scoping in one file each; separate frontend/backend/agent with **no** shared package (frontend enums are hand-mirrored). Known open gaps: `/pc/sync` has no device auth, `/register` allows admin self-signup, no pagination, access tokens aren't revoked on logout.

---

## 28. Interview Questions & Answers

> Each: **Q → simple answer → technical answer → what's being tested.**

### Beginner

**Q1. What does LABMON do?**
- *Simple*: Tracks the specs and warranty of every lab PC and lets anyone report a broken one and follow the fix.
- *Technical*: A MERN system: a Python agent syncs per-PC hardware/software to an Express/MongoDB backend that also runs a public, token-tracked complaint workflow with a fixed Lab Incharge → HOD → Dean Infra escalation chain and department-scoped role access; a React SPA is the UI.
- *Testing*: Can you summarize your own project crisply.

**Q2. Walk me through what happens when a student submits a complaint.**
- *Simple*: They type the PC's tag and the problem; the server checks the PC exists, saves the complaint at "Lab Incharge" level, and gives back a token.
- *Technical*: `POST /api/v1/complaint` → `complaintLimiter` → `validate(raiseComplaintSchema)` → controller → `createComplaint`: `Pc.findOne({deadStockNo})` (404 if missing), `nanoid(8)` token, `Complaint.create` with `status:Open`, `currentLevel:labIncharge`, copied `department`/`lab`, and a `history:[{action:"created"}]` entry → `201 { data: complaint }`.
- *Testing*: End-to-end request understanding.

**Q3. Why three separate projects?**
- *Simple*: The browser app, the server, and the PC agent do totally different jobs and run in different places.
- *Technical*: Independent runtimes/deploys, different languages (JS/JS/Python), no shared build; the tradeoff is that shared constants (roles/statuses) are hand-duplicated in `frontend/src/constants/roles.js`.
- *Testing*: Awareness of coupling/cohesion tradeoffs.

### Backend

**Q4. Why split controllers and services?**
- *Simple*: Controllers deal with HTTP; services hold the actual rules and database work.
- *Technical*: Keeps business logic transport-agnostic and testable without spinning up HTTP; controllers stay ~3 lines (`asyncHandler` + `ApiResponse`). Services take plain args and throw `ApiError`.
- *Testing*: Separation of concerns; layered architecture.

**Q5. How do you avoid try/catch in every route?**
- *Simple*: A wrapper catches async errors for me.
- *Technical*: `asyncHandler(fn)` returns `(req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`, forwarding to the single `errorHandler` middleware, which formats `ApiError`s and hides unknown errors as `500`.
- *Testing*: Error-propagation design in Express.

**Q6. How does the escalation logic prevent the wrong person moving a complaint?**
- *Simple*: Only the role that currently "holds" the complaint can push it forward, and only within their department.
- *Technical*: Route `roleCheck(LAB_INCHARGE, HOD)`; service then checks `status !== Resolved`, `assertDepartmentAccess(user, complaint.department)`, `user.role === complaint.currentLevel`, and `NEXT_LEVEL[currentLevel]` exists; transitions via `NEXT_LEVEL`/`STATUS_FOR_LEVEL` and appends to `history[]`.
- *Testing*: Defense-in-depth authorization; state-machine correctness.

**Q7. What happens when the database is down?**
- *Simple*: On startup it fails to connect; during a request you'd get a 500.
- *Technical*: `connectDB` `process.exit(1)` on initial failure — **but** `server.js`'s `.catch` only logs "Failed to connect database" and lets the process continue (a known weakness); a mid-request Mongoose failure bubbles to `errorHandler` as a generic `500`. No retry/backoff, no circuit breaker.
- *Testing*: Failure-mode awareness and honesty about gaps.

### Database

**Q8. Why MongoDB instead of PostgreSQL?**
- *Simple*: The data is naturally "one document with nested stuff", not lots of related tables.
- *Technical*: `Pc` embeds `config`/`warranty`; `Complaint` embeds `raisedBy` and an append-only `history[]`; reads want the whole doc; schema evolves without migrations. Cost: no FK constraints or transactions — integrity is app-enforced; `jsonb` in Postgres would be the alternative if reporting/integrity mattered more.
- *Testing*: Data-modeling judgment, not buzzwords.

**Q9. Embedded vs referenced — how did you decide?**
- *Simple*: Embed things only used with their parent; reference things managed on their own.
- *Technical*: Embedded: `config`, `warranty`, `history`, `raisedBy`. Referenced: `department`, `lab`, `pc`, `history.by` (shared entities, displayed via `populate(..., "name")`). Deliberate denormalization: `Complaint.department`/`lab` copied from the PC so scope filters need no join.
- *Testing*: Understanding of document DB tradeoffs.

**Q10. What indexes exist and why?**
- *Simple*: Unique ones on the natural keys, plus a couple to speed up PC lookups.
- *Technical*: `unique`: `users.email`, `pcs.deadStockNo`, `complaints.token`, `depts.name`. `pcs`: compound `{department:1, lab:1}` (scoped lists/search) and `{"warranty.status":1}` (warranty filter). Gap: regex search on `config.*` isn't index-friendly; `labs.name` has no unique index.
- *Testing*: Query-performance awareness.

**Q11. What does `populate()` cost you?**
- *Simple*: Extra queries to fetch the referenced documents.
- *Technical*: `getComplaints` populates `lab`, `department`, and `history.by` — additional lookups per list. At scale you'd denormalize display names or batch/cache.
- *Testing*: Knowing ODM conveniences aren't free.

### API

**Q12. How is your API structured?**
- *Simple*: Versioned REST under `/api/v1`, one router per resource, consistent JSON envelope.
- *Technical*: `auth`, `pc`, `complaint`, `dept` routers; `GET/POST/PATCH` by intent; success via `ApiResponse` (`{statusCode,data,message,success}`), errors via one middleware (`{success:false,statusCode,message,errors}`).
- *Testing*: API consistency and conventions.

**Q13. Point out a REST smell in your own API.**
- *Simple*: The health-card read is a `POST`.
- *Technical*: `POST /pc/:id/health-card` is a pure read (`getPcHealthCard` doesn't mutate); should be `GET`. The frontend deliberately calls it as `POST` to match. Also: no pagination on list endpoints, `/register` lacks a rate limiter.
- *Testing*: Self-critique.

**Q14. How would you add pagination to `GET /complaint`?**
- *Simple*: Accept `page`/`limit`, `skip().limit()` in the query, return total count.
- *Technical*: Validate `page`/`limit` with Zod; `Complaint.find(scope).sort({createdAt:-1}).skip((page-1)*limit).limit(limit)`; return `{ items, page, limit, total }`; prefer a cursor (`_id`/`createdAt`) over `skip` for large offsets; update the dashboard to page server-side instead of filtering client-side.
- *Testing*: Practical scaling changes.

### Authentication

**Q15. Explain your auth flow.**
- *Simple*: Verify email by OTP, then log in with a password to get token cookies; a refresh token silently renews them.
- *Technical*: `register` → `verify-email` (bcrypt-hashed OTP, `otpAttempts` lockout) → `login` (password check + `isEmailVerified`) issues access (`{id,role,department}`, 15m) + refresh (7d) as httpOnly `sameSite:strict` cookies; `User.refreshToken` stores `bcrypt(sha256(refreshToken))`; `/refresh-token` verifies + compares + **rotates** both; `logout` unsets the hash; `auth` middleware verifies the access token and sets `req.user`.
- *Testing*: Whether you understand your own security code.

**Q16. Why hash the refresh token with SHA-256 before bcrypt?**
- *Simple*: bcrypt ignores anything past 72 bytes and JWTs are longer.
- *Technical*: Two refresh JWTs sharing a 72-byte prefix would bcrypt-collide; `crypto.createHash("sha256").update(token).digest("hex")` gives a fixed 64-char digest so the whole token determines the stored hash. (Comment in `auth.service.js`.)
- *Testing*: Depth — did you understand the code you wrote or copied.

**Q17. What happens when the access token expires?**
- *Simple*: The next call 401s, the app quietly refreshes and retries.
- *Technical*: `apiClient.js` response interceptor: on a non-auth-endpoint `401` not already retried, call `POST /auth/refresh-token` once (module-level shared promise dedupes concurrent 401s), then re-issue the original request; if refresh fails, reject so the UI can redirect to `/login`. `AuthProvider` also rehydrates via `GET /auth/me` on load.
- *Testing*: Client-side session handling.

**Q18. Can you revoke a token immediately on logout?**
- *Simple*: Only the refresh token; the access token stays valid until it expires.
- *Technical*: `logoutUser` unsets `User.refreshToken`, so no new access tokens can be minted, but the current access token (~≤15m) still verifies because `auth` middleware does no DB check. Fixes: shorter TTL, a `tokenVersion` claim checked against the DB, or a denylist.
- *Testing*: Understanding JWT's core tradeoff.

**Q19. Where are tokens stored and why?**
- *Simple*: In httpOnly cookies, so page scripts can't read them.
- *Technical*: httpOnly + `sameSite:strict` (+ `secure` in prod) cookies resist XSS token theft and CSRF; there's also a `localStorage.accessToken` Bearer fallback in the request interceptor — convenient but XSS-readable, so it partly undercuts the cookie choice.
- *Testing*: Token-storage threat model.

### Architecture

**Q20. Trace a request through your backend.**
- *Simple*: URL → checkpoints (rate limit, validate, auth, role, scope) → controller → service → MongoDB → JSON back.
- *Technical*: `app.js` global middleware → resource router → per-route chain (`rateLimiter → validate(zod) → auth → roleCheck → deptScope`) → `asyncHandler`-wrapped controller → service (business rules + `scope.js` + Mongoose) → model → DB; result wrapped in `ApiResponse`; any throw → `errorHandler`.
- *Testing*: Whole-system mental model.

**Q21. Why centralize the scoping rule in `scope.js`?**
- *Simple*: It used to be written three different ways and could disagree.
- *Technical*: `deptScope` middleware, an inline `assertDeptAccess`, and `buildComplaintScope` were separate implementations; unifying into `buildDepartmentScope` / `assertDepartmentAccess` / `buildComplaintScope` means the "admin/deanInfra unscoped" rule is defined once and can't drift.
- *Testing*: DRY applied to security-critical logic.

**Q22. How do the frontend and backend stay in sync on roles/statuses?**
- *Simple*: They don't automatically — I copy the enums by hand.
- *Technical*: `backend/src/config/constants.js` is the source; `frontend/src/constants/roles.js` mirrors it with a "keep in sync" comment. Better: a shared workspace package or a CI check that diffs them.
- *Testing*: Recognizing a real fragility.

**Q23. Why is `app.js` separate from `server.js`?**
- *Simple*: So tests can import the app without starting a real server.
- *Technical*: `app.js` exports the configured app; `server.js` does env load + `connectDB` + `listen`. Tests `import { app }` and call `app.listen(0)` on a random port.
- *Testing*: Testability-driven structure.

### Security

**Q24. How do you resist NoSQL injection?**
- *Simple*: Force inputs to be strings before they reach the database.
- *Technical*: Zod coerces `email`/`deadStockNo`/etc. to `string`, so `{ $ne: null }`-style objects are rejected at the edge; `searchPcs` wraps values in `escapeRegex(String(value))` before building `$regex`. No raw `$where`/`eval`.
- *Testing*: Injection awareness specific to MongoDB.

**Q25. What are the biggest security gaps you know about?**
- *Simple*: The PC sync endpoint has no auth, and anyone can register as admin.
- *Technical*: `/pc/sync` has no device auth (rewrite/provision PCs by knowing a `deadStockNo`); `/register` has no `roleCheck` (self-signup as `admin`); access tokens aren't revoked on logout and claims aren't re-checked; login throttling is per-IP only; no `trust proxy`; `/refresh-token` has no limiter. All tracked in `backend/docs/known-issues.md`.
- *Testing*: Honesty + threat awareness.

**Q26. Why disable rate limiting and OTP lockout in tests?**
- *Simple*: The tests fire many requests fast from one IP and would trip the limits.
- *Technical*: `rateLimiter.js` `skip: () => NODE_ENV==="test"`; `auth.service.js` guards lockout/cooldown with `!isTestEnv`. Tradeoff: those paths aren't exercised by the suite.
- *Testing*: Test-vs-prod configuration reasoning.

**Q27. How are passwords and OTPs protected at rest?**
- *Simple*: Both are bcrypt-hashed; OTP fields aren't even returned by default.
- *Technical*: `user.model.js` `pre("save")` bcrypt-hashes `password` (rounds 10); `otp.js` bcrypt-hashes the CSPRNG 6-digit code; `otp`, `otpExpiry`, `otpPurpose`, `otpAttempts`, `lastOtpSentAt` are `select:false`; responses null out `password`.
- *Testing*: At-rest secret handling.

### "Why did you use X?"

**Q28. Why axios over fetch?** Interceptors: auto-attach the Bearer fallback, and do the one-shot de-duplicated refresh-on-401-and-retry — awkward to build cleanly on `fetch`. Also `withCredentials` and JSON defaults.

**Q29. Why `nanoid` for the complaint token?** Short, URL-safe, collision-resistant; friendlier for a human to copy/type than a 24-char ObjectId, and it shouldn't be a guessable/sequential id.

**Q30. Why Zod instead of Mongoose validation alone?** Zod rejects malformed shape/type at the HTTP boundary with friendly, uniform `400`s *before* any DB work and normalizes input (`trim`/`lowercase`); Mongoose validation stays as the last-line guarantee for every write path (seeds, agent, tests).

**Q31. Why httpOnly cookies instead of just `localStorage`?** `localStorage` is readable by any script (XSS = token theft); httpOnly cookies aren't, and `sameSite:strict` adds CSRF protection. (The remaining `localStorage` Bearer fallback is a known compromise.)

**Q32. Why is there no state-management library?** The only genuinely global state is the auth user, handled by one React context; everything else is server data fetched per screen into local state. Redux/Zustand would be overhead. `src/store/` is left as a placeholder for when that changes.

**Q33. Why `express-rate-limit` in memory rather than Redis?** Simplicity for a single-instance deployment. It's a known scaling limit — multiple backend instances would each have their own counters, so a shared store (Redis) is needed before horizontal scaling.

### Challenge questions (interviewer pushes back)

**Q34. "Your `/pc/sync` has no auth — isn't your whole inventory untrustworthy?"**
- Acknowledge: yes, that's the top known gap (`known-issues.md`). Today only a 30/min/IP limiter and Zod validation guard it. Mitigation plan: a per-PC device key or HMAC-signed request, plus binding a `deadStockNo` to its key so it can't be reassigned by an attacker. Until then, provisioning at least requires a valid existing `department` name.

**Q35. "Dean Infra sees complaints from every department — how is that not a privacy hole?"**
- It's intentional: Dean Infra is the final infrastructure authority across the college, so `isDeptUnscoped` includes `deanInfra`. But it's *narrowed by level*: `buildComplaintScope` returns `{ currentLevel: "deanInfra" }`, so they only see complaints actually escalated to them, not every department's full history.

**Q36. "What if two agents provision PCs in the same brand-new lab at the same time?"**
- `resolveOrCreateLabId` uses `findOneAndUpdate(..., { upsert:true })` keyed on `{name, department}`, which MongoDB handles atomically for the common case. The real weakness is no **unique index** on `{name, department}`, so a rare race (or a name typo) can create duplicate labs. Fix: add the compound unique index.

**Q37. "Your tests hit a real database — aren't they flaky and order-dependent?"**
- They connect to `MONGO_URL` and clean up created ids in `after()`; CI uses a throwaway `labmon-ci` database in a Mongo service container, so it's isolated there. Locally it shares whatever DB `.env` points at, which is a legitimate risk — `mongodb-memory-server` or a per-run database would make them hermetic.

**Q38. "10,000 PCs and 500 concurrent staff — what breaks first?"**
- `GET /complaint` and `GET /pc/search`: they return the entire scoped set with `populate` fan-out and (for search) unanchored `$regex` that can't use indexes → slow queries and huge JSON, then heavy React renders. First fixes: pagination + server-side filtering, a text/prefix index for search, a summary endpoint for dashboard stats, and Redis-backed rate limiting so the API can run multiple instances.

**Q39. "You store `role` in the JWT — what happens when an admin demotes someone mid-shift?"**
- Nothing until their access token expires (~15m), because `auth.middleware.js` trusts the token payload and never re-reads the user. That's an accepted short-window risk today (no admin CRUD exists yet to trigger it). Proper fix before admin CRUD ships: a `tokenVersion`/claims check against the DB, or a much shorter access TTL.

**Q40. "Why copy `department` onto the complaint instead of joining through the PC every time?"**
- Every complaint list is department-scoped, so the filter would otherwise need a `Pc` lookup on every query. A PC's department effectively never changes, so copying the id once at creation is a cheap write for a big read win. The tradeoff — if a PC *is* reassigned, its old complaints keep the old department — is actually the historically-correct behavior.

---

*End of report. Sources: the code under `backend/src/`, `frontend/src/`, and `agent/` in this repository, cross-checked against `backend/docs/known-issues.md`. Where the code and `backend/Readme.md` disagree, this report follows the code.*
