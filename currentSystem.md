# LABMON — Current System State

_Snapshot written 2026-08-20 by reading the actual code, not the docs (several existing docs are stale — see "Docs vs. reality" below)._

## 1. What LABMON is

A MERN-based lab PC health monitoring and complaint management system for college environments.

- A Python agent runs on each lab PC, collects hardware/software config, and syncs it to the backend, keeping a "digital health card" (department, lab, dead-stock number, warranty) up to date.
- Anyone (no login) can file a complaint about a lab PC, tracked by a unique token.
- Complaints escalate through a fixed chain: **Lab Incharge → HOD → Dean Infra**.
- Access is role- and department-scoped: `labIncharge`/`hod` only see their own department; `admin`/`deanInfra` see everything.

## 2. Repo layout

```
D:\labmon\
├── backend/     Node.js + Express + MongoDB (Mongoose) — most complete piece
├── frontend/    React 19 + Vite — scaffolded, partially built
├── agent/       Python collector (single script) — functional, unpackaged
└── CLAUDE.md    Project instructions for Claude Code (currently stale, see §6)
```

Three independent runtimes, no shared package/workspace — each is run and installed separately.

## 3. Backend (`backend/`) — most mature part of the system

Node/Express, ESM (`"type": "module"`), MongoDB via Mongoose. Layering: **routes → controllers → services → models**, controllers wrapped in `asyncHandler`, errors thrown as `ApiError` and caught by a single global `errorHandler`, success responses wrapped in `ApiResponse`.

Run from `backend/`: `npm run dev` (nodemon) or `npm start`. No test runner script wired to CI, but `npm test` runs Node's built-in test runner (`node --test src/tests/**/*.test.js`) against 5 test files (auth, complaint, healthcard, pc, pc.search).

### Domain model
```
Dept  1──* Lab
Dept  1──* User   (null department for admin/deanInfra)
Dept  1──* Pc
Lab   1──* Pc
Pc    1──* Complaint
```
Roles: `admin`, `labIncharge`, `hod`, `deanInfra` (`src/config/constants.js`). Complaint `status`: `Open → Escalated_HOD → Escalated_Dean → Resolved`; `currentLevel` mirrors the escalation chain and excludes `admin`.

### API surface that actually exists today

**Auth** (`/api/v1/auth`, all public except `logout`) — two-step OTP-gated flow, not plain password login:
- `POST /register`, `POST /verify-email`, `POST /resend-otp`
- `POST /login` (password check → sends OTP, no session yet), `POST /verify-login-otp` (OTP check → issues JWT access+refresh tokens as httpOnly cookies)
- `POST /refresh-token`, `POST /logout` (auth-protected)

