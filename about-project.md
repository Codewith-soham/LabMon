# About LABMON — Architecture & Tech Stack Overview

> Structural overview only (Step 1). Business logic is intentionally not analyzed in detail.
> Based on the working tree at branch `person-1` (includes uncommitted changes).

## 1. Application Purpose

**LABMON** is a lab PC health monitoring and complaint management system for college environments.

- **Health cards:** a Python agent running on each lab PC collects hardware/software configuration (CPU, RAM, disk, OS, installed software) and syncs it to the backend, keeping a per-PC "digital health card" current. Each card is tied to a department, lab, dead-stock number and warranty status.
- **Public complaints:** anyone (no login) can raise a complaint against a PC and track it with a unique token.
- **Escalation:** complaints move through a fixed chain, currently **Lab Incharge → HOD**, with **Admin** monitoring the system (the older Dean Infra level has been removed in the V1 role model).
- **Role-scoped access:** staff log in (email + OTP-verified registration) and see data scoped by role/department.

## 2. Tech Stack

The repo contains three independent runtimes with no shared package or workspace; each is installed and run separately.

| Layer | Languages / Frameworks | Key dependencies |
|---|---|---|
| **Backend** (`backend/`) | TypeScript (strict, ESM, `NodeNext`), Node 22, Express 5 | `mongoose` 9 (ODM), `zod` (env + request validation), `jsonwebtoken`, `bcrypt`, `cookie-parser`, `cors`, `helmet`, `morgan`, `express-rate-limit`, `nodemailer`, `nanoid`, `validator`, `dotenv` |
| **Frontend** (`frontend/`) | TypeScript, React 19, Vite 8 | `react-router-dom` 7, `axios`; lint with `oxlint`; plain CSS (no UI or state-management library) |
| **Agent** (`agent/`) | Python | `psutil`, `requests`; `winreg` (stdlib, Windows only) for installed software |
| **Database** | MongoDB (Atlas or local; `mongo:7` in CI) | Accessed through Mongoose models (no SQL, no separate migration tool) |
| **Dev / test tooling** | `tsx` (dev runner), `tsc` (build/typecheck), Node built-in test runner, `mongodb-memory-server` | Prettier for backend formatting |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) | Runs on push/PR to `main`: backend typecheck → build → test (with a `mongo:7` service); frontend lint + build |

**ORM/ODM:** Mongoose models in `backend/src/models/`: `User`, `Dept`, `Lab`, `Pc` (embedded `warranty` and `config`), `Complaint` (embedded `history[]`).

**Auth mechanism:** JWT access + refresh tokens delivered as httpOnly cookies, with a `Bearer` header fallback. Registration is OTP-verified by email. Passwords are hashed with bcrypt.

## 3. Folder Organization

```
labmon/
├── backend/                 Express + Mongoose API (TypeScript)
│   ├── src/
│   │   ├── server.ts        Process entry: load env, connect DB, listen
│   │   ├── app.ts           Express app: middleware stack + route mounting
│   │   ├── config/          env.ts (zod-validated env), db.config.ts, constants.ts (ROLES, COMPLAINT_STATUS, escalation chain, OTP settings)
│   │   ├── routes/          Route definitions per resource (auth, pc, complaint, dept, admin)
│   │   ├── controllers/     Thin HTTP handlers wrapped in asyncHandler
│   │   ├── services/        Business logic (auth, pc, complaint, dept, admin)
│   │   ├── models/          Mongoose schemas (user, department, lab, pc, complaint)
│   │   ├── middlewares/     auth, roleCheck, deptScope, validate, rateLimiter, error handler
│   │   ├── validators/      Zod request schemas
│   │   ├── utils/           ApiError/ApiResponse, asyncHandler, scope (access scoping), tokenGeneration, otp, mailer, requireAuth
│   │   ├── types/           Shared TS types and Express type augmentation
│   │   ├── scripts/         Seed scripts (admin, departments, labs, demo data) and data migrations
│   │   └── tests/           Node test-runner suites (auth, authz, complaint, healthcard, pc, pc.search) + helpers/_setup
│   ├── scripts/             Ad-hoc .mjs utilities (Atlas IP allowlist, laptop-flow test, PC detail updates)
│   └── docs/                Detailed backend reference (architecture, models, modules, known issues, phases)
├── frontend/                React SPA (Vite + TypeScript)
│   └── src/
│       ├── main.tsx         Entry: mounts <App/> into #root
│       ├── app/             App.tsx, routes.tsx (role-gated routing), providers/AuthProvider
│       ├── features/        Feature folders: auth, admin, hod, lab-incharge, complaints, pc-search, laboratories, public-complaint, equipment, inventory, requests, errors
│       ├── components/      Shared UI (DetailModal, ProtectedRoute, charts placeholder)
│       ├── services/        axios client + API wrappers (auth, complaint, dept, pc)
│       ├── constants/       Role and route constants (hand-mirrored from the backend)
│       ├── hooks/ types/ utils/ styles/ assets/
│       └── store/           Empty (no state library adopted)
├── agent/                   Python PC collector
│   ├── collector.py         Gathers system config and POSTs it to /api/v1/pc/sync
│   ├── measure_payload.py   Payload-size helper
│   └── requirements.txt
├── docs/                    Project-level docs (API contract, architecture, database, roles, task board, audit, dev log)
├── prd.md                   Product requirements document
├── .github/workflows/       CI pipeline
└── CLAUDE.md                Guidance for Claude Code
```

## 4. Entry Points & Configuration

### Entry points

