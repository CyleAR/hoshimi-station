from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"

AOI_SPEAKER = "井川葵"
TARGET_WORDS = ("당신", "오빠")
ORIGINAL_YOU_MARKERS = ("君", "キミ", "きみ")


@dataclass(frozen=True)
class Replacement:
    old: str
    new: str
    safe: bool = True


REPLACEMENTS = [
    Replacement("당신한테", "너한테"),
    Replacement("당신에게", "너한테"),
    Replacement("당신이랑", "너랑"),
    Replacement("당신과", "너랑"),
    Replacement("당신은", "너는"),
    Replacement("당신이", "네가"),
    Replacement("당신을", "너를"),
    Replacement("당신의", "네"),
    Replacement("당신도", "너도"),
    Replacement("당신만", "너만"),
    Replacement("당신뿐", "너뿐"),
    Replacement("당신", "너"),
    Replacement("큰오빠랑", "큰형님이랑", safe=False),
    Replacement("큰오빠야", "큰형님이야", safe=False),
    Replacement("큰오빠가", "큰형님이", safe=False),
    Replacement("큰오빠는", "큰형님은", safe=False),
    Replacement("큰오빠를", "큰형님을", safe=False),
    Replacement("큰오빠한테", "큰형님한테", safe=False),
    Replacement("큰오빠에게", "큰형님한테", safe=False),
    Replacement("큰오빠", "큰형님", safe=False),
    Replacement("오빠들", "형님들", safe=False),
    Replacement("오빠가", "형님이", safe=False),
    Replacement("오빠는", "형님은", safe=False),
    Replacement("오빠를", "형님을", safe=False),
    Replacement("오빠랑", "형님이랑", safe=False),
    Replacement("오빠라고", "형님이라고", safe=False),
    Replacement("오빠한테", "형님한테", safe=False),
    Replacement("오빠에게", "형님한테", safe=False),
    Replacement("오빠", "형님", safe=False),
]

PLAYER_SPEAKERS = {"__player_choice__", "__player_text__", "{user}"}
HOME_AOI_TEXT_RE = re.compile(r"^characterTalks\[.*\]\.text$")
HOME_TALK_CALL_AOI_FIELDS = {"characterArrivalText"}


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def original_addresses_protag(row: sqlite3.Row) -> bool:
    original = row["original_text"] or ""
    return any(marker in original for marker in ORIGINAL_YOU_MARKERS)


def is_aoi_candidate(row: sqlite3.Row, *, risky_only: bool = False, allow_unmarked_you: bool = False) -> bool:
    text = row["translation_text"] or ""
    if not any(word in text for word in TARGET_WORDS):
        return False
    if risky_only and "오빠" not in text:
        return False
    if "당신" in text and "오빠" not in text and not allow_unmarked_you and not original_addresses_protag(row):
        return False

    speaker = row["speaker"] or ""
    if speaker in PLAYER_SPEAKERS:
        return False
    if speaker == AOI_SPEAKER:
        return True

    category = row["category"]
    record_id = row["record_id"] or ""
    scope_id = row["scope_id"] or ""
    unit_id = row["unit_id"] or ""
    field_path = row["field_path"] or ""

    if category == "HomeTalk":
        return (
            ("aoi" in record_id or "aoi" in scope_id or "aoi" in unit_id)
            and HOME_AOI_TEXT_RE.match(field_path) is not None
        )

    if category in {"LoveHomeAction", "CompanyEnjoyHomeAction"}:
        return "aoi" in record_id or "aoi" in scope_id or "aoi" in unit_id

    if category == "HomeTalkCallPattern":
        return (
            field_path in HOME_TALK_CALL_AOI_FIELDS
            and ("aoi" in record_id or "aoi" in scope_id or "aoi" in unit_id)
        )

    if category in {"Card", "CardEvolutionMessage"}:
        return "aoi" in record_id or "aoi" in scope_id or "aoi" in unit_id

    return False


def replace_text(
    text: str,
    *,
    include_risky: bool,
    risky_only: bool = False,
    allow_unmarked_you: bool = False,
    original_has_you_marker: bool = False,
) -> tuple[str, list[Replacement]]:
    changed: list[Replacement] = []
    result = text
    for item in REPLACEMENTS:
        if item.safe and risky_only:
            continue
        if item.safe and item.old.startswith("당신") and not allow_unmarked_you and not original_has_you_marker:
            continue
        if not item.safe and not include_risky:
            continue
        if item.old in result:
            result = result.replace(item.old, item.new)
            changed.append(item)
    return result, changed


