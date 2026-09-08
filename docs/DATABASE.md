# DATABASE.md

**Status:** as-built (2026-09-08) + PRD target + migration plan. Update on any schema change (PRD §27).
**Engine:** MongoDB (Atlas), accessed via Mongoose 9. `timestamps: true` on every schema → `createdAt` / `updatedAt`.
Collection names are Mongoose-pluralized: `User→users`, `Dept→depts`, `Lab→labs`, `Pc→pcs`, `Complaint→complaints`.

---

## 1. As-built schemas

### 1.1 `users` — `src/models/user.model.ts`
| Field | Type | Rules / default | Notes |
|---|---|---|---|
| `name` | String | required | |
| `email` | String | required, **unique**, lowercase, trim, `validator.isEmail` | login identity |
| `department` | ObjectId → `Dept` | default `null` | `null` for `deanInfra`/`admin` |
| `password` | String | required | bcrypt-hashed by `pre("save")` when modified (10 rounds) |
| `role` | String | required, enum `admin\|labIncharge\|hod\|deanInfra` | |
| `refreshToken` | String | — | `SHA-256→bcrypt` hash of current refresh JWT; cleared on logout |
| `isEmailVerified` | Boolean | default `false` | login blocked until `true` |
| `otp` | String | `select:false` | bcrypt hash of 6-digit code |
| `otpExpiry` | Date | `select:false` | now + 10 min |
| `otpPurpose` | String | `select:false`, enum `emailVerification` | |
| `otpAttempts` | Number | default `0`, `select:false` | lockout at `OTP_MAX_ATTEMPTS` (5) |
| `lastOtpSentAt` | Date | `select:false` | resend cooldown anchor |

Method: `comparePassword(plain) → bcrypt.compare`. Indexes: unique `email`.

### 1.2 `depts` — `department.model.ts`
| Field | Type | Rules |
|---|---|---|
| `name` | String | required, **unique**, trim |
| `code` | String | required, trim, uppercase |

Seeded by `src/scripts/seedDepartments.ts`: Computer Science(CSE), **Information Technology(IT)**, Mechanical(MECH), Civil(CIVIL), EXTC, CSEDS, AIDS.

### 1.3 `labs` — `lab.model.ts`
| Field | Type | Rules |
|---|---|---|
| `name` | String | required, trim | (no convention enforced; no unique index) |
| `department` | ObjectId → `Dept` | required |
| `incharge` | ObjectId → `User` | optional |

**Labs are created ad-hoc** by `pc.service.ts#resolveOrCreateLabId` (upsert by `{name, department}`) during a PC sync. No CRUD, no listing route, no `labNumber`, no seeding of specific labs.

### 1.4 `pcs` — `pc.model.ts`  *(asset system — out of V1 scope)*
| Field | Type | Rules / default |
|---|---|---|
| `deadStockNo` | String | required, **unique** |
| `department` | ObjectId → `Dept` | required |
| `lab` | ObjectId → `Lab` | required |
| `warranty.status` | String | enum `Active\|Expired`, default `Active` |
| `warranty.expiryDate` | Date | optional |
| `purchaseDate` | Date | optional |
| `config.cpu\|ram\|disk\|os` | String | optional (agent-written) |
| `config.software` | [String] | optional |
| `config.lastSyncedAt` | Date | set every sync |

Indexes: unique `deadStockNo`; compound `{department:1, lab:1}`; `{"warranty.status":1}`. `config` + `warranty` embedded.

### 1.5 `complaints` — `complaint.model.ts`
| Field | Type | Rules / default |
|---|---|---|
| `token` | String | required, **unique** — `nanoid(8)` |
| `pc` | ObjectId → `Pc` | **required** |
| `department` | ObjectId → `Dept` | required — **copied from the PC at creation** |
| `lab` | ObjectId → `Lab` | required — copied from the PC |
| `description` | String | required (Zod 1–2000) |
| `raisedBy.name` | String | required (embedded) |
| `raisedBy.contact` | String | required (embedded) |
| `status` | String | enum `Open\|Escalated_HOD\|Escalated_Dean\|Resolved`, default `Open` |
| `currentLevel` | String | enum = roles minus `admin`, default `labIncharge` |
| `history[]` | subdocs | `{ level?, action?, by? → User, at (default now), note? }` — append-only |

