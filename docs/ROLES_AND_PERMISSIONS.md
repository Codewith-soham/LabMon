# ROLES_AND_PERMISSIONS.md

**Status:** as-built (2026-09-08) + PRD target. Update on any authz change (PRD §27).
**2026-09-09 (Phase 1):** D1–D4 are **locked**. Final roles: `ADMIN`, `HOD`, `LAB_INCHARGE` (no `deanInfra`). Final statuses: `SUBMITTED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. Escalation chain tops out at HOD. The **frontend** constants/types/routes now reflect this; the **backend** enums, `complaint.model`, `complaint.service` and `scope.ts` still carry the legacy set and are migrated in Phase 2 (see `DEVELOPMENT_LOG.md`).

---

## 1. Roles

### As-built (`backend/src/config/constants.ts` `ROLES`)
| Key | Value | Scope | Notes |
|---|---|---|---|
| `ADMIN` | `admin` | system-wide (unscoped) | Enum + `scope.ts` treat it as unscoped for reads. **No admin UI, no admin endpoints.** Anyone can self-register as this today (S1). |
| `HOD` | `hod` | own department | Sees complaints **currently at HOD level** in their department. |
| `LAB_INCHARGE` | `labIncharge` | own department | Sees their department's **whole** complaint queue (no lab filter). |
| `DEAN_INFRA` | `deanInfra` | system-wide (unscoped) | Top of escalation chain; resolve-only in UI. **PRD has no such role** (decision D1). |

### PRD target (§6) — 3 roles
| Role | Scope | Provisioning |
|---|---|---|
| `ADMIN` | system-wide | **Seeded securely** via env/DB (`ADMIN_EMAIL`/`ADMIN_PASSWORD`). Never via public registration. |
| `HOD` | `department` | Created by Admin. |
| `LAB_INCHARGE` | `department` + `lab` | Created by Admin, assigned to one lab. |
| *(public user)* | none | No account. |

**Decision D1** (`PROJECT_AUDIT.md` §7): **LOCKED — collapse `deanInfra` → `admin`.** Backend migration in Phase 2 (`updateMany({role:"deanInfra"},{$set:{role:"admin"}})` + enum change); frontend already on the 3-role set as of Phase 1.

---

## 2. Organizational scope model (PRD §13 — "ROLE + ORGANIZATIONAL SCOPE, not role alone")

| Role | `department` | `lab` | Can access |
|---|---|---|---|
| Admin | `null` | `null` | Everything, all departments and labs. |
| HOD | set | `null` | All labs + complaints in **their** department only. |
| Lab Incharge | set | **set** | **Their one lab** only (complaints, PCs). |

**As-built enforcement:**
- Department scope: `buildDepartmentScope` / `assertDepartmentAccess` / `buildComplaintScope` in `src/utils/scope.ts`, applied via `deptScope` middleware (on `/pc` routes) and directly inside `complaint.service.ts`.
- **Lab scope: NOT IMPLEMENTED.** `User` has no `lab` field; no `buildLabScope`. **[TARGET]** add both; enforce for Lab Incharge on every complaint read + action. PRD §7/§8/§10 label cross-lab/cross-department leakage a **mandatory** test failure.

---

## 3. Permission matrix — TARGET (V1)

Legend: ✅ allowed · ❌ forbidden (backend must 401/403) · ➖ n/a

| Capability | Public | Lab Incharge | HOD | Admin |
|---|---|---|---|---|
| Raise complaint (no login) | ✅ | ✅ | ✅ | ✅ |
| Track complaint by token | ✅ | ✅ | ✅ | ✅ |
| Log in / log out / `GET me` | ➖ | ✅ | ✅ | ✅ |
| View complaints — own lab | ❌ | ✅ | ✅ (dept) | ✅ (all) |
| View complaints — another lab, same dept | ❌ | ❌ | ✅ | ✅ |
| View complaints — another department | ❌ | ❌ | ❌ | ✅ |
| Update complaint status (`SUBMITTED→ASSIGNED→IN_PROGRESS`) | ❌ | ✅ own lab | ✅ dept | ✅ |
| Assign complaint to staff (if staff feature exists) | ❌ | ✅ own lab | ✅ dept | ✅ |
| Add remarks on a transition | ❌ | ✅ own lab | ✅ dept | ✅ |
| Mark `RESOLVED` | ❌ | ✅ own lab | ✅ dept | ✅ |
| Verify resolution / mark `CLOSED` | ❌ | ✅ own lab | ✅ dept | ✅ |
| Reopen a `RESOLVED`/`CLOSED` complaint | ❌ | ✅ own lab | ✅ dept | ✅ |
| Escalate Lab Incharge → HOD | ❌ | ✅ (own lab, when owner) | ➖ | ➖ |
| Escalate HOD → Admin/Infra | ❌ | ❌ | ✅ (own dept, when owner) | ➖ |
| Dashboard stats — own scope | ❌ | ✅ lab | ✅ dept | ✅ system |
| Create / edit HOD | ❌ | ❌ | ❌ | ✅ |
| Create / edit Lab Incharge | ❌ | ❌ | ❌ | ✅ |
| Activate / deactivate staff account | ❌ | ❌ | ❌ | ✅ |
| Assign department / lab to a user | ❌ | ❌ | ❌ | ✅ |
| Create / edit department | ❌ | ❌ | ❌ | ✅ |
| Create / edit lab | ❌ | ❌ | ❌ | ✅ |
| Create / modify Admin | ❌ | ❌ | ❌ | ❌ (seed/DB only) |
| Change own role | ❌ | ❌ | ❌ | ❌ |
| View audit log | ❌ | ❌ | ❌ | ✅ |
| Modify audit records | ❌ | ❌ | ❌ | ❌ |

PRD §6 explicit "cannot"s (HOD/Lab Incharge): create system-level users, delete/modify Admin, access another department's data (HOD) / another lab (Lab Incharge), change their own role, bypass backend authorization.

---

## 4. Permission matrix — AS-BUILT (today)

| Capability | Public | labIncharge | hod | deanInfra | admin |
|---|---|---|---|---|---|
| `POST /complaint` (raise) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /complaint/track/:token` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/register` (any role!) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/login`, `/verify-email`, `/resend-otp`, `/refresh-token` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/logout`, `GET /auth/me` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `GET /complaint` (list) | ❌ | ✅ dept (whole queue) | ✅ dept, `currentLevel=hod` only | ✅ all depts, `currentLevel=deanInfra` only | ✅ all |
| `PATCH /complaint/:id/escalate` | ❌ | ✅ if `role===currentLevel` & same dept & next level exists | ✅ same | ❌ (`roleCheck` excludes) | ❌ |
| `PATCH /complaint/:id/resolve` | ❌ | ✅ if `role===currentLevel` & same dept | ✅ same | ✅ same | ❌ (`roleCheck` excludes) |
| `GET /pc/search` | ❌ | ✅ dept | ✅ dept | ✅ all | ❌ |
| `POST /pc/:id/health-card` | ❌ | ✅ dept | ✅ dept | ✅ all | ✅ |
| `GET /pc/lookup/:deadStockNo` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /pc/sync` | ✅ (no auth) | ✅ | ✅ | ✅ | ✅ |
| `GET /dept` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin dashboard / user CRUD | ➖ **does not exist** | | | | |

