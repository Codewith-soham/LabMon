# Roadmap Phases — Planned vs. Actual

`backend/Readme.md` lays out a 7-phase roadmap. This page cross-checks each phase against
the actual code and git history (`git log --oneline`) as of 2026-08-13.

## Phase 1: Foundation

**Planned:** MVC skeleton, all 5 Mongoose models, JWT auth, role and department scoping
middleware.

**Actual: done.**
- MVC skeleton exists: `src/routes` → `src/controllers` → `src/services` → `src/models`.
- All 5 models exist and are wired up: `Dept`, `Lab`, `User`, `Pc`, `Complaint` (see
  [`models.md`](./models.md)).
- JWT auth exists: `src/middlewares/auth.middleware.js` verifies a Bearer token and
  populates `req.user`; `src/utils/tokenGeneration.js` issues access/refresh tokens on
  login.
- Role and department scoping middleware exist: `src/middlewares/roleCheck.middleware.js`
  and `src/middlewares/deptScope.middleware.js` (see [`middlewares.md`](./middlewares.md)).

## Phase 2: Python Agent

**Planned:** Hardware/software collector, sync endpoint integration.

**Actual: done**, ahead of what `backend/Readme.md`'s "Repository Status" section
(written earlier) suggests — that section still says the agent hasn't started, but
`agent/collector.py` exists and is functional. See [`agent.md`](./agent.md). It collects
CPU, RAM, disk, OS, and installed software (via the Windows registry) and POSTs to
`/api/v1/pc/sync`.

## Phase 3: Health Card + Complaint Core

**Planned:** Health card view, public complaint flow and token system, escalation state
machine.

**Actual: done.**
- Health card view: `GET-like` `POST /api/v1/pc/:id/health-card` (see note on HTTP verb
  in [`known-issues.md`](./known-issues.md)) returns a department-scoped PC document via
  `getPcHealthCard` in `pc.service.js`.
- Public complaint flow: `POST /api/v1/complaint/` (no auth) creates a complaint with an
  `nanoid(8)` token via `createComplaint` in `complaint.service.js`.
- Escalation state machine: `escalateComplaint` and `resolveComplaint` in
  `complaint.service.js`, driven by the `NEXT_LEVEL` / `STATUS_FOR_LEVEL` lookup tables in
  `constants.js`. See [`complaint-module.md`](./complaint-module.md).

Not yet done from this phase: `GET /api/complaints/track/:token` (public complaint
lookup by token) and `GET /api/complaints` (role-scoped list) from the planned API
surface — no route or controller for either exists yet.

## Phase 4: Role Dashboards

**Planned:** Lab Incharge, HOD, and Dean Infra dashboards with backend-enforced
visibility.

**Actual: not started.** No dashboard/list endpoints exist beyond the single-PC health
card and single-complaint escalate/resolve actions. There's no `GET /api/complaints`
or `GET /api/pcs` listing endpoint yet, so there's nothing for a dashboard to call.

## Phase 5: Search

**Planned:** PC search by configuration and software, indexed queries.

**Actual: not started.** No `GET /api/pc/search` route, controller, or service exists.
No indexes beyond the implicit ones from `unique: true` schema fields.

## Phase 6: Security Hardening

**Planned:** Rate limiting, validation, audit logs, CORS and Helmet.

**Actual: partially done.**
- Helmet: applied (`app.use(helmet())` in `app.js`).
- CORS: applied, configurable via `CORS_ORIGIN` env var.
- Audit logs: the `Complaint.history[]` array is a domain-level audit trail of
  create/escalate/resolve actions — arguably satisfies this for complaints.
- Validation: minimal — mostly relies on Mongoose schema-level `required`/`enum`/
  `validate`. No request-body validation library (e.g. Zod/Joi) is wired in.
- Rate limiting: **not implemented.** No rate-limit middleware anywhere, and the public,
  auth-free endpoints (`POST /api/v1/complaint/`, `POST /api/v1/pc/sync`) are exposed to
  it.

## Phase 7: Deployment

**Planned:** Dockerization, CI/CD, MongoDB Atlas, agent packaging, load testing.

**Actual: not started.** No Dockerfile, no CI config, no packaging script for the agent
(it's run as a plain Python script via `python agent/collector.py`).

## Summary table

| Phase | Status |
|---|---|
| 1. Foundation | Done |
| 2. Python Agent | Done |
| 3. Health Card + Complaint Core | Done (minus track-by-token and list endpoints) |
| 4. Role Dashboards | Not started |
| 5. Search | Not started |
| 6. Security Hardening | Partial (Helmet/CORS/audit trail done; rate limiting and request validation missing) |
| 7. Deployment | Not started |