Indexes: unique `token`.

### 1.6 Relationships (as-built)
```
Dept 1─* User        (User.department; null for admin/deanInfra)
Dept 1─* Lab         (Lab.department, required)
Dept 1─* Pc          (Pc.department, required)
Dept 1─* Complaint   (Complaint.department, denormalized from Pc)
Lab  1─* Pc          (Pc.lab, required)
Lab  0/1 incharge → User
Pc   1─* Complaint   (Complaint.pc, required)
User 1─* Complaint.history[].by  (null for the public "created" entry)
```
Embedded (no collection): `Pc.config`, `Pc.warranty`, `Complaint.raisedBy`, `Complaint.history[]`.
The **only deliberate denormalization**: `Complaint.department` + `lab` (from the PC) — for join-free scoping.

---

## 2. PRD §14 core entities vs. as-built

| PRD entity | As-built | Verdict |
|---|---|---|
| `users` (`id,name,email,password_hash,role,department_id,lab_id,is_active,created_at,updated_at`) | `users` — **missing `lab`, missing `isActive`** | Add both. |
| `departments` (`id,name,code`) | `depts` (name, code) | ✔ matches. |
| `labs` (`id,department_id,lab_number,name`) | `labs` (name, department) — **missing `lab_number`**, no unique index, no seed | Add `labNumber`, unique `{department,name}`, seed IT 9–14. |
| `complaints` (`id,token,dead_stock_number,department_id,lab_id,reason,status,assigned_to,created_at,updated_at`) | `complaints` — **`dead_stock_number` not stored (only via `pc` ref)**, `status` enum differs, no `assigned_to` | Add `deadStockNo` string; make `pc` optional; rework `status`; add `assignedTo`. |
| `complaint_status_history` (`id,complaint_id,status,changed_by,remarks,created_at`) | embedded `Complaint.history[]` (`level,action,by,at,note`) | **Satisfied by the embedded array** (PRD §14 allows adapting). Add `fromStatus`/`toStatus`; optionally rename `note→remarks`. A separate collection is optional. |
| *(implied)* `audit_logs` (PRD §23) | — | New collection. |

---

## 3. Target schema changes (V1)

### 3.1 `users`
```
+ isActive:     Boolean, default true, index            // PRD §15/§16 (M2, S2)
+ lab:          ObjectId → Lab, default null            // PRD §13   (M3, S3)  — set for labIncharge
+ tokenVersion: Number, default 0                       // S4 — bump on deactivate/role change/logout
~ role enum:    ["admin","hod","labIncharge"]           // if D1 = collapse (drop "deanInfra")
- otp, otpExpiry, otpPurpose, otpAttempts, lastOtpSentAt // if D2 = remove public registration
~ isEmailVerified: keep as always-true OR remove + drop the loginUser check   // if D2
```

### 3.2 `labs`
```
+ labNumber:  Number (or keep name = "Lab 9" as canonical) // PRD §14, §8 (M14)
+ index:      unique { department: 1, name: 1 }            // currently none
  incharge:   (unchanged) ObjectId → User
```
Seed script `seedLabs.ts`: for department IT, create `Lab 9 … Lab 14`.

### 3.3 `complaints`  (depends on D3 + D4)
```
+ deadStockNo: String, required, trim                    // D4 (M5) — stored directly, not via pc
~ pc:          ObjectId → Pc, NOT required               // D4 — link only if a matching Pc exists
  department:  required (from validated form selection, not from Pc)
  lab:         required (from validated form selection; must belong to department)
~ status enum: ["SUBMITTED","ASSIGNED","IN_PROGRESS","RESOLVED","CLOSED"], default "SUBMITTED"   // D3 (M4)
~ currentLevel/ownerLevel: ["labIncharge","hod","admin"], default "labIncharge"   // D1 + D3
+ assignedTo:  ObjectId → User, default null             // PRD §14/§18 (M9)
~ token:       "LM-<DEPTCODE>-<6–8 base32>" — still not a DB id   // M6
~ history[]:   { fromStatus?, toStatus, action, by → User, at, remarks? }   // PRD §12
  raisedBy:    keep { name, contact } but make OPTIONAL if the PRD form omits them (confirm — PRD §8 lists no name/contact fields)
```

