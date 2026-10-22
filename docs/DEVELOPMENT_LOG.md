# DEVELOPMENT_LOG.md

Chronological record of work on the VCET LABMON V1 modification effort.
One entry per working session / phase. Newest first. (PRD §26 Rule 10, §27.)

---

## 2026-09-09 — Phase 2 (cont.): execute + verify the data migration

**Owner:** Claude (branch `person-1`)
**Type:** migration — data only. No business-logic changes. No Phase 3/4 work.

### What ran
- `MONGO_URL` in `backend/.env` points at a **shared Atlas cluster**
  (`cluster0.k5lgkyi.mongodb.net`) — not touched. No local mongod/docker/mongosh
  available, so a private throwaway MongoDB was stood up with
  `mongodb-memory-server` (v10, installed only in the scratchpad — **no change to
  `backend/package.json`**), seeded with representative legacy + already-correct +
  unrelated data, and the migration run against that.
- `npm run migrate:roles-statuses -- --dry-run` → `npm run migrate:roles-statuses`
  → dry-run again (idempotency) → second apply (idempotency). Full before/after
  collection snapshots diffed field-by-field.

### Migration script fixes (`backend/src/scripts/migrateRolesAndStatuses.ts`)
- **Bug:** `dotenv.config()` ran *after* the model imports, which transitively
  evaluate `src/config/env.ts` (validates `JWT_*` at import time) — the script
  crashed before connecting unless the shell already exported every var. Fixed by
  switching to `import "dotenv/config";` as the first import, matching `server.ts`.
- Added a consolidated end-of-run SUMMARY block (Users migrated / Complaints
  migrated / Current levels migrated / Already-correct records / Errors), an
  `errors` counter with try/catch around the steps, and a WARNING line for values
  that are neither legacy-mapped nor valid V1. Mapping and write behaviour
  unchanged. `prettier --check`, `typecheck`, `build` all green.

### Results (against the safe copy: 5 users, 6 complaints, 1 dept, 1 lab)
- Users migrated: 2 (`deanInfra` → `admin`). Complaints migrated: 4 legacy
  statuses → `SUBMITTED`/`RESOLVED`. Current levels migrated: 1 (`deanInfra` →
  `hod`). History arrays rewritten: 2 (`history[].level` `deanInfra` → `hod`).
  Errors: 0.
- Post-migration: 0 `deanInfra` roles, 0 legacy statuses, 0 legacy `currentLevel`,
  0 legacy `history.level`. Second dry-run + second apply: 0 changes (idempotent).
- Integrity: field-level before/after diff shows **only** `role` / `status` /
  `currentLevel` / `history[].level` changed. No docs added/deleted, `createdAt` /
  `updatedAt` / `history` `by`/`at`/`note`/`action` / depts / labs all untouched.
- Backend: `typecheck` ✅ · `prettier --check` ✅ · `build` ✅ · `npm test` ✅ 59/59
  (run against a separate MMS db, not Atlas).
- Live smoke: backend booted against the migrated db; admin / hod / labIncharge
  all log in with the correct role claim; a migrated ex-`deanInfra` user now
  authenticates as `admin`; `GET /complaint` returns only V1 `status`
  (`SUBMITTED`/`RESOLVED`) and `currentLevel` (`labIncharge`/`hod`) values — every
  one has a `frontend/.../complaintMeta.ts` `STATUS_META` / `LEVEL_LABEL` entry, so
  no meta mismatch; unauthenticated `GET /complaint` → 401.

### Still open (unchanged, Phase 3+)
- The migration has **not** been run against the shared Atlas database — that
  requires a maintainer with a safe target (backup/restore copy or a maintenance
  window) to run `npm run migrate:roles-statuses -- --dry-run` then without the
  flag, against that copy.
- Seeds: no `seedAdmin.ts` yet (Phase 3). Current seeds (`seed.ts`,
  `seedDepartments.ts`) create no `User` docs, so none can create `deanInfra`.

---

## 2026-09-09 — Phase 2: Backend role/status/currentLevel migration

