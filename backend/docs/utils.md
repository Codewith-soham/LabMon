# Utilities (`src/utils/`)

Six small, single-purpose modules. None of them import from `src/models/`,
`src/controllers/`, or `src/routes/` — they're the leaf dependencies everything else
builds on.

## `ApiError` — `src/utils/ApiError.js`

```js
class ApiError extends Error {
  constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
    super(message)
    this.statusCode = statusCode
    this.message = message
    this.data = null
    this.success = false
    this.errors = errors
    if (stack) this.stack = stack
    else Error.captureStackTrace(this, this.constructor)
  }
}
```

The one exception type thrown across the whole app for anything that should become a
client-facing HTTP error. Constructor signature is `(statusCode, message, errors,
stack)` — every call site in this codebase uses the two-argument form
(`new ApiError(404, "PC not found")`), leaving `errors: []` and letting
`Error.captureStackTrace` build the stack automatically. `data: null` and
`success: false` are fixed fields that mirror the shape of `ApiResponse` (see below),
so error and success payloads are structurally similar — both objects, both carrying a
`message`, differing mainly in `success`/`errors` vs `data`. `errorHandler`
(`src/middlewares/error.middleware.js`) is the only place that reads
`err.statusCode`/`err.message`/`err.errors` back out.

## `ApiResponse` — `src/utils/ApiResponse.js`

```js
class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode
    this.data = data
    this.message = message
    this.success = statusCode < 400
  }
}
```

The success-side counterpart. Every controller in the codebase ends with
`res.status(N).json(new ApiResponse(N, data, "..."))` — the status code is passed twice
(once to `res.status()`, once into the constructor) so the JSON body's `success` flag
and `statusCode` field are self-consistent even if a caller only looks at the body
without checking the actual HTTP status.

## `asyncHandler` — `src/utils/asyncHandler.js`

```js
const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
  }
}
```

Wraps every controller function (`register`, `syncPc`, `raiseComplaint`, etc.). Because
Express does not automatically catch rejected promises thrown inside an `async`
controller, without this wrapper every controller would need its own
`try { ... } catch (err) { next(err) }`. `Promise.resolve(...)` normalizes both actual
promises (from `async` functions) and synchronous return values into a promise, so
`.catch` works uniformly either way. Any `ApiError` thrown inside a wrapped controller
(directly or via an `await`ed service call) ends up routed to `next(err)`, which Express
forwards to `errorHandler`.

Note: `auth.middleware.js` does *not* use this wrapper (it throws synchronously instead
of being `async`) — see [`middlewares.md`](./middlewares.md#auth) for why that
particular case still works despite the inconsistency.

## `tokenGeneration.js` — `src/utils/tokenGeneration.js`

```js
generateAccessToken(user)  -> jwt.sign({ id: user._id, role: user.role, department: user.department }, JWT_ACCESS_TOKEN, { expiresIn: JWT_ACCESS_EXPIRY })
generateRefreshToken(user) -> jwt.sign({ userId: user._id }, JWT_REFRESH_TOKEN, { expiresIn: JWT_REFRESH_EXPIRY })
```

Full detail (payload shape, why access/refresh have different claim names, how this
feeds `auth.middleware.js`) is in
[`auth-module.md`](./auth-module.md#token-generation-srcutilstokengenerationjs).

## `otp.js` — `src/utils/otp.js`

```js
generateOtp()          -> 6-digit zero-padded numeric string
hashOtp(otp)            -> bcrypt.hash(otp, 10)
compareOtp(otp, hash)   -> bcrypt.compare(otp, hash)
```

Pure OTP primitives with no knowledge of `User`, purposes, or expiry — those concerns
live in `auth.service.js`'s `issueOtp`. Kept separate so the hashing/generation logic is
independently testable and reusable if OTPs are ever needed outside the auth flow.
Full detail in
[`auth-module.md`](./auth-module.md#otp-mechanics-srcutilsotpjs).

## `mailer.js` — `src/utils/mailer.js`

```js
sendOtpEmail({ to, otp, purpose })
otpEvents   // EventEmitter, emits "otp" on every send attempt
```

Lazily creates a nodemailer transporter only if `SMTP_HOST` is set; otherwise logs the
OTP to the console instead of sending real email, which is what makes local dev/test
usable without SMTP credentials. The `otpEvents` emitter is a deliberate test hook so
`src/tests/auth.test.js` can read a plaintext OTP without a real mailbox. Full detail in
[`auth-module.md`](./auth-module.md#email-dispatch-srcutilsmailerjs).

## Dependency direction summary

```
ApiError / ApiResponse   <- used by every controller and every service
asyncHandler             <- wraps every controller
tokenGeneration, otp, mailer  <- used only by auth.service.js
```

`ApiError` and `ApiResponse` are the only two utilities with app-wide reach; the other
three are auth-specific.