### 3.4 `audit_logs` (new)
```
actor:       ObjectId → User, required
action:      String, required        // "hod.create", "labIncharge.deactivate", "complaint.reopen", …
targetType:  String                  // "User" | "Complaint" | "Lab" | "Dept"
targetId:    ObjectId
metadata:    Mixed                   // before/after diff, ids, etc.
at:          Date, default now
index:       { actor: 1, at: -1 }, { targetType: 1, targetId: 1 }
```
Append-only; no update/delete API.

### 3.5 New/changed indexes
- `users`: `{ isActive: 1 }`, `{ role: 1, department: 1 }`, `{ role: 1, lab: 1 }`.
- `labs`: unique `{ department: 1, name: 1 }`.
- `complaints`: `{ department: 1, status: 1 }`, `{ lab: 1, status: 1 }`, `{ ownerLevel: 1 }`, keep unique `token`.

---

## 4. Migration plan

> Run against a **backup / non-prod copy first**. Every script idempotent, follows `src/scripts/*.ts` pattern (`mongoose.connect(env.MONGO_URL)`, log, `process.exit`). Add `npm run` aliases.

| Order | Script | Action |
|---|---|---|
| 1 | `seedDepartments.ts` (existing) | Ensure IT + others exist. Keep. |
| 2 | `seedLabs.ts` (new) | Upsert IT `Lab 9`–`Lab 14`. Detect & merge any ad-hoc `labs` created by past PC syncs (reassign `pcs.lab` / `complaints.lab` if merging). |
| 3 | `seedAdmin.ts` (new) | Upsert one `admin` from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bcrypt via model hook). `isActive:true`, `isEmailVerified:true`. |
| 4 | `migrateUsers.ts` (new) | `$set isActive:true`, `tokenVersion:0` on all users; backfill `lab` from `labs.incharge` back-refs; if D1: `role:"deanInfra" → "admin"`; if D2: `$unset` all `otp*` + `lastOtpSentAt`. |
| 5 | `migrateComplaints.ts` (new) | Per doc: copy `pc.deadStockNo → deadStockNo` (via populate or `$lookup`); map `status` (`Open→SUBMITTED`, `Escalated_HOD→SUBMITTED`+`ownerLevel:hod`, `Escalated_Dean→SUBMITTED`+`ownerLevel:admin`, `Resolved→RESOLVED`); rename `currentLevel→ownerLevel`; add `assignedTo:null`; normalize `history[]` (`level→` keep, add `toStatus` best-effort, `note→remarks`). Leave existing `token` values untouched. |
| 6 | `dropDeadIndexes.ts` (opt) | Drop obsolete indexes; `Model.syncIndexes()` for the rest. |

**If the DB currently holds only seed/test data** (likely — `seed.ts` inserts one throwaway Dept/Lab/PC, and `known-issues.md` implies no prod deployment), steps 4–5 collapse to "wipe `complaints`, re-seed" — decide per environment.

**Dry-run:** every migration script should accept `--dry-run` and print counts before writing.

---

## 5. Seed data required for V1 (PRD §2 / Phase 2)

```
Department: Information Technology (code IT)          — seedDepartments.ts ✔
Labs (IT):  Lab 9, Lab 10, Lab 11, Lab 12, Lab 13, Lab 14   — seedLabs.ts (new)
Admin:      one account from env                      — seedAdmin.ts (new)
```
HODs and Lab Incharges are **created by the Admin at runtime**, not seeded (PRD §6, §16). For local/dev testing before the Admin UI exists, a small `seedTestStaff.ts` may create one HOD + one Lab-12 Incharge — mark it dev-only.

---

## 6. Data-integrity rules to enforce in services (not just schema)

- `lab.department === complaint.departmentId` on complaint creation and on any lab reassignment.
- A `labIncharge` user must have a non-null `lab`; an `hod` must have a non-null `department`; an `admin` has both null.
- `token` uniqueness: retry generation on the (rare) duplicate-key error.
- `assignedTo` (if set) must be a user in the same lab/department as the complaint.
- Deactivating a user (`isActive:false`) bumps `tokenVersion` and should surface any complaints still `assignedTo` them for reassignment.
- `history[]` is append-only — no service path updates or removes an entry.