**Owner:** Claude (branch `person-1`)
**Type:** migration + test — **backend only.** Scope limited to making the backend
domain model match the Phase 1 frontend contract. No Phase 3/4 work (no `isActive`,
no lab scope, no `seedAdmin`/`seedLabs`, no no-PC complaints, no new endpoints).

### Role migration (`legacy → new`)
- `deanInfra` → `admin` (removed `ROLES.DEAN_INFRA`; `admin` takes the top-authority slot).
- `admin`, `hod`, `labIncharge` unchanged. `ROLES` is now exactly the 3 PRD roles and
  matches `frontend/src/constants/roles.ts` verbatim.

### Status migration (`legacy → new`)
- `Open` → `SUBMITTED` · `Escalated_HOD` → `SUBMITTED` · `Escalated_Dean` → `SUBMITTED`
  · `Resolved` → `RESOLVED`. Full new enum: `SUBMITTED/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED`.
- **Escalation is now decoupled from status** (locked D3): escalating changes the owner
  level and appends history; it no longer mutates `status`. `STATUS_FOR_LEVEL` deleted.

### currentLevel migration (`legacy → new`)
- `deanInfra` → `hod`. Valid values are now `labIncharge | hod` (derived from `ROLES`).
- `NEXT_LEVEL` reduced to `labIncharge → hod`; `hod` is the escalation ceiling
  (escalating past it → `400 "Complaint is already at the highest escalation level"`).

### Done (files changed)
- `backend/src/config/constants.ts` — `ROLES` (drop `DEAN_INFRA`); `COMPLAINT_STATUS`
  → 5-state lifecycle; `NEXT_LEVEL` → `{ labIncharge: hod }`; added `TERMINAL_STATUSES`
  (`RESOLVED`,`CLOSED`); removed `STATUS_FOR_LEVEL`.
- `backend/src/models/complaint.model.ts` — `status` default `SUBMITTED`; enums track
  the constants automatically.
- `backend/src/services/complaint.service.ts` — create → `SUBMITTED`; escalate no longer
  sets status; escalate/resolve guards use `TERMINAL_STATUSES` (reject `RESOLVED` **and**
  `CLOSED`).
- `backend/src/utils/scope.ts` — `isDeptUnscoped` = admin only; `buildComplaintScope`
  drops the `deanInfra` branch (admin `{}`, hod `{department, currentLevel: hod}`,
  labIncharge `{department}`).
- `backend/src/routes/complaint.route.ts` — `resolve` roleCheck drops `DEAN_INFRA`.
- `backend/src/routes/pc.route.ts` — `search` / `health-card` roleChecks drop `DEAN_INFRA`.
- `backend/src/types/auth.ts` — comment.
- `backend/src/tests/complaint.test.ts`, `pc.search.test.ts`, `healthcard.test.ts` —
  updated assertions to the new model; removed `deanInfra`/`Escalated_*` cases; added
  model-level negative tests (role/status/currentLevel enum rejection) + an API-value
  assertion test.
- `backend/src/scripts/migrateRolesAndStatuses.ts` — **new**, idempotent, `--dry-run`
  supported; `npm run migrate:roles-statuses`. Maps the values above.

### Database migration
- Script **created, NOT executed.** `MONGO_URL` points at a shared Atlas cluster; per
  PRD (no destructive ops against a shared/production DB) it was not run in this
  environment. Run `npm run migrate:roles-statuses -- --dry-run` against a backup copy
  first, then without the flag to apply.

### Legacy references
- No active backend references to `deanInfra` / legacy statuses remain. Remaining
  mentions are intentional: the migration script's mapping, and negative tests that
  assert the schema now rejects those values.

### Testing
- Backend: `npm run typecheck` ✅ · Prettier `--check` ✅ · `npm run build` ✅ ·
  `npm test` ✅ **59/59** (was 57; +4 new, −2 removed deanInfra cases).
- Frontend: not touched this phase.

### Next
- Phase 3 — Auth + RBAC (`isActive`, `tokenVersion`, lab scope, admin route protection).

---

## 2026-09-09 — Phase 1: Foundation

**Owner:** Claude
**Type:** refactor + docs — **frontend only; backend source untouched.**

