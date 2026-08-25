# Known Issues

Bugs and gaps found while reading the current tree (last verified 2026-08-26), so they
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

### `POST /resend-otp` still doesn't verify the caller owns the email

A resend cooldown was added (`OTP_RESEND_COOLDOWN_SECONDS`, default 60s, tracked via
`User.lastOtpSentAt`) so an anonymous caller can no longer trigger unlimited sends to an
arbitrary address, and `otpResendLimiter` throttles the route further. Neither of those
is proof of ownership, though — no OTP, password, or session is required to trigger *a*
resend, just not unlimited ones. True ownership verification (e.g. a magic link) is out
of scope for now; this residual gap is an accepted tradeoff, not an oversight. See
[`auth-module.md`](./auth-module.md#notable-gaps-in-this-module-see-also-known-issuesmd).

## Design inconsistencies (not bugs, but worth knowing before extending)

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
- **Department/level scoping used to be implemented three different ways** (`deptScope`
  middleware, `complaint.service.js`'s inline `assertDeptAccess`, and its
  `buildComplaintScope`) — **fixed**: all three now call into a single shared
  `src/utils/scope.js` (`buildDepartmentScope`, `assertDepartmentAccess`,
  `buildComplaintScope`), so the admin/deanInfra-unscoped rule is defined exactly once.
  Behavior is unchanged. See [`utils.md`](./utils.md#scope-srcutilsscopejs).
- **No rate limiting anywhere** — **fixed**: `src/middlewares/rateLimiter.js`
  (`express-rate-limit`) now throttles `POST /login`, `POST /verify-email`, `POST
  /resend-otp`, `POST /complaint`, and `POST /pc/sync`. Disabled under `NODE_ENV=test`.
- **No request-body validation library** — **fixed**: Zod schemas
  (`src/validators/`) plus a generic `validate(schema, target)` middleware
  (`src/middlewares/validate.middleware.js`) now validate shape/type on `POST /login`,
  `POST /verify-email`, `POST /resend-otp`, `POST /pc/sync`, `POST /pc/:id/health-card`
  (params), and `POST /complaint` + its escalate/resolve routes. Existing service-layer
  semantic checks (invalid OTP purpose, etc.) are intentionally left in place — schemas
  stay looser than those checks so their specific error messages still fire. `POST
  /register` was deliberately left out of this pass. See
  [`middlewares.md`](./middlewares.md#validate-srcmiddlewaresvalidatemiddlewarejs).
- **`POST /verify-email` had no guess-limit and OTPs were generated with `Math.random()`**
  — **fixed**: `otp.js` now uses `crypto.randomInt()` (a CSPRNG), and `User` gained an
  `otpAttempts` counter that locks verification out after `OTP_MAX_ATTEMPTS` (default 5)
  wrong guesses until a fresh OTP is issued. See
  [`auth-module.md`](./auth-module.md#otp-mechanics-srcutilsotpjs).
- **`POST /pc/:id/health-card` had no `roleCheck`** — any authenticated user of any role
  could hit it (department-scoped only) — **fixed**: now gated by
  `roleCheck(LAB_INCHARGE, HOD, DEAN_INFRA, ADMIN)`, matching the roles actually meant to
  view health cards (a superset of `GET /pc/search`'s role list, since admin is
  deliberately excluded from search but allowed on health-card).
