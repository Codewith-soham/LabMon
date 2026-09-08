# PROJECT_AUDIT.md — Phase 0: Existing Project Audit

**Date:** 2026-09-08
**Auditor:** Claude (Phase 0, per `prd.md` §PHASE 0 and §31)
**Repo state:** branch `main`, clean working tree (only `prd.md` untracked, `currentSystem.md` / `task.md` deleted).
**Scope of this document:** inspect the existing repo, compare it against `prd.md`, and produce a concrete, phase-ordered modification plan. **No implementation is done in this phase.**

---

## 0. TL;DR

LABMON already contains a **working, well-structured MERN complaint system in TypeScript** (Express 5 + Mongoose 9 backend, React 19 + Vite frontend, both strict TS). Auth, department-scoped RBAC, a public complaint + tracking flow, a role dashboard, validation, rate limiting and CI all exist and pass.

However, the current system was built around a **different domain model** than the PRD describes:

| Area | Current | PRD wants |
|---|---|---|
| Roles | `admin`, `labIncharge`, `hod`, `deanInfra` (4) | `ADMIN`, `HOD`, `LAB_INCHARGE` (3) |
| Escalation chain | Lab Incharge → HOD → **Dean Infra** | Lab Incharge → HOD (Admin/Infra is top) |
| Complaint status | `Open` / `Escalated_HOD` / `Escalated_Dean` / `Resolved` | `SUBMITTED` / `ASSIGNED` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` |
| Complaint identity | needs a pre-existing `Pc` doc; token = bare `nanoid(8)` | dead-stock **string** only, no asset record required; token = `LM-IT-8F42K7` style |
| Public form | dead-stock + description + name + contact (dept/lab auto-derived) | dead-stock + **Department dropdown** + **Lab dropdown** + reason |
| Staff onboarding | public self-registration + email OTP (any role, incl. admin) | Admin seeded securely; Admin **creates** HODs & Lab Incharges; no public staff registration |
| Admin dashboard / user CRUD | **does not exist** | full staff-management dashboard |
| Account deactivation (`is_active`) | **no field, not enforced** | required (§15, §16) |
| Lab scope on users | `User` has `department` only, no `lab` | Lab Incharge needs `labId` (§13) |
| Labs | auto-created ad-hoc during PC sync, no numbers, no CRUD | seeded IT Labs 9–14, Admin-managed |
| Agent / PC sync / asset system | present and wired | **explicitly out of scope for V1** (§3) — leave untouched |

There are **4 genuine architectural decisions** that need your confirmation before Phase 1 — see §7 and the end of this document.

---

## 1. Current Architecture

### 1.1 Runtimes (3, independent — no monorepo tooling)

```
labmon/
├── backend/    Node.js + Express 5 + TypeScript (strict) + Mongoose 9 → MongoDB (Atlas)
├── frontend/   React 19 + Vite 8 + TypeScript (strict) + React Router 7 + axios
└── agent/      Python 3 collector (psutil/requests)  ── OUT OF SCOPE for V1 ──
```

Each folder has its own `package.json` / `requirements.txt`, installed and run separately.
Both `backend/` and `frontend/` were migrated to **strict TypeScript** on 2026-09-08 (commits `524d56f`, and the backend migration before it). `CLAUDE.md` still narrates the old `.js` layout in places and is **gitignored** — treat `backend/docs/` + code as truth.

### 1.2 Backend architecture

**Entry chain:** `src/server.ts` → `import "dotenv/config"` → `connectDB()` (`src/config/db.config.ts`) → `app.listen` on the app from `src/app.ts`.

**App middleware order** (`src/app.ts`): `helmet()` → `cors({ origin: env.CORS_ORIGIN, credentials: true })` → `express.json({limit:"10mb"})` → `express.urlencoded` → `cookieParser()` → `morgan("dev")` → routers → `errorHandler`.

**Routers mounted under `/api/v1`:** `auth`, `pc`, `complaint`, `dept`.

**Layering:** `routes → middlewares → controllers → services → models`.
- Controllers wrapped in `asyncHandler` (`src/utils/asyncHandler.ts`); thin — call one service fn, wrap result in `ApiResponse`.
- All business logic + all Mongoose access lives in **services**.
- Errors: `throw new ApiError(statusCode, message, errors?)`; single `errorHandler` middleware formats `{ success:false, statusCode, message, errors }` and 500s unknown errors.
- Success envelope: `new ApiResponse(statusCode, data, message)` → `{ statusCode, data, message, success:true }`.

**Config / typing:**
- `src/config/env.ts` — Zod-validated typed view of `process.env`; **fails loudly at startup** on missing required vars. Exports `env`, `isTestEnv`, `isProduction`.
- `src/config/constants.ts` — `ROLES`, `COMPLAINT_STATUS`, `NEXT_LEVEL`, `STATUS_FOR_LEVEL`, `OTP_*`; derived TS types (`Role`, `ComplaintLevel`, `ComplaintStatus`).
- `src/types/` — `auth.ts` (`AuthTokenPayload`, `RefreshTokenPayload`), `express.d.ts` (augments `Request` with `user?`, `scope?`), `mongo.ts` (`MongoFilter`).
- `tsconfig.json` — `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. `tsconfig.build.json` for `tsc` emit to `dist/`.

