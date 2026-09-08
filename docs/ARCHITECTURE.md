# ARCHITECTURE.md

**Status:** current (as-built) architecture, captured in Phase 0 on 2026-09-08.
Update this file whenever architecture or behavior changes (PRD §27).
Target-state deltas required by the PRD are marked **[TARGET]**.

---

## 1. System overview

LABMON is three independently deployed runtimes with no shared package:

| Runtime | Path | Stack | Role in V1 |
|---|---|---|---|
| Backend API | `backend/` | Node.js, Express 5, TypeScript (strict, `NodeNext`), Mongoose 9, MongoDB (Atlas) | Everything: auth, complaints, org data, admin |
| Frontend SPA | `frontend/` | React 19, Vite 8, TypeScript (strict), React Router 7, axios | Public complaint/track pages + staff dashboards |
| Collector agent | `agent/` | Python 3, `psutil`, `requests` | **Out of scope for V1** (PRD §3). Present, untouched. |

```
              Public browser                     Staff browser (SPA)
             /  raise  \  track                  AuthProvider · ProtectedRoute
              \________/                          axios apiClient (cookie + Bearer, 401→refresh)
                  │                                        │
                  ▼                                        ▼
        ┌──────────────────────────────────────────────────────────┐
        │  Express 5   (base path /api/v1)                          │
        │  helmet → cors(credentials) → json → urlencoded →         │
        │  cookieParser → morgan → routers → errorHandler           │
        │                                                          │
        │  /auth   /pc   /complaint   /dept   [TARGET: /admin, …]   │
        │                                                          │
        │  route → (rateLimit) → (validate zod) → (auth jwt) →      │
        │          (roleCheck) → (deptScope[/labScope TARGET]) →    │
        │          controller → service → Mongoose model           │
        └───────────────────────────┬──────────────────────────────┘
                                    │ Mongoose 9
                     MongoDB: users · depts · labs · pcs · complaints
                                    │
                     Gmail SMTP (nodemailer) — OTP email   [TARGET: remove or gate, D2]
```

---

## 2. Backend

### 2.1 Startup chain
`src/server.ts` → `import "dotenv/config"` → `connectDB()` (`src/config/db.config.ts`, `mongoose.connect(env.MONGO_URL)`, `process.exit(1)` on failure) → `app.listen(env.PORT)`.
`src/config/env.ts` parses & validates `process.env` with Zod **at import time** — a missing required var throws before the server binds.

### 2.2 Layering & conventions
```
routes/         URL + middleware order only. One router per resource, mounted in app.ts.
middlewares/    Cross-cutting gates: auth, roleCheck, deptScope, validate, rateLimiter, error.
controllers/    Thin. Wrapped in asyncHandler. Read req → call ONE service fn → res.json(new ApiResponse(...)).
services/       ALL business logic + ALL Mongoose calls. Take plain args, return plain data, throw ApiError.
models/         Mongoose schemas: fields, enums, indexes, hooks, instance methods.
validators/     Zod schemas (shape/type only). Consumed solely by validate.middleware.
utils/          ApiError, ApiResponse, asyncHandler, tokenGeneration, scope, requireAuth, otp, mailer.
config/         constants.ts (enums/lookups), env.ts (typed env), db.config.ts.
types/          auth.ts, mongo.ts, express.d.ts (augments Express.Request with user?, scope?).
```

**Response envelope**
- Success: `ApiResponse(statusCode, data, message)` → `{ statusCode, data, message, success: true }`.
- Error: `ApiError(statusCode, message, errors?)` → caught by `errorHandler` → `{ success:false, statusCode, message, errors }`. Unknown errors → `console.error` + generic `500` (no stack to client — PRD §21 ✔).

**Async errors:** every controller is `asyncHandler(...)`; Express 5 also auto-forwards rejected promises.

### 2.3 Authentication (KEEP — PRD §15)
- **Access JWT**: claims `{ id, role, department }`, secret `env.JWT_ACCESS_TOKEN`, expiry `env.JWT_ACCESS_EXPIRY` (`15m`). Sent as `accessToken` httpOnly cookie or `Authorization: Bearer`.
- **Refresh JWT**: claims `{ userId }`, secret `env.JWT_REFRESH_TOKEN`, expiry `7d`. `SHA-256 → bcrypt` hash stored on `User.refreshToken`.
- **Rotation**: `POST /auth/refresh-token` verifies the refresh JWT, compares the stored hash, issues a **new pair**, overwrites the stored hash.
- **Logout**: clears `User.refreshToken` + both cookies. **Access token stays valid until expiry** (known gap S4).
- Cookies: `httpOnly`, `sameSite:"strict"`, `secure: isProduction`, `maxAge` derived from the expiry string via `parseExpiryToMs`.
- `auth` middleware verifies the access token and sets `req.user: AuthTokenPayload`.