| Runtime | Entry file | Flow |
|---|---|---|
| Backend | `backend/src/server.ts` | `import "dotenv/config"` → `connectDB()` (`config/db.config.ts`) → `app.listen(env.PORT)`. `src/app.ts` builds the Express app: `helmet`, `cors` (credentials, `CORS_ORIGIN`), JSON/urlencoded parsers (10 MB), `cookie-parser`, `morgan`, then mounts routers under `/api/v1/{auth,pc,complaint,dept,admin}` and the error handler. |
| Frontend | `frontend/src/main.tsx` | Renders `app/App.tsx` (providers + `routes.tsx`) in `StrictMode`. |
| Agent | `agent/collector.py` | Run manually (`python collector.py`); takes a dead-stock number and POSTs `{ deadStockNo, config }` to `{LABMON_BACKEND_URL}/api/v1/pc/sync`. |

### Commands

| Where | Command | Purpose |
|---|---|---|
| `backend/` | `npm run dev` | `tsx watch src/server.ts` |
| `backend/` | `npm run build` / `npm start` | Compile to `dist/` / run `dist/server.js` |
| `backend/` | `npm run typecheck`, `npm test` | `tsc --noEmit`; Node test runner via tsx with `_setup.ts` |
| `backend/` | `npm run seed:admin`, `seed:departments`, `seed:labs`, `seed` | Seed data |
| `backend/` | `npm run migrate:roles-statuses`, `migrate:users` | One-off data migrations |
| `frontend/` | `npm run dev` / `build` / `typecheck` / `lint` / `preview` | Vite dev server, production build (`tsc -b && vite build`), typecheck, oxlint, preview |
| `agent/` | `python collector.py` | Sync this PC's config |

### Configuration loading

