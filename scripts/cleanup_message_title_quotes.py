from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def cleaned_translation(original_text: str, translation_text: str) -> str | None:
    original = str(original_text or "").strip()
    translation = str(translation_text or "").strip()
    if not translation or original.startswith("「"):
        return None
    if len(translation) < 2 or not translation.startswith("'") or not translation.endswith("'"):
        return None
    cleaned = translation.strip("'").strip()
    return cleaned if cleaned and cleaned != translation else None


def candidate_rows(conn: sqlite3.Connection) -> list[dict[str, str]]:
    rows = conn.execute(
        """
        SELECT unit_id, record_id, original_text, translation_text
        FROM translation_units
        WHERE category = 'Message'
          AND field_path = 'name'
          AND trim(translation_text) <> ''
        ORDER BY record_id, unit_id
        """
    ).fetchall()
    candidates: list[dict[str, str]] = []
    for row in rows:
        cleaned = cleaned_translation(row["original_text"], row["translation_text"])
        if cleaned is None:
            continue
        candidates.append(
            {
                "unit_id": row["unit_id"],
                "record_id": row["record_id"],
                "original_text": row["original_text"],
                "translation_text": row["translation_text"],
                "cleaned_translation": cleaned,
            }
        )
    return candidates


def apply_candidates(conn: sqlite3.Connection, candidates: list[dict[str, str]]) -> int:
    updated = 0
    with conn:
        for row in candidates:
            cursor = conn.execute(
                """
                UPDATE translation_units
                SET translation_text = $translation_text,
                    updated_at = datetime('now')
                WHERE unit_id = $unit_id
                  AND translation_text = $previous_translation
                """,
                {
                    "translation_text": row["cleaned_translation"],
                    "unit_id": row["unit_id"],
                    "previous_translation": row["translation_text"],
                },
            )
            updated += cursor.rowcount
    return updated


def main() -> None:
    configure_stdio()
    parser = argparse.ArgumentParser(
        description="Remove erroneous outer ASCII quotes from translated Message.name values whose originals have no Japanese corner brackets."
    )
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--apply", action="store_true", help="Actually update the database. Without this, only prints a dry-run.")
    parser.add_argument("--limit", type=int, default=30, help="Number of sample rows to print.")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        candidates = candidate_rows(conn)
        print(f"targets={len(candidates)}")
        for row in candidates[: max(0, args.limit)]:
            print(f"- {row['unit_id']}")
            print(f"  original: {row['original_text']}")
            print(f"  before:   {row['translation_text']}")
            print(f"  after:    {row['cleaned_translation']}")

        if not args.apply:
            print("dry_run=true")
            return

        updated = apply_candidates(conn, candidates)
        print(f"updated={updated}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
