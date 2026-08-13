# PC Module — health card sync and lookup, in detail

Files involved:

- `src/routes/pc.route.js`
- `src/controllers/pc.controller.js`
- `src/services/pc.service.js`
- `src/models/pc.model.js`
- `src/middlewares/auth.middleware.js`, `src/middlewares/deptScope.middleware.js`
  (consumed by the health-card route)
- `agent/collector.py` (the external client that calls `/sync`)

This module has two endpoints: one for the Python agent to push hardware/software
config (`sync`), and one for a logged-in user to read a PC's "health card"
(`health-card`).

## Route (`src/routes/pc.route.js`)

```js
import Router from "express"
import { syncPc, PcHealthCard } from "../controllers/pc.controller.js"
import { auth } from "../middlewares/auth.middleware.js"
import { deptScope } from "../middlewares/deptScope.middleware.js"

const router = Router()

router.post("/sync", syncPc)
router.post("/:id/health-card", auth, deptScope, PcHealthCard)

export default router
```

Mounted at `/api/v1/pc` in `app.js`, so live paths are `POST /api/v1/pc/sync` and
`POST /api/v1/pc/:id/health-card`.

Two things worth flagging (also in [`known-issues.md`](./known-issues.md)):
- `import Router from "express"` — this imports Express's **default export** (the `express`
  factory function itself, aliased as `Router`) and calls it as `Router()`. This
  happens to work because `express()` and `express.Router()` are different but
  `import Router from "express"; Router()` still returns a valid Express *application*
  object that supports `.post()`/`.use()` etc. — it is not actually a `Router`
  instance, just something duck-type-compatible enough for this file's usage. The other
  two route files import `{ Router }from "express"` (the named export) correctly.
- `/sync` has **no `auth` middleware** — per `backend/Readme.md`'s planned API surface
  this endpoint should be gated by an "Agent device key," but no such check exists yet.
  Anyone who can reach the server can overwrite any PC's `config` by POSTing a known
  `deadStockNo`.
- `/:id/health-card` is a `POST`, not a `GET`, despite being a pure read (`getPcHealthCard`
  does not mutate anything). `backend/Readme.md`'s planned surface lists it as `GET`.

## Controller (`src/controllers/pc.controller.js`)

```js
const syncPc = asyncHandler(async (req, res) => {
    const pc = await syncPcConfig(req.body)
    return res.status(200).json(new ApiResponse(200, pc, "PC config updated"))
})

const PcHealthCard = asyncHandler(async (req, res) => {
    const pc = await getPcHealthCard(req.params.id, req.scope)
    return res.status(200).json(new ApiResponse(200, pc, "PC health card fetched"))
})
```

Both are thin per the layering convention: pull input from `req`, delegate to the
service, wrap the result in `ApiResponse`. `PcHealthCard` is where `req.scope` (set by
`deptScope`) gets threaded into the service call — the controller itself has no idea
what department scoping means, it just forwards whatever the middleware produced.

## Service (`src/services/pc.service.js`)

### `syncPcConfig(payload)`

```js
const syncPcConfig = async (payload) => {
  const { deadStockNo, config } = payload

  if (!deadStockNo) {
    throw new ApiError(400, "deadStockNo is required")
  }

  const pc = await Pc.findOneAndUpdate(
    { deadStockNo },
    { $set: { config: { ...config, lastSyncedAt: new Date() } } },
    { returnDocument: "after" },
  )

  if (!pc) {
    throw new ApiError(404, "PC not found. Check dead stock number.")
  }

  return pc
}
```