- **Backend:** `server.ts` loads `.env` via `dotenv/config`. `src/config/env.ts` then parses `process.env` with a **zod schema** and exports a typed `env` object. Every other module imports `env` and none read `process.env` directly. Invalid or missing required values throw at startup. Template: `backend/.env.example`.
  - *Required:* `MONGO_URL`, `JWT_ACCESS_TOKEN`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_TOKEN`, `JWT_REFRESH_EXPIRY`.
  - *Defaulted:* `PORT` (8000), `CORS_ORIGIN` (`http://localhost:5173`), `NODE_ENV` (`development`).
  - *Optional groups:* SMTP/mail (`SMTP_*`, `MAIL_FROM`; OTP email is logged when `SMTP_HOST` is unset), OTP tuning (`OTP_*`), per-route rate limits (`RATE_LIMIT_*`, disabled when `NODE_ENV=test`), seed-only admin credentials (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).
  - `config/constants.ts` centralizes `ROLES` (`admin`, `hod`, `labIncharge`), `COMPLAINT_STATUS` (`SUBMITTED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), the escalation chain, and OTP settings.
- **Frontend:** Vite env. `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`) is read in `services/apiClient.ts`. Template: `frontend/.env.example`. The client uses `withCredentials: true` plus a `localStorage` access-token `Authorization` fallback, and a refresh-on-401 interceptor.
- **Agent:** plain environment variables: `LABMON_BACKEND_URL` (default `http://localhost:8000`) and `LABMON_SOFTWARE_ALLOWLIST` (comma-separated substrings, or `all`).

## Notes for readers

- **Port consistency:** backend, frontend and agent defaults now all point at port **8000**. Older docs that mention port 5000 are stale.
- **`CLAUDE.md` and `backend/Readme.md` are partly stale.** They still describe the Dean Infra level and the old `.js` layout, while the code is TypeScript with roles `admin | hod | labIncharge`. Prefer `backend/docs/` and the source.
- **Frontend and backend enums are mirrored by hand.** There is no shared package, so role and status constants must be kept in sync manually.
- **Work in progress:** `EquipmentPage`, `InventoryPage` and `RequestsPage` are placeholders, and the admin module (`/api/v1/admin/summary`) is new and uncommitted.

---

# Step 2 — Data & Logic Flow Analysis

## 1. Data Models & Entities

Five Mongoose models live in `backend/src/models/`. Every model has `timestamps: true`.

| Model | Key fields | Notes |
|---|---|---|
| **User** (`user.model.ts`) | `name`, `email` (unique, lowercase, validated), `password` (bcrypt via `pre('save')`), `role` (`admin`/`hod`/`labIncharge`), `department` → Dept (null for admin), `lab` → Lab (only for `labIncharge`), `isActive`, `tokenVersion`, `refreshToken` (hashed), `isEmailVerified`, OTP fields (`otp`, `otpExpiry`, `otpPurpose`, `otpAttempts`, `lastOtpSentAt`) | OTP fields are `select: false`, so they are only loaded when a query asks for them explicitly. `comparePassword()` is an instance method. |
| **Dept** (`department.model.ts`) | `name` (unique), `code` (uppercased) | Root of the org hierarchy. |
| **Lab** (`lab.model.ts`) | `name`, `labNumber?`, `department` → Dept, `incharge?` → User | Compound unique index `(department, name)`. |
| **Pc** (`pc.model.ts`) | `deadStockNo` (unique), `department` → Dept, `lab` → Lab, `purchaseDate?`, embedded `warranty {status: Active/Expired, expiryDate}`, embedded `config {cpu, ram, disk, os, software[], lastSyncedAt}` | `config` is the part the Python agent overwrites. Indexes: `(department, lab)` and `warranty.status`. |
| **Complaint** (`complaint.model.ts`) | `token` (unique, 8-char nanoid), `pc` → Pc, `department` → Dept, `lab` → Lab, `description`, embedded `raisedBy {name, contact}`, `status` (`SUBMITTED`/`ASSIGNED`/`IN_PROGRESS`/`RESOLVED`/`CLOSED`), `currentLevel` (`labIncharge`/`hod`), embedded `history[] {level, action, by → User, at, note}` | `department` and `lab` are denormalized copies from the PC at creation time, so scope filters don't need a join. `history` is an append-only audit trail. |

### Relationships

```
Dept 1──* Lab 1──* Pc 1──* Complaint
 │         │ └─ incharge ──► User (ref on Lab)
 │         └──────────────◄── User.lab   (labIncharge only)
 └───────────────────────◄── User.department   (hod, labIncharge; null for admin)

Complaint also holds direct refs to Dept and Lab (denormalized from its Pc),
and history[].by → User.
```

- **Referenced** (ObjectId + `ref`): User→Dept, User→Lab, Lab→Dept, Lab→User, Pc→Dept, Pc→Lab, Complaint→Pc/Dept/Lab, history.by→User. The only cross-model reads are `populate()` calls (for example `lab`/`department` names on complaints, and department/lab on the health card).
- **Embedded** (single document, no join): `Pc.warranty`, `Pc.config`, `Complaint.raisedBy`, `Complaint.history`.
- **Roles are data, not a collection.** `ROLES`, `COMPLAINT_STATUS` and `NEXT_LEVEL` (`labIncharge → hod`) are code constants in `config/constants.ts`. Complaint `status` and `currentLevel` are two independent axes: escalating changes only `currentLevel`, and resolving changes only `status`.
- **Not modelled:** the public complainant is not a user. Their name and contact are stored inline on the complaint, and they follow it using the token alone.

## 2. End-to-End Request Trace

### Primary trace — public complaint creation: `POST /api/v1/complaint`

This is the app's central write path. The caller needs no login.

| # | Layer | File | What happens |
|---|---|---|---|
| 1 | **Client** | `frontend/src/features/public-complaint/RaiseComplaintPage.tsx` → `services/complaintService.ts` → `apiClient` (axios) | The page can first call `GET /pc/lookup/:deadStockNo` (public) to confirm the PC exists. It then POSTs `{ deadStockNo, description, raisedBy: {name, contact} }` to `VITE_API_BASE_URL` + `/complaint`. |
| 2 | **Global middleware** | `backend/src/app.ts` | `helmet` → `cors` (origin `CORS_ORIGIN`, credentials) → `express.json` (10 MB) → `cookieParser` → `morgan`. The request is routed by the `/api/v1/complaint` prefix to `complaint.route.ts`. |
| 3 | **Rate limit** | `middlewares/rateLimiter.ts` → `complaintLimiter` | 20 requests per hour per client by default, from `RATE_LIMIT_COMPLAINT_*` env vars. Over the limit it returns 429 in the standard error envelope. It is skipped when `NODE_ENV=test`. |
| 4 | **Validation** | `middlewares/validate.middleware.ts` + `validators/complaint.validator.ts` (`raiseComplaintSchema`) | Zod parses `req.body`: `deadStockNo` trimmed and non-empty, `description` 1–2000 characters, `raisedBy.name` and `raisedBy.contact` non-empty. On failure it throws `ApiError(400, "Validation failed", [{field, message}])`. On success it **replaces** `req.body` with the parsed (trimmed, stripped) data. |
| 5 | **Controller** | `controllers/complaint.controller.ts` → `raiseComplaint` (wrapped in `asyncHandler`) | Calls `createComplaint(req.body)` and responds `201` with `new ApiResponse(201, complaint, "Complaint raised successfully")`. It contains no business logic. |
| 6 | **Service** | `services/complaint.service.ts` → `createComplaint` | `Pc.findOne({ deadStockNo })`. If not found, throws `ApiError(404, "PC not found")`. Generates `token = nanoid(8)`. |
| 7 | **DB write** | `Complaint.create({...})` | Inserts the complaint with `department` and `lab` copied from the PC, `status: SUBMITTED`, `currentLevel: labIncharge`, and a first history entry `{level: labIncharge, action: "created", by: null}`. Mongoose enforces `required`/`enum`, and the unique index on `token` guards collisions. |
| 8 | **Response** | `ApiResponse` envelope | `{ statusCode: 201, data: <complaint>, message, success: true }`. The UI shows the token. |
| 9 | **Later: tracking** | `GET /complaint/track/:token` → `trackComplaint` | Public. Returns only `token status currentLevel description createdAt` through a field-limited `select`, so staff, history and requester contact details are not exposed. |

**Any thrown error** (validation, 404, a Mongoose error) takes the same exit: `asyncHandler` catches the rejection → `next(err)` → `middlewares/error.middleware.ts` (see §3.4). Rate-limit rejections skip this path and respond directly from the limiter's handler, in the same envelope.

### Secondary trace — staff login → protected action

**Login: `POST /api/v1/auth/login`.** `loginLimiter` (10 per 15 min) → `validate(loginSchema)` → `login` controller → `auth.service.loginUser`:

1. `User.findOne({ email })`. If missing, 401 "Invalid email or password". The same message is used for a wrong password, so accounts can't be enumerated.
2. `user.comparePassword()` (bcrypt).
3. Rejects the login if `!isActive` (403) or `!isEmailVerified` (403).
4. `generateAccessToken` (JWT claims `id, role, department, tokenVersion`; expiry from `JWT_ACCESS_EXPIRY`, 15 min in the sample env) and `generateRefreshToken` (claim `userId`; `JWT_REFRESH_EXPIRY`, 7 days in the sample env).
5. Stores a **bcrypt hash of the SHA-256 digest of the refresh token** on the user. The SHA-256 step avoids bcrypt's 72-byte truncation.
6. Populates the department and lab names, then the controller sets both tokens as cookies and returns the user.

**Protected action — escalate a complaint: `PATCH /complaint/:id/escalate`.** The middleware chain is `auth` → `roleCheck(labIncharge, hod)` → `validate(objectIdParamSchema, 'params')` → controller → `escalateComplaint` service:

1. `Complaint.findById`. Missing → 404. Terminal status (`RESOLVED`/`CLOSED`) → 400.
2. `assertLabAccess(user, complaint.department, complaint.lab)`. HOD must match the department. Lab Incharge must match the department and the lab.
3. `user.role` must equal `complaint.currentLevel`, otherwise 403. Only the current owner can act.
4. `NEXT_LEVEL[currentLevel]`. A complaint already at HOD has no next level → 400.
5. Sets `currentLevel`, pushes a history entry `{level, action: "escalated", by: user.id}`, then `save()` and `populate()` of lab, department and `history.by` names.

## 3. Cross-Cutting Concerns

### 3.1 Authentication (AuthN)

- **Account lifecycle:** an **Admin creates staff** with `POST /auth/register`. That route is behind `auth` + `roleCheck(ADMIN)`, and `registerSchema` only accepts `hod` or `labIncharge`. Admin accounts come only from `npm run seed:admin`. Registration emails a 6-digit OTP, which is generated with `crypto.randomInt`, stored only as a hash, and expires in 10 minutes. `POST /auth/verify-email` checks it with an attempt lockout (`OTP_MAX_ATTEMPTS`, default 5). `POST /auth/resend-otp` has a cooldown (60 s default). Login issues tokens directly after the password check, with no login-time OTP.
- **Tokens:** a short-lived JWT access token plus a long-lived JWT refresh token, both set as **httpOnly, `sameSite: strict` cookies** (`secure` in production). The `auth` middleware also accepts `Authorization: Bearer <token>`.
- **Per-request verification (`middlewares/auth.middleware.ts`):** verify the JWT signature and expiry, then **re-load the user from MongoDB**. It checks that the user exists, that `isActive` is true (else 403), and that the token's `tokenVersion` equals the stored one (else 401). `req.user` is then populated **from the database**, not from the token. Role, department and lab changes therefore take effect immediately.
- **Revocation:** `logout` deletes the stored refresh token **and bumps `tokenVersion`**, which instantly invalidates every access token already issued. The `tokenVersion` comment in the model says deactivation and role changes are meant to bump it too, but I only verified the logout path.
- **Refresh:** `POST /auth/refresh-token` verifies the refresh JWT, compares it against the stored hash, then **rotates both tokens** and stores a new hash. A replayed old refresh token fails the hash comparison.
- **Frontend session:** `AuthProvider` calls `GET /auth/me` on mount to rehydrate `user` from the cookie, and it exposes `{ user, setUser, loading }`. `apiClient`'s response interceptor handles a 401 by sending one `POST /auth/refresh-token` (shared via `refreshPromise` so concurrent requests don't stampede) and then retrying the original request. It skips this for the auth endpoints themselves.

