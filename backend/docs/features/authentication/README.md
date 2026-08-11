# Authentication Feature

> Folder: `backend/src/{controllers,services,routes,models,middlewares,utils}` (auth-related files)
> Status: implemented — register, verify-email, login, verify-login-otp. Refresh-token rotation and logout are **not** built yet.

This document explains, in plain language, how a user account gets created and how a user logs in to LABMON. It covers every file involved, every library used and why, the full request flow, and every API endpoint with its inputs/outputs. Read this and you should be able to explain the auth system to someone else without re-reading the code.

---

## 1. What this feature actually does

LABMON doesn't use a plain "email + password → logged in" flow. It uses a **two-step, OTP-gated** flow:

1. **Register** — user submits name/email/password/role → account is created (unverified) → a 6-digit OTP is emailed.
2. **Verify email** — user submits the OTP → account becomes "verified" → they're now allowed to log in.
3. **Login (step 1)** — user submits email/password → if correct, a **new** OTP is emailed (password alone does not log you in).
4. **Verify login OTP (step 2)** — user submits that OTP → server issues a JWT **access token** and **refresh token**, sent back as httpOnly cookies. The user is now logged in.

So logging in always requires **something you know (password) + something you have (email inbox)** — a simple form of two-factor authentication, without needing an SMS provider.

```
 REGISTER                    VERIFY EMAIL              LOGIN (step 1)            VERIFY LOGIN OTP (step 2)
┌────────────────┐         ┌──────────────────┐      ┌──────────────────┐      ┌───────────────────────┐
│ name, email,    │ OTP     │ email, otp        │      │ email, password   │ OTP  │ email, otp             │
│ password, role  │ email ->│                   │      │                   │email │                        │
│                 │         │ isEmailVerified   │      │ password checked, │ ->   │ issues accessToken +   │
│ user created,   │         │ = true            │      │ new OTP emailed   │      │ refreshToken cookies   │
│ unverified      │         │                   │      │ (not logged in    │      │                        │
│                 │         │                   │      │  yet)             │      │                        │
└────────────────┘         └──────────────────┘      └──────────────────┘      └───────────────────────┘
```

---

## 2. Technologies & libraries used, and why

| Library | Used for | Why this one |
|---|---|---|
| **express** | HTTP server & routing | Standard, minimal Node web framework; the whole app (`app.js`) is built on it. |
| **mongoose** | MongoDB object modeling | Defines the `User` schema with validation, hooks (password hashing), and typed refs to other collections (`Dept`). |
| **bcrypt** | Hashing passwords, OTPs, and refresh tokens | Never store secrets in plain text. bcrypt is the industry-standard slow hash that resists brute-forcing, used consistently for password, OTP, and refresh-token storage. |
| **jsonwebtoken (JWT)** | Issuing access & refresh tokens | Stateless tokens — the server doesn't need a session store to know who's making a request; it just verifies the token's signature. |
| **validator** | Email format validation | Used inside the Mongoose schema (`validator.isEmail`) to reject malformed emails before hitting the database. |
| **nodemailer** | Sending the OTP email | Standard Node mailer; wraps any SMTP provider (Gmail, SendGrid, etc.) behind one `sendMail` call. |
| **cookie-parser** | Reading cookies from incoming requests | Needed because tokens are delivered as httpOnly cookies, not JSON, so Express needs to parse `Cookie` headers. |
| **helmet** | Sets security-related HTTP headers | Defense-in-depth: mitigates things like clickjacking/MIME-sniffing by default, applied globally in `app.js`. |
| **cors** | Controls which frontend origins can call the API with credentials | Needed because cookies are `credentials: true` — the browser refuses to send cookies cross-origin unless CORS explicitly allows it. |
| **dotenv** | Loads `.env` into `process.env` | Keeps secrets (JWT keys, SMTP creds, Mongo URL) out of the codebase. |

**Why OTP instead of just password login?** Passwords alone are one factor. Requiring an emailed OTP on both signup (to prove the email is real) and every login (to prove the person logging in still controls that inbox) adds a second factor without needing SMS/authenticator-app infrastructure — appropriate for a small internal college tool.

**Why JWT instead of server-side sessions?** No session store (e.g. Redis) needs to be run — the token itself carries `id`, `role`, and `department`, so downstream middleware (`roleCheck`, `deptScope`) can make authorization decisions without a database lookup.

**Why httpOnly cookies instead of returning the token in the JSON body?** JavaScript running in the browser cannot read an httpOnly cookie, so a successful XSS attack on the frontend can't simply steal the token via `document.cookie`.