def candidate_rows(
    conn: sqlite3.Connection,
    *,
    risky_only: bool = False,
    allow_unmarked_you: bool = False,
) -> list[sqlite3.Row]:
    where = "translation_text LIKE '%오빠%'" if risky_only else """
        translation_text LIKE '%당신%'
           OR translation_text LIKE '%오빠%'
    """
    rows = conn.execute(
        f"""
        SELECT unit_id, source_type, category, source_file, record_id, field_path,
               line_no, speaker, original_text, translation_text, status,
               scope_type, scope_id
        FROM translation_units
        WHERE {where}
        ORDER BY source_type, category, source_file, record_id, line_no, field_path
        """
    ).fetchall()
    return [
        row
        for row in rows
        if is_aoi_candidate(row, risky_only=risky_only, allow_unmarked_you=allow_unmarked_you)
    ]


def print_preview(
    rows: list[sqlite3.Row],
    *,
    include_risky: bool,
    risky_only: bool,
    allow_unmarked_you: bool,
    limit: int,
) -> tuple[int, int]:
    safe_count = 0
    risky_count = 0
    printed = 0

    for row in rows:
        before = row["translation_text"]
        original_has_you_marker = original_addresses_protag(row)
        after_safe, safe_changes = replace_text(
            before,
            include_risky=False,
            allow_unmarked_you=allow_unmarked_you,
            original_has_you_marker=original_has_you_marker,
        )
        after, all_changes = replace_text(
            before,
            include_risky=include_risky,
            risky_only=risky_only,
            allow_unmarked_you=allow_unmarked_you,
            original_has_you_marker=original_has_you_marker,
        )
        risky_changes = [item for item in all_changes if not item.safe]

        if safe_changes and not risky_only:
            safe_count += 1
        if risky_changes or "오빠" in before:
            risky_count += 1

        if limit > 0 and printed >= limit:
            continue
        printed += 1
        risk_label = " risky" if risky_changes or (not include_risky and "오빠" in before) else ""
        print(f"- {row['unit_id']} [{row['source_type']}/{row['category']}]{risk_label}")
        print(f"  speaker: {row['speaker'] or '-'}")
        print(f"  field: {row['field_path']}")
        print(f"  original: {row['original_text']}")
        print(f"  before: {before}")
        print(f"  after:  {after if include_risky else after_safe}")

    if limit > 0 and len(rows) > limit:
        print(f"... {len(rows) - limit} more rows")
    return safe_count, risky_count


def apply_rows(
    conn: sqlite3.Connection,
    rows: list[sqlite3.Row],
    *,
    include_risky: bool,
    risky_only: bool,
    allow_unmarked_you: bool,
) -> int:
    changed = 0
    stamp = now()
    for row in rows:
        before = row["translation_text"]
        after, changes = replace_text(
            before,
            include_risky=include_risky,
            risky_only=risky_only,
            allow_unmarked_you=allow_unmarked_you,
            original_has_you_marker=original_addresses_protag(row),
        )
        if after == before or not changes:
            continue
        conn.execute(
            """
            UPDATE translation_units
            SET translation_text = ?,
                status = CASE WHEN status = 'new' THEN 'edited' ELSE status END,
                updated_at = ?
            WHERE unit_id = ?
            """,
            (after, stamp, row["unit_id"]),
        )
        changed += 1
    return changed


def main() -> None:
    configure_stdio()
    parser = argparse.ArgumentParser(description="Replace Aoi Igawa's Korean tone markers in translation_units.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--apply", action="store_true", help="Actually update the database.")
    parser.add_argument("--include-risky", action="store_true", help="Also replace 오빠 -> 형님 patterns.")
    parser.add_argument("--risky-only", action="store_true", help="Replace only risky 오빠 -> 형님 patterns.")
    parser.add_argument(
        "--allow-unmarked-you",
        action="store_true",
        help="Also replace 당신 when original_text has no 君/キミ/きみ marker.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Preview row limit. Use 0 to print every row.")
    args = parser.parse_args()
    if args.risky_only:
        args.include_risky = True

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        rows = candidate_rows(
            conn,
            risky_only=args.risky_only,
            allow_unmarked_you=args.allow_unmarked_you,
        )
        print(f"candidates={len(rows)}")
        safe_count, risky_count = print_preview(
            rows,
            include_risky=args.include_risky,
            risky_only=args.risky_only,
            allow_unmarked_you=args.allow_unmarked_you,
            limit=args.limit,
        )
        print(f"safe_rows={safe_count}")
        print(f"risky_rows={risky_count}")

        if not args.apply:
            print("dry_run=true")
            return

        changed = apply_rows(
            conn,
            rows,
            include_risky=args.include_risky,
            risky_only=args.risky_only,
            allow_unmarked_you=args.allow_unmarked_you,
        )
        conn.commit()
        print(f"updated={changed}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
