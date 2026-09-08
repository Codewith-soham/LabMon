# API_CONTRACT.md

**Status:** as-built (2026-09-08) + PRD target endpoints. Update on any route change (PRD §27).
**Revised 2026-09-09:** D4 — a complaint must match an existing `Pc` (404 otherwise) and keep the PC reference; backend validates `departmentId`/`labId` against the PC (see §3.3).
Base path: **`/api/v1`**. All requests/responses JSON.

---

## 1. Conventions

- **Success:** `{ "statusCode": <n>, "data": <T>, "message": <string>, "success": true }`.
- **Error:** `{ "success": false, "statusCode": <n>, "message": <string>, "errors": <array> }`.
  Validation errors: `errors = [{ "field": "...", "message": "..." }]`. Unknown → `500 "Internal Server Error"`, `errors: []`, stack logged server-side only (PRD §21 ✔).
- **Status codes in use:** 200, 201, 400 (validation / bad state), 401 (unauthenticated), 403 (role / department / level), 404, 409 (duplicate email), 429 (rate limit / OTP lockout), 500.
- **Auth:** access JWT via `accessToken` httpOnly cookie **or** `Authorization: Bearer <token>`. 401 from a protected route triggers the SPA's one-shot refresh+retry.
- **Identity in URL** (`/:id`, `/:token`, `/:deadStockNo`); **filters in query string**.
- **Versioning:** path only (`/api/v1`), single version.
- **PRD §20 note:** the PRD sketches role-prefixed routes (`/api/hod/*`, `/api/lab-incharge/*`, plural `/api/complaints`). We keep **resource routes + in-service scoping** and adapt names to existing conventions, as §20 explicitly allows. New admin routes are grouped under `/api/v1/admin`.

---

## 2. Endpoints — AS-BUILT

### 2.1 `/api/v1/auth`
| Method | Path | Auth | Body / params | Success `data` | Guards |
|---|---|---|---|---|---|
| POST | `/register` | none | `{ name, email, password, role, department? }` (`department` = name string) | user (no password) | **none** (S1 — see D2) |
| POST | `/verify-email` | none | `{ email, otp }` (`otp` = 6 digits) | user | `otpVerifyLimiter`, Zod, `otpAttempts` lockout |
| POST | `/resend-otp` | none | `{ email, purpose }` | `{ email }` | `otpResendLimiter`, Zod, cooldown |
| POST | `/login` | none | `{ email, password }` | `{ user }` + sets `accessToken`/`refreshToken` cookies | `loginLimiter`, Zod; 403 if `!isEmailVerified` |
| POST | `/refresh-token` | refresh cookie | — | `{}` + new cookies | **no limiter** (S7); rotates |
| POST | `/logout` | access | — | `{}` + clears cookies | `auth` |
| GET | `/me` | access | — | `{ user }` (dept populated) | `auth` |

### 2.2 `/api/v1/complaint`
| Method | Path | Auth | Body / params | Success `data` | Guards |
|---|---|---|---|---|---|
| POST | `/` | none | `{ deadStockNo, description, raisedBy:{ name, contact } }` | complaint incl. `token` (`nanoid(8)`) | `complaintLimiter`, Zod; **404 if no `Pc` with that `deadStockNo`** |
| GET | `/track/:token` | none | param `token` | `{ token, status, currentLevel, description, createdAt }` (5 fields) | — |
| GET | `/` | access | — | complaint[] (role/level scoped by `buildComplaintScope`; `lab`,`department`,`history.by` populated; `sort createdAt desc`) | `auth`; no pagination/filter |
| PATCH | `/:id/escalate` | access | param `id` (ObjectId) | complaint (populated) | `auth`, `roleCheck(labIncharge,hod)`, Zod param; svc: not resolved, same dept, `role===currentLevel`, next level exists |
| PATCH | `/:id/resolve` | access | param `id`, `{ remarks? }` | complaint (populated) | `auth`, `roleCheck(labIncharge,hod,deanInfra)`, Zod param+body; svc: not already resolved, same dept, `role===currentLevel` |

