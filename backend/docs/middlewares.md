# Middlewares (`src/middlewares/`)

Four middleware modules exist. `auth` → `roleCheck`/`deptScope` are meant to run in that
order on any protected route (auth must populate `req.user` before the other two can use
it). `errorHandler` is global and mounted last in `app.js`.

## `auth` — `src/middlewares/auth.middleware.js`

```js
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer")) {
        throw new ApiError(401, "Authentication required")
    }
    const token = authHeader.split(" ")[1]
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN)
        req.user = decoded
        next()
    } catch (error) {
        throw new ApiError(401, "Invalid or expired token")
    }
}
```

- Reads `Authorization: Bearer <token>`. Missing header or wrong scheme → `401`.
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
    if (req.user.role === ROLES.ADMIN || req.user.role === ROLES.DEAN_INFRA) {
        req.scope = {}
    } else {
        req.scope = { department: req.user.department }
    }
    next()
}
```

- Also requires `req.user` from `auth` to already be set.
- Produces `req.scope`, a **Mongoose filter fragment** meant to be spread into a query:
  - Admin and Dean Infra get `req.scope = {}` — no department restriction, since both
    roles operate across all departments (`department: null` on their `User` docs
    confirms this — see `models.md`).
  - Everyone else (`labIncharge`, `hod`) gets `req.scope = { department:
    req.user.department }` — restricts to their own department only.
- Consumed in two places: `pc.service.js`'s `getPcHealthCard(pcId, scope)` does
  `Pc.findOne({ _id: pcId, ...scope })`, and `complaint.route.js`'s `GET /` (`list`)
  route applies it before `complaint.service.js`'s `getComplaints(scope)` does
  `Complaint.find({ ...scope })`. Spreading `{}` is a no-op filter (matches any
  department); spreading `{ department: X }` narrows the match. On the PC route, if a
  non-admin/non-Dean user requests a PC in another department, the `_id` matches but
  `department` doesn't, so `findOne` returns `null` and the service throws `404 "Pc not
  found"` — **not** a `403`. This is a deliberate (or at least consistent) choice:
  out-of-scope resources look identical to nonexistent ones, avoiding confirming to a
  caller that a specific `_id` exists in a department they can't see.
- Still not used on the complaint `escalate`/`resolve` routes — `complaint.service.js`
  does its own inline department check there instead (now bypassing for both `ADMIN` and
  `DEAN_INFRA`, matching this middleware's treatment of those roles). This remains an
  inconsistency worth unifying eventually: the same "is this admin/Dean-Infra/scoped-by-
  department" logic exists in two different forms in two different layers (see
  [`known-issues.md`](./known-issues.md)).

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
router.post("/:id/health-card", auth, deptScope, PcHealthCard)
```

Order matters: `auth` must run first to populate `req.user`; `deptScope` reads
`req.user.role`/`req.user.department` to build `req.scope`; `PcHealthCard` (the
controller) reads both `req.params.id` and `req.scope`.

`complaint.route.js`:

```js
router.patch("/:id/escalate", auth, roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD), escalateComplaint)
router.get("/", auth, deptScope, list)
```

`escalate`/`resolve` use `roleCheck` instead of `deptScope` — the department check for
those two happens inside the service layer instead of via middleware (see the
`deptScope` section above). `list` is the one complaint route that does use `deptScope`,
the same as the PC health-card route.