**Auth mechanism (keep — PRD §15 "use existing if secure and suitable"):**
- JWT access token (`{ id, role, department }`, `JWT_ACCESS_EXPIRY` default `15m`) + refresh token (`{ userId }`, `7d`), both as `httpOnly, sameSite:strict, secure(in prod)` cookies.
- `auth` middleware accepts `Authorization: Bearer` **or** `accessToken` cookie.
- Refresh token: **rotated** on every `/refresh-token`; a `SHA-256→bcrypt` hash stored on `User.refreshToken` (revocable on logout).
- Passwords hashed by a `pre("save")` bcrypt hook on `User`.

**Cross-cutting middlewares:** `auth`, `roleCheck(...roles)`, `deptScope` (sets `req.scope` from `buildDepartmentScope`), `validate(zodSchema, target)`, rate limiters (`loginLimiter`, `otpVerifyLimiter`, `otpResendLimiter`, `complaintLimiter`, `pcSyncLimiter` — all skipped when `NODE_ENV=test`).

**Access-scoping (single source of truth — `src/utils/scope.ts`):**
- `buildDepartmentScope(user)` — `{}` for `admin`/`deanInfra`, else `{ department: user.department }`.
- `assertDepartmentAccess(user, dept, msg)` — throws 403 on cross-department.
- `buildComplaintScope(user)` — admin: `{}`; deanInfra: `{ currentLevel: deanInfra }`; hod: `{ department, currentLevel: hod }`; labIncharge: `{ department }`.
- **No lab-level scoping anywhere** (PRD §13 requires it for Lab Incharge).

### 1.3 Frontend architecture

- `src/main.tsx` → `src/app/App.tsx` (`<BrowserRouter><AuthProvider><AppRoutes/>`).
- `src/app/routes.tsx` — all routes; protected ones wrapped in `<ProtectedRoute allowedRoles={[...]}>`.
- `src/app/providers/AuthProvider.tsx` — `{ user, setUser, loading }` context; rehydrates via `GET /auth/me` on mount. No token-refresh-on-expiry beyond the axios interceptor.
- `src/components/common/ProtectedRoute.tsx` — redirects to `/login` if `!user` or role not allowed.
- `src/services/apiClient.ts` — axios instance, `withCredentials`, `Bearer` fallback from `localStorage.accessToken`, **response interceptor** that on 401 calls `/auth/refresh-token` **once** (shared promise) and retries; skips the retry for auth endpoints.
- `src/services/*Service.ts` — `authService`, `complaintService`, `pcService`, `deptService`.
- `src/constants/roles.ts` + `routes.ts` — **hand-mirrored** from backend enums (no shared package).
- `src/features/` — feature folders (see §3).
- `src/types/` — `domain.ts` (all API DTOs), `api.ts` (`ApiResponse<T>`, `getApiErrorMessage`), `axios.d.ts`.
- `src/store/` — empty; no state library.
- Lint: `oxlint`. Build: `tsc -b && vite build`.

### 1.4 Diagram — what exists today

```
 Lab PC agent ─POST /pc/sync─┐            Browser (React SPA)
 (OUT OF SCOPE V1)           │            AuthProvider · ProtectedRoute · axios(apiClient)
                             ▼                     │ withCredentials + 401→refresh→retry
                    ┌────────────────────────────────────────────────┐
                    │  Express 5 app  (/api/v1)                       │
                    │  helmet→cors→json→cookie→morgan→routers→error   │
                    │  auth│pc│complaint│dept                         │
                    │  routes→[rateLimit→validate→auth→roleCheck→     │
                    │          deptScope]→controller→service→model    │
                    └───────────────┬────────────────────────────────┘
                                    │ Mongoose 9
                          MongoDB (users,depts,labs,pcs,complaints)
                                    │
                          Gmail SMTP (nodemailer) — OTP emails
```

---

## 2. Files / Folders Inspected

### Backend (read in full)
- `package.json`, `.env.example`, `.gitignore`, `.prettierrc`, `tsconfig.json`, `tsconfig.build.json`
- `src/server.ts`, `src/app.ts`
- `src/config/`: `constants.ts`, `env.ts`, `db.config.ts`
- `src/models/`: `user.model.ts`, `department.model.ts`, `lab.model.ts`, `pc.model.ts`, `complaint.model.ts`
- `src/routes/`: `auth.route.ts`, `pc.route.ts`, `complaint.route.ts`, `dept.route.ts`
- `src/controllers/`: `auth.controller.ts`, `complaint.controller.ts`, `pc.controller.ts`, `dept.controller.ts`
- `src/services/`: `auth.service.ts`, `complaint.service.ts`, `pc.service.ts`, `dept.service.ts`
- `src/middlewares/`: `auth`, `roleCheck`, `deptScope`, `error`, `rateLimiter`, `validate`
- `src/utils/`: `ApiError`, `ApiResponse`, `asyncHandler` (not re-read; stable), `tokenGeneration`, `scope`, `requireAuth`, `otp`/`mailer` (behavior via docs)
- `src/validators/`: `auth`, `complaint`, `pc`, `common`
- `src/types/`: `auth.ts`, `express.d.ts`, `mongo.ts` (via usage)
- `src/tests/`: `complaint.test.ts` (read in full); `auth`, `pc`, `pc.search`, `healthcard` (via `package.json` + docs)
- `src/scripts/`: `seed.ts`, `seedDepartments.ts`
- `backend/docs/`: `known-issues.md`, `phases.md` (read in full); `README.md`, `architecture.md`, `models.md`, `auth-module.md`, `complaint-module.md`, `pc-module.md`, `middlewares.md`, `constants.md`, `utils.md`, `agent.md` (indexed)

