"""LABMON agent: collects this PC's hardware/software config and syncs it
to the backend health card for the given dead stock number.

The installed-software list is filtered to an allowlist (default: Microsoft
Office / productivity apps). Override per machine with the
LABMON_SOFTWARE_ALLOWLIST env var, or set it to "all" to report everything.
"""

import argparse
import json
import os
import platform
import re
import sys
from datetime import datetime, timezone

import psutil
import requests

try:
    import winreg
except ImportError:
    winreg = None

BACKEND_URL = os.environ.get("LABMON_BACKEND_URL", "http://localhost:8000")
SYNC_ENDPOINT = f"{BACKEND_URL.rstrip('/')}/api/v1/pc/sync"

UNINSTALL_KEYS = [
    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall") if winreg else None,
    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall") if winreg else None,
    (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall") if winreg else None,
]

# Only software whose registry DisplayName contains one of these (case-insensitive)
# substrings is reported. Default targets Microsoft Office / productivity apps. Override
# per machine with LABMON_SOFTWARE_ALLOWLIST (comma-separated substrings); set it to
# "all" or "*" to report every installed program.
DEFAULT_SOFTWARE_ALLOWLIST = (
    "microsoft office", "microsoft 365", "office 16 click-to-run",
    "microsoft word", "microsoft excel", "microsoft powerpoint",
    "microsoft outlook", "microsoft onenote", "microsoft access",
    "microsoft publisher", "microsoft visio", "microsoft project",
    "microsoft teams",
)


def _software_allowlist():
    raw = os.environ.get("LABMON_SOFTWARE_ALLOWLIST", "").strip()
    if not raw:
        return DEFAULT_SOFTWARE_ALLOWLIST
    if raw.lower() in ("all", "*"):
        return None  # sentinel: no filtering
    return tuple(p.strip().lower() for p in raw.split(",") if p.strip())


def _name_matches(name, allowlist):
    lowered = name.lower()
    return any(term in lowered for term in allowlist)


# Registry DisplayNames for helper packages that ship alongside real apps but
# aren't user-facing applications — dropped from the reported list.
SOFTWARE_NOISE = (
    "click-to-run extensibility",
    "meeting add-in",
    "add-in for microsoft office",
    "redistributable",
    "runtime library",
    "web experience pack",
)

# Trailing locale/edition tag, e.g. "Microsoft OneNote - en-us" -> "Microsoft OneNote".
_LOCALE_SUFFIX_RE = re.compile(r"\s*-\s*[a-z]{2}-[a-z]{2}\s*$", re.IGNORECASE)

# Product names whose correct casing a naive title-case would mangle
# ("Onenote", "Powerpoint"). Applied word-by-word after title-casing.
CANONICAL_CASING = {
    "onenote": "OneNote",
    "powerpoint": "PowerPoint",
    "sharepoint": "SharePoint",
    "onedrive": "OneDrive",
}


def _is_software_noise(name):
    lowered = name.lower()
    return any(term in lowered for term in SOFTWARE_NOISE)


def _clean_software_name(name):
    """Normalises a raw registry DisplayName into a clean, consistently-cased
    product name: strips the locale suffix, collapses whitespace, and title-cases
    while preserving acronyms and known product spellings."""
    name = _LOCALE_SUFFIX_RE.sub("", name).strip()
    name = re.sub(r"\s{2,}", " ", name)

    words = []
    for word in name.split(" "):
        lowered = word.lower()
        if lowered in CANONICAL_CASING:
            words.append(CANONICAL_CASING[lowered])
        elif any(ch.isdigit() for ch in word) or (word.isupper() and len(word) <= 4):
            words.append(word)  # version numbers ("2024") and acronyms ("SQL")
        else:
            words.append(word[:1].upper() + word[1:].lower())
    return " ".join(words)


def _collect_cpu_brand_windows():
    """Reads the marketing CPU name (e.g. "Intel(R) Core(TM) i7-9700K CPU @
    3.60GHz") from the registry. platform.processor() only returns the raw
    "Intel64 Family 6 Model ..." identification string, which never contains
    searchable model names like "i7"/"i5"/"Ryzen 5" — this is what makes CPU
    search on the PC search page actually match real-world search terms.
    """
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        with key:
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            return name.strip() if name else None
    except OSError:
        return None


def collect_cpu():
    cores = psutil.cpu_count(logical=True)

    brand = _collect_cpu_brand_windows() if winreg is not None else None
    if brand:
        return f"{brand} ({cores} cores)"

    processor = platform.processor() or "Unknown CPU"
    freq = psutil.cpu_freq()
    if freq:
        return f"{processor} @ {freq.max / 1000:.2f}GHz ({cores} cores)"
    return f"{processor} ({cores} cores)"


def collect_ram():
    total_gb = psutil.virtual_memory().total / (1024 ** 3)
    return f"{total_gb:.1f} GB"


def collect_disk():
    path = "C:\\" if platform.system() == "Windows" else "/"
    total_gb = psutil.disk_usage(path).total / (1024 ** 3)
    return f"{total_gb:.1f} GB"


def collect_os():
    return f"{platform.system()} {platform.release()} ({platform.version()})"


def collect_software():
    if winreg is None:
        return []

    allowlist = _software_allowlist()

    names = set()
    for entry in UNINSTALL_KEYS:
        if entry is None:
            continue
        hive, path = entry
        try:
            key = winreg.OpenKey(hive, path)
        except OSError:
            continue

        with key:
            for i in range(winreg.QueryInfoKey(key)[0]):
                try:
                    subkey_name = winreg.EnumKey(key, i)
                    with winreg.OpenKey(key, subkey_name) as subkey:
                        name, _ = winreg.QueryValueEx(subkey, "DisplayName")
                        if not name:
                            continue
                        name = name.strip()
                        if _is_software_noise(name):
                            continue
                        if allowlist is None or _name_matches(name, allowlist):
                            names.add(_clean_software_name(name))
                except OSError:
                    continue

    return sorted(names)


def build_payload(dead_stock_no, department=None, lab=None):
    payload = {
        "deadStockNo": dead_stock_no,
        "config": {
            "cpu": collect_cpu(),
            "ram": collect_ram(),
            "disk": collect_disk(),
            "os": collect_os(),
            "software": collect_software(),
            "lastSyncedAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    if department:
        payload["department"] = department
    if lab:
        payload["lab"] = lab
    return payload


def sync(payload):
    response = requests.post(SYNC_ENDPOINT, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Collect this PC's hardware/software config and sync it to LABMON.",
    )
    parser.add_argument("--dead-stock", help="Dead stock number for this PC (skips the prompt)")
    parser.add_argument(
        "--department",
        help="Department name — only needed the first time this PC is provisioned",
    )
    parser.add_argument(
        "--lab",
        help="Lab name — only needed the first time this PC is provisioned",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Collect and print the payload as JSON; do not POST it to the backend.",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    dead_stock_no = (args.dead_stock or "").strip()
    if not dead_stock_no and not args.dry_run:
        dead_stock_no = input("Enter Dead Stock Number for this PC: ").strip()
    if not dead_stock_no:
        if args.dry_run:
            dead_stock_no = "DRY-RUN"
        else:
            print("Dead Stock Number is required.")
            sys.exit(1)

    # Only needed the first time this PC is synced — an already-provisioned PC just
    # refreshes its hardware config if these are left blank.
    if args.dry_run:
        department = args.department
        lab = args.lab
    else:
        department = (
            args.department
            if args.department is not None
            else input("Enter Department name (e.g. Computer Science) [leave blank if already set up]: ").strip()
        )
        lab = (
            args.lab
            if args.lab is not None
            else input("Enter Lab name (e.g. Lab 1) [leave blank if already set up]: ").strip()
        )

    payload = build_payload(dead_stock_no, department, lab)

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    print(f"Syncing config for {dead_stock_no} to {SYNC_ENDPOINT} ...")

    try:
        result = sync(payload)
    except requests.RequestException as exc:
        print(f"Sync failed: {exc}")
        sys.exit(1)

    print("Sync successful:", result)


if __name__ == "__main__":
    main()
