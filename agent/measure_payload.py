"""Reports how large one pc/sync payload from this machine is, and how much gzip
would save — to decide whether compressing the agent's request body is worth it.

Run from the agent/ directory with the venv python, e.g.:
    venv\\Scripts\\python.exe measure_payload.py
    tells how much size of data the pc config is consuming 
"""

import gzip
import json

from collector import build_payload


def human(n):
    return f"{n:,} B ({n / 1024:.1f} KB)"


def field_bytes(key, value):
    return len(json.dumps({key: value}, separators=(",", ":")).encode("utf-8"))


def main():
    payload = build_payload("MEASURE-TEST", department=None, lab=None)

    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    pretty = json.dumps(payload, indent=2).encode("utf-8")
    gz = gzip.compress(raw, compresslevel=6)

    config = payload["config"]
    software = config.get("software", [])
    saved = (1 - len(gz) / len(raw)) * 100 if raw else 0.0

    print("=== LABMON agent payload size (this machine) ===\n")
    print(f"installed software entries : {len(software)}")
    print(f"raw JSON (compact)         : {human(len(raw))}")
    print(f"raw JSON (indent=2)        : {human(len(pretty))}")
    print(f"gzip (level 6)             : {human(len(gz))}")
    print(f"gzip saving                : {saved:.1f}%\n")

    print("per-field raw bytes (compact):")
    for key, value in config.items():
        print(f"  config.{key:<14}: {human(field_bytes(key, value))}")
    print(f"  {'deadStockNo':<21}: {human(field_bytes('deadStockNo', payload['deadStockNo']))}")

    print("\nrecommendation:")
    if len(raw) < 8 * 1024:
        print("  < 8 KB  — compression not worth the added complexity on either side.")
    elif len(raw) < 30 * 1024:
        print("  8-30 KB — borderline; only compress if sync frequency / PC count is high.")
    else:
        print("  > 30 KB — gzip is worthwhile: agent sends Content-Encoding: gzip and the")
        print("            backend adds a zlib decompression middleware before express.json().")


if __name__ == "__main__":
    main()