### 3.2 Authorization (AuthZ)

Three layers, from coarse to fine:

1. **Role gate**: `roleCheck(...roles)` returns 403 if `req.user.role` isn't in the allowed list. For example, `/admin/*` is `roleCheck(ADMIN)` for the whole router, and escalate/resolve are `labIncharge`/`hod`.
2. **Scope**: `utils/scope.ts` is the single place for the access-scoping rule.
   - `buildDepartmentScope` / `deptScope` middleware: admin is unscoped; everyone else is filtered by `{department}`. Used for PC search and the health card.
   - `buildLabScope` / `assertLabAccess`: admin unrestricted, HOD limited to their department, Lab Incharge limited to their department **and** lab.
   - `buildComplaintScope` (for `GET /complaint`): admin sees all; HOD sees only complaints in their department that are **currently at the HOD level**; Lab Incharge sees their department and lab.
3. **Ownership of workflow step**: escalate/resolve require `user.role === complaint.currentLevel`. This is enforced in the service layer, not by middleware.

- **Frontend gating** (`ProtectedRoute`, `constants/roles.ts`): no user redirects to `/login`; a wrong role redirects to `/forbidden`. This is UX only, and the backend enforces the real checks. The role constants are mirrored by hand between the two codebases.
- **Intentionally public routes:** `POST /complaint`, `GET /complaint/track/:token`, `GET /pc/lookup/:deadStockNo`, `GET /dept`, `POST /pc/sync` (agent), and the login, OTP and refresh routes.

### 3.3 Input validation

- **Layer 1, Zod schemas** (`validators/*.ts`) applied by the generic `validate(schema, target)` middleware to `body`, `params` or `query`. A failure produces `400 Validation failed` with a per-field `errors[]`. Schemas also normalise input (trim, lowercase emails). Covered: register/login/verify-email/resend-otp, PC sync, complaint create and resolve, and Mongo ObjectId path params (`common.validator.ts`).
- **Layer 2, Mongoose schema constraints**: `required`, `enum`, `unique`, and the email format check through `validator`.
- **Layer 3, semantic checks in services**: for example, "PC not found", "already verified", terminal-status checks, and department/lab name resolution.
- **Environment** is validated at boot with Zod (`config/env.ts`), as described in Step 1.
- **Abuse limits:** `express-rate-limit` on login, OTP verify, OTP resend, complaint create and PC sync, plus the 10 MB body limit.

### 3.4 Error handling

- **Throwing:** services and middleware throw `ApiError(statusCode, message, errors?)`. There are no per-controller try/catch blocks, because `asyncHandler` forwards every rejected promise to `next(err)`. The `auth` middleware wraps its body in try/catch and calls `next(err)` because it is an async middleware.
- **Single exit point (`error.middleware.ts`):** an `ApiError` is serialized as `{ success: false, statusCode, message, errors }` with its own status code. **Anything else** is logged with `console.error` and returned as a generic `500 "Internal Server Error"`, so internals don't leak.
- **Success envelope:** `ApiResponse(statusCode, data, message)` gives `{ statusCode, data, message, success }`, so clients can rely on one shape for both outcomes.
- **Rate-limit rejections** use the same error envelope, with status 429.
- **Frontend:** axios errors are surfaced by each page or service. The only global handling is the 401-refresh-retry interceptor.

### 3.5 State management

- **Server:** the process is effectively stateless. All state is in MongoDB, and sessions are JWT cookies plus the `refreshToken` hash and `tokenVersion` on the User row. The rate limiter uses express-rate-limit's default in-memory store, which is per process and resets on restart.
- **Client:** there is no state library, and `src/store/` is empty. The only global state is `AuthContext` (`user`, `loading`). Each feature page holds its own data with `useState`/`useEffect` and fetches through `services/*`. The `localStorage` `accessToken` is read by `apiClient` on each request and removed in `ComplaintsDashboard`, but I found no code that sets it.
- **Database:** consistency relies on single-document atomic writes. Complaint `history` is pushed within the same document as `status` and `currentLevel`, so a complaint's state and audit trail change together. The code uses no multi-document transactions.