### Frontend (read in full unless noted)
- `package.json`, `tsconfig*.json`, `vite.config.ts`, `.oxlintrc.json`, `index.html`
- `src/app/`: `App.tsx` (via usage), `routes.tsx`, `providers/AuthProvider.tsx`
- `src/components/common/`: `ProtectedRoute.tsx`; `DetailModal.tsx`, `OtpInput.tsx` (indexed)
- `src/constants/`: `roles.ts`, `routes.ts`
- `src/services/`: `apiClient.ts`, `authService.ts`, `complaintService.ts`, `pcService.ts`, `deptService.ts`
- `src/features/auth/`: `AuthPage.tsx`; `OtpVerification.tsx` (indexed)
- `src/features/public-complaint/`: `RaiseComplaintPage.tsx`, `TrackComplaintPage.tsx`
- `src/features/complaints/`: `ComplaintsDashboard.tsx`; `Donut.tsx`, `ComplaintDetailModal.tsx`, `ResolveComplaintModal.tsx`, `complaintMeta.ts` (indexed)
- `src/features/lab-incharge|hod|dean-infra/`: `*Home.tsx` (thin wrappers)
- `src/features/laboratories/`, `pc-search/` (indexed)
- `src/features/equipment|inventory|requests/`: stub pages (`EquipmentPage.tsx` read — one `<h1>`)
- `src/types/`: `domain.ts`, `api.ts` (via usage)

### Root / CI
- `.gitignore`, `.github/workflows/ci.yml`, `docs/info.md` (1481 lines — indexed, §1–12 read), `prd.md`

### Not inspected (irrelevant to V1)
- `agent/` internals (`collector.py`, `measure_payload.py`) — out of scope §3; `backend/scripts/*.mjs` (gitignored personal scripts); `node_modules/`.

---

## 3. Existing Features

### Works end-to-end (frontend + API + validation + authz + DB + tests)
| Feature | Backend | Frontend | Tests |
|---|---|---|---|
| Public complaint submission | `POST /api/v1/complaint` (rate-limit + Zod) → `createComplaint` | `RaiseComplaintPage.tsx` | `complaint.test.ts` |
| Public complaint tracking by token | `GET /api/v1/complaint/track/:token` (5-field projection) | `TrackComplaintPage.tsx` | `complaint.test.ts` |
| Staff register → email OTP verify → resend | `POST /auth/register`, `/verify-email`, `/resend-otp` | `AuthPage.tsx` + `OtpVerification.tsx` | `auth.test.ts` |
| Password login → JWT cookies | `POST /auth/login` (rate-limit + Zod) | `AuthPage.tsx` | `auth.test.ts` |
| Token refresh (rotating) / logout / session rehydrate | `POST /auth/refresh-token`, `POST /auth/logout`, `GET /auth/me` | `apiClient` interceptor + `AuthProvider` | `auth.test.ts` |
| Role dashboard: list / escalate / resolve complaints | `GET /api/v1/complaint` (role+level scoped), `PATCH /:id/escalate`, `PATCH /:id/resolve` | `ComplaintsDashboard.tsx` (shared by 3 role homes) + detail/resolve modals + `Donut` stats | `complaint.test.ts` |
| Department dropdown data | `GET /api/v1/dept` | `deptService` → `AuthPage` signup | — |
| PC search + health-card modal *(asset system)* | `GET /api/v1/pc/search`, `POST /api/v1/pc/:id/health-card` | `LaboratoriesPage` → `PcSearchPage` + `PcHealthCardModal` | `pc.search.test.ts`, `healthcard.test.ts` |
| Agent PC config sync *(asset system)* | `POST /api/v1/pc/sync` (rate-limit + Zod; no device auth) | — | `pc.test.ts` |
| Public PC lookup (confirms dead-stock, shows dept/lab) | `GET /api/v1/pc/lookup/:deadStockNo` | used by `RaiseComplaintPage` blur handler | — |

### Infrastructure that works
- Zod request validation middleware; `express-rate-limit`; `helmet`; CORS; consistent response envelope.
- Startup env validation (`env.ts`).
- OTP hardening: `crypto.randomInt()`, `otpAttempts` lockout, resend cooldown.
- CI: `.github/workflows/ci.yml` — backend job (mongo:7 service, `npm ci` → `typecheck` → `build` → `test`) + frontend job (`lint` → `build`), Node 22.
- Seed scripts: `seed.ts` (one test Dept/Lab/PC), `seedDepartments.ts` (7 departments incl. Information Technology).

### Stubs / not built
- `EquipmentPage.tsx`, `InventoryPage.tsx`, `RequestsPage.tsx` — placeholder `<h1>` only (not in PRD V1).
- No admin dashboard, no user CRUD, no aggregation/summary endpoints, no audit-log collection, no assignment, no reopen, no lab CRUD, no lab listing endpoint.

---

## 4. Missing Features (PRD V1 requirements not met)

