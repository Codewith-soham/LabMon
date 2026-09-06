# Architecture

## Entry point chain

```mermaid
flowchart LR
    A["server.js"] -->|"loads .env (dotenv)"| B["connectDB()\nsrc/config/db.config.js"]
    B -->|"connection established"| C["app.listen(PORT)"]
    C -->|"app instance built by"| D["src/app.js\n(Express app)"]
```

`src/app.js` builds and exports the Express instance. It does not call `listen` itself —
that's `server.js`'s job — which keeps the app importable/testable without binding a
port (used by `src/tests/*.test.js`).

## Middleware stack (global, in `app.js`)

Applied in this order, to every request:

```mermaid
flowchart TD
    Req(["Incoming request"]) --> M1["helmet()\nsecurity headers"]
    M1 --> M2["cors({ origin: CORS_ORIGIN, credentials: true })"]
    M2 --> M3["express.json({ limit: '10mb' })"]
    M3 --> M4["express.urlencoded({ extended: true, limit: '10mb' })"]
    M4 --> M5["cookieParser()\npopulates req.cookies"]
    M5 --> M6["morgan('dev')\nrequest logging"]
    M6 --> Routers["Mounted routers\n(auth / pc / complaint / dept)"]
    Routers --> EH["errorHandler\n(last, catches thrown ApiError)"]
```

1. `helmet()` — sets security-related HTTP headers.
2. `cors({ origin: CORS_ORIGIN, credentials: true })` — allows the configured frontend
   origin, with cookies allowed cross-origin.
3. `express.json({ limit: "10mb" })` — parses JSON bodies.
4. `express.urlencoded({ extended: true, limit: "10mb" })` — parses form bodies.
5. `cookieParser()` — populates `req.cookies` (used for reading the `accessToken`/
   `refreshToken` cookies set at login).
6. `morgan("dev")` — request logging.

Then routers are mounted, then `errorHandler` last (see [`middlewares.md`](./middlewares.md)).

## Router mounts

```js
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/pc", pcRouter);
app.use("/api/v1/complaint", complaintRouter);
app.use("/api/v1/dept", deptRouter);
```

## Layering convention

```mermaid
flowchart LR
    R["Routes\n(HTTP method + path + middleware)"] --> C["Controllers\n(asyncHandler-wrapped)"]
    C --> S["Services\n(business logic, ApiError)"]
    S --> M["Models\n(Mongoose schemas)"]
```

- **Routes** (`src/routes/`) wire an HTTP method + path to a controller function, and
  attach any per-route middleware (`auth`, `deptScope`, `roleCheck`, and — on public or
  otherwise sensitive routes — a rate limiter from `src/middlewares/rateLimiter.js` and a
  Zod `validate(schema)` from `src/middlewares/validate.middleware.js`, with schemas
  defined in `src/validators/`; see [`middlewares.md`](./middlewares.md)).
- **Controllers** (`src/controllers/`) are thin. Each handler is wrapped in
  `asyncHandler` (see [`utils.md`](./utils.md)) so a thrown/rejected error is forwarded
  to Express's error-handling middleware instead of needing a `try/catch` in every
  handler. A controller's job is: pull data out of `req`, call one service function,
  shape an `ApiResponse`.
- **Services** (`src/services/`) hold all business logic — validation beyond schema
  constraints, cross-model lookups, state-machine transitions (e.g. complaint
  escalation), token/OTP issuance. Services throw `ApiError` for anything that should
  become an HTTP error response.
- **Models** (`src/models/`) are Mongoose schemas. Schema-level `required`/`enum`/
  `unique`/custom `validate` are the first line of defense; anything more complex than
  that lives in the service layer.

This means a controller never talks to a model directly, and a route never contains
business logic — both of those only happen in `src/services/`.

## Request lifecycle example: escalating a complaint

```mermaid
sequenceDiagram
    participant Client
    participant Auth as auth middleware
    participant Role as roleCheck(LAB_INCHARGE, HOD)
    participant Ctrl as escalateComplaint controller
    participant Svc as escalateComplaintService
    participant DB as Complaint (Mongo)

    Client->>Auth: PATCH /api/v1/complaint/:id/escalate
    Auth->>Auth: verify JWT, set req.user = { id, role, department }
    Auth->>Role: forward request
    Role-->>Client: 403 if req.user.role not in {LAB_INCHARGE, HOD}
    Role->>Ctrl: forward request
    Ctrl->>Ctrl: validate :id is a Mongo ObjectId (else 400)
    Ctrl->>Svc: escalateComplaintService(id, req.user)
    Svc->>DB: findById(id)
    DB-->>Svc: complaint or null
    Svc-->>Ctrl: 404 if missing
    Svc-->>Ctrl: 400 if status already Resolved
    Svc-->>Ctrl: 403 if not admin/deanInfra and department mismatch
    Svc-->>Ctrl: 403 if req.user.role !== complaint.currentLevel
    Svc-->>Ctrl: 400 if NEXT_LEVEL[currentLevel] undefined (top of chain)
    Svc->>DB: mutate currentLevel/status, push history[], save
    Svc-->>Ctrl: updated complaint
    Ctrl-->>Client: 200 ApiResponse(complaint)
    Note over Auth,Ctrl: Any thrown ApiError is caught by the global errorHandler and converted to JSON
```

Every layer that can fail throws `ApiError(statusCode, message)`; nothing writes to
`res` directly except the final controller step and `errorHandler`.
