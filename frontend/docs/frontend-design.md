# Frontend Design — Phase Plan

What the frontend needs to build, phase by phase, driven strictly by what the backend
already exposes (`backend/src/routes/*`). Each phase only uses endpoints that exist
today — nothing here assumes an unbuilt backend feature. Status reflects the codebase as
of 2026-08-20.

Reference for the "already built" look-and-feel: `features/lab-incharge/LabInchargeHome.jsx`
+ `Donut.jsx` + `ComplaintDetailModal.jsx` + `LabInchargeHome.css`. New role dashboards
should reuse this pattern (stat cards with donut charts, panel + table, detail modal
reusing `AuthPage.css` classes) rather than inventing a new visual language.

## Phase 0: Auth Shell — Done

Backend: `POST /auth/register`, `verify-email`, `resend-otp`, `login`, `verify-login-otp`,
`refresh-token`, `logout`.

- `AuthPage.jsx` — login/signup tabs, OTP step, role + department selects.
- `OtpVerification.jsx` — OTP entry, resend.
- `AuthProvider.jsx` — holds `user`, no refresh-on-expiry yet (tracked as a gap below).
- `ProtectedRoute.jsx` — role-gated routing via `ROLES`/`ROUTES` constants.

**Gap to close in this phase before moving on:** `AuthProvider` doesn't call
`POST /auth/refresh-token` on 401, so a session silently dies when the access-token
cookie expires (15m) instead of transparently refreshing. Add an axios response
interceptor in `apiClient.js` that retries once after a refresh call.

## Phase 1: Lab Incharge Dashboard — Partially done (UI done, wired to mock data)

Backend: `GET /complaint` (auth + deptScope), `PATCH /complaint/:id/escalate`,
`PATCH /complaint/:id/resolve`.

Built: `LabInchargeHome.jsx`, `Donut.jsx`, `ComplaintDetailModal.jsx`,
`LabInchargeHome.css` — header, 4 stat cards (total/open/escalated/resolved) with donut
charts, complaints table, detail modal with Escalate/Resolve actions and history.

**Still needed:**
- Replace `complaintData.js` mock array with a real `complaintService.js`
  (`GET /complaint` via `apiClient`) called on mount.
- Wire `handleEscalate`/`handleResolve` to `PATCH /complaint/:id/escalate` and
  `/resolve` instead of local array mutation; refetch or optimistically patch state
  from the response.