| # | PRD ref | Missing / gap | Size |
|---|---|---|---|
| M1 | §6, §16, Ph6 | **Admin role model + Admin dashboard + Admin staff-management CRUD** (create/view/edit/activate-deactivate HOD & Lab Incharge; assign dept/lab). Nothing exists. | Large |
| M2 | §6, §15, §16 | **`User.isActive` field + enforcement** (login blocked, ideally session invalidated). No field today. | Small model, medium enforcement |
| M3 | §13, §18 | **Lab-level scope**: `User.lab` field + `buildLabScope` + Lab Incharge sees only their lab's complaints. `User` has no `lab`; `scope.ts` has no lab logic. | Medium |
| M4 | §11, §12 | **Status model rework**: `SUBMITTED/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED` replacing `Open/Escalated_*/Resolved`. Plus decoupling "escalation" from "status". Frontend constants + `complaintMeta.ts` + tests all touch this. | Large (breaking) |
| M5 | §8, §9 | **Public form: manual Department + Lab dropdowns**, and complaint creation **without requiring a `Pc` record** (store `deadStockNo` as a string; verify dept/lab exist). Today `createComplaint` 404s if no PC. | Medium (breaking) |
| M6 | §9, §10 | **Tracking token format** `LM-<DEPTCODE>-<RAND>` (e.g. `LM-IT-8F42K7`), still not an internal id. Today: bare `nanoid(8)`. | Small |
| M7 | §10 | **Public tracker richer payload**: department, lab, dead-stock, last-updated, full status timeline. Today returns only `token, status, currentLevel, description, createdAt`. | Small–medium |
| M8 | §16, §17, §18 | **Dashboard aggregation endpoints** (totals by status, by lab, lab-incharge overview, recent). Today frontend derives counts client-side from the raw list. | Medium |
| M9 | §18 | **Lab Incharge actions**: assign to staff (optional), status update (SUBMITTED→ASSIGNED→IN_PROGRESS), remarks on any transition, resolution verification, **reopen**. Today only escalate + resolve. | Medium |
| M10 | §17, §18 | **HOD/Lab-Incharge role dashboards per PRD** (lab overview, lab-incharge overview, complaint table columns incl. `Assigned To`). Current shared dashboard is close but column set + actions differ. | Medium |
| M11 | §23 | **Admin audit log** (`actor, action, target, timestamp, metadata`) for admin/staff actions. Nothing. | Medium |
| M12 | §2, §7, §16, §31 | **Secure Admin provisioning** via env/seed (no public admin registration). Today anyone can self-register as `admin`. | Small (+ policy decision) |
| M13 | §7, §30 | **Route names**: `/admin-login`, `/hod-login`, `/labincharge-login`, `/admin-dashboard`, `/hod-dashboard`, `/labincharge-dashboard`. Today: single `/login`, `/lab-incharge`, `/hod`, `/dean-infra`. | Small |
| M14 | §2, Ph2 | **Seed IT Labs 9–14** as real `Lab` docs with numbers; **Lab CRUD** + a **labs-by-department listing endpoint** for the public form. Today labs are auto-created ad-hoc by PC sync, unnamed-by-convention, no CRUD, no list route. | Small–medium |
| M15 | §7, §19 | **403 / access-denied UX**: `ProtectedRoute` currently redirects wrong-role users to `/login` silently; PRD wants a 403/login distinction. | Small |
| M16 | §1, §6 | **Decide fate of `deanInfra`** — PRD has only 3 roles; escalation tops out at HOD; Admin/Infra is the top authority. | Decision |
| M17 | §6, §15 | **Decide fate of public OTP registration** — PRD has no public staff signup. | Decision |
| M18 | Ph1, §5 | `.env.example` for **frontend** (`VITE_API_BASE_URL`) — none exists. Backend `.env.example` exists and is good. | Trivial |

---

## 5. What Should Remain Unchanged (preserve — PRD §4, Rule 2)

- **Backend layering** (routes→controllers→services→models), `asyncHandler`, `ApiError`/`ApiResponse` envelope, `errorHandler`. (PRD §20, §21 align with it.)
- **JWT cookie auth** (access + rotating refresh, hashed refresh storage, `httpOnly`/`sameSite:strict`), `auth`/`roleCheck` middlewares, `tokenGeneration.ts`, `parseExpiryToMs`. (PRD §15 — "do not introduce two competing auth systems".)
- **`bcrypt` password hashing** via `User` `pre("save")` hook + `comparePassword`.
- **`src/config/env.ts`** startup validation pattern — extend, don't replace.
- **`src/utils/scope.ts`** as the single home for access-scoping — **extend** with lab scope, don't fork.
- **Zod `validate` middleware**, `src/validators/*`, **rate limiters**, `helmet`, CORS config.
- **`Dept` model** (name/code) — matches PRD §14 `departments` fine.
- **Public complaint + tracking endpoints** — modify payload/shape, keep the route and flow.
- **Frontend**: `apiClient` (interceptor + refresh), `AuthProvider`, `ProtectedRoute` (tweak redirect), `DetailModal` shell, `ComplaintsDashboard` shell + `Donut` + modals, `AuthPage` shell, `OtpInput`, `formatDate`, `types/api.ts` `getApiErrorMessage`.
- **TS configs** (`tsconfig*.json`, strict flags) and **CI workflow** — extend (add tests to frontend job later), don't rewrite.
- **Backend integration test suite** (`node --test`, real Mongo, tokens minted directly) — adapt assertions to the new model; keep the harness.
- **`agent/`** — do not touch, do not delete (PRD §3, §29: future phase).

---

## 6. What Can Be Removed Safely

**Safe now (low/no risk):**
- Nothing needs deletion to start. Stub pages `EquipmentPage` / `InventoryPage` / `RequestsPage` and their routes are not in PRD V1 — can be removed or left dormant; **recommend leaving them** (zero cost, avoids churn) and hiding their nav entries.
- `docs/info.md` is a large auto-generated narrative that will drift; keep for now, supersede with the `docs/` set this audit creates.