- Looks a PC up **by `deadStockNo`**, not by `_id` — this is the natural key the agent
  knows (it's a physical asset tag typed in by whoever runs the agent, see
  [`agent.md`](./agent.md)), so the agent never needs to know Mongo `_id`s.
  - `deadStockNo` is required to be **pre-existing** — `findOneAndUpdate` here does
    *not* upsert (no `upsert: true` option), so syncing a PC that was never registered
    in the DB by an admin first will 404 rather than create a new `Pc` document. In
    other words: an admin (via not-yet-built PC CRUD endpoints, per the Phase 1/4
    roadmap) must create the `Pc` document with its `department`/`lab` first; the agent
    can only fill in `config`.
  - Only `config` is touched (`$set: { config: {...} }`) — `department`, `lab`,
    `warranty`, `purchaseDate` are untouched by a sync. The agent has no way to change
    a PC's department/lab assignment, which is correct (that's an admin/inventory
    concern, not something a machine should be able to self-report).
  - `config: { ...config, lastSyncedAt: new Date() }` spreads whatever the caller sent
    as `config` and then **stamps the server's own timestamp** over whatever
    `lastSyncedAt` the caller might have included — the agent does send its own
    `lastSyncedAt` in `agent/collector.py`'s payload, but it's silently overwritten
    here. This is intentional-looking (trust server clock over client clock) though
    undocumented as such.
  - Because `config` is replaced wholesale (not merged field-by-field beyond the spread
    already being flat), a partial payload (e.g. just `{ cpu: "..." }`) would wipe out
    `ram`/`disk`/`os`/`software` on that PC's `config` subdocument, since Mongoose
    interprets `$set: { config: {...} }` as replacing the whole embedded object. The
    current agent always sends all five fields together (see `agent.md`), so this isn't
    hit in practice today, but a partial-payload caller would silently destroy data.
  - `{ returnDocument: "after" }` — returns the *updated* document, not the pre-update
    one (this is the modern Mongo driver option name; Mongoose historically used
    `new: true` for the same effect — both are accepted).
  - No `deadStockNo` at all → `400`. Nonexistent `deadStockNo` → `404`.

### `getPcHealthCard(pcId, scope)`

```js
const getPcHealthCard = async (pcId, scope) => {
  const pc = await Pc.findOne({ _id: pcId, ...scope })
  if (!pc) {
    throw new ApiError(404, "Pc not found")
  }
  return pc
}
```

- This time the lookup is by Mongo `_id` (`req.params.id` from the route), combined with
  whatever `scope` the `deptScope` middleware computed (`{}` for admin/Dean Infra,
  `{ department }` otherwise — see [`middlewares.md`](./middlewares.md#deptscope)).
- If `pcId` isn't a valid ObjectId string, Mongoose throws a `CastError` — this isn't
  caught here or converted to a clean `ApiError`, so it falls through to
  `errorHandler`'s generic `500` branch rather than a `400`. (Contrast with
  `complaint.controller.js`'s `escalateComplaint`, which explicitly validates
  `mongoose.Types.ObjectId.isValid(req.params.id)` before calling the service — the PC
  module doesn't do the equivalent check.)
- A PC that exists but is outside the caller's department scope produces the exact same
  `404` as a PC that doesn't exist at all — see the discussion in
  [`middlewares.md`](./middlewares.md#deptscope) for why that's a deliberate
  information-hiding property of spreading `scope` directly into the query rather than
  fetching first and checking department after.

## Model (`src/models/pc.model.js`)

```js
deadStockNo:  String, required, unique
department:   ObjectId -> Dept, required
lab:          ObjectId -> Lab, required
warranty:     { status: enum("Active","Expired") default "Active", expiryDate: Date }
purchaseDate: Date
config: {
  cpu: String, ram: String, disk: String, os: String,
  software: [String],
  lastSyncedAt: Date
}
```

`config` is an **embedded subdocument**, not a separate collection/model — this is what
`syncPcConfig`'s `$set: { config: {...} }` replaces wholesale. `warranty` is likewise
embedded. There is no schema-level index beyond the implicit unique index on
`deadStockNo` (from `unique: true`) — Phase 5 (Search) would need additional indexes on
`config.cpu`/`config.ram`/`config.software` etc. for the planned hardware/software
search, none of which exist yet.

## Downstream client: the agent

See [`agent.md`](./agent.md) for the full write-up of `agent/collector.py`, the only
current caller of `POST /sync`. In short: it prompts for a dead stock number on stdin,
collects `cpu`/`ram`/`disk`/`os`/`software` via `psutil`/`platform`/the Windows
registry, and POSTs the exact shape `syncPcConfig` expects
(`{ deadStockNo, config: { cpu, ram, disk, os, software, lastSyncedAt } }`).
