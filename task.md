# LABMON — Remaining Tasks

Gaps in the current project to close and hardening to do — scoped to what already
exists in the codebase today (no speculative future features, no admin panel/CRUD, since
there is no `admin` role in active use yet). See `currentSystem.md` and `backend/docs/`
for the full status this list was drawn from.

## Security (backend)

- [ ] `POST /register` has no access control — anyone can self-register as any role,
      including `admin`. Restrict registration (e.g. require an existing admin/HOD to
      create accounts, or otherwise gate the `role` field).
- [ ] `POST /pc/sync` has no device authentication — anyone who knows/guesses a
      `deadStockNo` can overwrite that PC's config, or provision a brand-new one if they
      also supply `department`/`lab`. Add a shared secret/device key the agent sends.
- [ ] `POST /resend-otp` doesn't verify the caller owns the email — it only needs
      `{ email, purpose }`, no proof of account ownership. Add a check and/or rate-limit
      per email.
- [ ] No rate limiting anywhere — especially the public, auth-free endpoints
      (`POST /complaint`, `POST /pc/sync`, `POST /login`, `POST /resend-otp`). Add
      `express-rate-limit` or similar.

## Validation (backend)

- [ ] No request-body validation library (Zod/Joi) — relies solely on Mongoose
      schema-level validation. Add a validation layer, at minimum for the public/
      unauthenticated routes (`POST /complaint`, `POST /pc/sync`, `POST /register`,
      `POST /login`).

## Architecture cleanup (backend)

- [ ] Department/level access-scoping logic is implemented independently in three
      places — `deptScope` middleware (PC health-card route), the inline
      `assertDeptAccess` check in `complaint.service.js`'s escalate/resolve, and
      `buildComplaintScope` in `complaint.service.js`'s `getComplaints`. Behaviorally
      consistent today, but not unified — consolidate into one shared helper so
      role/scoping changes don't need updating in three places.

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
