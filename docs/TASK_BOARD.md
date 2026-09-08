# TASK_BOARD.md

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` completed · `[!]` blocked
Each task: **Phase · Owner · Status · Files · Notes · Testing**. Owner `Claude` unless reassigned.
Update as work proceeds (PRD §27, §28).

---

## BLOCKING DECISIONS — RESOLVED 2026-09-09

| ID | Decision | Status | Notes |
|---|---|---|---|
| D1 | Collapse `deanInfra` → final roles `ADMIN`/`HOD`/`LAB_INCHARGE` | `[x]` locked | Frontend done (Phase 1); backend enum/scope/model cutover = Phase 2. |
| D2 | Remove public staff registration/OTP; Admin creates staff | `[x]` locked | Backend/UI removal = Phase 2/3; login flow unchanged. |
| D3 | Complaint status → `SUBMITTED/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED` | `[x]` locked | Frontend constants/meta done (Phase 1); backend model/service + migration = Phase 2. |
| D4 | Complaint **requires** an existing `Pc` matching `deadStockNo`; backend validates dept/lab against it | `[x]` locked | Per revised `API_CONTRACT.md` §3.3; implementation = Phase 4. |

---

## PHASE 0 — Existing Project Audit  `[x]`

| Task | Status | Files | Notes |
|---|---|---|---|
| Inspect repo (backend/frontend/agent/CI/docs) | `[x]` | — | See `PROJECT_AUDIT.md` §2 |
| Identify frontend / backend / DB / routes / auth / complaint / env / reusable / working / debt | `[x]` | — | `PROJECT_AUDIT.md` §1,§3,§4,§9 |
| Compare against PRD | `[x]` | — | `PROJECT_AUDIT.md` §0,§4,§7 |
| Produce `PROJECT_AUDIT.md` + companion docs | `[x]` | `docs/*.md` | This board + 5 others |
| Implementation plan from actual repo | `[x]` | — | `PROJECT_AUDIT.md` §10,§11 |

---

## PHASE 1 — Foundation  `[x]`  (P0) — completed 2026-09-09

Scope decision (locked with user): **frontend-only** constant/type/route work this phase;
backend enum/model/service/test cutover for D1/D3 is deferred to Phase 2. See `DEVELOPMENT_LOG.md` 2026-09-09.

| Task | Status | Files | Notes | Testing |
|---|---|---|---|---|
| Backend build + full test suite green (sanity, no backend changes) | `[x]` | — | `npm run typecheck`/`build` ✅, `npm test` ✅ 57/57 | — |
| Verify dev servers (`npm run dev`) talk live SPA↔API | `[~]` | — | not run this session; build+tests cover compile/contract | manual (Phase 2) |
| Add `frontend/.env.example` (`VITE_API_BASE_URL=`) | `[x]` | `frontend/.env.example` (new), `frontend/.gitignore` (ignore `.env*` except example) | M18 | — |
| Confirm `.env` ignored | `[x]` | `.gitignore`, `backend/.gitignore`, `frontend/.gitignore` | frontend gitignore now covers it | — |
| TS config review (both `tsconfig` already strict) | `[x]` | — | no change needed | `tsc -b` |
| Final role/status constants + types (frontend) | `[x]` | `frontend/src/constants/roles.ts`, `types/domain.ts` (re-exports), `features/complaints/complaintMeta.ts`, `ComplaintsDashboard.tsx`, `public-complaint/TrackComplaintPage.tsx`, `auth/AuthPage.tsx`, `pc-search/PcSearchPage.tsx` | D1 + D3 (frontend side). `ESCALATED_STATUSES`→`IN_PROGRESS_STATUSES` | `tsc -b`, `lint`, `build` |
| Route rename + scaffold (`/admin-login`,`/hod-login`,`/labincharge-login`,`/*-dashboard`) | `[x]` | `frontend/src/constants/routes.ts`, `app/routes.tsx` | M13; `-login` paths share `AuthPage`; `-dashboard` reuse role homes; legacy paths redirect; new `features/admin/AdminHome.tsx` replaces removed `features/dean-infra/` | `build` |
| Distinct 403 / access-denied view | `[x]` | `components/common/ProtectedRoute.tsx`, `features/errors/ForbiddenPage.tsx` (new), `constants/routes.ts` (`FORBIDDEN`) | M15 — wrong-role → `/403`, unauth → `/login` | `build` |
| Document API conventions | `[x]` | `docs/API_CONTRACT.md` §1 | done Phase 0 | — |
| Docs reflect locked D1–D4 | `[x]` | `docs/DEVELOPMENT_LOG.md`, `ROLES_AND_PERMISSIONS.md`, `TASK_BOARD.md` | — | — |

**Exit:** frontend typecheck/lint/build green; backend untouched + green; PRD route shells + 403 in place; docs updated. Live dev-server smoke test carried into Phase 2.

---

## PHASE 2 — Database + Organization  `[ ]`  (P0; **blocked by D1–D4**)

| Task | Status | Files | Notes |
|---|---|---|---|
| Apply D1 cleanup (remove `deanInfra`) *(if chosen)* | `[!]` | `config/constants.ts`, `utils/scope.ts`, `models/complaint.model.ts`, `frontend/src/constants/roles.ts`, `features/dean-infra/*`, `routes.tsx` | one focused commit |
| Apply D2 cleanup (remove/gate registration + OTP) *(if chosen)* | `[!]` | `routes/auth.route.ts`, `services/auth.service.ts`, `utils/otp.ts`, `utils/mailer.ts`, `models/user.model.ts`, `middlewares/rateLimiter.ts`, `validators/auth.validator.ts`, `.env.example`, `features/auth/AuthPage.tsx`, `OtpVerification.tsx` | |
| `User.isActive` (+ index) | `[ ]` | `models/user.model.ts` | M2 |
| `User.lab` (ObjectId → Lab, nullable) | `[ ]` | `models/user.model.ts` | M3 |
| `User.tokenVersion` | `[ ]` | `models/user.model.ts` | S4 |
| `Lab.labNumber` + unique `{department,name}` index | `[ ]` | `models/lab.model.ts` | M14 |
| `Complaint`: `deadStockNo` string, `pc` optional | `[!]` | `models/complaint.model.ts` | D4 |
| `Complaint`: status enum → 5-state, `ownerLevel`, `assignedTo` | `[!]` | `models/complaint.model.ts`, `config/constants.ts` | D3 |
| `AuditLog` model | `[ ]` | `models/auditLog.model.ts` (new) | M11 |
| `seedAdmin.ts` (env-driven, idempotent) | `[ ]` | `src/scripts/seedAdmin.ts` (new), `package.json`, `.env.example` (`ADMIN_EMAIL`,`ADMIN_PASSWORD`) | M12 |
| `seedLabs.ts` — IT Lab 9–14 | `[ ]` | `src/scripts/seedLabs.ts` (new), `package.json` | M14 |
| `migrateUsers.ts`, `migrateComplaints.ts` (+ `--dry-run`) | `[!]` | `src/scripts/*` (new) | `DATABASE.md` §4 |
| Update backend tests for new schema | `[!]` | `src/tests/*.test.ts` | keep harness |

**Exit:** DB represents `IT → Lab 9..14`; Admin account exists; schemas + migrations ready; `npm run typecheck` + `npm test` green.

---

## PHASE 3 — Authentication + RBAC  `[ ]`  (P0; blocked by Phase 2)

| Task | Status | Files | Notes |
|---|---|---|---|
| Keep login flow; add `!isActive` → 403 | `[ ]` | `services/auth.service.ts#loginUser` | S2 |
| `tokenVersion` in access claim + `auth` middleware check | `[ ]` | `utils/tokenGeneration.ts`, `middlewares/auth.middleware.ts`, `types/auth.ts` | S4 |
| `logout` / deactivate / role-change bump `tokenVersion` | `[ ]` | `services/auth.service.ts`, admin services | S4 |
| `buildLabScope` + `assertLabAccess` in `scope.ts` | `[ ]` | `utils/scope.ts` | M3 / S3 |
| `labScope` middleware (or in-service) | `[ ]` | `middlewares/deptScope.middleware.ts` (extend) or new | |
| `roleCheck(ADMIN)` on all `/api/v1/admin/*` | `[ ]` | `routes/admin.route.ts` (new), `app.ts` | |
| Complaint list/detail/actions filtered by lab for Lab Incharge | `[ ]` | `services/complaint.service.ts` | PRD §8 "mandatory" |
| `GET /auth/me` returns `lab` populated | `[ ]` | `services/auth.service.ts`, `controllers/auth.controller.ts`, `frontend types/domain.ts` | |
| Authz test matrix (PRD §3) | `[ ]` | `src/tests/authz.test.ts` (new) | HOD→admin 403; LI→admin 403; IT HOD→MECH 403; Lab12→Lab13 403; unauth→dashboard 401 |

**Exit:** all PRD §3 mandatory authz tests pass.

---

## PHASE 4 — Public Complaint System  `[ ]`  (P0; blocked by Phase 2, D3, D4)

| Task | Status | Files | Notes |
|---|---|---|---|
| `GET /dept/:id/labs` endpoint | `[ ]` | `routes/dept.route.ts`, `controllers/dept.controller.ts`, `services/dept.service.ts` | M14 feed |
| Rework `createComplaint`: no PC required; dept+lab from form; verify lab∈dept | `[ ]` | `services/complaint.service.ts`, `validators/complaint.validator.ts` | D4 |
| Token format `LM-<DEPTCODE>-<rand>` + collision retry | `[ ]` | `services/complaint.service.ts` | M6 |
| Set initial `status: SUBMITTED`, `ownerLevel: labIncharge`, first history entry | `[ ]` | `services/complaint.service.ts` | D3 |
| `RaiseComplaintPage`: Department + Lab dropdowns; drop `lookupPc` blur | `[ ]` | `features/public-complaint/RaiseComplaintPage.tsx`, `services/deptService.ts`, `services/pcService.ts` | M5 |
| Backend validation on all fields (PRD §22) | `[ ]` | `validators/complaint.validator.ts` | |
| Success screen with token + copy + "track" link | `[ ]` | `RaiseComplaintPage.tsx` | already partly present |
| Tests: submit → row created → unique token | `[ ]` | `src/tests/complaint.test.ts` | rewrite for new model |

---

## PHASE 5 — Public Tracker  `[ ]`  (P1; blocked by Phase 4)

| Task | Status | Files | Notes |
|---|---|---|---|
| Richer `track` payload (dept, lab, deadStock, lastUpdated, timeline) — no staff PII | `[ ]` | `services/complaint.service.ts#trackComplaint`, `types/domain.ts` | M7 |
| `/track-complaint` page: details + status + timeline | `[ ]` | `features/public-complaint/TrackComplaintPage.tsx` | |
| States: loading / empty / invalid token / no-token validation | `[ ]` | `TrackComplaintPage.tsx` | PRD §5 |
| Tests: valid → shown; invalid → error; empty → validation | `[ ]` | `src/tests/complaint.test.ts` | |

---

## PHASE 6 — Admin System  `[ ]`  (P1; blocked by Phase 3)

| Task | Status | Files | Notes |
|---|---|---|---|
| `/api/v1/admin` router + `roleCheck(ADMIN)` | `[ ]` | `routes/admin.route.ts`, `app.ts` | |
| `GET /admin/dashboard` (system totals + by department) | `[ ]` | `controllers/admin.controller.ts`, `services/admin.service.ts` | M8 |
| HOD CRUD (`GET/POST/PATCH/DELETE /admin/hods`) + activate/deactivate + assign dept | `[ ]` | `services/admin.service.ts` | M1 |
| Lab-Incharge CRUD + activate/deactivate + assign dept + lab | `[ ]` | `services/admin.service.ts` | M1 |
| Audit-log write on every admin mutation | `[ ]` | `services/admin.service.ts`, `models/auditLog.model.ts` | M11 |
| `GET /admin/audit-logs` | `[ ]` | `services/admin.service.ts` | |
| Admin dashboard UI (overview + staff tables + create/edit modals) | `[ ]` | `features/admin/*` (new) | |
| `/admin-login` + `/admin-dashboard` routes + ProtectedRoute | `[ ]` | `app/routes.tsx`, `constants/routes.ts` | M13 |
| Tests: full staff-management workflow; 409 on dup email; deactivated user cannot log in | `[ ]` | `src/tests/admin.test.ts` (new) | |

---

## PHASE 7 — HOD System  `[ ]`  (P1; blocked by Phase 3, Phase 6, Phase 4)

| Task | Status | Files | Notes |
|---|---|---|---|
| `GET /hod/dashboard` (dept totals, by lab, lab-incharge overview, recent) | `[ ]` | `services/hod.service.ts` (or fold into complaint/admin) | M8/M10 |
| Department-scoped complaint list + detail + management actions | `[ ]` | `services/complaint.service.ts` | |
| Escalate (HOD → Admin/Infra) when owner | `[ ]` | `services/complaint.service.ts` | D1-dependent |
| Reopen incorrectly-resolved complaint | `[ ]` | `services/complaint.service.ts` | M9 |
| HOD dashboard UI | `[ ]` | `features/hod/*`, reuse `ComplaintsDashboard` shell | |
| Test: HOD **never** receives another department's data | `[ ]` | `src/tests/complaint.test.ts` / `authz.test.ts` | PRD §7 mandatory |

---

## PHASE 8 — Lab Incharge System  `[ ]`  (P1; blocked by Phase 3, Phase 6, Phase 4)

| Task | Status | Files | Notes |
|---|---|---|---|
| `GET /lab-incharge/dashboard` (lab totals, workload, recent) | `[ ]` | `services/*` | M8 |
| Lab-scoped complaint list + detail | `[ ]` | `services/complaint.service.ts` | S3 |
| `PATCH /complaint/:id/status` — validated transitions | `[ ]` | `services/complaint.service.ts` | M9/D3 |
| `PATCH /complaint/:id/assign` (if staff feature) | `[ ]` | `services/complaint.service.ts` | M9 |
| Remarks on transitions; resolution verification; reopen; escalate to HOD | `[ ]` | `services/complaint.service.ts` | M9 |
| Lab Incharge dashboard UI | `[ ]` | `features/lab-incharge/*` | |
| Test: Lab Incharge **never** receives another lab's data | `[ ]` | `src/tests/*` | PRD §8 mandatory |

---

## PHASE 9 — End-to-End Integration  `[ ]`  (P0)

| Task | Status | Notes |
|---|---|---|
| PRD §24 full scenario (public raise → track → admin creates HOD+LI → HOD sees dept → LI sees lab → update → tracker reflects) | `[ ]` | scripted / manual |
| Persistence across server restart | `[ ]` | |

---

## PHASE 10 — Security + QA  `[ ]`  (P0)

| Task | Status | Files | Notes |
|---|---|---|---|
| Per-account login lockout | `[ ]` | `models/user.model.ts`, `services/auth.service.ts` | S5 |
| `app.set("trust proxy", …)` | `[ ]` | `app.ts` | S6 |
| `refreshLimiter` on `/auth/refresh-token` | `[ ]` | `middlewares/rateLimiter.ts`, `routes/auth.route.ts` | S7 |
| Full auth/authz/complaint/general test matrix (PRD §10) | `[ ]` | `src/tests/*` | |
| Frontend tests + add to CI | `[ ]` | `frontend/`, `.github/workflows/ci.yml` | |
| Refresh `CLAUDE.md` / retire `docs/info.md` | `[ ]` | — | doc drift |

---

## Backlog / explicitly deferred (not V1)

| Item | Reason |
|---|---|
| Agent auth (`/pc/sync` device key) | PRD §3 — asset system future phase |
| Desktop tray app, Python collector integration, hardware telemetry, asset DB | PRD §3, §29 |
| Equipment / Inventory / Requests pages | not in PRD V1 (stubs left dormant) |
| Dockerfile / deploy automation / load testing | PRD Phase 7 (partial: CI exists) |
| Shared frontend/backend types package | nice-to-have; parity check instead |
