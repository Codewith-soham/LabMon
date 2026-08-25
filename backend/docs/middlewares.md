# Middlewares (`src/middlewares/`)

Six middleware modules exist. `auth` → `roleCheck`/`deptScope` are meant to run in that
order on any protected route (auth must populate `req.user` before the other two can use
it). `rateLimiter` and `validate` are route-specific and independent of `auth` — both are
also usable (and used) on public, unauthenticated routes. `errorHandler` is global and
mounted last in `app.js`.

```mermaid
flowchart LR
    Req(["Request"]) --> Auth["auth\n(verifies JWT, sets req.user)"]
    Auth -->|"401 if missing/invalid token"| Fail1(["errorHandler"])
    Auth --> Role["roleCheck(...roles)\n(optional, route-specific)"]
    Auth --> Scope["deptScope\n(optional, route-specific)"]
    Role -->|"403 if role not allowed"| Fail1
    Scope --> Handler["Route controller"]
    Role --> Handler
    Handler -->|"throws ApiError"| Fail1
    Handler -->|"success"| Res(["ApiResponse"])
    Fail1 --> ErrRes(["JSON error response"])
```

## `auth` — `src/middlewares/auth.middleware.js`

```js
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization
    const headerToken = authHeader?.startsWith("Bearer") ? authHeader.split(" ")[1] : null
    const token = headerToken || req.cookies?.accessToken

    if (!token) {
        throw new ApiError(401, "Authentication required")
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN)
        req.user = decoded
        next()
    } catch (error) {
        throw new ApiError(401, "Invalid or expired token")
    }
}
```

- Reads `Authorization: Bearer <token>` first; if that header is missing or not a
  Bearer scheme, falls back to the `accessToken` httpOnly cookie set at login (see
  [`auth-module.md`](./auth-module.md)) — either credential source works, so a
  browser client relying purely on the cookie and an API client sending an explicit
  header both authenticate the same way. Neither present → `401`.
- Verifies the JWT against `JWT_ACCESS_TOKEN` (the same secret
  `generateAccessToken` in `tokenGeneration.js` signs with).
- On success, sets `req.user` to the **decoded payload**, i.e. exactly
  `{ id, role, department, iat, exp }` (see [`auth-module.md`](./auth-module.md) for the
  payload shape). This is why every downstream consumer reads `req.user.role`,
  `req.user.department`, `req.user.id` — those are JWT claims, not a fresh DB lookup.
  There is no re-fetch of the `User` document here, so if a user's role/department
  changes in the DB after a token was issued, `req.user` still reflects the old values
  until the token expires and they log in again.
- Any verification failure (expired, malformed, wrong signature) → `401 "Invalid or
  expired token"`.
- Note: `auth` throws synchronously (not via `asyncHandler`), which works here because
  Express 5's default routing catches synchronous throws in middleware — but it's
  inconsistent with the rest of the codebase's `asyncHandler` convention. It happens to
  work today because nothing here is genuinely async (`jwt.verify` used synchronously).

## `roleCheck` — `src/middlewares/roleCheck.middleware.js`

```js
const roleCheck = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            throw new ApiError(403, "You do not have permission to perform this action")
        }
        next()
    }
}
```

- A middleware **factory** — called with a list of allowed role strings at route-
  definition time, e.g. `roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD)`, and returns the
  actual middleware function.
- Requires `req.user` to already be populated — **must run after `auth`**. If mounted
  without `auth` first, `req.user` is `undefined` and `req.user.role` throws a
  `TypeError` instead of a clean `ApiError` (an unhandled crash, not a 403 — the route
  wiring is what prevents this today; there's no defensive check inside the middleware
  itself).
- Used in `src/routes/complaint.route.js`:
  - `escalate`: `roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD)` — Dean Infra is excluded
    because there is no level above Dean Infra to escalate *to*.
  - `resolve`: `roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA)` — any level
    in the chain can resolve.
- Not currently used on any PC route — `pc.route.js` relies on `deptScope` alone for the
  health-card endpoint, with no role restriction beyond "authenticated."

## `deptScope` — `src/middlewares/deptScope.middleware.js`

```js
const deptScope = (req, res, next) => {
    req.scope = buildDepartmentScope(req.user)
    next()
}
```

