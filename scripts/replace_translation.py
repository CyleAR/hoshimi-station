from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"


def preview_rows(conn: sqlite3.Connection, old: str, limit: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT unit_id, source_type, category, source_file, record_id, field_path, translation_text
        FROM translation_units
        WHERE translation_text LIKE '%' || $old || '%'
        ORDER BY source_type, category, source_file, record_id, field_path
        LIMIT $limit
        """,
        {"old": old, "limit": limit},
    ).fetchall()


def count_rows(conn: sqlite3.Connection, old: str) -> tuple[int, list[sqlite3.Row]]:
    total = conn.execute(
        """
        SELECT COUNT(*)
        FROM translation_units
        WHERE translation_text LIKE '%' || $old || '%'
        """,
        {"old": old},
    ).fetchone()[0]
    by_category = conn.execute(
        """
        SELECT source_type, category, COUNT(*) AS count
        FROM translation_units
        WHERE translation_text LIKE '%' || $old || '%'
        GROUP BY source_type, category
        ORDER BY count DESC, source_type, category
        """,
        {"old": old},
    ).fetchall()
    return int(total), by_category


def replace_rows(conn: sqlite3.Connection, old: str, new: str) -> int:
    cursor = conn.execute(
        """
        UPDATE translation_units
        SET translation_text = replace(translation_text, $old, $new),
            status = CASE WHEN status = 'new' THEN 'edited' ELSE status END,
            updated_at = datetime('now')
        WHERE translation_text LIKE '%' || $old || '%'
        """,
        {"old": old, "new": new},
    )
    return cursor.rowcount


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Bulk replace text inside saved Korean translations.")
    parser.add_argument("old", help="Text to find in translation_text.")
    parser.add_argument("new", help="Replacement text.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--apply", action="store_true", help="Actually update the database. Without this, only prints a dry-run.")
    parser.add_argument("--limit", type=int, default=10, help="Number of sample rows to print.")
    args = parser.parse_args()

    if not args.old:
        raise SystemExit("old text must not be empty")
    if args.old == args.new:
        raise SystemExit("old and new text are identical")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        total, by_category = count_rows(conn, args.old)
        print(f"matches={total}")
        if by_category:
            print("by_category=" + ", ".join(f"{row['source_type']}:{row['category']}:{row['count']}" for row in by_category))

        for row in preview_rows(conn, args.old, args.limit):
            before = row["translation_text"]
            after = before.replace(args.old, args.new)
            print(f"- {row['unit_id']} [{row['source_type']}/{row['category']}]")
            print(f"  before: {before}")
            print(f"  after:  {after}")

        if not args.apply:
            print("dry_run=true")
            return

        changed = replace_rows(conn, args.old, args.new)
        conn.commit()
        print(f"updated={changed}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