### Decisions locked (inputs to this phase)
- **D1** — final roles are `ADMIN`, `HOD`, `LAB_INCHARGE`; `deanInfra` removed. Escalation chain tops out at HOD.
- **D2** — no public staff registration/OTP long-term; Admin creates staff. (Removal itself is Phase 2/3; not done here.)
- **D3** — complaint statuses are `SUBMITTED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.
- **D4** — a complaint requires an existing `Pc` matching `deadStockNo`; backend validates it (per revised `API_CONTRACT.md`).

### Done (frontend)
- `src/constants/roles.ts` — `ROLES` reduced to the 3 final roles; `COMPLAINT_STATUS` replaced with the 5-state lifecycle; added `NEXT_LEVEL` (`labIncharge → hod`). `ComplaintLevel` now = `labIncharge | hod`.
- `src/constants/routes.ts` — added the PRD route names: `/admin-login`, `/hod-login`, `/labincharge-login`, `/admin-dashboard`, `/hod-dashboard`, `/labincharge-dashboard`, plus `/403`. Old `/lab-incharge`, `/hod`, `/dean-infra` kept as `LEGACY_ROUTES` redirects.
- `src/app/routes.tsx` — new route table; the three `-login` paths render the shared `AuthPage`; the three `-dashboard` paths are role-gated and reuse the existing role-home wrappers; legacy paths redirect; `/dean-infra` → `/admin-dashboard`.
- `src/components/common/ProtectedRoute.tsx` — wrong-role (authenticated) users now go to `/403`, not silently to `/login`. Unauthenticated still → `/login`.
- `src/features/errors/ForbiddenPage.tsx` — new 403 Access Denied screen (role-aware CTA back to the user's dashboard / login).
- `src/features/admin/AdminHome.tsx` — new thin wrapper (reuses `ComplaintsDashboard`, unscoped) replacing the removed `features/dean-infra/`.
- Remapped status/role references in `complaintMeta.ts`, `ComplaintsDashboard.tsx` (stats/filter "Escalated" → "In Progress"), `TrackComplaintPage.tsx`, `AuthPage.tsx`, `PcSearchPage.tsx`. `ESCALATED_STATUSES` → `IN_PROGRESS_STATUSES`.
- `frontend/.env.example` — added (`VITE_API_BASE_URL`). `.gitignore` now ignores `.env*` except the example.

### Deviations / deferred
- Backend constants, `complaint.model` enums, `complaint.service`, `scope.ts` and backend tests **still use the legacy 4-role / old-status set** — the D1/D3 cutover is Phase 2 (needs the DB migration). Live dashboard status rendering will not fully match the API until then.
- Public registration / OTP UI (`AuthPage` Sign Up tab, `OtpVerification`) left in place — D2 removal is Phase 2/3.
- New `-login` / `-dashboard` routes reuse existing screens; no Admin/HOD/Lab-Incharge feature work (out of Phase 1 scope).

### Testing
- Frontend: `npx tsc -b --force` ✅ · `npm run lint` ✅ (2 pre-existing warnings only) · `npm run build` ✅.
- Backend (unchanged, sanity): `npm run typecheck` ✅ · `npm run build` ✅ · `npm test` ✅ 57/57.

### Next
- Phase 2 — Database + Organization: apply D1/D2 cleanup in the backend, `User.isActive`/`.lab`, `Lab` model + seed IT Labs 9–14, `seedAdmin`, D3/D4 schema + `migrateComplaintStatus`.

---

## 2026-09-08 — Phase 0: Existing Project Audit

**Owner:** Claude
**Type:** audit only — **no source code changed.**

### Done
- Read `prd.md` in full (VCET LABMON PRD, 31 sections + 11 phases).
- Inspected the entire repo (excluding `node_modules` / `agent` internals / gitignored personal scripts):
  - Backend: `app.ts`, `server.ts`, all `config/`, `models/`, `routes/`, `controllers/`, `services/`, `middlewares/`, `validators/`, `utils/scope.ts` + `tokenGeneration.ts` + `requireAuth.ts`, `types/`, `scripts/`, `tests/complaint.test.ts`, `package.json`, `.env.example`, `tsconfig*.json`, `backend/docs/known-issues.md` + `phases.md`.
  - Frontend: `app/` (`routes.tsx`, `AuthProvider.tsx`), `components/common/ProtectedRoute.tsx`, `constants/`, `services/` (all 5), `features/auth/AuthPage.tsx`, `features/public-complaint/*`, `features/complaints/ComplaintsDashboard.tsx`, role-home wrappers, `features/equipment/EquipmentPage.tsx`, `types/domain.ts`, `package.json`, `tsconfig*`.
  - Root: `.gitignore`, `.github/workflows/ci.yml`, `docs/info.md` (§1–12).
- Established that both backend and frontend were migrated to **strict TypeScript** (commits `524d56f` + prior); working tree is clean apart from untracked `prd.md` and deleted `currentSystem.md` / `task.md`.
- Produced the full `docs/` set:
  - `PROJECT_AUDIT.md` — architecture, files inspected, feature inventory, PRD gap analysis (M1–M18), security concerns (S1–S10), 4 blocking decisions (D1–D4), DB migration plan, phase dependency graph, risks, completion status.
  - `ARCHITECTURE.md` — as-built + target deltas.
  - `ROLES_AND_PERMISSIONS.md` — as-built + target permission matrices, scope model, enforcement checklist.
  - `API_CONTRACT.md` — as-built 18 endpoints + target additions, conventions, validation rules.
  - `DATABASE.md` — as-built schemas, PRD §14 mapping, target schema changes, migration scripts, seed data.
  - `TASK_BOARD.md` — phase-by-phase task breakdown with the PRD status legend.
  - `DEVELOPMENT_LOG.md` — this file.

### Key findings (see `PROJECT_AUDIT.md` for detail)
- A working, well-structured complaint system already exists (auth, dept-scoped RBAC, public raise/track, role dashboard, validation, rate limiting, CI, tests). **Preserve it.**
- It targets a different domain model than the PRD: 4 roles incl. `deanInfra` vs PRD's 3; status enum conflates escalation with lifecycle; complaint creation requires a pre-existing `Pc`; public self-registration as any role incl. `admin`; **no Admin dashboard / user CRUD at all**; no `isActive`; no lab-level scope; labs are auto-created ad-hoc with no numbers/CRUD/seed.
- The Python agent / PC-asset subsystem is **out of scope for V1** (PRD §3) — leave untouched, do not delete.

### Blocking — needs user input before Phase 1
- **D1** collapse `deanInfra` → `admin`? (recommended)
- **D2** remove public OTP registration; seed Admin securely? (recommended)
- **D3** migrate complaint status to `SUBMITTED/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED`, decoupling escalation? (recommended)
- **D4** stop requiring a `Pc` record for a complaint (store `deadStockNo` string)? (recommended)

### Next
- Await D1–D4. Then Phase 1 (Foundation): verify startup, add `frontend/.env.example`, scaffold PRD route names + 403 view.

### Testing
- No tests run this phase (audit only). Existing suite state per CI: `typecheck` + `build` + `npm test` green as of last `main` push.

### Files modified
- None. Added: `docs/PROJECT_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/ROLES_AND_PERMISSIONS.md`, `docs/API_CONTRACT.md`, `docs/DATABASE.md`, `docs/TASK_BOARD.md`, `docs/DEVELOPMENT_LOG.md`.

### Remaining issues / open risks
- D1–D4 unresolved (blocking Phase 2+).
- Frontend/backend enum drift risk (no shared package).
- Unknown whether any real production data exists in the target Mongo (affects migration risk).
- Access-token claims not re-verified mid-session (S4) — must be fixed in Phase 3 before admin role/deactivation features land.

---

<!-- Template for future entries:

## YYYY-MM-DD — Phase N: <title>

**Owner:**
**Type:** feature | fix | refactor | migration | test | docs

### Done
- …

### Decisions / deviations
- …

### Testing
- `npm run typecheck` (backend): …
- `npm test` (backend): … / N passing
- `npm run typecheck && npm run build` (frontend): …
- Manual: …

### Files modified
- …

### Remaining issues
- …

### Next
- …
-->
