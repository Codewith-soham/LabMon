# DEVELOPMENT_LOG.md

Chronological record of work on the VCET LABMON V1 modification effort.
One entry per working session / phase. Newest first. (PRD §26 Rule 10, §27.)

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
