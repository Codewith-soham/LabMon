# Frontend Design — Phase Plan

What the frontend needs to build, phase by phase, driven strictly by what the backend
already exposes (`backend/src/routes/*`). Each phase only uses endpoints that exist
today — nothing here assumes an unbuilt backend feature. Status reflects the codebase as
of 2026-08-21.

Reference for the "already built" look-and-feel: `features/lab-incharge/LabInchargeHome.jsx`
+ `Donut.jsx` + `ComplaintDetailModal.jsx` + `LabInchargeHome.css`. New role dashboards
should reuse this pattern (stat cards with donut charts, panel + table, detail modal
reusing `AuthPage.css` classes) rather than inventing a new visual language.

## Phase 0: Auth Shell — Done

Backend: `POST /auth/register`, `verify-email`, `resend-otp`, `login`, `verify-login-otp`,
`refresh-token`, `logout`, `GET /auth/me`.

- `AuthPage.jsx` — login/signup tabs, OTP step, role + department selects.
- `OtpVerification.jsx` — OTP entry, resend.
- `AuthProvider.jsx` — calls `GET /auth/me` on mount to rehydrate `user` from the
  still-valid session cookie after a hard refresh (`useAuth.js` hook exposes
  `user`/`setUser`/`loading` from the context).
- `ProtectedRoute.jsx` — role-gated routing via `ROLES`/`ROUTES` constants; redirects to
  `ROUTES.LOGIN` while `loading` is true or the role isn't in `allowedRoles`.
- `apiClient.js` — axios response interceptor: on a 401 (that isn't itself a
  refresh-token call, and hasn't already been retried) it calls
  `POST /auth/refresh-token` once (de-duped via a shared `refreshPromise` so concurrent
  401s only trigger one refresh) and retries the original request.

Closed: the refresh-on-expiry gap called out in the previous version of this doc is done.

## Phase 1: Lab Incharge Dashboard — Done

Backend: `GET /complaint` (auth + deptScope), `PATCH /complaint/:id/escalate`,
`PATCH /complaint/:id/resolve`.

Built: `LabInchargeHome.jsx`, `Donut.jsx`, `ComplaintDetailModal.jsx`,
`ResolveComplaintModal.jsx`, `complaintMeta.js` (status label/color + date formatting),
`LabInchargeHome.css` — header with user name/department badge/logout, 4 stat cards
(total/open/escalated/resolved) with donut charts, complaints table, detail modal with
Escalate/Resolve actions and history.

- `complaintService.js` wraps `GET/PATCH /complaint` via `apiClient`; `LabInchargeHome`
  fetches on mount and replaces the affected complaint in local state from each
  escalate/resolve response rather than refetching the whole list.
- `canAct(complaint)` gates the row/modal actions on `complaint.currentLevel === role`
  (plus not already `Resolved`) — matches the backend's role-gated escalate check instead
  of always offering an action that could 403.
- Resolve goes through `ResolveComplaintModal` (captures remarks) before calling
  `PATCH /complaint/:id/resolve`; escalate is a direct one-click action.
- Loading and error states are wired for both the initial fetch and the
  escalate/resolve actions (`loadError`/`actionError`/`resolveError`).

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
  filtering is even needed. Note `assertDeptAccess` (added in `complaint.service.js`) is
  what enforces department scoping on escalate/resolve server-side — admin/deanInfra
  bypass it, everyone else is locked to their own department — so the HOD dashboard
  doesn't need to duplicate that check client-side, just reuse `canAct` the way
  `LabInchargeHome` does.
- Escalate action here moves a complaint to Dean Infra, not back to Lab Incharge —
  label the button "Escalate to Dean Infra" rather than reusing the generic label from
  Phase 1.
- Extract the stat-card-grid + table + modal shell from `LabInchargeHome` into a shared
  component (e.g. `features/complaints/ComplaintDashboard.jsx`) parameterized by role,
  instead of copy-pasting `LabInchargeHome.jsx` — HOD and Dean Infra are structurally
  the same screen with different data and action labels.

## Phase 3: Dean Infra Dashboard — Not started (`DeanInfraHome.jsx` is a stub)

Backend: `GET /complaint` (deanInfra sees cross-department — `assertDeptAccess` in
`complaint.service.js` explicitly bypasses the department check for `admin`/`deanInfra`),
`PATCH /complaint/:id/resolve` only — Dean Infra is the last level, there is no further
escalate target (`NEXT_LEVEL` has no entry past `deanInfra`).

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

## Phase 5: Public Complaint Submission + Tracking — Done

Backend: `POST /complaint` (public, no auth), `GET /complaint/track/:token` (public).

Built: `RaiseComplaintPage.jsx`, `TrackComplaintPage.jsx`, `PublicComplaint.css` — both
mounted outside `ProtectedRoute` at `/`, `ROUTES.RAISE_COMPLAINT` and
`ROUTES.TRACK_COMPLAINT` respectively, reusing `AuthPage.css` form classes but with their
own page chrome (no logged-in-user header, since there's no session here).

- `raiseComplaint`/`trackComplaint` in `complaintService.js` wrap the two public
  endpoints.
- Raise form collects `deadStockNo`, `description`, `raisedBy: { name, contact }`; on
  success shows the returned tracking token with a "raise another" reset and links to
  track/staff-login.
- Track page takes a token, calls `GET /complaint/track/:token`, and renders
  status/currentLevel/description/createdAt from the response (`STATUS_LABELS`/
  `LEVEL_LABELS` maps built from the `ROLES`/`COMPLAINT_STATUS` constants rather than
  hardcoded strings).
- `RaiseComplaintPage` also serves as the `/` catch-all landing route and the
  `path="*"` redirect target in `routes.jsx`.

## Phase 6: Admin — Blocked on backend (no admin CRUD exists yet)

Backend today has `admin` as a role in `ROLES` and in the CORS/complaint bypass logic,
but there's no admin CRUD route for Dept/Lab/User/Pc — only `GET /dept` (read-only,
already consumed by Phase 0's signup dropdown). **Do not start building an admin panel
UI until the backend actually exposes create/update/delete endpoints** — there's nothing
to wire it to yet, and speculative admin screens would just be dead code sitting on
`InventoryPage.jsx`/`RequestsPage.jsx`'s current stub placeholders.

## Cross-cutting frontend gaps (apply across every phase above)

- **`complaintService.js` now exists** (`services/`, alongside `authService.js` and
  `deptService.js`) and covers `listComplaints`/`escalateComplaint`/`resolveComplaint`/
  `raiseComplaint`/`trackComplaint` — reuse it for Phases 2–3 rather than duplicating axios
  calls. A `pcService.js` for Phase 4's `POST /pc/:id/health-card` + `GET /pc/search` still
  doesn't exist.
- **`ROLES`/`COMPLAINT_STATUS` are hand-mirrored** from `backend/src/config/constants.js`
  into `frontend/src/constants/roles.js` — if the backend enum changes, this file must be
  updated by hand; there's no shared package. Check this file against the backend's
  `constants.js` whenever a phase surfaces a new status/role value.
- **No state-management library** (`src/store/` is empty) — fine for Phases 1–3 if each
  dashboard just fetches its own `GET /complaint` on mount, but revisit if multiple
  screens end up needing the same complaint list simultaneously (e.g. a shared header
  badge showing open-complaint count).
