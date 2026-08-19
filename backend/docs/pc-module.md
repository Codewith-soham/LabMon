# PC Module

Covers `src/services/pc.service.js`, its endpoints in `src/routes/pc.route.js` / `src/controllers/pc.controller.js`, all mounted at `/api/v1/pc`, and operating on the `Pc` model (`src/models/pc.model.js`).

## `syncPcConfig(payload)` -> `POST /api/v1/pc/sync`

Agent-facing endpoint. No auth middleware yet (device-key auth is planned, not implemented).

- Requires `payload.deadStockNo`; throws `400` (`"deadStockNo is required"`) if missing.
- Looks up the PC by `deadStockNo` and `$set`s its `config` to `{ ...payload.config, lastSyncedAt: new Date() }`, overwriting the whole embedded `config` subdocument (any field omitted from `payload.config` is dropped, not merged).
- Returns the updated document (`{ returnDocument: "after" }`).
- Throws `404` (`"PC not found. Check dead stock number."`) if no PC has that `deadStockNo` - this endpoint does not create PCs, only updates config on existing ones.

## `getPcHealthCard(pcId, scope)` -> `POST /api/v1/pc/:id/health-card`

`auth`, `deptScope`.

- `Pc.findOne({ _id: pcId, ...scope })` - `scope` comes from `deptScope` (`{}` for admin/deanInfra, `{ department: req.user.department }` otherwise), so a labIncharge/hod requesting a PC outside their department gets the same `404` as a nonexistent id.
- Throws `404` (`"Pc not found"`) if no match.
- Returns the full PC document (deadStockNo, department, lab, warranty, purchaseDate, config).

## `searchPcs(queryParams, scope)` -> `GET /api/v1/pc/search`

`auth`, `roleCheck(labIncharge, hod, deanInfra)`, `deptScope`. Lets Lab Incharge/HOD/Dean Infra look up PCs by hardware, software, dead stock number, or warranty status without needing the exact `_id`.

**Scoping**: same `deptScope` idiom as above - `req.scope = {}` for admin/deanInfra (search across all departments), `req.scope = { department: req.user.department }` for labIncharge/hod (restricted to their own department). There is no lab-level restriction - labIncharge and hod both see their whole department's PCs, not just their own lab, since `User` has no `lab` field.

**Query params** (all optional; an empty query returns every PC in scope, sorted newest-first by `createdAt`):

| Param | Match type | Field | Notes |
|---|---|---|---|
| `deadStockNo` | partial, case-insensitive | `deadStockNo` | regex-escaped |
| `cpu` | partial, case-insensitive | `config.cpu` | regex-escaped |
| `ram` | partial, case-insensitive | `config.ram` | regex-escaped |
| `disk` | partial, case-insensitive | `config.disk` | regex-escaped |
| `os` | partial, case-insensitive | `config.os` | regex-escaped |
| `software` | partial, case-insensitive | `config.software` | matches if any array element contains the substring |
| `warrantyStatus` | exact | `warranty.status` | must be `Active` or `Expired`, else `400` |
| `lab` | exact | `lab` | must be a valid Mongo ObjectId, else `400` |

There is intentionally no `department` override param - scope always comes from `req.scope`, so a labIncharge/hod can't widen their results by passing a different department.

**Regex safety**: free-text params (`deadStockNo`, `cpu`, `ram`, `disk`, `os`, `software`) are escaped with `escapeRegex` (`str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`) before being used in `$regex`, so metacharacters (`. * + ? ^ $ { } ( ) | [ ] \`) are matched literally instead of being interpreted as regex syntax - this closes off both ReDoS and unintended pattern-injection from user input. A param is only added to the filter if it's truthy and non-blank after trimming, so unset params never widen the query with an empty/permissive regex.

**Indexes** added to support this: `{ department: 1, lab: 1 }` and `{ "warranty.status": 1 }` on `pc.model.js`. Substring regex on `config.cpu`/`os`/`software` isn't accelerated by these (B-tree indexes don't help unanchored regex) - a future `$text`/Atlas Search index would be needed for that.

**Example**:
```
GET /api/v1/pc/search?cpu=i5&warrantyStatus=Active
Authorization: Bearer <accessToken>
```
Returns PCs (within the caller's scope) whose `config.cpu` contains "i5" (case-insensitive) and whose `warranty.status` is exactly `"Active"`.

**Tests**: `src/tests/pc.search.test.js` - end-to-end integration tests covering auth/role/department scoping, each filter type, input validation (`400`s), and regex-escaping.