**Remove only after the decisions in §7 are made (potentially destructive — confirm first):**
- **`deanInfra` role** and everything keyed to it: `ROLES.DEAN_INFRA`, `STATUS_FOR_LEVEL[deanInfra]`, `Escalated_Dean` status, `buildComplaintScope` dean branch, `features/dean-infra/`, `/dean-infra` route, dean branch in `TrackComplaintPage` labels. → **only if** decision D1 = "collapse to 3 roles".
- **Public OTP registration stack**: `POST /register` + `/verify-email` + `/resend-otp` routes, `registerUser`/`verifyEmailOtp`/`resendOtp` services, `src/utils/otp.ts` + `mailer.ts`, `otpVerifyLimiter`/`otpResendLimiter`, `User.otp*` / `lastOtpSentAt` / `isEmailVerified` fields, `OtpVerification.tsx` + `OtpInput.tsx`, `SMTP_*` / `OTP_*` env. → **only if** decision D2 = "remove public registration entirely" (vs. keep a gated/admin-invite flow that reuses OTP).
- **Asset subsystem** (`Pc` model, `pc.*` routes/service/controller/validator, `LaboratoriesPage`/`PcSearchPage`/`PcHealthCardModal`, `pcService`, `pc*.test.ts`, `seed.ts`): PRD §3 puts it out of scope but says *don't spend time on it*, not *delete it*. → **Recommendation: keep, leave untouched.** Only the public `GET /pc/lookup` usage in `RaiseComplaintPage` gets dropped when the form moves to manual dept/lab selection (M5).

**Never remove:** `agent/`, backend `docs/`, CI, seed scripts (adapt `seedDepartments.ts` / add lab + admin seeds).

---

## 7. Architectural Conflicts (need your decision before Phase 1)

> PRD §31: *"Ask for confirmation ONLY if there is a genuine architectural conflict or destructive change required."* These four qualify.

### D1 — `deanInfra` role: keep 4 roles, or collapse to the PRD's 3?
- **PRD:** exactly 3 roles (`ADMIN`, `HOD`, `LAB_INCHARGE`); escalation chain is Lab Incharge → HOD; Admin/Infra is the top, system-wide authority.
- **Current:** 4 roles; chain is Lab Incharge → HOD → **Dean Infra**; `admin` is unused-in-UI.
- **Options:**
  - **(A) Recommended — collapse:** treat the PRD's `ADMIN` as today's `deanInfra` *plus* system admin powers. Remove `deanInfra`; migrate any `deanInfra` users → `admin`; drop `Escalated_Dean`. Escalation tops out at HOD (HOD can escalate to Admin/Infra queue, or HOD is terminal for escalation and Admin just monitors — see D3).
  - **(B) Keep `deanInfra`** as a 4th role behind the PRD (extra escalation tier). Diverges from PRD §6; more code to carry.
- **Impact:** `constants.ts`, `scope.ts`, `complaint.model` enums, frontend `roles.ts`/routes/features, tests, status migration.

### D2 — Public staff registration + email OTP: keep, gate, or remove?
- **PRD §6/§15:** Admin is seeded securely; Admin **creates** HOD & Lab Incharge accounts; there is **no public staff signup**. "Do not introduce two competing authentication systems."
- **Current:** anyone can `POST /register` (no access control — flagged in `backend/docs/known-issues.md`) as **any role including `admin`**, then verify via emailed OTP.
- **Options:**
  - **(A) Recommended — remove public registration for V1:** admin seeded via env/script; Admin's "Create HOD / Create Lab Incharge" sets a password (or emails an invite). Keep the *login* flow exactly as-is. Optionally retain the OTP utilities for an admin-triggered "send set-password link" later (not V1).
  - **(B) Gate `POST /register`** behind `auth + roleCheck(ADMIN)` and drop the self-service signup UI. Reuses OTP as "verify the new staffer's email". More moving parts.
  - **(C) Keep self-signup**, just forbid `role=admin`. Contradicts PRD §6 ("Admin controls staff access"). Not recommended.
- **Impact:** `auth.route.ts`, `auth.service.ts`, `AuthPage.tsx` (remove Sign Up tab), `OtpVerification`, mailer/otp utils, `User` schema (`isEmailVerified`, `otp*`), env, tests.

### D3 — Complaint status model: full migration to the PRD's 5-state lifecycle?
- **PRD §11:** `SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED` (+ reopen from RESOLVED). Escalation is a **separate** action, not a status.
- **Current:** `status` *is* the escalation position (`Open`, `Escalated_HOD`, `Escalated_Dean`, `Resolved`); `currentLevel` tracks who owns it.
- **Recommended:** adopt the PRD lifecycle for `status`; **keep** a `currentLevel` / `assignedLevel` field for "who owns it now" (Lab Incharge / HOD / Admin). Escalate = change owner + history entry, independent of `status`. `history[]` entries gain `fromStatus`/`toStatus`.
- **Impact (breaking):** `complaint.model.ts` enums, `complaint.service.ts` (escalate/resolve/create + new transitions), `scope.ts` `buildComplaintScope` (it filters on `currentLevel`), frontend `roles.ts` `COMPLAINT_STATUS`, `complaintMeta.ts`, `ComplaintsDashboard` stats/filters, `TrackComplaintPage` labels, **all complaint tests**, plus a **data-migration script** for any existing complaint docs (old status → new).