## Observations from this pass

- **`POST /pc/sync` has no device authentication.** Anyone who knows or guesses a `deadStockNo` can overwrite that PC's config, and with `department` and `lab` supplied can create a new PC. It is rate limited and validated, but neither is a substitute for authentication. The repo docs list this as a known gap.
- **Health-card and search scope is department-level only.** `POST /pc/:id/health-card` and `GET /pc/search` use `deptScope`, which does not apply the lab filter. A Lab Incharge can therefore view PCs in other labs of their own department, while complaints are lab-scoped. Worth confirming this is intended.
- **The `localStorage` token fallback looks vestigial.** The cookie is the real credential, and the `Authorization` header fallback in `apiClient` only fires if something has stored `accessToken`, which I didn't find.

---

# Step 3 — Code Health & Refactoring Roadmap

> Audit date 2026-10-20, on branch `person-1` with uncommitted changes. Read-only: no source files were changed.
>
> **What I ran:** `npm run typecheck` (backend, passes), `npm run typecheck` and `npm run lint` (frontend, typecheck passes, lint gives 2 warnings), `npm audit --omit=dev` (backend and frontend), and `npm test` (backend, results below).
> **What I did not run:** the app itself, the agent, or the frontend build. Findings are from reading the code, so "Confirmed" means I saw it directly in code or tool output, and "Likely" means it needs checking.

## Overall assessment

The codebase is in good shape for its size (about 2,900 lines of backend source and tests). It has a clean routes → controllers → services → models layering, strict TypeScript on both sides, Zod validation, a centralized scope module, and a real authorization test matrix. The problems below are mostly **hardening and hygiene gaps** and a few places where the code and its docs have drifted. None call for a rewrite. The plan in §3 is incremental and keeps the API contract stable.

## 1. Architectural Weaknesses

### 1.1 Security (highest priority)

| # | Finding | Evidence | Impact |
|---|---|---|---|
| S1 | **Unauthenticated PC sync that can create or overwrite records.** `POST /pc/sync` takes only a `deadStockNo`. If `department` and `lab` are also supplied, it **creates** a PC and auto-creates the Lab. `config` is `z.record(z.string(), z.any())`, so any keys and value types are accepted. | `routes/pc.route.ts`, `validators/pc.validator.ts`, `services/pc.service.ts` (`syncPcConfig`, `resolveOrCreateLabId`) | Anyone who knows or guesses a dead-stock number can overwrite a PC's health card and pollute the inventory with fake PCs and labs. The 30/min rate limit is per IP and does not stop a patient attacker. Already known in the repo docs. |
| S2 | **Production dependency vulnerabilities.** Backend: **4 advisories (1 critical, 1 high, 2 moderate)**, including `qs` and `proxy-addr` (IP spoofing). Frontend: **1 high** (`axios`, redirect-based SSRF in the fetch adapter). All report "fix available via `npm audit fix`". | `npm audit --omit=dev` in `backend/` and `frontend/` | The `proxy-addr` issue matters directly because rate limiting keys on the client IP. The critical one wasn't named in the tail of the output I kept. Rerun `npm audit` for the full list. |
| S3 | **Rate limiting depends on the client IP, but `trust proxy` is never set.** `app.ts` doesn't configure it. | `app.ts`, `middlewares/rateLimiter.ts` | Behind a reverse proxy or PaaS, every client appears to share one IP. Either one abuser locks everyone out, or the limits are ineffective. The limiter store is in-memory, so limits also reset on restart and do not work across multiple instances. |
| S4 | **Several public endpoints have no rate limit.** `GET /complaint/track/:token`, `GET /pc/lookup/:deadStockNo`, `GET /dept` and `POST /auth/refresh-token` are unthrottled. | `routes/complaint.route.ts`, `routes/pc.route.ts`, `routes/auth.route.ts` | Tracking tokens are 8-character nanoids (about 48 bits). That is hard to guess, but nothing slows enumeration, and `lookup` lets anyone enumerate valid dead-stock numbers along with their department and lab. The track response is limited to status fields. |
| S5 | **Public `resend-otp` is not tied to the caller.** It lets anyone trigger an OTP email to any unverified account. | `services/auth.service.ts` (`resendOtp`), `routes/auth.route.ts` | Mitigated by a 60 s per-account cooldown and a per-IP limiter, but it can still be used to spam a staff member's inbox. Registration is now admin-only, so the exposure is small. |
| S6 | **Logout revocation is verified, but other revocation paths are not.** The `User.tokenVersion` comment says deactivation and role changes bump it too. I found the bump only in `logoutUser`. | `models/user.model.ts`, `services/auth.service.ts` | Deactivation is still enforced because `auth` re-checks `isActive` on every request, so that case is covered. A role change would only take effect by the same live DB lookup. The risk is low, but the comment overstates what the code does. |
| S7 | **Refresh does not re-check account state.** `refreshAccessToken` does not check `isActive` or `isEmailVerified` before minting new tokens. | `services/auth.service.ts` | A deactivated user can still obtain tokens, though the `auth` middleware then rejects them. Better to fail at refresh. |
| S8 | **The `sendOtpEmail` path emits the plaintext OTP on an in-process `EventEmitter` in all environments.** It exists so tests can read the code. | `utils/mailer.ts` (`otpEvents`) | No external exposure, but it is test scaffolding shipped in production code. If anything subscribes to it later, the OTP leaks. |
| S9 | **Global `10mb` JSON and urlencoded body limit.** | `app.ts` | Far larger than any endpoint needs (complaints cap at 2,000 characters). It makes unauthenticated memory pressure cheaper. |
| S10 | **`morgan("dev")` in all environments**, and Express 5's default error output. | `app.ts` | Dev-format request logs in production. No structured logging, no request IDs. |

