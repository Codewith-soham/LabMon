# `src/config/constants.js`

Single source of truth for role names, complaint statuses, and the escalation lookup
tables. The file's own comment states the intent: *"Centralizing roles and
complaint_status so that we can change role if we want without updating in different
files."* Nothing in the codebase should hardcode a role or status string — always import
from here.

## Exports

### `ROLES`

```js
export const ROLES = {
    ADMIN: "admin",
    LAB_INCHARGE: "labIncharge",
    HOD: "hod",
    DEAN_INFRA: "deanInfra"
}
```

The four roles in the system. `ADMIN` is a superuser role that is not part of the
complaint escalation chain (see `Complaint.currentLevel`'s enum, which explicitly
excludes `ADMIN`). `LAB_INCHARGE` is the first responder for a complaint; `HOD` and
`DEAN_INFRA` are the two escalation levels above it.

Used by:
- `src/models/user.model.js` — `role` field enum (`Object.values(ROLES)`).
- `src/models/complaint.model.js` — `currentLevel` field enum
  (`Object.values(ROLES).filter(r => r !== ROLES.ADMIN)`) and the default
  (`ROLES.LAB_INCHARGE`).
- `src/middlewares/deptScope.middleware.js` — checks `req.user.role === ROLES.ADMIN ||
  req.user.role === ROLES.DEAN_INFRA` to decide whether to scope by department.
- `src/routes/complaint.route.js` — `roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD)` and
  `roleCheck(ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA)` gate the escalate/resolve
  routes.
- `src/services/complaint.service.js` — compares `user.role` against
  `complaint.currentLevel` and `ROLES.ADMIN` for department-scope bypass.

### `COMPLAINT_STATUS`

```js
export const COMPLAINT_STATUS = {
    OPEN: "Open",
    ESCALATED_HOD: "Escalated_HOD",
    ESCALATED_DEAN: "Escalated_Dean",
    RESOLVED: "Resolved"
}
```

The lifecycle states of a complaint. Mirrors `currentLevel` but is a separate field
because `status` needs a distinct terminal value (`RESOLVED`) that isn't itself an
escalation level.

Used by:
- `src/models/complaint.model.js` — `status` field enum, default `"Open"` (note: the
  model's default is the raw string `"Open"`, not `COMPLAINT_STATUS.OPEN` — see
  [`known-issues.md`](./known-issues.md)).
- `src/services/complaint.service.js` — sets `status: COMPLAINT_STATUS.OPEN` on create,
  compares against `COMPLAINT_STATUS.RESOLVED` to block double-escalation/double-resolve,
  and sets `status: COMPLAINT_STATUS.RESOLVED` on resolve.

### `NEXT_LEVEL`

```js
export const NEXT_LEVEL = {
    [ROLES.LAB_INCHARGE]: ROLES.HOD,
    [ROLES.HOD]: ROLES.DEAN_INFRA
}
```

A lookup table encoding the escalation chain as edges: `labIncharge -> hod -> deanInfra`.
There is intentionally no entry for `ROLES.DEAN_INFRA` — looking it up returns
`undefined`, which `escalateComplaint` in `complaint.service.js` uses as the signal that
a complaint is already at the top of the chain (it throws `400 "Complaint is already at
the highest escalation level"` in that case). This makes the chain's end an emergent
property of the data structure rather than a special-cased `if`.

Used by:
- `src/services/complaint.service.js` (`escalateComplaint`) — `NEXT_LEVEL[complaint.currentLevel]`
  determines both the new `currentLevel` and whether escalation is even possible.

### `STATUS_FOR_LEVEL`

```js
export const STATUS_FOR_LEVEL = {
    [ROLES.HOD]: COMPLAINT_STATUS.ESCALATED_HOD,
    [ROLES.DEAN_INFRA]: COMPLAINT_STATUS.ESCALATED_DEAN
}
```

Maps an escalation-chain *level* to the `status` string that should be set when a
complaint reaches that level. There's no entry for `ROLES.LAB_INCHARGE` because a
complaint's status is never set *to* "still with lab incharge" via escalation — that's
only the creation-time default.

Used by:
- `src/services/complaint.service.js` (`escalateComplaint`) —
  `complaint.status = STATUS_FOR_LEVEL[nextLevel]` right after computing `nextLevel` from
  `NEXT_LEVEL`. Because `nextLevel` is always `HOD` or `DEAN_INFRA` at this point
  (`LAB_INCHARGE` can never be a "next" level), this lookup can never miss.

### `OTP_PURPOSE`

```js
export const OTP_PURPOSE = {
    EMAIL_VERIFICATION: "emailVerification",
    LOGIN: "login"
}
```

Distinguishes what an outstanding OTP on a `User` document is *for*, since both
email-verification and login share the same `otp`/`otpExpiry` fields on the user model.
Prevents an OTP issued for one purpose being accepted for the other.

Used by:
- `src/models/user.model.js` — `otpPurpose` field enum.
- `src/services/auth.service.js` — `issueOtp(user, purpose)` stamps this onto the user;
  `verifyEmailOtp` and `verifyLoginOtp` each check `user.otpPurpose` matches the
  purpose they expect before accepting the OTP.

### `OTP_EXPIRY_MINUTES`

```js
export const OTP_EXPIRY_MINUTES = 10
```

A plain number (not a role/status map). Used by `src/services/auth.service.js` to compute
`OTP_EXPIRY_MS` (`OTP_EXPIRY_MINUTES * 60 * 1000`) at module load, which is added to
`Date.now()` when issuing an OTP.

## Why this file matters architecturally

Every enum-like value that crosses a model/service/middleware boundary in this codebase
funnels through `constants.js`. This is what lets the escalation chain
(`LAB_INCHARGE → HOD → DEAN_INFRA`) be expressed as two small object literals
(`NEXT_LEVEL`, `STATUS_FOR_LEVEL`) instead of `if/else` chains scattered across the
service layer — adding a new escalation level (e.g. a level between HOD and Dean Infra)
would mean editing this one file plus the `currentLevel`/`status` enums on the
`Complaint` model, not hunting through controllers.