**[TARGET]** add `User.tokenVersion` (claim + check) so deactivation / role change / logout can invalidate live access tokens (S4); enforce `User.isActive` (S2).

### 2.4 Authorization
- `roleCheck(...roles)` — 403 unless `req.user.role` ∈ roles.
- `deptScope` — sets `req.scope = buildDepartmentScope(req.user)`; mounted only on `/pc` routes today.
- `src/utils/scope.ts` — **single source of truth**:
  - `buildDepartmentScope` → `{}` for `admin`/`deanInfra`, else `{ department }`.
  - `assertDepartmentAccess` → throws 403 on cross-department mutation.
  - `buildComplaintScope` → per-role complaint list filter (admin all; deanInfra `currentLevel:deanInfra`; hod `{department, currentLevel:hod}`; labIncharge `{department}`).
- **No lab scoping exists.** **[TARGET]** add `buildLabScope` / `labScope` middleware and use it for Lab Incharge everywhere (PRD §13, §18 — "mandatory").

### 2.5 Validation & abuse protection
- `validate(schema, "body"|"params"|"query")` — Zod `safeParse`; on failure `ApiError(400,"Validation failed",[{field,message}])`; on success **replaces `req[target]`** with parsed/normalized data.
- Schemas: `auth.validator` (login, verify-email, resend-otp), `complaint.validator` (raise, resolve), `pc.validator` (sync), `common.validator` (`objectIdParamSchema`). **`register` is intentionally unvalidated** (tied to its open access-control gap).
- `express-rate-limit` (`rateLimiter.ts`): `loginLimiter`, `otpVerifyLimiter`, `otpResendLimiter`, `complaintLimiter`, `pcSyncLimiter`. All **skipped when `NODE_ENV=test`**. `refresh-token` has **no** limiter (S7).
- `helmet()` first; CORS locked to `env.CORS_ORIGIN` with `credentials:true`.

### 2.6 Routers (as-built)
`/api/v1/auth`, `/api/v1/pc`, `/api/v1/complaint`, `/api/v1/dept`. Full endpoint list in `API_CONTRACT.md`.
**[TARGET]** add `/api/v1/admin/*` (dashboard + HOD/Lab-Incharge CRUD), `/api/v1/dept/:id/labs` (or `/api/v1/lab*`), aggregation endpoints for HOD/Lab-Incharge dashboards. PRD §20's role-prefixed layout (`/api/hod/*`) is **not** adopted — resource routes + in-service scoping stay (PRD §20 permits adapting to existing conventions).

### 2.7 Tests
`node --test` with `tsx` (`npm test`), files in `src/tests/` (`auth`, `complaint`, `healthcard`, `pc`, `pc.search`). They boot the **real** app in-process (`app.listen(0)`), hit it with `fetch`, use the **real** `MONGO_URL`, mint access tokens directly via `generateAccessToken`, and clean up created docs in `after()`. CI runs `typecheck` → `build` → `test` against a `mongo:7` service container.

---

## 3. Frontend

### 3.1 Composition
`main.tsx` → `App.tsx` = `<BrowserRouter><AuthProvider><AppRoutes/></AuthProvider></BrowserRouter>`.

### 3.2 Routing (`src/app/routes.tsx`)
- Public: `/` and `/raise-complaint` → `RaiseComplaintPage`; `/track-complaint` → `TrackComplaintPage`; `/login` → `AuthPage`.
- Protected (via `<ProtectedRoute allowedRoles>`): `/lab-incharge`, `/hod`, `/dean-infra`, plus `/laboratories`, `/equipment`, `/inventory`, `/requests` (last three are stubs).
- `*` → redirect to `/raise-complaint`.
- **[TARGET]** rename to PRD §7/§30: `/admin-login`, `/hod-login`, `/labincharge-login`, `/admin-dashboard`, `/hod-dashboard`, `/labincharge-dashboard` (login pages can share one component keyed by role); add an Admin dashboard; keep `deanInfra` routes only if D1=keep.

### 3.3 Auth state
`AuthProvider` holds `{ user, setUser, loading }`; on mount calls `GET /auth/me` to rehydrate from the httpOnly cookie. `ProtectedRoute` renders `null` while `loading`, redirects to `/login` if unauthenticated or wrong role (**[TARGET]** distinct 403 view — M15). No proactive refresh loop; the axios interceptor handles expiry.

### 3.4 API layer
`src/services/apiClient.ts` — one axios instance: `baseURL = VITE_API_BASE_URL || "http://localhost:8000/api/v1"`, `withCredentials:true`, request interceptor adds `Bearer` from `localStorage.accessToken` if present, response interceptor catches `401` → single shared `POST /auth/refresh-token` → retry original (skipped for `/auth/*` endpoints). Per-resource wrappers: `authService`, `complaintService`, `pcService`, `deptService`.