- Also requires `req.user` from `auth` to already be set.
- Produces `req.scope`, a **Mongoose filter fragment** meant to be spread into a query,
  by delegating to `buildDepartmentScope` in `src/utils/scope.js` (see
  [`utils.md`](./utils.md#scope-srcutilsscopejs)):
  - Admin and Dean Infra get `req.scope = {}` — no department restriction, since both
    roles operate across all departments (`department: null` on their `User` docs
    confirms this — see `models.md`).
  - Everyone else (`labIncharge`, `hod`) gets `req.scope = { department:
    req.user.department }` — restricts to their own department only.
- Consumed today by exactly one route: `pc.route.js`'s `POST /:id/health-card`, where
  `pc.service.js`'s `getPcHealthCard(pcId, scope)` does `Pc.findOne({ _id: pcId,
  ...scope })`. Spreading `{}` is a no-op filter (matches any department); spreading
  `{ department: X }` narrows the match. If a non-admin/non-Dean user requests a PC in
  another department, the `_id` matches but `department` doesn't, so `findOne` returns
  `null` and the service throws `404 "Pc not found"` — **not** a `403`. This is a
  deliberate (or at least consistent) choice: out-of-scope resources look identical to
  nonexistent ones, avoiding confirming to a caller that a specific `_id` exists in a
  department they can't see.
- **Not** used on the complaint `list`/`escalate`/`resolve` routes. `list` computes its
  own role/level-aware scope inside `complaint.service.js` via `buildComplaintScope`
  (department scoping alone isn't expressive enough there — HOD/Dean Infra additionally
  need to see only complaints currently at *their* level); `escalate`/`resolve` call
  `assertDepartmentAccess`. All three (`deptScope`, `buildComplaintScope`,
  `assertDepartmentAccess`) now live in the same module, `src/utils/scope.js` — the same
  "admin/Dean-Infra are unscoped, everyone else is department-locked" rule used to be
  re-derived independently in three places (see
  [`known-issues.md`](./known-issues.md#already-fixed-things-this-doc-or-claudemd-used-to-flag-as-open));
  it's now defined once and imported everywhere it's needed. See
  [`complaint-module.md`](./complaint-module.md).

## `rateLimiter` — `src/middlewares/rateLimiter.js`

```js
const makeLimiter = ({ windowMs, max, message }) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => process.env.NODE_ENV === "test",
        handler: (req, res) => {
            res.status(429).json({ success: false, statusCode: 429, message, errors: [] })
        }
    })