### D4 — Complaint no longer requires a `Pc` record
- **PRD §8/§9/§14:** public form collects dead-stock **string** + chosen Department + chosen Lab + reason; the complaint row stores `dead_stock_number`, `department_id`, `lab_id` directly. The asset/PC system is future (§3).
- **Current:** `createComplaint` does `Pc.findOne({ deadStockNo })` → **404 if not found**; `Complaint.pc` is `required: true` and dept/lab are copied *from the PC*.
- **Recommended:** make `Complaint.pc` **optional** (link opportunistically if a matching `Pc` exists), add `Complaint.deadStockNo: String` (required), take `department`/`lab` from the **validated form selection** (verify both exist and lab∈department), not from a PC.
- **Impact (breaking):** `complaint.model.ts`, `complaint.validator.ts`, `complaint.service.ts#createComplaint`, `RaiseComplaintPage.tsx` (add dropdowns, drop the `lookupPc` blur check), tests.

> **D3 + D4 together** are the core of Phase 4 and the only unavoidable **data migration** (§8). Everything else is additive.

---

## 8. Database Migration Requirements

Existing collections: `users`, `depts`, `labs`, `pcs`, `complaints` (Mongoose-pluralized). PRD §14 asks for `users, departments, labs, complaints, complaint_status_history` — the embedded `Complaint.history[]` **satisfies** `complaint_status_history` (PRD §14 line ~659: "Adapt … if equivalent functionality already exists"). No need for a separate collection unless you prefer one.

| Entity | Change | Migration action |
|---|---|---|
| **`users`** | Add `isActive: Boolean` (default `true`, index). | Backfill all existing users `isActive: true`. |
| | Add `lab: ObjectId → Lab` (nullable; set for `labIncharge`). | Backfill from `Lab.incharge` back-refs where present; else leave null, Admin assigns. |
| | If **D2 = remove registration:** drop `otp`, `otpExpiry`, `otpPurpose`, `otpAttempts`, `lastOtpSentAt`; consider dropping/keeping `isEmailVerified` (keep as always-`true` or remove + adjust `loginUser`). | `$unset` on all user docs; adjust `loginUser` verified-check. |
| | If **D1 = collapse:** `role: "deanInfra"` → `"admin"`. | `updateMany({role:"deanInfra"},{$set:{role:"admin"}})`. |
| | Seed one **Admin** from env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) — idempotent upsert. | New `src/scripts/seedAdmin.ts`. |
| **`depts`** | No schema change. Ensure `Information Technology` (code `IT`) exists. | `seedDepartments.ts` already inserts it — keep. |
| **`labs`** | Add `labNumber: Number` (or keep `name` = `"Lab 9"`); add **unique compound index** `{ department, name }` (currently none — uniqueness is only "as-used" via `pc.service.ts` upsert). Optional `incharge` already present. | New `src/scripts/seedLabs.ts`: IT Labs 9–14. Dedupe any ad-hoc labs created by past PC syncs. |
| **`complaints`** | **D4:** `pc` → not required; add `deadStockNo: String` (required); `department`/`lab` set from form. | For existing docs: copy `pc.deadStockNo` → `deadStockNo` (via `$lookup`/script); keep `pc` link. |
| | **D3:** `status` enum → `SUBMITTED/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED`. Rename/rework `currentLevel` (enum shifts if D1). Add `assignedTo: ObjectId → User` (nullable). `history[]` entries: add `fromStatus`,`toStatus`. | Map existing: `Open→SUBMITTED`, `Escalated_HOD→SUBMITTED`(owner=hod), `Escalated_Dean→SUBMITTED`(owner=admin), `Resolved→RESOLVED`. Write `src/scripts/migrateComplaintStatus.ts`. |
| | **M6:** `token` format `LM-<DEPTCODE>-<6-8 rand>`. | Leave old tokens as-is (still unique); new format applies to new complaints only. |
| **`audit_logs`** (new, M11) | New collection `{ actor, action, targetType, targetId, metadata, at }`. | None (new). |

