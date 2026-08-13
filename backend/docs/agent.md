# Python Agent (`agent/collector.py`)

Contrary to `CLAUDE.md`'s and `backend/Readme.md`'s "Repository Status" note that the
Python agent is "not yet built" / "not yet started," a working single-file version
already exists at `agent/collector.py`. See [`phases.md`](./phases.md) Phase 2.

## What it does

```
run collector.py
  -> prompts on stdin: "Enter Dead Stock Number for this PC: "
  -> collects cpu / ram / disk / os / installed software
  -> POSTs { deadStockNo, config: {...} } to {LABMON_BACKEND_URL}/api/v1/pc/sync
  -> prints the JSON response, or the error, and exits
```

It is a manually-run CLI script (`python agent/collector.py`), not a background service
or scheduled task — matches the "not yet packaged" state noted in
[`phases.md`](./phases.md) Phase 7.

## Configuration

```python
BACKEND_URL = os.environ.get("LABMON_BACKEND_URL", "http://localhost:8000")
SYNC_ENDPOINT = f"{BACKEND_URL.rstrip('/')}/api/v1/pc/sync"
```

Only one env var, `LABMON_BACKEND_URL`, defaulting to `http://localhost:8000`. Note this
default doesn't match the backend's own default port convention (`.env`'s `PORT`, per
`CLAUDE.md`, is whatever the operator sets — commonly `5000` in the sample `.env`
values) — running the agent against a local backend requires explicitly setting
`LABMON_BACKEND_URL` unless the backend happens to also run on `8000`.

## Collection functions

```python
collect_cpu()      -> platform.processor() + psutil.cpu_freq().max (GHz) + psutil.cpu_count()
                       e.g. "Intel64 Family 6 ... @ 3.60GHz (8 cores)"
collect_ram()       -> psutil.virtual_memory().total, formatted as "{X.X} GB"
collect_disk()      -> psutil.disk_usage("C:\\" on Windows, else "/").total, as "{X.X} GB"
collect_os()        -> f"{platform.system()} {platform.release()} ({platform.version()})"
collect_software()  -> Windows registry scan (see below)
```

All four scalar fields produce plain **display strings**, not structured/numeric data
(e.g. `"16.0 GB"` not `{ value: 16.0, unit: "GB" }`) — this matches the `Pc.config`
schema, where `cpu`/`ram`/`disk`/`os` are all plain `String` fields (see
[`models.md`](./models.md)). This is a deliberate simplicity tradeoff, but it also means
Phase 5's planned "search by hardware" (e.g. "find all PCs with ≥16GB RAM") can't be a
numeric range query against these fields as they're currently stored — it would need
either a schema change to store a numeric value alongside the display string, or
string-pattern matching, neither of which exists yet.

### `collect_software()` — Windows-only

```python
UNINSTALL_KEYS = [
    (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    (HKEY_CURRENT_USER,  r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
]
```

Reads the standard three Windows "Add/Remove Programs" registry locations (64-bit,
32-bit-on-64-bit via `WOW6432Node`, and per-user installs), pulling each subkey's
`DisplayName` value into a deduplicated, sorted set. `winreg` is imported inside a
`try/except ImportError`, so on non-Windows platforms `winreg` is `None` and
`collect_software()` short-circuits to `[]` — the rest of the script (CPU/RAM/disk/OS
collection via `psutil`/`platform`) is cross-platform, so the agent doesn't crash on
non-Windows, it just can't enumerate installed software there. Given the product is
explicitly for **lab PCs** (which in this context are assumed Windows), this asymmetry
is not currently a practical problem.

Malformed/inaccessible registry entries are swallowed per-entry (`except OSError:
continue`), so one broken uninstall-key subkey doesn't abort the whole scan.

## Payload shape and sync

```python
def build_payload(dead_stock_no):
    return {
        "deadStockNo": dead_stock_no,
        "config": {
            "cpu": collect_cpu(), "ram": collect_ram(), "disk": collect_disk(),
            "os": collect_os(), "software": collect_software(),
            "lastSyncedAt": datetime.now(timezone.utc).isoformat(),
        },
    }

def sync(payload):
    response = requests.post(SYNC_ENDPOINT, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()
```

This is exactly the shape `syncPcConfig` in `src/services/pc.service.js` destructures
(`{ deadStockNo, config }`) — see [`pc-module.md`](./pc-module.md#syncpcconfigpayload).
The agent's own `lastSyncedAt` (an ISO 8601 string, client-clock timestamp) is sent but
**silently overwritten** server-side with `new Date()` at sync time — the backend trusts
its own clock, not the agent's, for this field (documented in `pc-module.md`).

`response.raise_for_status()` means any non-2xx response (e.g. the backend's `404 "PC
not found. Check dead stock number."` when the dead stock number wasn't pre-registered
by an admin) raises `requests.HTTPError`, caught in `main()`'s `except
requests.RequestException` and printed as `"Sync failed: {exc}"` before exiting with
status 1 — the raw backend error message isn't surfaced to the person running the
agent, just the generic HTTP error text from `requests`.

## No authentication

The agent sends a plain unauthenticated POST — there's no API key, device credential, or
header of any kind attached to the request. This matches the corresponding gap already
noted on the backend side in [`pc-module.md`](./pc-module.md) and
[`known-issues.md`](./known-issues.md): `backend/Readme.md`'s planned surface calls
`/api/pc/sync` an "Agent device key" protected endpoint, but neither side of that
contract has been implemented yet.

## Dependencies (`agent/requirements.txt`)

`psutil` (cross-platform hardware stats) and `requests` (HTTP client) — `winreg` is part
of the Python standard library on Windows and isn't a pip dependency.