```

Five named limiter instances built from this factory, one per throttled route, each
independently configurable via env vars (see `backend/Readme.md`):

| Export | Route | Default | Rationale |
|---|---|---|---|
| `loginLimiter` | `POST /auth/login` | 10 / 15 min | password-guessing surface |
| `otpVerifyLimiter` | `POST /auth/verify-email` | 10 / 15 min | OTP-guessing surface |
| `otpResendLimiter` | `POST /auth/resend-otp` | 5 / 15 min | inbox-spam vector |
| `complaintLimiter` | `POST /complaint` | 20 / hour | public-form flood protection |
| `pcSyncLimiter` | `POST /pc/sync` | 30 / min | basic abuse throttle (no device auth yet — see [`known-issues.md`](./known-issues.md)) |

- Built on `express-rate-limit`. `skip: () => NODE_ENV === "test"` disables every
  limiter during the automated test suite (each `src/tests/*.test.js` file sets
  `process.env.NODE_ENV = "test"` before importing `app.js`) so the suite's rapid
  sequential requests against the same in-process server aren't throttled — this is a
  test-harness accommodation, not a weakening of the deployed app's limits.
- `handler` overrides the library's default 429 body so it matches the app's standard
  error envelope (`{ success, statusCode, message, errors }`) instead of
  `express-rate-limit`'s own shape.
- Mounted directly on the route, before `validate`/the controller — e.g.
  `router.post("/login", loginLimiter, validate(loginSchema), login)`.

## `validate` — `src/middlewares/validate.middleware.js`

```js
const validate = (schema, target = "body") => (req, res, next) => {
    const result = schema.safeParse(req[target])
    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message
        }))
        throw new ApiError(400, "Validation failed", errors)
    }
    req[target] = result.data
    next()
}
```

A middleware **factory** (like `roleCheck`) parameterized by a Zod schema and which part
of the request to validate (`"body"` by default, or `"params"`). On failure it throws a
`400 "Validation failed"` `ApiError` with a field-by-field `errors[]` array (`{ field,
message }` per issue) rather than the single-string `message` most other `ApiError`s
carry. On success, `req[target]` is replaced with Zod's parsed/coerced output.

Schemas live in `src/validators/` (`auth.validator.js`, `pc.validator.js`,
`complaint.validator.js`, `common.validator.js` for the shared `objectIdParamSchema`) and
check **shape/type only** — they're deliberately kept looser than a service's own
semantic checks wherever a specific error message matters. For example
`resendOtpSchema`'s `purpose` field is just `z.string().min(1)`, not an enum, so
`resendOtp()`'s own `"Invalid OTP purpose"` 400 still fires for an unrecognized value
instead of a generic Zod message. `POST /register` was deliberately left unvalidated by
this middleware — out of scope for the security-hardening pass that introduced it (see
[`known-issues.md`](./known-issues.md)).

Wired in ahead of the controller on: `POST /auth/login`, `POST /auth/verify-email`,
`POST /auth/resend-otp`, `POST /pc/sync`, `POST /pc/:id/health-card` (params only),
`POST /complaint`, `PATCH /complaint/:id/escalate` (params only), and `PATCH
/complaint/:id/resolve` (params + body).

## `errorHandler` — `src/middlewares/error.middleware.js`

```js
const errorHandler = (err, req, res, next) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            statusCode: err.statusCode,
            message: err.message,
            errors: err.errors
        })
    }
    console.error(err)
    return res.status(500).json({
        success: false,
        statusCode: 500,
        message: "Internal Server Error",
        errors: []
    })
}
```

- Express error-handling middleware (4-arg signature — the arity is what tells Express
  to treat it as an error handler rather than a normal middleware). Mounted last in
  `app.js`, after all routers.
- Two branches:
  - Known errors (`ApiError` instances, thrown anywhere in a controller/service/
    middleware and forwarded here via `asyncHandler`'s `.catch(next)` or a synchronous
    `throw` inside route-stack code) → passed through as-is: their own `statusCode`,
    `message`, and `errors` array.
  - Anything else (a raw `TypeError`, a Mongoose `ValidationError`/`CastError`, etc.) →
    logged server-side with `console.error`, and the client gets a generic `500`
    without leaking internal error details.
- This is what lets every controller/service just `throw new ApiError(...)` freely
  without a local `try/catch` — as long as the handler is wrapped in `asyncHandler` (for
  async code) so the rejection actually reaches `next(err)` and thus this middleware.

## Composition example

`pc.route.js`:

```js
router.post("/sync", pcSyncLimiter, validate(syncPcSchema), syncPc)
router.post(
    "/:id/health-card",
    auth,
    roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA, ROLES.ADMIN),
    validate(objectIdParamSchema, "params"),
    deptScope,
    PcHealthCard
)
```

Order matters: for `/sync`, throttling happens before validation, before the (still
unauthenticated) controller runs. For `/:id/health-card`: `auth` must run first to
populate `req.user`; `roleCheck` rejects any role outside the allowed set; `validate`
checks `:id` is a well-formed ObjectId; `deptScope` reads `req.user.role`/
`req.user.department` to build `req.scope`; `PcHealthCard` (the controller) reads both
`req.params.id` and `req.scope`.

`complaint.route.js`:

```js
router.post("/", complaintLimiter, validate(raiseComplaintSchema), raiseComplaint)
router.patch("/:id/escalate", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD), validate(objectIdParamSchema, "params"), escalateComplaint)
router.patch("/:id/resolve", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA), validate(objectIdParamSchema, "params"), validate(resolveComplaintSchema), resolveComplaint)
router.get("/", auth, list)
```

None of the complaint routes use `deptScope` — `escalate`/`resolve` use `roleCheck` for
the coarse "is this role allowed at all" check, then `assertDepartmentAccess` (from
`src/utils/scope.js`) inside the service layer; `list` computes its own role/level-aware
scope entirely inside `complaint.service.js` via `buildComplaintScope`, also from
`src/utils/scope.js` (see the `deptScope` section above). `deptScope` middleware itself
is only wired into the PC health-card route today.