**PC** (`/api/v1/pc`):
- `POST /sync` — agent-facing, no auth yet, upserts a PC's `config` by `deadStockNo`
- `POST /:id/health-card` — auth + deptScope, returns full PC doc (note: implemented as POST though it's a pure read)
- `GET /search` — auth + roleCheck(labIncharge/hod/deanInfra) + deptScope; filter by deadStockNo/cpu/ram/disk/os/software (regex, case-insensitive, escaped) and warrantyStatus/lab (exact)

**Complaint** (`/api/v1/complaint`):
- `POST /` — public, creates complaint from `deadStockNo` + description + raisedBy, issues an 8-char `nanoid` token
- `GET /track/:token` — public, returns a trimmed status/level projection
- `GET /` — auth + deptScope, department-scoped list, no pagination/filtering yet
- `PATCH /:id/escalate` — auth + roleCheck(labIncharge, hod); only the role matching the complaint's current level can move it forward
- `PATCH /:id/resolve` — auth + roleCheck(labIncharge, hod, deanInfra); any level can close it

**Dept** (`/api/v1/dept`):
- `GET /` — public, lightweight `{name, code}` list (used by the frontend's registration/department dropdown)

### What's implemented vs. what's still missing (verified against code, 2026-08-20)

| Area | Status |
|---|---|
| Foundation (models, JWT auth, role/dept middleware) | Done |
| Python agent | Done (functional, not packaged) |
| Health card + complaint core (raise/track/escalate/resolve/list) | Done |
| PC search | Done |
| Auth refresh/logout/resend-OTP | Done (these were "missing" in older docs — now implemented) |
| Department listing | Done (minimal — no admin CRUD yet) |
| Role dashboards (backend aggregation/summary endpoints) | Not started — frontend dashboards currently fake/derive their own data |
| Admin CRUD for Dept/Lab/User/Pc | Not started |
| Rate limiting | Not started |
| Request-body validation library (Zod/Joi) | Not started — relies on Mongoose schema validation only |
| Docker/CI/deployment | Not started |
| Agent device authentication | Not started — `/pc/sync` has no credential check |

### Known real issues in the current backend code
- `pc.route.js` imports `Router` as the default export of `express` (should be the named export) — works today but is fragile.
- `getPcHealthCard` doesn't validate `pcId` is a Mongo ObjectId before querying → a malformed id throws an uncaught Mongoose `CastError` → generic `500` instead of a clean `400`.
- `syncPcConfig` overwrites the whole `config` subdocument on every sync (not a field-by-field merge) — a partial payload would wipe other fields. Not hit today because the agent always sends everything.
- `POST /register` has no access control — anyone can self-register as `admin`. The roadmap says registration should be admin-only.
- `POST /pc/sync` has no device authentication — anyone who knows/guesses a `deadStockNo` can overwrite that PC's config.
- Auth cookie `maxAge` values are hardcoded (15m/7d) rather than derived from `JWT_ACCESS_EXPIRY`/`JWT_REFRESH_EXPIRY` env vars — can silently drift out of sync if those env vars change.
- Department scoping logic exists in two different forms: `deptScope` middleware (PC health-card, complaint list) vs. an inline admin/deanInfra-bypass + department-match check duplicated inside `complaint.service.js`'s escalate/resolve — behaviorally consistent today, but not unified.

*(The much longer bug list that used to live in `CLAUDE.md`'s "Known issues" section — the `Role` import, `ObjectID` casing, `userSchema.method` typo, `Obejct.values` typo, default-export `User` import, `prcoess.env` typo — has all been fixed in the current tree. `CLAUDE.md` has not been updated to reflect that; see §6.)*

## 4. Frontend (`frontend/`) — React 19 + Vite, partially built

Run from `frontend/`: `npm run dev` (Vite dev server), `npm run build`, `npm run lint` (oxlint). Talks to the backend via `axios` (`src/services/apiClient.js`, base URL `VITE_API_BASE_URL` or `http://localhost:8000/api/v1`, `withCredentials: true` for the auth cookies, plus a `localStorage` access-token fallback for the `Authorization` header).

### What's actually built
- **Auth flow** (`features/auth/AuthPage.jsx`, 288 lines; `OtpVerification.jsx`, 111 lines) — login/register forms + OTP verification screen, wired to `authService.js` (login, register, logout, refresh, verify-email, verify-login-otp; a `resendOtp` call is wired client-side but has no matching concept issue — the backend route now exists at `/auth/resend-otp`, so this is in sync).
- **Lab Incharge dashboard** (`features/lab-incharge/LabInchargeHome.jsx`, 207 lines) — the one fleshed-out dashboard: complaint list/stats, a `Donut.jsx` chart component, and `ComplaintDetailModal.jsx` for viewing/acting on a single complaint. Currently backed by local mock data (`complaintData.js`), not yet wired to the real `GET /api/v1/complaint` endpoint.
- **Routing** (`app/routes.jsx`) — role-gated routes via `ProtectedRoute.jsx` + `ROLES`/`ROUTES` constants that mirror the backend's role/status enums by hand (`frontend/src/constants/roles.js` has a comment noting it must be kept in sync manually — there's no shared package between frontend/backend).
- **Auth context** (`app/providers/AuthProvider.jsx`) — minimal: just a `user`/`setUser` React context, no token-refresh-on-expiry logic yet.

### What's a stub
`HodHome.jsx`, `DeanInfraHome.jsx`, `LaboratoriesPage.jsx`, `EquipmentPage.jsx`, `InventoryPage.jsx`, `RequestsPage.jsx` are all ~9-line placeholder components — routed to, but with no real content yet. `src/components/charts/` and `src/store/` are empty (`.gitkeep` only) — no state-management library adopted yet.

A `frontend/dist/` build output is checked into the tree from a prior `vite build` run.

## 5. Python agent (`agent/collector.py`)

A single-file, manually-run CLI script (`python agent/collector.py`) — **not** a background service or scheduled task, and not yet mentioned as existing in `CLAUDE.md` (see §6).

- Prompts for a dead-stock number on stdin.
- Collects CPU/RAM/disk/OS via `psutil`/`platform` (cross-platform), plus installed software via a Windows registry scan (`winreg`, Windows-only — silently returns `[]` on non-Windows).
- POSTs `{ deadStockNo, config }` to `{LABMON_BACKEND_URL}/api/v1/pc/sync` (default `http://localhost:8000`, which does **not** match the backend's own sample `.env` default of port 5000 — set `LABMON_BACKEND_URL` explicitly when running the agent locally).
- No authentication on the request (matches the backend's currently-open `/pc/sync` endpoint).
- Dependencies: `psutil`, `requests` (`agent/requirements.txt`); a `venv/` is present locally but gitignored.

## 6. Docs vs. reality — why you lost track

There are **three overlapping sources of "what's built"** in this repo, and they've drifted apart at different times:

1. **`CLAUDE.md`** (repo root) — says only the backend exists, frontend and Python agent are "not yet started," and lists several backend bugs. Both claims are now wrong: the agent and a substantial frontend both exist, and every listed bug has since been fixed.
2. **`backend/docs/*.md`** — a detailed, accurate-as-of-2026-08-13 snapshot of the backend, including its own `known-issues.md` that supersedes `CLAUDE.md`'s bug list. This is the best current backend reference, but it predates: the `dept` module, auth `resend-otp`/`refresh-token`/`logout` routes, and all frontend work (all of which landed in commits after `43ab010`/`220f667`, i.e. `b26a278` through `db47b4d`).
3. **`backend/Readme.md`** — the original product/roadmap doc. Its "Repository Status" section is the most out of date (still frames the agent and frontend as unstarted future work), but its Phase 5 note ("Search (Done)") and data model tables are accurate.
4. **The actual code** (this document's source) — as of commit `db47b4d`, ahead of all three docs above.

**Recommended fix**, if you want the docs to stop drifting: update `CLAUDE.md`'s "Repository Status" and "Known issues" sections to match this document, and treat `backend/docs/` as due for a refresh pass (dept module + auth resend/refresh/logout + frontend now exist and aren't covered there). Ask if you'd like that done as a follow-up edit.

## 7. Suggested next steps (from the roadmap gaps in §3/§4)

1. Wire `LabInchargeHome` to the real `GET /api/v1/complaint` endpoint instead of `complaintData.js` mock data — the backend side is ready.
2. Build out `HodHome`/`DeanInfraHome` against the same complaint-list endpoint (department-scoped for HOD, unscoped for Dean Infra — the backend already supports this via `deptScope`).
3. Add device-key auth to `POST /pc/sync` and role-restriction to `POST /register`, the two flagged open security gaps.
4. Decide on Admin CRUD (Dept/Lab/User/Pc) — currently no create/update/delete endpoints exist for any of these, only reads.