### 1.2 Code smells, coupling and missing abstractions

| # | Finding | Evidence |
|---|---|---|
| C1 | **Behaviour and documentation disagree on OTP expiry.** `constants.ts` hard-codes `OTP_EXPIRY_MINUTES = 10`, while `env.ts` accepts `OTP_EXPIRY_MINUTES` and `mailer.ts` prints `env.OTP_EXPIRY_MINUTES \|\| 10` in the email. Setting the env var changes the email text but not the real expiry. |
| C2 | **Duplicated name→id resolution.** `pc.service.ts` has `resolveDepartmentId`, with a comment saying it mirrors the same pattern in `auth.service.ts` (`registerUser`), which does its own `Dept.findOne({ name })`. Lab resolution is similarly duplicated (`findOne` in auth, upsert in pc). These belong in a shared `dept`/`lab` service, and `dept.service.ts` is currently a 7-line stub. |
| C3 | **Controllers are thin, but services are untyped at the edges.** `searchPcs(req.query, ...)` takes `unknown` fields and re-validates by hand (`addRegexFilter`, `WARRANTY_STATUSES`, `ObjectId.isValid`) instead of using a Zod `query` schema through the existing `validate(schema, "query")`. This is the only input path that bypasses the validator layer. |
| C4 | **Inconsistent lab scoping.** `scope.ts` has `buildLabScope` and `assertLabAccess`, and complaints use them. PC search and the health card still use the department-only `deptScope`/`buildDepartmentScope`. A Lab Incharge sees every PC in their department. |
| C5 | **`buildDepartmentScope` and `buildLabScope` overlap.** Two near-identical builders plus `assertDepartmentAccess` (likely unused now) invite drift. |
| C6 | **Read-modify-write on complaints.** `escalate`/`resolve` do `findById`, check, mutate, `save()`. Two concurrent actions can both pass the "terminal status" and "current level" checks. A conditional `findOneAndUpdate({ _id, status: {$nin: TERMINAL}, currentLevel })` would make the transition atomic. |
| C7 | **Stale `new: true` option.** `Lab.findOneAndUpdate(..., { upsert: true, new: true })` sits next to `returnDocument: "after"` in the same service. Use the newer option consistently. |
| C8 | **Docs and code have diverged.** `CLAUDE.md` and `backend/Readme.md` still describe Dean Infra, the old statuses and `.js` files. `backend/docs/` is closer to the code, but `docs/PROJECT_AUDIT.md` (dated 2026-09-08) describes the pre-V1 model. `CLAUDE.md` is gitignored, so it can't be shared or reviewed. |
| C9 | **`backend/scripts/` is gitignored** (`scripts/` in `backend/.gitignore`), yet `package.json` defines `atlas:allow` pointing at `scripts/atlas-allowlist.mjs`. The script exists locally but is not tracked, so the command fails on a fresh clone. |
| C10 | **Mixed naming and style.** `PcHealthCard` (a PascalCase controller export) next to camelCase peers, `Pc` vs `Dept` abbreviations, and a `Readme.md`/`README.md` mix. Cosmetic, but it adds friction. |
| C11 | **`app.ts` has no `/health` endpoint**, no graceful shutdown, and `server.ts` swallows the connection error (`.catch(() => console.error(...))` without the error object or exit code), so a failed boot logs a message with no cause and the process may exit 0. (`connectDB` already calls `process.exit(1)` on failure, which masks this in practice.) |
| C12 | **No API versioning contract in code.** `docs/API_CONTRACT.md` is hand-maintained, and the frontend types in `types/domain.ts` and `constants/roles.ts` are hand-mirrored copies of backend enums and shapes. |

### 1.3 Frontend

| # | Finding | Evidence |
|---|---|---|
| F1 | **Session and token handling is split three ways**: the httpOnly cookie (real credential), a `localStorage.accessToken` fallback, and the `AuthContext` user. I found `getItem` and `removeItem` for `accessToken` but no `setItem`, so the fallback looks dead. | `services/apiClient.ts:13`, `features/complaints/ComplaintsDashboard.tsx:141` |
| F2 | **Large, mixed-concern components.** `ComplaintsDashboard.tsx` (351 lines) combines data fetching, filter state, stats derivation, logout, and layout. `PcSearchPage.tsx` is 301 lines. There are no data hooks (`useComplaints`, `usePcSearch`), and each page re-implements loading and error handling. |
| F3 | **Lint warnings**: `AuthProvider.tsx` exports a context alongside a component (breaks Fast Refresh), and `ComplaintsDashboard.tsx:45` calls `setState` inside an effect (extra render, derive instead). |
| F4 | **No client-side route code-splitting** and no error boundary. A render error blanks the app. |
| F5 | **No shared API types.** Response shapes are hand-typed (`types/api.ts`, `types/domain.ts`), so a backend change breaks the UI only at runtime. |
| F6 | **Placeholder pages** (`EquipmentPage`, `InventoryPage`, `RequestsPage`) are routed and linked but unimplemented. |

### 1.4 Agent (Python)

- No authentication or signing when posting to `/pc/sync` (see S1), and the default URL is `http://localhost:8000`, so nothing enforces HTTPS in deployment.
- Interactive `input()` prompts mean it cannot run unattended from a scheduler or startup script without passing the CLI arguments.
- No tests, no packaging, and the Windows-only software collector is untested on other platforms.

### 1.5 Redundant or questionable dependencies

- `validator` is used only for an email check on the User model, and `zod` already validates email at the API edge. One of the two is redundant.
- `nodemailer` is configured for Gmail SMTP in the example env. A real deployment will want a transactional mail provider with proper credentials, not a personal account.
- Not wrong, but worth a decision: `bcrypt` (native addon) vs `bcryptjs`/`argon2` for easier Windows and container builds.

## 2. Test Coverage

### 2.1 Existing setup