### 2.3 `/api/v1/pc`  *(asset system — out of V1 scope, left untouched)*
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/sync` | **none** | `pcSyncLimiter`, Zod. Field-by-field `$set` of `config.*`; provisions a new PC if `deadStockNo` unknown + `department`+`lab` supplied. **No device auth (S8).** |
| GET | `/lookup/:deadStockNo` | none | Returns `{ deadStockNo, department:{name}, lab:{name} }`. Used by `RaiseComplaintPage` to pre-fill / confirm the department & lab for a dead-stock number. **UX helper only** — the backend re-validates the PC, department and lab on `POST /complaint` regardless of what the client sends (revised D4, see §3.3). |
| GET | `/search` | access + `roleCheck(labIncharge,hod,deanInfra)` + `deptScope` | Regex filters `deadStockNo/cpu/ram/disk/os/software`; exact `warrantyStatus`,`lab`. |
| POST | `/:id/health-card` | access + `roleCheck(labIncharge,hod,deanInfra,admin)` + Zod param + `deptScope` | Pure read wired as POST (cosmetic issue). |

### 2.4 `/api/v1/dept`
| Method | Path | Auth | Success `data` |
|---|---|---|---|
| GET | `/` | none | `[{ _id, name, code }]` sorted by name |

---

## 3. Endpoints — TARGET ADDITIONS (V1, PRD §16–§20)

> Exact shapes finalized per-phase; this is the intended surface. `[Ph n]` = implementation phase.

### 3.1 Auth changes
| Change | Phase | Detail |
|---|---|---|
| `POST /auth/register` removed **or** gated `roleCheck(ADMIN)` | Ph3 | Per decision D2. |
| `POST /auth/login` also 403s when `!user.isActive` | Ph3 | PRD §15. |
| `GET /auth/me` returns `department` **and** `lab` (populated) | Ph3 | For lab-scoped UI. |
| (if D2 removes OTP) `/verify-email`, `/resend-otp` removed | Ph2/3 | + mailer/otp utils. |

### 3.2 Organization (public + admin reads)
| Method | Path | Auth | Purpose | Phase |
|---|---|---|---|---|
| GET | `/dept` | none | (unchanged) department list for the public form | — |
| GET | `/dept/:id/labs` | none | Labs in a department — feeds the public form's Lab dropdown | Ph4 |
| GET | `/admin/departments` | admin | Full department list for admin | Ph6 |
| GET | `/admin/labs` | admin | All labs (filter `?departmentId=`) | Ph6 |
| POST/PATCH | `/admin/departments`, `/admin/labs` | admin | Manage org (if in V1 scope — PRD §16 "where applicable") | Ph6 |

### 3.3 Public complaint (reworked — D3, D4)

**D4 (revised 2026-09-09): a complaint MUST be tied to a real PC.**

- `deadStockNo` must match an existing document in the `Pc` collection. No match → **`404`** (`"PC not found"`), no complaint created.
- The created complaint **retains a reference to the matched PC** (`complaint.pc = pc._id`), as it does today.
- The client also submits `departmentId` and `labId` (chosen in the form). The backend **must verify both equal the matched PC's `department` and `lab`** — a mismatch → **`400`** (`"Department/lab does not match this PC"`), no complaint created. (The PC's own `department`/`lab` remain the source of truth for the stored complaint.)
- The frontend PC lookup (`GET /pc/lookup/:deadStockNo`, §2.3) is a **UX aid only** — it pre-fills/greys the dept & lab selectors. Backend validation on `POST /complaint` is authoritative and runs whether or not the client called lookup.
- This supersedes the earlier "no `Pc` required" wording. The `Pc` model, routes and the `agent/` sync path are unchanged.

| Method | Path | Auth | Body / response | Phase |
|---|---|---|---|---|
| POST | `/complaint` | none | Body `{ deadStockNo, departmentId, labId, reason, raisedBy? }`. **Requires** an existing `Pc` with that `deadStockNo` (else `404`); verifies dept exists, lab ∈ dept, **and `departmentId`/`labId` match the PC** (else `400`); links `complaint.pc` to the matched PC. Returns `{ token: "LM-<DEPTCODE>-<rand>", status:"SUBMITTED", ... }`. | Ph4 |
| GET | `/complaint/track/:token` | none | Richer: `{ token, department, lab, deadStockNo, reason, status, assignedInfo?, lastUpdated, timeline:[{ status, at, remarks? }] }` — no staff PII. | Ph5 |

### 3.4 Staff complaint actions
| Method | Path | Auth | Purpose | Phase |
|---|---|---|---|---|
| GET | `/complaint` | staff | Role+scope filtered (Admin=all, HOD=dept, Lab Incharge=**lab**). Add `?status=&labId=&page=&limit=`. | Ph3/7/8 |
| GET | `/complaint/:id` | staff | Single complaint + full history, scope-checked. | Ph7/8 |
| PATCH | `/complaint/:id/status` | staff | `{ status, remarks? }` — validated transition (`SUBMITTED→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED`). | Ph8 |
| PATCH | `/complaint/:id/assign` | Lab Incharge/HOD | `{ assignedTo }` (if staff feature) → status `ASSIGNED`. | Ph8 |
| PATCH | `/complaint/:id/reopen` | staff | `{ remarks }` — `RESOLVED`/`CLOSED` → `IN_PROGRESS`. | Ph7/8 |
| PATCH | `/complaint/:id/escalate` | Lab Incharge / HOD | Owner-level only; appends history; does not change `status`. | Ph7/8 |

### 3.5 Dashboards (aggregation — M8)
| Method | Path | Auth | Returns | Phase |
|---|---|---|---|---|
| GET | `/admin/dashboard` | admin | `{ totals:{submitted,assigned,inProgress,resolved,closed}, byDepartment:[...] }` | Ph6 |
| GET | `/hod/dashboard` | hod | dept totals + `byLab` + `labInchargeOverview` + `recent` | Ph7 |
| GET | `/lab-incharge/dashboard` | labIncharge | lab totals + workload + `recent` | Ph8 |

### 3.6 Admin — staff management (PRD §16)
| Method | Path | Auth | Body | Phase |
|---|---|---|---|---|
| GET | `/admin/hods` | admin | — | Ph6 |
| POST | `/admin/hods` | admin | `{ name, email, password?, departmentId }` (+ audit) | Ph6 |
| PATCH | `/admin/hods/:id` | admin | `{ name?, departmentId?, isActive? }` (+ audit) | Ph6 |
| DELETE | `/admin/hods/:id` | admin | soft-delete = `isActive:false` (+ audit) | Ph6 |
| GET | `/admin/lab-incharges` | admin | — | Ph6 |
| POST | `/admin/lab-incharges` | admin | `{ name, email, password?, departmentId, labId }` (+ audit) | Ph6 |
| PATCH | `/admin/lab-incharges/:id` | admin | `{ name?, departmentId?, labId?, isActive? }` (+ audit) | Ph6 |
| DELETE | `/admin/lab-incharges/:id` | admin | soft-delete (+ audit) | Ph6 |
| GET | `/admin/audit-logs` | admin | `?actor=&action=&page=` | Ph6 |

---

## 4. Validation rules (backend is authoritative — PRD §22)

| Field | Rule |
|---|---|
| `deadStockNo` | required, trimmed, non-empty; **must match an existing `Pc`** (complaint creation returns `404` if not) |
| `departmentId` / `labId` | required, valid ObjectId, must exist; `lab.department === departmentId`; on `POST /complaint` **both must also equal the matched PC's `department` / `lab`** (else `400`) |
| `reason` / `description` | required, trimmed, 1–2000 chars |
| `email` | required, valid, lowercased |
| `password` | required; **[TARGET]** min length policy (currently only `min(1)` on login) |
| `role` | must be one of the allowed enum values; never accepted on a self-service path |
| `token` (track) | required non-empty string |
| every `:id` param | `^[0-9a-fA-F]{24}$` (`objectIdParamSchema`) |

---

## 5. Contract test checklist (PRD §21, §25)

- [ ] Every error path returns the standard error envelope (no bare strings, no HTML, no stack).
- [ ] 401 vs 403 used correctly (unauthenticated vs wrong role/scope).
- [ ] 409 on duplicate email (register/create user).
- [ ] 400 on invalid department/lab, missing fields, bad token param.
- [ ] `POST /complaint`: 404 when `deadStockNo` has no matching `Pc`; 400 when `departmentId`/`labId` don't match the matched PC; on success `complaint.pc` references that PC.
- [ ] Public `track` payload contains **no** staff identities / internal ids.
- [ ] Scoped list endpoints never return out-of-scope rows (dept for HOD, lab for Lab Incharge) — asserted with negative fixtures.
- [ ] Rate-limited routes return 429 with the standard envelope (verified outside `NODE_ENV=test`).
