# LABMON — Remaining Tasks

Gaps in the current project to close and hardening to do — scoped to what already
exists in the codebase today (no speculative future features, no admin panel/CRUD, since
there is no `admin` role in active use yet). See `currentSystem.md` and `backend/docs/`
for the full status this list was drawn from.

## Security (backend)

- [x] ~~No rate limiting anywhere~~ — **done**. `express-rate-limit` now throttles
      `POST /login`, `POST /verify-email`, `POST /resend-otp`, `POST /complaint`, and
      `POST /pc/sync` (`src/middlewares/rateLimiter.js`), disabled under `NODE_ENV=test`.
- [x] ~~`POST /resend-otp` doesn't verify the caller owns the email~~ — **partially
      done**. Added a per-account resend cooldown (`OTP_RESEND_COOLDOWN_SECONDS`,
      default 60s, via `User.lastOtpSentAt`) plus rate limiting. Still no proof of actual
      inbox ownership (no OTP/password/session required to trigger *a* resend, just not
      unlimited ones) — accepted as a residual gap, not reopened as a task; true
      ownership verification (e.g. a magic link) would be a separate, larger change.
- [ ] `POST /register` has no access control — anyone can self-register as any role,
      including `admin`. Restrict registration (e.g. require an existing admin/HOD to
      create accounts, or otherwise gate the `role` field). Deliberately excluded from
      the security-hardening pass that closed the other items here.
- [ ] `POST /pc/sync` has no device authentication — anyone who knows/guesses a
      `deadStockNo` can overwrite that PC's config, or provision a brand-new one if they
      also supply `department`/`lab`. Add a shared secret/device key the agent sends.
      It's now rate-limited (`pcSyncLimiter`, 30/min) and body-validated, but that's
      throttling, not authentication.
- [ ] Access tokens aren't revoked on logout — only the refresh token is cleared, so a
      leaked/stolen access token stays valid until its own expiry. Would need either a
      revocation list (Redis/DB-backed) or a much shorter access-token TTL; not
      attempted in the last round since it needs new infra or an architecture decision.

## Validation (backend)

- [x] ~~No request-body validation library (Zod/Joi)~~ — **done for everything except
      `/register`**. Zod schemas (`src/validators/`) + a generic `validate(schema,
      target)` middleware now cover `POST /login`, `POST /verify-email`,
      `POST /resend-otp`, `POST /pc/sync`, `POST /pc/:id/health-card` (params),
      `POST /complaint`, and its escalate/resolve routes. `POST /register` was
      deliberately left out — add a `registerSchema` when that route's access-control
      gap above is tackled.

## Architecture cleanup (backend)

- [x] ~~Department/level access-scoping logic is implemented independently in three
      places~~ — **done**. Unified into `src/utils/scope.js`
      (`buildDepartmentScope`, `assertDepartmentAccess`, `buildComplaintScope`), used by
      `deptScope` middleware and by `complaint.service.js`'s escalate/resolve/
      getComplaints. Also fixed a related gap found while touching this code:
      `POST /pc/:id/health-card` had no `roleCheck` at all (any authenticated role could
      hit it) — now gated to `LAB_INCHARGE`/`HOD`/`DEAN_INFRA`/`ADMIN`.

## Frontend

- [ ] No state-management library / shared complaint-list cache (`src/store/` is
      empty) — fine today since each dashboard fetches its own list independently, but
      revisit if a shared header badge or cross-screen complaint count is ever needed.
- [ ] `pcService.js`'s `getPcHealthCard` (wraps `POST /pc/:id/health-card`) is unused
      dead code — `PcHealthCardModal` renders from the already-fetched search result
      instead. Either wire it in (e.g. a "refresh" action in the modal) or remove the
      unused function.

## Testing / process

- [ ] No CI configured — `npm test` (backend) and `npm run lint` / `npm run build`
      (frontend) are only ever run manually today. Add a CI workflow to run these on
      push/PR.
