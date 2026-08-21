"""LABMON agent: collects this PC's hardware/software config and syncs it
to the backend health card for the given dead stock number.
"""

import os
import platform
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


def collect_cpu():
    processor = platform.processor() or "Unknown CPU"
    freq = psutil.cpu_freq()
    cores = psutil.cpu_count(logical=True)
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
                        if name:
                            names.add(name.strip())
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


def main():
    dead_stock_no = input("Enter Dead Stock Number for this PC: ").strip()
    if not dead_stock_no:
        print("Dead Stock Number is required.")
        sys.exit(1)

    # Only needed the first time this PC is synced — an already-provisioned PC just
    # refreshes its hardware config if these are left blank.
    department = input("Enter Department name (e.g. Computer Science) [leave blank if already set up]: ").strip()
    lab = input("Enter Lab name (e.g. Lab 1) [leave blank if already set up]: ").strip()

    payload = build_payload(dead_stock_no, department, lab)
    print(f"Syncing config for {dead_stock_no} to {SYNC_ENDPOINT} ...")

    try:
        result = sync(payload)
    except requests.RequestException as exc:
        print(f"Sync failed: {exc}")
        sys.exit(1)

    print("Sync successful:", result)


if __name__ == "__main__":
    main()