- **Runner:** Node's built-in test runner via `tsx`, with `src/tests/_setup.ts` preloaded. It starts an in-memory MongoDB (`mongodb-memory-server`) unless `MONGO_URL` is already set in the process environment. Tests drive the real Express app over HTTP, which makes them integration tests.
- **Suites (74 tests):** `auth` (21), `complaint` (20), `authz` (12), `pc.search` (11), `healthcard` (6), `pc` (4).
- **CI:** `.github/workflows/ci.yml` runs backend typecheck, build and tests against a `mongo:7` service, and frontend lint and build. The frontend has **no tests**, and the agent has no tests or CI job.
- **Coverage tooling:** none. There is no coverage script, even though `.gitignore` already reserves `coverage/`.

### 2.2 Result of running `npm test` locally

**72 of 74 pass.** The two failures are `register - creates a new, unverified user…` and `resend-otp - reissues an email-verification otp…`, which fail with a 500.

**Cause (confirmed from the output):** the tests send real mail. My local `backend/.env` has Gmail SMTP settings, `_setup.ts` loads that file, and nodemailer received `535 5.7.8 Username and Password not accepted` from Gmail. So **the suite is not hermetic**. With a real `SMTP_HOST` in `.env`, it makes network calls, can fail or hang, and could send real email. CI passes only because CI sets no SMTP variables. My first full run also stalled until my timeout killed it, probably for the same reason, but I did not confirm that.

### 2.3 Critical uncovered paths

Ranked by risk. I based this on the test names, not on coverage numbers, so a path may be partly covered.

| Priority | Uncovered path | Why it matters |
|---|---|---|
| High | **`POST /pc/sync` authorization boundary.** Tests cover happy path and 404s only (4 tests). | This is the largest open security gap (S1). Add tests that pin down today's behaviour, then fail them when device auth lands. |
| High | **Concurrent escalate/resolve** (C6). | The state machine's only race. |
| High | **Rate limiting** (all limiters are disabled under `NODE_ENV=test`). | Login, OTP and complaint throttles have no automated test, so they can regress silently. |
| High | **OTP lockout and cooldown.** Both are skipped under `NODE_ENV=test` in the service (`!isTestEnv`). | The brute-force protections for the 6-digit code are untested by design. Inject the clock/config instead of branching on the environment. |
| High | **Refresh edge cases**: refresh for a deactivated or unverified user (S7), and refresh after logout. | Only rotation and replay are covered. |
| Medium | **Admin summary endpoint** (`/admin/summary`) correctness. The tests check only the role matrix (200/403/401), not the counts. | New, uncommitted code. |
| Medium | **Complaint validation boundaries**: description over 2,000 characters, empty `raisedBy`, malformed ObjectId params on escalate/resolve. | Validation schemas have only incidental coverage. |
| Medium | **`GET /pc/lookup`, `GET /dept`, `GET /auth/me`.** | Public and session endpoints with no dedicated tests. |
| Medium | **Lab scoping for PC search and health card.** | Tests assert department isolation, but nothing asserts same-department/different-lab behaviour, so C4 has no safety net either way. |
| Medium | **Env validation** (`config/env.ts` throws on bad config) and the seed and migration scripts. | Scripts that touch production data (`migrateRolesAndStatuses`, `migrateUsers`) have no tests. |
| Low | **Frontend**: no unit or component tests for `ProtectedRoute`, `apiClient`'s refresh interceptor, or the dashboards. No end-to-end flow test (raise → track → escalate → resolve). | The interceptor is subtle (shared promise, retry flag) and worth a focused test. |
| Low | **Agent**: collector parsing and payload building. | Pure functions that are easy to test. |

## 3. Prioritized Refactoring Plan

Ordered so each step is safe to ship alone and earlier steps de-risk later ones. Effort: **S** under half a day, **M** one to two days, **L** several days.

### Phase A — Stabilize (do first)

- [ ] **A1. Make the test suite hermetic (S).** In `_setup.ts`, force `SMTP_HOST` to be empty when `NODE_ENV=test`, or make `mailer.ts` skip transport under `isTestEnv`. Re-run: expect 74/74 locally. *Fixes the 2 failures and prevents accidental real mail.*
- [ ] **A2. Fix dependency advisories (S).** `npm audit fix` in `backend/` and `frontend/`, then run typecheck, tests and build. Review any `--force` suggestion by hand. Add `npm audit --omit=dev --audit-level=high` as a CI step.
- [ ] **A3. Commit the in-flight work (S).** The tree has about 30 modified or untracked files (admin module, authz tests, OTP removal on the frontend). Split into focused commits so later refactors have a clean base.
- [ ] **A4. Reconcile docs (S).** Update `CLAUDE.md` to the V1 model (3 roles, no Dean Infra) and un-ignore it if you want it shared. Mark `docs/PROJECT_AUDIT.md` as historical. Fix the `tokenVersion` comment (S6) and track `backend/scripts/` or remove the `atlas:allow` script (C9).

### Phase B — Close security gaps

- [ ] **B1. Set `trust proxy` correctly (S).** Make it an env setting (`TRUST_PROXY`), and document the value per deployment. Without it, S3 persists.
- [ ] **B2. Add limiters to the unthrottled public routes (S).** `track`, `lookup`, `refresh-token`. Use tight limits on `track` and `lookup`.
- [ ] **B3. Lower body limits (S).** Use `100kb` globally and a higher limit only on `/pc/sync` if the software list needs it (the agent has `measure_payload.py` for sizing).
- [ ] **B4. Authenticate the agent (M–L).** Options, simplest first:
  1. A per-PC (or per-lab) shared secret, stored hashed, sent in a header.
  2. A one-time enrollment code issued by Admin, exchanged for a device token.
  3. mTLS or signed payloads, if the deployment justifies it.
  Also stop the endpoint **creating** PCs and labs unless the request is authenticated. Split provisioning (Admin) from sync (device). Replace `config: z.record(z.any())` with a strict schema (`cpu`, `ram`, `disk`, `os`, `software[]` with length limits).
