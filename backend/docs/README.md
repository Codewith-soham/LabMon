# LABMON Documentation

This `docs/` folder documents the current state of the LABMON codebase in detail — what
exists, how the pieces connect, and what is still a stub. It reflects the code as it
actually is (verified by reading every file), not the aspirational roadmap in
`backend/Readme.md`.

## Index

- [`phases.md`](./phases.md) — the roadmap phases from `backend/Readme.md`, annotated
  with what is actually done in the repo today vs. still pending, based on the real code
  and git history.
- [`architecture.md`](./architecture.md) — request lifecycle, layering convention
  (routes → controllers → services → models), and how a request flows end to end.
- [`constants.md`](./constants.md) — `src/config/constants.js` in detail: every exported
  value, why it's centralized, and every file that imports it.
- [`pc-module.md`](./pc-module.md) — the PC health-card feature end to end: model,
  route, controller, service, and how it's wired to `constants.js` and the middlewares.
- [`middlewares.md`](./middlewares.md) — `auth`, `deptScope`, `roleCheck`, and
  `errorHandler` in detail, including the exact request object shape each one produces
  and consumes.
- [`auth-module.md`](./auth-module.md) — registration, OTP email verification, OTP-based
  login, and JWT/cookie issuance.
- [`complaint-module.md`](./complaint-module.md) — public complaint submission and the
  escalation/resolution state machine.
- [`models.md`](./models.md) — every Mongoose schema (`Dept`, `Lab`, `User`, `Pc`,
  `Complaint`) and their relationships.
- [`utils.md`](./utils.md) — `ApiError`, `ApiResponse`, `asyncHandler`, `tokenGeneration`,
  `otp`, `mailer`.
- [`agent.md`](./agent.md) — the Python collector agent (`agent/collector.py`) and how it
  talks to `/api/v1/pc/sync`.
- [`known-issues.md`](./known-issues.md) — bugs and gaps found while reading the current
  tree, so they aren't rediscovered from scratch later.

## How this differs from `backend/Readme.md`

`backend/Readme.md` is the design doc / roadmap and is treated as the source of truth for
**what's planned**. This `docs/` folder is the source of truth for **what's actually
implemented right now**, verified line-by-line. The two will drift as work lands — when
they disagree, trust `docs/` for current state and `Readme.md` for intent.
