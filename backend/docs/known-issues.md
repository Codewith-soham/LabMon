# Known Issues

Bugs and gaps found while reading the current tree (2026-08-13), so they don't need to be
rediscovered from scratch. Cross-referenced from the module docs where relevant. These
supersede the "Known issues" list in `CLAUDE.md`, several of which have since been fixed
in the code (see the "Already fixed" section at the bottom).

## Real bugs

### `app.js`: missing leading slash on the complaint router mount

```js
app.use("api/v1/complaint", complaintRouter)   // should be "/api/v1/complaint"
```

Compare to the other two mounts, which are correct: `app.use("/api/v1/auth", ...)`,
`app.use("/api/v1/pc", ...)`. Express treats a path without a leading `/` differently
from one with it — worth confirming with a live request whether `/api/v1/complaint/...`
still resolves as intended or whether this silently changes matching behavior before
relying on it. See [`architecture.md`](./architecture.md#router-mounts).

### `pc.route.js`: `import Router from "express"` uses the wrong export

```js
import Router from "express"   // default export = the express() app factory
...
const router = Router()
```

The other two route files correctly do `import { Router } from "express"`. This file's
version happens to still produce something with the methods this file calls
(`.post()`), so it doesn't crash today, but it is not actually an Express `Router`
instance and the mismatch could bite (e.g. missing `Router`-specific behavior, or
confusing anyone reading it expecting a `Router`). See
[`pc-module.md`](./pc-module.md#route-srcroutespcroutejs).

### `Complaint.status` default is a raw string, not the constant

```js
status: { type: String, enum: Object.values(COMPLAINT_STATUS), default: "Open" }
```

Works today because `COMPLAINT_STATUS.OPEN === "Open"`, but defeats the point of
centralizing the value in `constants.js` — if `COMPLAINT_STATUS.OPEN`'s string value
ever changed, this default would silently stop matching the enum's intended value
(though it would still be caught by the `enum` validator failing, just confusingly).
Should be `default: COMPLAINT_STATUS.OPEN`.

## Missing validation / defensive checks

### `pc.service.js`'s `getPcHealthCard` doesn't validate the id shape

`Pc.findOne({ _id: pcId, ...scope })` with a malformed `pcId` throws a Mongoose
`CastError`, which isn't an `ApiError`, so it falls through to `errorHandler`'s generic
`500` instead of a clean `400`. `complaint.controller.js`'s `escalateComplaint` does the
right thing here (`mongoose.Types.ObjectId.isValid(req.params.id)` before calling the
service) — `resolveComplaint` in the same file does *not* do this check either, so it has
the identical gap. See [`pc-module.md`](./pc-module.md#getpchealthcardpcid-scope) and
[`complaint-module.md`](./complaint-module.md#controller-srccontrollerscomplaintcontrollerjs).

### `syncPcConfig` replaces `config` wholesale, not field-by-field

`$set: { config: { ...config, lastSyncedAt: new Date() } }` overwrites the entire
embedded `config` subdocument. A caller sending a partial payload (e.g. just `{ cpu:
"..." }`) would wipe `ram`/`disk`/`os`/`software` on that PC. Not hit today because the
only real caller (`agent/collector.py`) always sends all fields, but there's no
server-side guard against a partial payload. See
[`pc-module.md`](./pc-module.md#syncpcconfigpayload).

## Missing endpoints (see `phases.md` for the full roadmap gap analysis)

- No `GET /complaints/track/:token` — the public tracking token generated in
  `createComplaint` is stored but nothing reads it back.
- No `GET /complaints` (role-scoped list) or `GET /pcs`/`GET /pc/search` — nothing for a
  dashboard to call yet (Phase 4/5).
- No refresh-token redemption endpoint or logout endpoint in the auth module — see
  [`auth-module.md`](./auth-module.md#notable-gaps-in-this-module-see-also-known-issuesmd).
- No "resend OTP" endpoint — an expired registration OTP requires registering again.

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
guesses) a valid `deadStockNo` can overwrite that PC's config. See
[`pc-module.md`](./pc-module.md#route-srcroutespcroutejs) and
[`agent.md`](./agent.md#no-authentication).

## Design inconsistencies (not bugs, but worth knowing before extending)

### Department scoping is implemented twice, two different ways

`deptScope` middleware (used only by the PC health-card route) produces a `req.scope`
object spread into a Mongoose query filter. `complaint.service.js` instead inlines the
same admin-bypass + department-match logic directly in `escalateComplaint` and
`resolveComplaint` (`user.role !== ROLES.ADMIN && String(complaint.department) !==
String(user.department)`), without using `deptScope` at all. If a third role
(e.g. `DEAN_INFRA`, which `deptScope` treats as scope-free but the complaint service
does not special-case beyond `ADMIN`) needs consistent treatment, it currently has to be
special-cased in two different places, and it's easy to update one and forget the other.
See [`middlewares.md`](./middlewares.md#deptscope) and
[`complaint-module.md`](./complaint-module.md#escalatecomplaintcomplaintid-user).

Note also the asymmetry this creates: `deptScope` treats `DEAN_INFRA` as unscoped (full
access, like admin), but `complaint.service.js`'s inline check only bypasses for
`ROLES.ADMIN` — a Dean Infra user *is* subject to the department check there. This may
be intentional (Dean Infra sits at the top of the escalation chain but perhaps
shouldn't act on complaints in departments a complaint hasn't reached them from... except
Dean Infra can only ever act on a complaint once it's *already* escalated to them, which
requires `currentLevel === DEAN_INFRA` regardless of department) — but it's worth
confirming this divergence is deliberate rather than a copy/paste gap between the two
implementations.

### `/pc/:id/health-card` is a `POST`, not a `GET`

The endpoint is a pure read (`getPcHealthCard` doesn't mutate anything), but is wired as
`router.post(...)`. `backend/Readme.md`'s planned surface lists it as `GET
/api/pc/:id/health-card`. Doesn't break anything currently (there's no caller yet other
than manual testing), but worth fixing before a frontend is built against it, since
`GET` is what browsers/caches/REST tooling will expect for an idempotent read.

### Auth cookie `maxAge` values are hardcoded, not read from env

`src/controllers/auth.controller.js`'s `cookieOptions` sets `maxAge: 15 * 60 * 1000` and
`maxAge: 7 * 24 * 60 * 60 * 1000`, with a comment noting these are meant to match
`JWT_ACCESS_EXPIRY`/`JWT_REFRESH_EXPIRY` from `.env`. If those env vars are ever changed,
the cookie lifetime and the JWT's actual `exp` claim can silently drift apart. See
[`auth-module.md`](./auth-module.md#cookie-issuance-srccontrollersauthcontrollerjs).

## Already fixed (superseding `CLAUDE.md`'s "Known issues" section)

`CLAUDE.md` lists several bugs that no longer reflect the current tree — verified while
writing this documentation:

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

`CLAUDE.md` itself should probably be updated to drop that stale section and note the
Python agent already exists (see [`phases.md`](./phases.md)) — flagging here rather than
editing it, since `CLAUDE.md` is explicitly the project's own instructions file.