---

## 3. Architecture — how the pieces connect

LABMON follows a strict layering rule everywhere, including auth:

```
route  →  controller  →  service  →  model
(URL)     (HTTP shape)    (business    (database
                            logic)       schema)
```

- **Routes** (`src/routes/auth.route.js`) just map an HTTP verb + path to a controller function. No logic here.
- **Controllers** (`src/controllers/auth.controller.js`) read `req.body`, call the matching service function, and shape the HTTP response (status code, cookies, JSON envelope). No business logic here — they never talk to the database directly.
- **Services** (`src/services/auth.service.js`) contain all the actual business logic: checking if a user exists, hashing OTPs, validating expiry, issuing tokens. This is the layer to read if you want to understand *what actually happens*.
- **Model** (`src/models/user.model.js`) defines the `User` document shape in MongoDB and two pieces of embedded logic: automatic password hashing before save, and a `comparePassword` helper.

Two shared utility classes keep every response the same shape, success or failure:

- **`ApiResponse`** (`src/utils/ApiResponse.js`) — wraps successful data: `{ statusCode, data, message, success: true }`.
- **`ApiError`** (`src/utils/ApiError.js`) — an `Error` subclass thrown from anywhere in a service/controller: `(statusCode, message, errors, stack)`. It's not caught locally — it's *thrown*.

That last point matters: normally a thrown error in an `async` Express handler would crash the request with an unhandled rejection. That's what **`asyncHandler`** (`src/utils/asyncHandler.js`) solves — every controller is wrapped in it. It runs the controller, and if the returned promise rejects (i.e. an `ApiError` was thrown), it forwards the error to `next(err)` instead of the process crashing. That error then lands in the centralized **`errorHandler`** middleware (`src/middlewares/error.middleware.js`), registered last in `app.js`, which turns `ApiError` instances into a consistent JSON error response, and anything unexpected into a generic `500`.

```
Controller throws ApiError
        │
        ▼
asyncHandler catches the rejected promise
        │
        ▼
next(err) → Express skips to error middleware
        │
        ▼
errorHandler (app.js, registered last)
   - ApiError  → res.status(err.statusCode).json({ success:false, ... })
   - anything else → 500 Internal Server Error
```

### Files involved in auth

```
backend/
├─ server.js                              starts the app, loads .env, connects DB
├─ src/
│  ├─ app.js                              mounts /api/v1/auth, global middleware (helmet, cors, cookieParser...)
│  ├─ config/
│  │  └─ constants.js                     ROLES, OTP_PURPOSE, OTP_EXPIRY_MINUTES (single source of truth)
│  ├─ routes/
│  │  └─ auth.route.js                    POST /register, /verify-email, /login, /verify-login-otp
│  ├─ controllers/
│  │  └─ auth.controller.js               HTTP-shape layer: reads req.body, calls services, sets cookies
│  ├─ services/
│  │  └─ auth.service.js                  all business logic (see section 5)
│  ├─ models/
│  │  └─ user.model.js                    User schema, password hashing hook, comparePassword()
│  ├─ middlewares/
│  │  ├─ auth.middleware.js               verifies JWT access token on protected routes (req.user = decoded)
│  │  ├─ roleCheck.middleware.js          restricts a route to specific roles
│  │  ├─ deptScope.middleware.js          restricts query results to the user's own department
│  │  └─ error.middleware.js              turns thrown ApiError into a JSON response
│  └─ utils/
│     ├─ tokenGeneration.js               generateAccessToken(), generateRefreshToken() (JWT signing)
│     ├─ otp.js                           generateOtp(), hashOtp(), compareOtp()
│     ├─ mailer.js                        sendOtpEmail() via nodemailer
│     ├─ ApiResponse.js / ApiError.js     response envelope classes
│     └─ asyncHandler.js                  wraps controllers so thrown errors reach error middleware
```

---

## 4. The `User` model — what's stored

