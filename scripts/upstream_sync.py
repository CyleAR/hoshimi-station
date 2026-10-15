#!/usr/bin/env python3
"""Detect and ingest upstream game-data updates into the live translation DB.

Run on the host (not in the read-only container) as the user that owns ./data.
Needs python3 and git.

  upstream_sync.py detect                 exit 0 = up to date, 10 = upstream moved
  upstream_sync.py ingest [--apply]       rebuild a COPY of the DB from new upstream data,
                                          verify nothing translated was lost, optionally swap

Markers live in the DB table upstream_state, so they travel with backups.
Disk use is bounded: shallow clones are kept in data/upstream/ (reused, never grown by
history) and the working DB copy is deleted after every run.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "hoshimi.sqlite3"
SOURCES = {
    "adv": {
        "repo": "https://github.com/CyleAR/ipr-adv-txts",
        "marker": "https://raw.githubusercontent.com/CyleAR/ipr-adv-txts/HEAD/revision",
    },
    "masterdb": {
        "repo": "https://github.com/CyleAR/ipr-master-diff",
        "marker": "https://raw.githubusercontent.com/CyleAR/ipr-master-diff/HEAD/!version.txt",
    },
}
EXIT_CHANGED = 10


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}] {msg}", flush=True)


def fetch_marker(name: str) -> str:
    req = urllib.request.Request(SOURCES[name]["marker"].replace("!", "%21"), headers={"User-Agent": "hoshimi-station-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode().strip()


def get_state(db: Path) -> dict[str, str]:
    conn = sqlite3.connect(db)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS upstream_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)")
        return dict(conn.execute("SELECT key, value FROM upstream_state"))
    finally:
        conn.close()


def set_state(db: Path, values: dict[str, str]) -> None:
    conn = sqlite3.connect(db)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS upstream_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)")
        now = datetime.now(timezone.utc).isoformat()
        conn.executemany(
            "INSERT INTO upstream_state(key,value,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            [(k, v, now) for k, v in values.items()],
        )
        conn.commit()
    finally:
        conn.close()


def current_markers() -> dict[str, str]:
    return {name: fetch_marker(name) for name in SOURCES}


def cmd_detect(args: argparse.Namespace) -> int:
    seen = get_state(args.db)
    now = current_markers()
    changed = {k: (seen.get(k), v) for k, v in now.items() if seen.get(k) != v}
    if not seen:
        log("no stored markers yet (first run); treating as changed")
    for k, (old, new) in changed.items():
        log(f"{k}: {old} -> {new}")
    if not changed:
        log("up to date")
        return 0
    return EXIT_CHANGED


def git(*a: str, cwd: Path | None = None) -> str:
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def sync_clone(name: str, up: Path) -> Path:
    dest = up / name
    if (dest / ".git").exists():
        git("fetch", "--depth", "1", "origin", "HEAD", cwd=dest)
        git("reset", "--hard", "FETCH_HEAD", cwd=dest)
        git("reflog", "expire", "--expire=now", "--all", cwd=dest)
        git("gc", "--prune=now", "--quiet", cwd=dest)
    else:
        up.mkdir(parents=True, exist_ok=True)
        git("clone", "--depth", "1", SOURCES[name]["repo"], str(dest))
    return dest


def counts(db: Path) -> dict[str, int]:
    conn = sqlite3.connect(db)
    try:
        q = lambda s: conn.execute(s).fetchone()[0]
        return {
            "units": q("SELECT COUNT(*) FROM translation_units"),
            "translated": q("SELECT COUNT(*) FROM translation_units WHERE translation_text<>''"),
        }
    finally:
        conn.close()


def verify(live: Path, new: Path) -> tuple[list[str], list[str]]:
    """Return (blocking problems, warnings)."""
    problems: list[str] = []
    warnings: list[str] = []
    conn = sqlite3.connect(new)
    try:
        conn.execute("ATTACH DATABASE ? AS old", (str(live),))
        lost = conn.execute(
            "SELECT COUNT(*) FROM old.translation_units o WHERE NOT EXISTS (SELECT 1 FROM main.translation_units n WHERE n.unit_id=o.unit_id)"
        ).fetchone()[0]
        if lost:
            problems.append(f"{lost} existing unit ids vanished")
        lost_tr = conn.execute(
            "SELECT COUNT(*) FROM old.translation_units o JOIN main.translation_units n ON n.unit_id=o.unit_id "
            "WHERE o.translation_text<>'' AND n.translation_text='' AND n.original_text=o.original_text"
        ).fetchone()[0]
        if lost_tr:
            problems.append(f"{lost_tr} translations lost although the original is unchanged")
        changed = conn.execute(
            "SELECT n.unit_id, n.source_file, n.field_path FROM old.translation_units o JOIN main.translation_units n "
            "ON n.unit_id=o.unit_id WHERE o.translation_text<>'' AND n.translation_text='' AND n.original_text<>o.original_text"
        ).fetchall()
        for uid, sf, fp in changed:
            warnings.append(f"JP original changed, translation cleared: unit {uid} {sf} {fp}")
        altered = conn.execute(
            "SELECT COUNT(*) FROM old.translation_units o JOIN main.translation_units n ON n.unit_id=o.unit_id "
            "WHERE o.translation_text<>'' AND n.translation_text<>'' AND n.translation_text<>o.translation_text"
        ).fetchone()[0]
        if altered:
            warnings.append(f"{altered} translations were rewritten by prefill rules")
        return problems, warnings
    finally:
        conn.close()


def load_importer():
    spec = importlib.util.spec_from_file_location("import_db", ROOT / "scripts" / "import_db.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["import_db"] = mod
    spec.loader.exec_module(mod)
    return mod


def backup_to(src: Path, dst: Path) -> None:
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=60)
    d = sqlite3.connect(dst)
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()


def cmd_ingest(args: argparse.Namespace) -> int:
    live: Path = args.db
    work = live.parent / "ingest"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    try:
        free = shutil.disk_usage(live.parent).free
        need = live.stat().st_size * 3
        if free < need:
            log(f"ABORT: {free >> 20}MB free, need ~{need >> 20}MB")
            return 2
        markers = current_markers()
        log(f"upstream markers: {markers}")
        paths = {n: sync_clone(n, live.parent / "upstream") for n in SOURCES}
        log("clones updated")
        cand = work / "candidate.sqlite3"
        backup_to(live, cand)
        baseline = counts(live)
        mtime_mark = live_change_mark(live)

        imp = load_importer()
        imp.MASTERDB_DIR = paths["masterdb"]
        imp.ADV_DIR = paths["adv"] / "resource"
        stats = imp.rebuild(cand, prefill_log_limit=0)
        after = counts(cand)
        log(f"units {baseline['units']} -> {after['units']}, translated {baseline['translated']} -> {after['translated']}, "
            f"new untranslated {stats.get('new_untranslated')}")
        problems, warnings = verify(live, cand)
        for w in warnings:
            log("WARN " + w)
        if problems:
            for p in problems:
                log("BLOCKED " + p)
            return 3
        if not args.apply:
            log("dry run OK (no --apply): live DB untouched")
            return 0

        if live_change_mark(live) != mtime_mark:
            log("ABORT: live DB was edited during the import; rerun")
            return 4
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        bdir = ROOT / "backups"
        bdir.mkdir(exist_ok=True)
        pre = bdir / f"pre-ingest-{stamp}.sqlite3"
        backup_to(live, pre)
        subprocess.run(["gzip", "-f", str(pre)], check=True)
        set_state(cand, markers)
        conn = sqlite3.connect(cand)
        conn.execute("VACUUM")
        conn.close()
        if args.stop_cmd:
            subprocess.run(args.stop_cmd, shell=True, check=True)
        if live_change_mark(live) != mtime_mark:
            log("ABORT: live DB edited just before swap; rerun")
            if args.start_cmd:
                subprocess.run(args.start_cmd, shell=True)
            return 4
        for suffix in ("-wal", "-shm"):
            Path(str(live) + suffix).unlink(missing_ok=True)
        os.replace(cand, live)
        if args.start_cmd:
            subprocess.run(args.start_cmd, shell=True, check=True)
        log(f"swapped in new DB; pre-ingest backup {pre}.gz")
        # keep only the 3 newest pre-ingest backups
        old = sorted(bdir.glob("pre-ingest-*.sqlite3.gz"))[:-3]
        for p in old:
            p.unlink()
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


def live_change_mark(db: Path) -> tuple:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=30)
    try:
        return conn.execute(
            "SELECT (SELECT COALESCE(MAX(id),0) FROM translation_changes), "
            "(SELECT COUNT(*) FROM translation_units WHERE translation_text<>'')"
        ).fetchone()
    finally:
        conn.close()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db", type=Path, default=DB)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("detect")
    ing = sub.add_parser("ingest")
    ing.add_argument("--apply", action="store_true", help="swap the verified candidate into place")
    ing.add_argument("--stop-cmd", help="shell command run just before the swap (e.g. 'docker compose stop')")
    ing.add_argument("--start-cmd", help="shell command run after the swap (e.g. 'docker compose start')")
    args = p.parse_args()
    return {"detect": cmd_detect, "ingest": cmd_ingest}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