**Notes**
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` are on — new optional fields need `field?: T | undefined` typing and guarded reads.
- Run all migration scripts against a **backup / non-prod copy first**. If the DB currently has no real production data (likely — seed scripts suggest test data only), migrations reduce to "adjust schema + re-seed".
- Every migration script follows the existing `src/scripts/*.ts` pattern (`mongoose.connect(env.MONGO_URL)`, idempotent, `npm run <script>`).

---

## 9. Security Concerns

### Must fix for V1 (PRD-driven)
| ID | Concern | PRD | Fix |
|---|---|---|---|
| S1 | `POST /register` has **no access control** — self-register as `admin`. | §6, §16, §31 | Remove or gate behind `roleCheck(ADMIN)` (D2). |
| S2 | **No `isActive` enforcement** — deactivated staff could still log in / use a live token. | §15, §16 | Add field; check in `loginUser`; re-check in `auth` middleware or `GET /me` (needs a DB read or token-version — see S4). |
| S3 | **No lab-scope enforcement** — a Lab Incharge token is only department-scoped; nothing stops them acting on another lab's complaint in their department. | §13, §18 ("must never receive another lab's data") | Add `buildLabScope` + enforce in complaint list/detail/actions. |
| S4 | **Access token claims never re-verified mid-session** (`req.user` straight from JWT for 15 min). Role/dept/lab change or deactivation has no effect until expiry; logout doesn't revoke the access token. | §15, §19 | Shorten access TTL and/or add a `tokenVersion` on `User` checked in `auth`; bump on deactivate / role change / logout. |

### Should fix (hardening, pre-deploy)
| ID | Concern | Source | Fix |
|---|---|---|---|
| S5 | Login rate-limit is **per-IP only**, no per-account lockout. | `known-issues.md` | Add a failed-login counter on `User` mirroring `otpAttempts`. |
| S6 | No `app.set("trust proxy", …)` — behind a proxy, IP-keyed limiters break or are spoofable. | `known-issues.md` | Set correct `trust proxy` before deployment (Phase 10). |
| S7 | `POST /refresh-token` has **no rate limiter**. | `known-issues.md` | Add `refreshLimiter`. |
| S8 | `POST /pc/sync` has **no device auth** (asset system). | `known-issues.md`, PRD §3 | Out of scope for V1; leave a `// TODO(agent-auth)` and de-prioritize (route still open but unused by V1). |
| S9 | Admin/staff **audit logging** absent. | §23 | Add `audit_logs` writes on admin CRUD + complaint state changes (M11). |
| S10 | `errorHandler` logs full errors with `console.error` and returns generic 500 to client — **good** (no stack leakage to users, §21). Keep; consider a real logger at Phase 10. | §21 | Keep. |

### Already good (keep)
- `httpOnly` + `sameSite:strict` + `secure`(prod) cookies (XSS/CSRF mitigation).
- bcrypt password + refresh-token hashing (SHA-256 pre-hash to dodge bcrypt's 72-byte truncation).
- Zod validation at the edge + `helmet` + scoped CORS with `credentials`.
- Regex-escaping in `pc.service.ts` search; `select()`-trimmed public projections.
- Env validation fails closed at startup.

---

## 10. Dependencies / Blockers Between Phases

```
D1 (roles)  D2 (registration)  D3 (status)  D4 (no-PC complaint)   ← decide FIRST
   │             │                  │            │
   └─────┬───────┴────────┬─────────┴─────┬──────┘
         ▼                ▼               ▼
 PHASE 1 Foundation ──▶ PHASE 2 DB + Org ──▶ PHASE 3 Auth + RBAC
 (env, startup,          (User.isActive/.lab,   (login unchanged; isActive
  frontend .env.example,  Lab model + seed       check; roleCheck; deptScope
  route renames plan,     Labs 9–14; seed        + NEW labScope; protect
  shared types)           Admin; status +        admin/hod/labincharge APIs)
                          complaint migration)          │
                              │                         │
          ┌───────────────────┼─────────────────────────┤
          ▼                   ▼                         ▼
 PHASE 4 Public Complaint   PHASE 5 Public Tracker   PHASE 6 Admin System
 (needs: Labs seeded +      (needs: Phase 4 status   (needs: Phase 3 RBAC +
  labs-by-dept endpoint;     model + timeline data)   audit log; blocks HOD/LI
  D3+D4 status/model)              │                   having users to test with)
          │                        │                         │
          └────────────┬───────────┴─────────────┬───────────┘
                       ▼                          ▼
              PHASE 7 HOD System          PHASE 8 Lab Incharge System
              (needs Phase 3 labScope,     (needs Phase 3 labScope,
               Phase 6 to create HODs,      Phase 6 to create Lab Incharges,
               Phase 4 status model)        Phase 4 status model, assignment)
                       └───────────┬────────────────┘
                                   ▼
                    PHASE 9 End-to-End Integration
                                   ▼
                    PHASE 10 Security + QA (S5–S7 + trust proxy + full matrix)
```

**Hard blockers:**
- **D1–D4 block Phase 2** (can't finalize `User` / `Complaint` schemas or migration scripts without them).
- **Phase 2 blocks Phase 3** (RBAC needs `isActive` + `User.lab`; scope needs finalized enums).
- **Phase 2 blocks Phase 4** (public form needs seeded Labs 9–14 **and** a `GET /dept/:id/labs` endpoint).
- **Phase 3 blocks Phases 6/7/8** (all are protected surfaces; lab-scope must exist before HOD/LI dashboards can be tested for cross-lab/dept leakage per PRD §7/§8 "mandatory").
- **Phase 6 (Admin creates users) blocks realistic testing of Phases 7/8** — you need HOD & Lab Incharge accounts with dept/lab assignments; until then, seed test users.
- **Phase 4 (status model) blocks Phase 5 tracker** (timeline + status labels) and the Phase 7/8 dashboard column sets.

**Soft/parallelizable:**
- Frontend route renames (M13) + 403 UX (M15) + frontend `.env.example` (M18) can land in Phase 1.
- Audit-log collection (M11) can be built in Phase 2 and wired incrementally.
- Dashboard aggregation endpoints (M8) can be added alongside Phases 6–8.
- Removing `deanInfra` / OTP stack (D1/D2 cleanup) happens in Phase 2–3 once decided.

---

## 11. Recommended Implementation Order

0. **Phase 0 (this doc) — DONE pending D1–D4 answers.**
1. **Decisions D1–D4** (blocking; see §7).
2. **Phase 1 — Foundation:** verify backend/frontend/DB start; add `frontend/.env.example`; confirm `.env` ignored (it is); plan + scaffold route renames (`constants/routes.ts`, `routes.tsx`, three login entry points sharing `AuthPage`); add a small shared type note (no shared package — keep the hand-mirror, add a lint check later); document API conventions in `API_CONTRACT.md`.
3. **Phase 2 — Database + Organization:** apply D1/D2 cleanups; `User.isActive` + `User.lab`; `Lab` model (`labNumber` + unique index); `seedAdmin.ts`, `seedLabs.ts` (IT 9–14), keep `seedDepartments.ts`; apply D3/D4 schema changes + write `migrateComplaintStatus.ts` / dead-stock backfill; add `audit_logs` model.
4. **Phase 3 — Auth + RBAC:** keep login; enforce `isActive`; add `tokenVersion` (S4); `buildLabScope` in `scope.ts` + `labScope` middleware; protect `/api/v1/admin/*`, and lab/dept scoping on `/complaint*`; the PRD §3.x authz test matrix.
5. **Phase 4 — Public Complaint System:** `GET /dept/:id/labs`; rework `createComplaint` (no PC required, dept+lab from form, new token format); `RaiseComplaintPage` dropdowns + success screen.
6. **Phase 5 — Public Tracker:** richer `track` payload + status timeline; `/track` page states (loading/empty/invalid).
7. **Phase 6 — Admin System:** admin dashboard aggregation + HOD/Lab-Incharge CRUD + activate/deactivate + assign dept/lab; audit-log writes; `/admin-login` + `/admin-dashboard`.
8. **Phase 7 — HOD System:** department-scoped dashboard + stats + complaint management + escalate; verify "never another department's data".
9. **Phase 8 — Lab Incharge System:** lab-scoped dashboard + status updates + remarks + assignment + resolution verify + reopen + escalate; verify "never another lab's data".
10. **Phase 9 — End-to-end integration** (PRD §24 scenario, persistence across restart).
11. **Phase 10 — Security + QA** (S5–S7, `trust proxy`, full auth/authz/complaint/general matrix; add frontend tests to CI).

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| D3 (status migration) breaks the existing complaint tests + frontend meta in many places | High | Medium | Do it as one focused Phase-4 change; update `complaintMeta.ts` + `roles.ts` + tests in the same PR; keep a mapping table. |
| Existing production data in Mongo (unknown) makes migrations risky | Unknown | High | Confirm whether any real data exists; back up first; make every script idempotent + dry-runnable. |
| Removing `deanInfra` / OTP stack touches many files; risk of half-removed dead code | Medium | Low | Do removal in a dedicated commit right after the decision; rely on `tsc --noEmit` + `oxlint` + tests to find danglers. |
| Frontend/backend enums drift (no shared package) | Medium | Medium | Keep the hand-mirror; add a tiny CI check (or a generated constants file) comparing `roles.ts` ↔ `constants.ts`. |
| Lab-scope added to `scope.ts` but missed at a call site → cross-lab data leak (PRD calls this "mandatory") | Medium | High | Centralize in `scope.ts`; add explicit negative tests (Lab 12 incharge → Lab 13 = 403) per PRD §3/§10. |
| `auth` middleware still trusts stale JWT claims after deactivation/role change | High (by design today) | Medium | Ship `tokenVersion` in Phase 3, not later; short access TTL as interim. |
| PRD's role-scoped API layout (`/api/hod/*`, `/api/lab-incharge/*`) vs. current single `/api/v1/complaint` | Low | Low | PRD §20 explicitly allows adapting to existing conventions; keep resource routes + in-service scoping; document the deviation in `API_CONTRACT.md`. |
| Asset/PC system left in place confuses scope / testing | Low | Low | Leave untouched; mark clearly "not V1" in docs; only drop `pc/lookup` usage from the public form. |
| `CLAUDE.md` is gitignored and partly stale | Low | Low | Trust `backend/docs/` + code + this `docs/` set; optionally refresh `CLAUDE.md` at Phase 10. |
| CI frontend job has no tests; regressions slip | Medium | Low | Add Vitest + a few route/guard tests in Phase 10. |

---

## 13. Phase 0 Completion Status

| Item | Status |
|---|---|
| Repository inspected (backend, frontend, agent, CI, docs) | ✅ Complete |
| Frontend tech & structure identified | ✅ React 19 + Vite 8 + TS strict + RR7 + axios |
| Backend tech & structure identified | ✅ Express 5 + TS strict + Mongoose 9 + Zod + JWT |
| Database tech & schema identified | ✅ MongoDB/Mongoose; 5 models mapped (§8, `DATABASE.md`) |
| Current routes identified | ✅ 18 endpoints under `/api/v1` (`API_CONTRACT.md`) |
| Current complaint implementation identified | ✅ create/track/list/escalate/resolve + embedded `history[]` |
| Current authentication identified | ✅ register+OTP / login / rotating refresh / logout / me |
| Existing models identified | ✅ `User`, `Dept`, `Lab`, `Pc`, `Complaint` |
| Environment configuration identified | ✅ backend `.env.example` present & Zod-validated; frontend `.env.example` **missing** (M18) |
| Reusable components/services identified | ✅ §5 |
| Broken/incomplete functionality identified | ✅ §4 (M1–M18), §9 (S1–S10), stubs |
| PRD ↔ implementation comparison | ✅ §0, §4, §7 |
| Architecture documented | ✅ this file + `ARCHITECTURE.md` |
| Implementation plan produced from the actual repo | ✅ §10, §11; `TASK_BOARD.md` |
| Deliverable `docs/PROJECT_AUDIT.md` | ✅ this file |
| Companion docs (`ARCHITECTURE`, `ROLES_AND_PERMISSIONS`, `API_CONTRACT`, `DATABASE`, `TASK_BOARD`, `DEVELOPMENT_LOG`) | ✅ created this phase |
| **Blocking decisions D1–D4 resolved** | ⛔ **Pending your input** — see §7 |
| Any Phase ≥1 implementation | ⬜ Not started (correct — PRD §31) |

**Phase 0 is COMPLETE.** No code was changed. Proceeding to Phase 1 requires answers to **D1–D4** (§7); everything else in the plan is unblocked once those are set.