`src/models/user.model.js`, collection `User`:

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique, lowercased/trimmed, validated with `validator.isEmail` |
| `department` | ObjectId ref → `Dept` | `null` for `admin` / `deanInfra` (they aren't scoped to one department) |
| `password` | String | required; **hashed automatically** before save (see below) — never stored in plain text |
| `role` | String enum | one of `ROLES` (`admin`, `labIncharge`, `hod`, `deanInfra`) |
| `refreshToken` | String | bcrypt **hash** of the current refresh token (so the raw token isn't stored) |
| `isEmailVerified` | Boolean | default `false`; flipped to `true` by `verify-email` |
| `otp` | String | bcrypt hash of the current OTP; `select: false` so it's excluded from normal queries — must explicitly `.select("+otp")` |
| `otpExpiry` | Date | when the current OTP stops being valid; also `select: false` |
| `otpPurpose` | String enum | `emailVerification` or `login` — which flow the pending OTP belongs to; also `select: false` |

**Two pieces of logic live on the model itself:**

- `userSchema.pre("save", ...)` — a Mongoose hook that runs automatically every time a `User` document is saved. It checks `this.isModified("password")`; if the password field wasn't touched, it does nothing (so re-saving a user for an unrelated reason, like flipping `isEmailVerified`, doesn't re-hash an already-hashed password). If it *was* touched (e.g. at creation), it replaces the plain password with `bcrypt.hash(password, 10)`.
- `userSchema.methods.comparePassword(password)` — an instance method available on any fetched `User` document; internally calls `bcrypt.compare(password, this.password)`. Used during login to check the submitted password against the stored hash.

**Why `select: false` on the OTP fields?** So that any normal `User.findOne({...})` (e.g. for showing a profile) never accidentally leaks the OTP hash or expiry in the response. The service layer has to opt in with `.select("+otp +otpExpiry +otpPurpose")` specifically when it needs to check a pending OTP.

---

## 5. Service layer — what each function does

`src/services/auth.service.js` is where all the real logic lives. Every function is a plain async function called by the matching controller.

### `issueOtp(user, purpose)` (internal helper, not exported)
Generates a 6-digit OTP, stores its **bcrypt hash** (not the plaintext) on the user document along with an expiry timestamp (`now + OTP_EXPIRY_MINUTES`, currently 10 minutes) and the `purpose` (`emailVerification` or `login`), saves the user, then emails the **plaintext** OTP to the user via `sendOtpEmail`. Used by both `registerUser` and `loginUser` — it's the single place that creates and sends an OTP, so both flows behave identically.

`{validateBeforeSave: false}` is passed to `user.save()` here because we're only updating OTP fields, not re-validating the whole document (e.g. we don't want an unrelated validation issue to block OTP issuance).