Gaps vs. target: **S1** (register open to all/any role), **S2** (no `isActive` check), **S3** (labIncharge is only dept-scoped, not lab-scoped), plus no admin surface at all.

---

## 5. Escalation / ownership

### As-built
`currentLevel` (enum: roles minus `admin`) tracks the owner. `NEXT_LEVEL`: `labIncharge→hod`, `hod→deanInfra`. `STATUS_FOR_LEVEL`: `hod→Escalated_HOD`, `deanInfra→Escalated_Dean`. Escalate is gated so **only the role equal to `currentLevel`** can move it forward; `resolve` allowed for `labIncharge`/`hod`/`deanInfra` when `role===currentLevel`. `history[]` gets `{level, action, by, at, note?}`.

### Target (PRD §2, §11, §12; depends on D1 + D3)
- Chain: **Lab Incharge → HOD → Admin/Infra** (HOD→Admin only if D1 keeps an Admin escalation queue; otherwise HOD is the escalation ceiling and Admin monitors).
- **Status ≠ escalation.** `status` follows `SUBMITTED→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED` (+ reopen). Escalation changes the **owner level**, appends history, and does not itself change `status`.
- Every transition writes a history/audit record: `{ complaintId, fromStatus, toStatus, changedBy, at, remarks? }` (PRD §12).

---

## 6. Enforcement checklist for implementation phases

- [ ] `roleCheck(ROLES.ADMIN)` on every `/api/v1/admin/*` route (Phase 3/6).
- [ ] `isActive` checked in `loginUser` **and** re-checked per request (token version or `/me`) (Phase 3).
- [ ] `buildLabScope` added to `scope.ts`; Lab Incharge complaint list + detail + every action filtered by `lab` (Phase 3).
- [ ] `assertDepartmentAccess` extended to `assertLabAccess` for Lab Incharge mutations (Phase 3).
- [ ] Negative tests: HOD→Admin API = 403; Lab Incharge→Admin API = 403; IT HOD→MECH data = 403; Lab 12 incharge→Lab 13 = 403; unauthenticated→any dashboard API = 401 (PRD §3, §10).
- [ ] No role assignable via a self-service path; `role` never editable by its own owner.
- [ ] Audit-log write on every admin CRUD + complaint state change (Phase 6+).