- Role check: `escalate` is only valid when `complaint.currentLevel === 'labIncharge'`
  for this role — hide/disable the button otherwise (backend already 403s, but the UI
  shouldn't offer an action that will fail).
- Loading/error states for the initial fetch (currently assumes data is always present).

## Phase 2: HOD Dashboard — Not started (`HodHome.jsx` is a stub)

Backend: same `GET /complaint` (deptScope means an HOD sees their department's
complaints — no separate endpoint), `PATCH /complaint/:id/escalate` (role-gated to
whichever role owns the complaint's *current* level — HOD can escalate to Dean Infra),
`PATCH /complaint/:id/resolve`.

- Same visual pattern as Lab Incharge: stat cards + table + detail modal.
- Difference in data shape: HOD's queue is complaints where `currentLevel === 'hod'`
  (i.e. `status === 'Escalated_HOD'`) plus visibility into ones already resolved/escalated
  further, per whatever `GET /complaint` returns for this role — confirm the actual
  filtering behavior in `complaint.service.js`'s `list` before assuming client-side
  filtering is even needed.
- Escalate action here moves a complaint to Dean Infra, not back to Lab Incharge —
  label the button "Escalate to Dean Infra" rather than reusing the generic label from
  Phase 1.
- Extract the stat-card-grid + table + modal shell from `LabInchargeHome` into a shared
  component (e.g. `features/complaints/ComplaintDashboard.jsx`) parameterized by role,
  instead of copy-pasting `LabInchargeHome.jsx` — HOD and Dean Infra are structurally
  the same screen with different data and action labels.

## Phase 3: Dean Infra Dashboard — Not started (`DeanInfraHome.jsx` is a stub)

Backend: `GET /complaint` (deanInfra likely sees cross-department, per the
admin/deanInfra-bypass noted in `complaint.service.js`), `PATCH /complaint/:id/resolve`
only — Dean Infra is the last level, there is no further escalate target
(`NEXT_LEVEL` has no entry past `deanInfra`).

- Same shared dashboard component as Phase 2, role=`deanInfra`.
- No Escalate action at all — only Resolve. The action column should reflect that
  structurally, not just hide a disabled button.
- Since Dean Infra isn't department-scoped, the table needs a Department column/filter
  that Lab Incharge and HOD views don't need (they already know their own department).

## Phase 4: PC Health Card + Search — Not started

Backend: `POST /pc/:id/health-card` (yes, `POST` not `GET` — noted as a known backend
sharp edge, not a frontend choice to make), `GET /pc/search` (auth + role-gated to
labIncharge/hod/deanInfra + deptScope).

- A PC lookup/search screen: form hitting `GET /pc/search` with whatever query params
  the backend supports (check `pc.service.js`'s `searchPc` for the actual filterable
  fields — likely cpu/ram/disk/os/software — before building filter UI around fields
  that don't exist).
- A health-card detail view: calls `POST /pc/:id/health-card`, renders the embedded
  `warranty` and `config` (cpu/ram/disk/os/software/lastSyncedAt) subdocuments.
- This is what `LaboratoriesPage.jsx`/`EquipmentPage.jsx` stubs are presumably meant to
  become — confirm with whoever scoped those feature folders whether "Laboratories" is
  PC-per-lab and "Equipment" is PC-per-department, since the backend only has one `Pc`
  model with `Dept`/`Lab` refs, not two distinct domain concepts.

## Phase 5: Public Complaint Submission + Tracking — Not started

Backend: `POST /complaint` (public, no auth), `GET /complaint/track/:token` (public).

- A public, login-free route (outside `ProtectedRoute`) for submitting a complaint:
  needs whatever fields `raiseComplaint`/the `Complaint` schema require (pc reference,
  description, etc. — check `complaint.model.js` and `complaint.controller.js` for the
  exact required body before building the form).
- A public token-lookup page: enter a token, hit `GET /complaint/track/:token`, show
  status + history — no auth, no role gating, should not live inside the
  `ProtectedRoute` tree at all.
- This is the one phase with zero role gating; don't reuse `ProtectedRoute` styling
  assumptions (e.g. header showing a logged-in user) here.

## Phase 6: Admin — Blocked on backend (no admin CRUD exists yet)

Backend today has `admin` as a role in `ROLES` and in the CORS/complaint bypass logic,
but there's no admin CRUD route for Dept/Lab/User/Pc — only `GET /dept` (read-only,
already consumed by Phase 0's signup dropdown). **Do not start building an admin panel
UI until the backend actually exposes create/update/delete endpoints** — there's nothing
to wire it to yet, and speculative admin screens would just be dead code sitting on
`InventoryPage.jsx`/`RequestsPage.jsx`'s current stub placeholders.

## Cross-cutting frontend gaps (apply across every phase above)

- **No shared complaint/PC service layer yet** — only `authService.js` and
  `deptService.js` exist in `services/`. Phases 1–5 all need
  `complaintService.js`/`pcService.js` wrapping the relevant `apiClient` calls; build
  these once and share them rather than duplicating axios calls per feature folder.
- **`ROLES`/`COMPLAINT_STATUS` are hand-mirrored** from `backend/src/config/constants.js`
  into `frontend/src/constants/roles.js` — if the backend enum changes, this file must be
  updated by hand; there's no shared package. Check this file against the backend's
  `constants.js` whenever a phase surfaces a new status/role value.
- **No state-management library** (`src/store/` is empty) — fine for Phases 1–3 if each
  dashboard just fetches its own `GET /complaint` on mount, but revisit if multiple
  screens end up needing the same complaint list simultaneously (e.g. a shared header
  badge showing open-complaint count).