### `registerUser({ name, email, password, role, department })`
1. Checks if a `User` with that email already exists → `409 Conflict` if so.
2. Creates the `User` document (the password gets hashed automatically by the model's `pre("save")` hook at this point).
3. Calls `issueOtp(user, OTP_PURPOSE.EMAIL_VERIFICATION)` to email a verification code.
4. Strips `password` off the returned object before handing it back (defense in depth — even though `password` isn't normally excluded via `select: false` on this field, this call makes sure the controller can never accidentally leak the hash).

### `verifyEmailOtp({ email, otp })`
1. Looks up the user **with** the hidden OTP fields (`.select("+otp +otpExpiry +otpPurpose")`).
2. Rejects with `404` if no such user, `400` if already verified, `400` if there's no pending *email verification* OTP (guards against submitting a login OTP here, or if none was ever issued), `400` if it's expired.
3. Compares the submitted OTP against the stored hash with `compareOtp` (bcrypt compare).
4. On success: sets `isEmailVerified = true`, clears the OTP fields, saves.

### `loginUser({ email, password })` — step 1 of login
1. Looks up user by email → `401 Invalid email or password` if not found (deliberately the *same* generic message as a wrong password, so an attacker can't use this endpoint to discover which emails are registered).
2. Calls `user.comparePassword(password)` → same generic `401` if wrong.
3. If the password is correct but the email was never verified → `403` (distinct message here, since at this point we already know the account/password are valid — telling them to check their email is legitimate).
4. Calls `issueOtp(user, OTP_PURPOSE.LOGIN)` — emails a fresh OTP.
5. Returns only `{ email }` — **no tokens yet**. The controller reports this back as "OTP sent, please verify".

### `verifyLoginOtp({ email, otp })` — step 2 of login
1. Looks up user with hidden OTP fields.
2. Validates purpose is `login` (not a leftover email-verification OTP), not expired, and the OTP matches — same pattern as `verifyEmailOtp`, `401`/`400` on failure.
3. Clears OTP fields.
4. Issues both tokens: `generateAccessToken(user)` and `generateRefreshToken(user)`.
5. Stores a **bcrypt hash** of the refresh token on the user (`user.refreshToken`) — so if the database were ever leaked, raw refresh tokens can't be replayed directly, and it sets up future support for revoking/rotating a specific refresh token.
6. Saves the user, strips `password`, returns `{ user, accessToken, refreshToken }` to the controller.

---

## 6. Tokens — what's inside them and how long they last

`src/utils/tokenGeneration.js`:

- **Access token** — payload `{ id, role, department }`, signed with `JWT_ACCESS_TOKEN` secret, expires after `JWT_ACCESS_EXPIRY` (env-configured; controller assumes 15 minutes when setting the cookie's `maxAge`). This is the token checked on every protected request — carrying `role`/`department` inline means `roleCheck`/`deptScope` middleware can make decisions without hitting the database.
- **Refresh token** — payload `{ userId }` only (deliberately minimal — it's not used for authorization, only to mint a new access token later), signed with a **separate** secret `JWT_REFRESH_TOKEN`, expires after `JWT_REFRESH_EXPIRY` (controller assumes 7 days).

Using two different secrets means a leaked access-token secret can't be used to forge refresh tokens and vice versa.

Both tokens are sent to the browser as **httpOnly cookies** (set in `auth.controller.js`'s `verifyLogin` handler), not in the JSON response body:

```js
secure: process.env.NODE_ENV === "production"   // HTTPS-only in prod
sameSite: "strict"                               // never sent on cross-site requests
httpOnly: true                                    // JS on the page can't read it
```

> **Not yet implemented:** there is no `/refresh-token` endpoint that exchanges the refresh token for a new access token, and no `/logout` endpoint that clears cookies / revokes `user.refreshToken`. The refresh token is stored (hashed) precisely so this can be added later, but right now once the 15-minute access token expires, the user has to log in again.

---

## 7. Middleware — how a protected route will check a request

These exist and are wired up per-route, but no route currently uses them yet (the auth routes themselves are intentionally public).

- **`auth` middleware** (`src/middlewares/auth.middleware.js`) — reads the `Authorization: Bearer <token>` header, verifies it against `JWT_ACCESS_TOKEN`, and if valid attaches the decoded payload as `req.user = { id, role, department }` for downstream handlers. Throws `401` if the header is missing/malformed or the token is invalid/expired.
- **`roleCheck(...allowedRoles)` middleware** (`src/middlewares/roleCheck.middleware.js`) — a factory: call it with the roles allowed on a route (e.g. `roleCheck(ROLES.HOD, ROLES.DEAN_INFRA)`), and it returns a middleware that rejects the request if `req.user.role` isn't in that list.
- **`deptScope` middleware** (`src/middlewares/deptScope.middleware.js`) — sets `req.scope` based on role: `admin`/`deanInfra` get `{}` (unrestricted — they can see all departments), everyone else gets `{ department: req.user.department }`. Downstream queries are expected to spread `req.scope` into their Mongo filter so a `labIncharge` can only ever see their own department's data.

> **Known bugs to fix before relying on these** (see project-level "Known issues" in `CLAUDE.md` — still true as of this doc):
> - `roleCheck.middleware.js` imports `ApiError` without the `.js` extension (will fail to resolve under Node ESM) and its returned middleware has the Express `(req, res, next)` parameters **swapped** to `(res, req, next)` — meaning `req.user.role` is actually being read off the response object. It also throws `401` for a permission failure; that should be `403 Forbidden` (401 means *not authenticated*, 403 means *authenticated but not allowed*).
> - Neither `auth` middleware currently checks that the token payload matches an *existing* user — a token stays "valid" (per JWT signature) even if the user was since deleted.

---

## 8. API Reference

Base path: **`/api/v1/auth`** (mounted in `src/app.js`). All bodies are JSON (`express.json()` is applied globally).

### `POST /api/v1/auth/register`

Creates a new (unverified) account and emails a 6-digit verification OTP.

**Body**
```json
{
  "name": "Jane Doe",
  "email": "jane@college.edu",
  "password": "plaintext-password",
  "role": "labIncharge",
  "department": "<Dept ObjectId, or omit for admin/deanInfra>"
}
```

**Success — `201`**
```json
{
  "statusCode": 201,
  "data": { "_id": "...", "name": "...", "email": "...", "role": "...", "isEmailVerified": false, ... },
  "message": "User registered. Check your email for the verification OTP",
  "success": true
}
```
(`password` is stripped from `data`.)

**Errors**
- `409` — a user with that email already exists.
- `400` — Mongoose validation failure (bad email format, missing required field, invalid role) — currently surfaces as whatever Mongoose throws, not yet normalized into `ApiError` shape.

---

### `POST /api/v1/auth/verify-email`

Confirms the emailed OTP and marks the account verified. Required before login will succeed.

**Body**
```json
{ "email": "jane@college.edu", "otp": "483920" }
```

**Success — `200`** — returns the updated user (verified, OTP fields cleared), message `"Email verified successfully"`.

**Errors**
- `404` — no user with that email.
- `400` — already verified / no pending email-verification OTP / OTP expired / OTP incorrect.

---

### `POST /api/v1/auth/login`

**Step 1 of 2.** Verifies email + password; does **not** log the user in yet — it emails a fresh OTP that must be confirmed via `verify-login-otp`.

**Body**
```json
{ "email": "jane@college.edu", "password": "plaintext-password" }
```

**Success — `200`**
```json
{
  "statusCode": 200,
  "data": { "email": "jane@college.edu" },
  "message": "OTP sent to your email, please verify to complete login",
  "success": true
}
```

**Errors**
- `401` — wrong email or password (same message for both, on purpose — doesn't reveal which one was wrong).
- `403` — credentials correct, but email not yet verified.

---

### `POST /api/v1/auth/verify-login-otp`

**Step 2 of 2.** Confirms the login OTP and actually logs the user in — issues JWT access + refresh tokens as httpOnly cookies.

**Body**
```json
{ "email": "jane@college.edu", "otp": "192837" }
```

**Success — `200`**
- Sets cookie `accessToken` (httpOnly, 15 min).
- Sets cookie `refreshToken` (httpOnly, 7 days).
```json
{
  "statusCode": 200,
  "data": { "user": { "_id": "...", "name": "...", "email": "...", "role": "...", ... } },
  "message": "Login successful",
  "success": true
}
```

**Errors**
- `401` — no such user, or no pending login OTP.
- `400` — no pending login OTP for this account / OTP expired / OTP incorrect.

---

## 9. Environment variables this feature needs

From `backend/Readme.md` and the code:

| Variable | Used by | Purpose |
|---|---|---|
| `JWT_ACCESS_TOKEN` | `tokenGeneration.js`, `auth.middleware.js` | secret used to sign/verify access tokens |
| `JWT_ACCESS_EXPIRY` | `tokenGeneration.js` | access token lifetime (e.g. `15m`) |
| `JWT_REFRESH_TOKEN` | `tokenGeneration.js` | secret used to sign refresh tokens |
| `JWT_REFRESH_EXPIRY` | `tokenGeneration.js` | refresh token lifetime (e.g. `7d`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | `mailer.js` | outgoing mail server for OTP emails. If `SMTP_HOST` is unset, the mailer falls back to `console.log`-ing the OTP instead of sending an email — this is what local dev/tests rely on. |
| `MAIL_FROM` | `mailer.js` | "From" address on OTP emails (defaults to `LABMON <no-reply@labmon.local>`) |
| `OTP_EXPIRY_MINUTES` | `mailer.js` (display text only — the *actual* expiry logic uses the constant in `constants.js`, not this env var) | shown in the OTP email body |
| `CORS_ORIGIN` | `app.js` | which frontend origin is allowed to call the API with cookies |
| `NODE_ENV` | `auth.controller.js` | when `"production"`, cookies get `secure: true` (HTTPS-only) |

---

## 10. Known issues in this feature (accurate as of this document)

- `roleCheck.middleware.js`: swapped `(req, res, next)` params (written as `(res, req, next)`), missing `.js` on the `ApiError` import, and returns `401` instead of `403` for permission denials. Not yet used by any route, so not currently causing failures, but must be fixed before any route relies on it.
- No `/refresh-token` or `/logout` endpoint yet, despite the refresh token already being generated and stored (hashed) — see section 6.
- `registerUser` validation errors (bad email, missing role, etc.) bubble up as raw Mongoose `ValidationError`s rather than a clean `ApiError`, so the error-response shape for those cases won't match the rest of the API yet.
- `auth` middleware trusts the JWT payload without re-checking the user still exists in the database.

---

## 11. Quick mental model (tl;dr)

- **Register** creates an account and proves you own the email (OTP #1).
- **Login is two calls**: password check → OTP #2 → tokens. A password alone never logs you in.
- **Nothing is ever stored in plain text**: password, OTP, and refresh token are all bcrypt-hashed in the database.
- **Tokens live in httpOnly cookies**, not in JSON, so frontend JS never touches them directly.
- **Controllers only talk to services; services only talk to models.** If you're debugging "why did this response come back wrong," the fix is almost always in `auth.service.js`.
