# Known Issues

Bugs and gaps found while reading the current tree (last verified 2026-08-24), so they
don't need to be rediscovered from scratch. Cross-referenced from the module docs where
relevant. A number of bugs previously listed here (and in `CLAUDE.md`'s older "Known
issues" section) have since been fixed in the code — see "Already fixed" at the bottom.

## Missing authorization

### `POST /register` has no access control

Per `backend/Readme.md`'s planned API surface, registration should be "Admin only," but
`src/routes/auth.route.js` mounts `register` with no `auth`/`roleCheck` at all — anyone
can self-register as any role, including `admin`. See
[`auth-module.md`](./auth-module.md#flow-a-registration--email-verification).

### `POST /pc/sync` has no device authentication

Per `backend/Readme.md`, this endpoint should require an "Agent device key." No such
check exists on either side (`pc.route.js` has no middleware on `/sync`;
`agent/collector.py` sends no credential). Anyone who can reach the server and knows (or
guesses) a valid `deadStockNo` can overwrite that PC's config — or, since `syncPcConfig`
also supports first-time provisioning, create a brand-new PC record by supplying an
unused `deadStockNo` plus a real `department`/`lab` name. See
[`pc-module.md`](./pc-module.md) and [`agent.md`](./agent.md#no-authentication).

### `POST /resend-otp` doesn't verify the caller owns the email

It only takes `{ email, purpose }` in the body — no OTP, password, or session proves the
caller controls that inbox. Not an account-takeover vector (nothing about the account
changes until the *correct* OTP comes back), but it is an unauthenticated way to trigger
repeated email sends to an arbitrary address. See
[`auth-module.md`](./auth-module.md#notable-gaps-in-this-module-see-also-known-issuesmd).

## Design inconsistencies (not bugs, but worth knowing before extending)

### Department/level scoping is implemented three different ways

- `deptScope` middleware — used only on the PC health-card route today. Produces
  `req.scope` (`{}` for admin/deanInfra, `{ department: user.department }` otherwise).
- `complaint.service.js`'s `assertDeptAccess` — an inline helper used by
  `escalateComplaint`/`resolveComplaint`, same admin/deanInfra-bypass + department-match
  rule, but not routed through `deptScope`.
- `complaint.service.js`'s `buildComplaintScope` — used by `getComplaints` (the `list`
  route). More than department scoping: `hod`/`deanInfra` are further filtered to only
  complaints currently at *their* escalation level, not their whole department/system
  history.

All three agree on which roles are unscoped (admin, Dean Infra) and are behaviorally
consistent today, but the same rule is re-derived independently in three places and has
to be kept in sync by hand if it ever changes. See
[`middlewares.md`](./middlewares.md#deptscope) and
[`complaint-module.md`](./complaint-module.md).

### `/pc/:id/health-card` is a `POST`, not a `GET`

The endpoint is a pure read (`getPcHealthCard` doesn't mutate anything), but is wired as
`router.post(...)`. `backend/Readme.md`'s planned surface lists it as `GET
/api/pc/:id/health-card`. Doesn't break anything currently, but worth fixing before
frontend/REST tooling is built expecting `GET` semantics for an idempotent read.

## Missing endpoints (see `phases.md` for the full roadmap gap analysis)

- Admin CRUD (create/update/delete) for Dept/Lab/User/Pc — only reads exist (`GET
  /api/v1/dept`; PC/User/Lab have no listing/CRUD routes of their own outside what
  `pc.route.js`/`complaint.route.js` already expose).
- Role-dashboard aggregation/summary endpoints (Phase 4) — the frontend would need to
  derive its own stats from the raw `GET /api/v1/complaint` list today.
- No filtering/pagination on `GET /api/v1/complaint` (Phase 4/5 territory).
- No rate limiting anywhere (Phase 6) — notably on the public, auth-free `POST
  /api/v1/complaint`, `POST /api/v1/pc/sync`, and `POST /api/v1/auth/login`/`resend-otp`.
- No request-body validation library (Zod/Joi) — relies on Mongoose schema validation
  only.

## Already fixed (things this doc, or `CLAUDE.md`, used to flag as open)

- `pc.route.js`'s `import Router from "express"` (wrong export, worked by accident) —
  **fixed**: now `import { Router } from "express"`.
- `app.js`'s `app.use("api/v1/complaint", ...)` missing leading `/` — **fixed**: now
  `"/api/v1/complaint"`.
- `getPcHealthCard` not validating `pcId` shape (uncaught `CastError` -> generic `500`)
  — **fixed**: now validates with `mongoose.Types.ObjectId.isValid(pcId)` first, throwing
  a clean `400 "Invalid PC id"`.
- `syncPcConfig` overwriting the whole `config` subdocument wholesale — **fixed**: now
  builds a field-by-field `configSet` and `$set`s only the keys present in the payload,
  so a partial sync no longer wipes the rest. See
  [`pc-module.md`](./pc-module.md#syncpcconfigpayload---post-apiv1pcsync).
- No refresh-token redemption endpoint, no logout endpoint, no "resend OTP" endpoint —
  **fixed**: `POST /refresh-token`, `POST /logout`, `POST /resend-otp` all exist now
  (`auth.route.js`), plus a `GET /me` session-rehydration endpoint that didn't exist
  before either.
- Auth cookie `maxAge` values hardcoded instead of derived from
  `JWT_ACCESS_EXPIRY`/`JWT_REFRESH_EXPIRY` — **fixed**: `auth.controller.js` now computes
  them via `parseExpiryToMs(process.env.JWT_ACCESS_EXPIRY / JWT_REFRESH_EXPIRY)`.
- `user.model.js`'s `import Roles from 'Role'` and `mongoose.Schema.Types.ObjectID` —
  **fixed**: current code has no such import, and correctly uses
  `mongoose.Schema.Types.ObjectId`.
- `userSchema.method.comparePassword` (should be `.methods`) — **fixed**: current code
  correctly uses `userSchema.methods.comparePassword`.
- `complaint.model.js`'s `Obejct.values(...)` typo — **fixed**: current code correctly
  uses `Object.values(...)`.
- `auth.service.js` importing `User` as a default export — **fixed**: current code
  correctly uses `import { User } from "../models/user.model.js"`.
- `tokenGeneration.js`'s `prcoess.env.JWT_ACCESS_TOKEN` typo — **fixed**: current code
  correctly uses `process.env.JWT_ACCESS_TOKEN`.
- `ApiError` single-string-argument call sites — not found in the current tree; every
  `throw new ApiError(...)` call site checked during this pass uses the correct
  `(statusCode, message)` two-argument form.
- The login-time OTP step (`POST /verify-login-otp`) that used to sit between password
  check and token issuance has been **removed entirely** — `POST /login` now issues
  tokens directly after the password check. This isn't a "fix" so much as a deliberate
  simplification, but it means any doc or frontend code still describing/calling
  `verify-login-otp` is now wrong — see
  [`auth-module.md`](./auth-module.md#flow-b-login-password-check-issues-tokens-directly).