- [ ] **B5. Harden the refresh path (S).** Reject refresh when the user is inactive or unverified (S7), and consider rate limiting per account as well as per IP.
- [ ] **B6. Move the OTP test hook out of production code (S).** Replace `otpEvents` with a pluggable mailer (`setMailer()` in tests, or a stub transport) (S8).
- [ ] **B7. Structured logging (S–M).** Replace `morgan("dev")` with `pino-http` (or morgan with a production format), add a request ID, and keep the generic 500 body.

### Phase C — Remove duplication and tighten the backend

- [ ] **C-1. Extract a `dept`/`lab` resolver service (S–M).** One `resolveDepartment(name)` and `resolveLab(name, deptId, { create })`, used by auth and PC. Keep error messages identical so tests still pass (C2).
- [ ] **C-2. Fix OTP expiry config (S).** Read `OTP_EXPIRY_MINUTES` from `env` in one place and use it for both the stored expiry and the email text (C1). Add a test.
- [ ] **C-3. Inject time and config instead of `isTestEnv` branches (M).** Give `auth.service` an options or clock parameter for cooldown and attempt limits so the lockout paths run under test (§2.3).
- [ ] **C-4. Zod schema for `GET /pc/search` (S).** Use `validate(searchPcSchema, "query")`, and drop the hand-rolled checks (C3).
- [ ] **C-5. Apply lab scope to PC search and the health card (S–M).** Decide the policy first (see Open question 1), then switch `deptScope` to a lab-aware scope for Lab Incharge. Add the missing same-department/different-lab tests before changing behaviour.
- [ ] **C-6. Make escalate/resolve atomic (S).** Conditional `findOneAndUpdate` with `$push` for the history entry (C6). Add a concurrency test.
- [ ] **C-7. Consolidate scope helpers (S).** Remove unused ones (`assertDepartmentAccess` if confirmed unused) and make `buildLabScope` the single builder (C5).
- [ ] **C-8. Housekeeping (S).** Use `returnDocument` consistently (C7), drop `validator` in favour of Zod or vice versa, surface the connection error in `server.ts` and exit non-zero, and add `/health` and graceful shutdown (C11).

### Phase D — Test depth

- [ ] **D1. Add coverage reporting (S).** `node --test --experimental-test-coverage`, or `c8`. Publish the number in CI and set a modest floor (for example 80% lines on `services/` and `middlewares/`).
- [ ] **D2. Fill the High-priority gaps from §2.3 (M).** `pc/sync` boundary, rate-limit behaviour (enable limiters in a dedicated test with tiny limits), OTP lockout and cooldown, refresh edge cases, concurrent complaint actions.
- [ ] **D3. Frontend tests (M).** Add Vitest and Testing Library. Start with `ProtectedRoute`, the `apiClient` refresh interceptor (single refresh, retry once, no loop on auth endpoints), and `ComplaintsDashboard` role behaviour.
- [ ] **D4. One end-to-end happy path (M).** Playwright: raise complaint → track → lab incharge escalates → HOD resolves. Run against the in-memory DB in CI.
- [ ] **D5. Agent tests (S).** `pytest` for `_name_matches`, `_clean_software_name`, `build_payload`, and a mocked `requests.post`. Add a CI job.

### Phase E — Frontend cleanup

- [ ] **E1. Remove the dead `localStorage` token path (S)** after confirming no code sets it (F1), leaving cookies as the only credential.
- [ ] **E2. Extract data hooks (M).** `useComplaints`, `usePcSearch`, with shared loading and error state. Split `ComplaintsDashboard` into container, stats, table and header (F2).
- [ ] **E3. Fix the lint warnings (S).** Move `AuthContext` to its own file, and derive state instead of setting it in an effect (F3).
- [ ] **E4. Add an error boundary and lazy-load route modules (S–M)** (F4).
- [ ] **E5. Share API types (M–L).** Either generate types from Zod schemas (export the backend validators and response types into a small shared package), or generate an OpenAPI document from the Zod schemas and derive the frontend types from it. This removes the hand-mirrored enums and shapes (C12, F5).
- [ ] **E6. Decide the fate of the placeholder pages (S)**: build them or remove the routes and nav links (F6).

### Phase F — Modernize and operate

- [ ] **F1. Deployment basics (M).** Dockerfiles for backend and frontend, a `docker-compose.yml` with MongoDB for local dev, and an env-var checklist per environment. (The repo currently has no deployment automation.)
- [ ] **F2. Agent packaging (M).** Non-interactive config file or env vars, a scheduled-task or service installer for Windows, retry with backoff, and HTTPS-only enforcement outside localhost.
- [ ] **F3. Monorepo tooling (optional, M).** If E5 is adopted, move to npm workspaces so `backend`, `frontend` and a `shared` package build and test together, with one CI pipeline.
- [ ] **F4. Mail provider (S).** Replace personal-account SMTP with a transactional provider and rotate any credentials that were ever used in a local `.env` shared outside your machine.

### Suggested order of execution

`A1 → A2 → A3 → A4` (stabilize), then `B1 → B2 → B3` (cheap security wins), `C-2`, `C-4`, `C-6` (small correctness fixes), `D1 → D2` (so the next changes are covered), then `B4` with `C-5` (the two behaviour changes), and finally E, F and the remaining C items.

## Open questions for you

1. **Lab scope for PC data:** should a Lab Incharge see only their own lab's PCs, or the whole department's? Complaints are already lab-scoped, which suggests the former, but the current PC code does the latter.
2. **Agent identity:** is a per-lab shared secret enough for the agent, or do you need per-PC identity? This decides the size of B4.
3. **Admin-created PCs:** should PCs ever be created by the agent, or only by Admin with the agent restricted to updating existing ones? The second option removes most of the S1 risk.
4. **Shared-types investment (E5):** is a shared package or OpenAPI worth the setup cost for a project of this size, or should the hand-mirrored types stay with better tests?
