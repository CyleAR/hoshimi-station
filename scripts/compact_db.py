from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from import_db import compact_link_meta


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"


def compact_metadata(conn: sqlite3.Connection) -> tuple[int, int]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        changes = []
        for rowid, raw in conn.execute("SELECT rowid, meta_json FROM links"):
            meta = json.loads(raw)
            if not isinstance(meta, dict):
                raise ValueError(f"links rowid={rowid}: meta_json must be an object")
            compact = compact_link_meta(meta)
            if compact != raw:
                changes.append((compact, rowid))
        conn.executemany("UPDATE links SET meta_json = ? WHERE rowid = ?", changes)
        contexts = conn.execute(
            "UPDATE translation_units SET context_json = '{}' WHERE context_json <> '{}'"
        ).rowcount
        conn.commit()
        return len(changes), contexts
    except Exception:
        conn.rollback()
        raise


def compact_database(db_path: Path, backup_dir: Path) -> dict:
    db_path = db_path.resolve(strict=True)
    conn = sqlite3.connect(db_path.as_uri() + "?mode=rw", uri=True, timeout=5)
    backup_path = backup_dir.resolve() / f"compact_{datetime.now():%Y%m%d_%H%M%S_%f}" / db_path.name
    try:
        backup_path.parent.mkdir(parents=True, exist_ok=False)
        backup = sqlite3.connect(backup_path)
        try:
            conn.backup(backup)
            result = backup.execute("PRAGMA integrity_check").fetchone()[0]
            if result != "ok":
                raise RuntimeError(f"Backup integrity check failed: {result}")
        finally:
            backup.close()
        print(f"backup={backup_path}", flush=True)
        before = conn.execute("PRAGMA page_count").fetchone()[0] * conn.execute("PRAGMA page_size").fetchone()[0]
        links, contexts = compact_metadata(conn)
        conn.execute("VACUUM")
        check = conn.execute("PRAGMA quick_check").fetchone()[0]
        if check != "ok":
            raise RuntimeError(f"Compacted DB check failed: {check}; backup={backup_path}")
        checkpoint = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        after = conn.execute("PRAGMA page_count").fetchone()[0] * conn.execute("PRAGMA page_size").fetchone()[0]
        return {"backup": str(backup_path), "links_updated": links, "contexts_cleared": contexts,
                "before_bytes": before, "after_bytes": after, "saved_bytes": before - after,
                "integrity_check": check, "checkpoint_busy": checkpoint[0]}
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Back up and compact translation metadata. Stop the site before running.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--backup-dir", type=Path, default=ROOT / "backups")
    args = parser.parse_args()
    print(json.dumps(compact_database(args.db, args.backup_dir), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