### 3.5 Shared UI
`components/common/`: `ProtectedRoute`, `DetailModal` (overlay/header/close shell used by 3 modals), `OtpInput`.
`features/complaints/`: `ComplaintsDashboard` (list + client-side stats via `Donut` + status filter + search + detail/resolve modals) — shared by `LabInchargeHome`, `HodHome`, `DeanInfraHome`. `canAct` = `currentLevel === role && status !== "Resolved"`; `canEscalate` = `canAct && role !== deanInfra`; Dean Infra view adds a Department column.
`utils/formatDate.ts`, `types/api.ts` (`ApiResponse<T>`, `getApiErrorMessage`), `types/domain.ts` (all DTOs).

### 3.6 Constants sync
`src/constants/roles.ts` + `routes.ts` are **hand-mirrored** from `backend/src/config/constants.ts`. No shared package. **[TARGET]** add a CI parity check or a generated file (Risk in `PROJECT_AUDIT.md` §12).

---

## 4. Data architecture (summary — full detail in `DATABASE.md`)

MongoDB via Mongoose 9. Collections: `users`, `depts`, `labs`, `pcs`, `complaints`.
- Embedded (no own collection): `Pc.config`, `Pc.warranty`, `Complaint.raisedBy`, `Complaint.history[]`.
- References: `User.department`, `Lab.department`, `Lab.incharge`, `Pc.department|lab`, `Complaint.pc|department|lab`, `Complaint.history[].by`.
- `Complaint.department` + `lab` are **denormalized from the PC at creation** for join-free scoping.
- `timestamps:true` everywhere. Indexes: unique on `User.email`, `Dept.name`, `Pc.deadStockNo`, `Complaint.token`; compound `Pc {department,lab}` + `Pc {"warranty.status"}`.

**[TARGET]** `User.isActive`, `User.lab`, `User.tokenVersion`; `Lab.labNumber` + unique `{department,name}`; `Complaint.deadStockNo` (string, required) + `pc` optional + reworked `status`/`currentLevel` enums + `assignedTo`; new `audit_logs` collection. See `PROJECT_AUDIT.md` §8 and `DATABASE.md`.

---

## 5. Environment configuration

**Backend** (`backend/.env.example`, Zod-validated in `env.ts`):
`NODE_ENV`, `PORT`(8000), `MONGO_URL`(required), `CORS_ORIGIN`(default `http://localhost:5173`), `JWT_ACCESS_TOKEN`/`JWT_ACCESS_EXPIRY`/`JWT_REFRESH_TOKEN`/`JWT_REFRESH_EXPIRY` (all required), optional `SMTP_*` / `MAIL_FROM`, optional `OTP_*`, optional `RATE_LIMIT_*`.
`.env` and `.env.*` are gitignored (root + `backend/`), `!.env.example` kept.

**Frontend:** only `import.meta.env.VITE_API_BASE_URL` is read. **No `frontend/.env.example` exists — add one (M18).**

**[TARGET]** add `ADMIN_EMAIL` / `ADMIN_PASSWORD` (secure admin seed, D2/M12). If D2 removes OTP, drop `SMTP_*` / `OTP_*`.

---

## 6. Build / run / CI

| | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Dev | `npm run dev` (`tsx watch src/server.ts`) | `npm run dev` (Vite) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | `npm run typecheck` (`tsc -b`) |
| Build | `npm run build` (`tsc -p tsconfig.build.json` → `dist/`) | `npm run build` (`tsc -b && vite build`) |
| Start (prod) | `npm start` (`node dist/server.js`) | `npm run preview` |
| Lint | none (Prettier only) | `npm run lint` (`oxlint`) |
| Test | `npm test` (`node --import tsx --test src/tests/**/*.test.ts`) | none yet |
| Seed | `npm run seed`, `npm run seed:departments` | — |

CI (`.github/workflows/ci.yml`, push/PR to `main`, Node 22): backend job (mongo:7 service → `npm ci` → `typecheck` → `build` → `test`) + frontend job (`npm ci` → `lint` → `build`).
**[TARGET]** add `seedAdmin` / `seedLabs` / migration scripts; add frontend tests to CI at Phase 10.

---

## 7. Known architectural gaps (carried from `backend/docs/known-issues.md` + Phase 0)

- Access-token claims (`role`, `department`) never re-checked mid-session; logout doesn't revoke the access token (S4).
- Login brute-force protection is per-IP only (S5); no `trust proxy` (S6); `/refresh-token` unthrottled (S7).
- `POST /register` has no access control — self-register as `admin` (S1 / D2).
- `POST /pc/sync` has no device auth (S8 — asset system, out of V1 scope).
- No lab-level authorization (S3 / PRD §13).
- `POST /pc/:id/health-card` is a `POST` for a pure read (cosmetic).
- Frontend/backend enum drift risk (no shared package).
