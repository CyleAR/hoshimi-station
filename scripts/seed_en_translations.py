#!/usr/bin/env python3
"""G.0 feasibility spike: seed the EN translation_units DB from idolypride-en-data's
existing, already-translated corpus, matching the fork's own prefill-step conventions
(status='prefilled', only fills currently-empty translation_text).

Sources matched, in order:
  1. local-files/masterTrans/<Table>.json  -> masterdb:<Table>:<record>:<path> (direct key match)
  2. local-files/localization.json         -> localization:<key>              (direct key match)
  3. agency-adv/{src,work}/<stem>.json     -> adv:<file>:<order>:<field>       (JP-text verified
     positional match within each file; 'place' units matched separately by JP value)
  4. Table-scoped path-translation fallback (step 5 below) for masterdb categories whose
     nested list fields the fork addresses by value (`details[14-1;messageDetailId].text`)
     while idolypride-en-data addresses by position (`details[0].text`) -- those two
     encodings can't be converted into each other directly, so instead of reconstructing
     paths we match on JP text content within the same (table, record) scope, built from
     two existing idolypride-en-data sources:
       - sources/master/<Table>.json      -> flat JP->EN memory (Message, Skill, HomeTalk,
         Story, HelpCategory, Character, CharacterGroup)
       - agency/src/<Table>.json (JP) zipped with local-files/masterTrans/<Table>.json (EN)
         at the same `record|field[N].leaf` key                 (LiveAbility, ActivityPromotion,
         Tutorial, ActivityFanEvent, ActivityAbility, ExerciseHint, Stage, ActivityRefresh)
  5. local-files/genericTrans/generic.json -> any still-empty unit            (flat JP->EN fallback)

This is read-mostly analysis: every write is additionally guarded by
`AND translation_text=''` so nothing already present is ever overwritten. Everything
that doesn't match is counted and reported, never silently dropped or guessed at.
"""

from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"
EN_REPO = Path("/home/vodyanitsa/idolypride-en-data")
TRANSLATOR = "[seed] idolypride-en-data"

UPDATE_SQL = (
    "UPDATE translation_units SET translation_text=?, status='prefilled', "
    "translator_name=?, updated_at=datetime('now') WHERE unit_id=? AND translation_text=''"
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def seed_masterdb(conn: sqlite3.Connection, known_ids: set[str], stats: dict) -> None:
    masterTrans_dir = EN_REPO / "local-files" / "masterTrans"
    for path in sorted(masterTrans_dir.glob("*.json")):
        table = path.stem
        data = load_json(path).get("data", {})
        for key, en_text in data.items():
            if not en_text:
                continue
            parts = key.split("|")
            if len(parts) < 2:
                stats["masterdb_bad_key"] += 1
                continue
            # idolypride-en-data joins every key part (composite PK fields, then
            # the field path) with "|"; the fork's pk_value() joins composite PK
            # fields with "_". Last segment is always the path; everything before
            # it is the (possibly composite) record id.
            field_path = parts[-1]
            record_id = "_".join(parts[:-1])
            unit_id = f"masterdb:{table}:{record_id}:{field_path}"
            if unit_id not in known_ids:
                stats["masterdb_unmatched"][table] += 1
                continue
            cur = conn.execute(UPDATE_SQL, (en_text, TRANSLATOR, unit_id))
            if cur.rowcount:
                stats["masterdb_seeded"] += 1
            else:
                stats["masterdb_already_filled"] += 1


def seed_localization(conn: sqlite3.Connection, known_ids: set[str], stats: dict) -> None:
    doc = load_json(EN_REPO / "local-files" / "localization.json")
    for key, en_text in doc.items():
        if not en_text:
            continue
        unit_id = f"localization:{key}"
        if unit_id not in known_ids:
            stats["localization_unmatched"] += 1
            continue
        cur = conn.execute(UPDATE_SQL, (en_text, TRANSLATOR, unit_id))
        if cur.rowcount:
            stats["localization_seeded"] += 1
        else:
            stats["localization_already_filled"] += 1


def order_key(unit_id: str) -> int:
    # adv:<file>:<order>:<field>
    return int(unit_id.split(":")[2])


def seed_adv(conn: sqlite3.Connection, stats: dict) -> None:
    src_dir = EN_REPO / "agency-adv" / "src"
    work_dir = EN_REPO / "agency-adv" / "work"
    for work_path in sorted(work_dir.glob("*.json")):
        stem = work_path.stem
        filename = f"{stem}.txt"
        src_path = src_dir / f"{stem}.json"
        if not src_path.exists():
            stats["adv_missing_src"] += 1
            continue
        src = load_json(src_path)
        work = load_json(work_path)

        ordered_rows = conn.execute(
            "SELECT unit_id, original_text FROM translation_units "
            "WHERE source_type='adv' AND source_file=? "
            "AND (field_path IN ('text','title') OR field_path LIKE 'choice[%')",
            (filename,),
        ).fetchall()
        ordered_rows.sort(key=lambda r: order_key(r[0]))

        place_rows = conn.execute(
            "SELECT unit_id, original_text FROM translation_units "
            "WHERE source_type='adv' AND source_file=? AND field_path='place'",
            (filename,),
        ).fetchall()

        src_ordered = [item for item in src if item["kind"] != "place"]
        src_places = [item for item in src if item["kind"] == "place"]

        if len(src_ordered) != len(ordered_rows):
            stats["adv_count_mismatch"].append((stem, len(src_ordered), len(ordered_rows)))

        for idx, (db_unit_id, db_text) in enumerate(ordered_rows):
            if idx >= len(src_ordered):
                stats["adv_extra_db_unit"] += 1
                continue
            src_item = src_ordered[idx]
            if src_item["jp"] != db_text:
                stats["adv_text_mismatch"].append((stem, idx, src_item["jp"], db_text))
                continue
            en_text = work.get(str(src_item["uid"]))
            if not en_text:
                stats["adv_no_en_text"] += 1
                continue
            cur = conn.execute(UPDATE_SQL, (en_text, TRANSLATOR, db_unit_id))
            if cur.rowcount:
                stats["adv_text_seeded"] += 1
            else:
                stats["adv_already_filled"] += 1

        place_uid_by_text: dict[str, int] = {}
        for item in src_places:
            place_uid_by_text.setdefault(item["jp"], item["uid"])
        for db_unit_id, db_text in place_rows:
            uid = place_uid_by_text.get(db_text)
            if uid is None:
                stats["adv_place_unmatched"] += 1
                continue
            en_text = work.get(str(uid))
            if not en_text:
                stats["adv_place_no_en_text"] += 1
                continue
            cur = conn.execute(UPDATE_SQL, (en_text, TRANSLATOR, db_unit_id))
            if cur.rowcount:
                stats["adv_place_seeded"] += 1
            else:
                stats["adv_place_already_filled"] += 1


# Tables whose nested-list fields idolypride-en-data represents as a flat JP->EN
# translation memory, independent of record/array-position addressing.
FLAT_MEMORY_TABLES = [
    "Message", "Skill", "HomeTalk", "Story", "HelpCategory", "Character", "CharacterGroup",
]

# Tables covered instead by an agency/ kit (JP src + EN work, same `record|field[N].leaf`
# keys as masterTrans) -- zip src and masterTrans by key to derive JP->EN pairs.
KIT_MEMORY_TABLES = [
    "LiveAbility", "ActivityPromotion", "Tutorial", "ActivityFanEvent",
    "ActivityAbility", "ExerciseHint", "Stage", "ActivityRefresh",
]


def build_table_memory(table: str, stats: dict) -> dict[str, str]:
    memory: dict[str, str] = {}
    conflicts = 0

    flat_path = EN_REPO / "sources" / "master" / f"{table}.json"
    if flat_path.exists():
        for jp, en in load_json(flat_path).items():
            if not en:
                continue
            if jp in memory and memory[jp] != en:
                conflicts += 1
                continue
            memory[jp] = en

    src_path = EN_REPO / "agency" / "src" / f"{table}.json"
    work_path = EN_REPO / "local-files" / "masterTrans" / f"{table}.json"
    if src_path.exists() and work_path.exists():
        src_data = load_json(src_path).get("data", {})
        work_data = load_json(work_path).get("data", {})
        for key, jp in src_data.items():
            en = work_data.get(key)
            if not jp or not en:
                continue
            if jp in memory and memory[jp] != en:
                conflicts += 1
                continue
            memory[jp] = en

    stats["table_memory_conflicts"][table] += conflicts
    return memory


def seed_table_scoped_fallback(conn: sqlite3.Connection, stats: dict) -> None:
    for table in FLAT_MEMORY_TABLES + KIT_MEMORY_TABLES:
        memory = build_table_memory(table, stats)
        if not memory:
            stats["table_memory_empty"].append(table)
            continue
        rows = conn.execute(
            "SELECT unit_id, original_text FROM translation_units "
            "WHERE source_type='masterdb' AND category=? AND translation_text=''",
            (table,),
        ).fetchall()
        translator = TRANSLATOR + " (table-scoped path-translation fallback)"
        seeded = 0
        for unit_id, original_text in rows:
            en_text = memory.get(original_text)
            if not en_text:
                continue
            cur = conn.execute(UPDATE_SQL, (en_text, translator, unit_id))
            if cur.rowcount:
                seeded += 1
        stats["table_scoped_seeded"][table] = seeded


def seed_generic_fallback(conn: sqlite3.Connection, stats: dict) -> None:
    generic = load_json(EN_REPO / "local-files" / "genericTrans" / "generic.json")
    rows = conn.execute(
        "SELECT unit_id, original_text FROM translation_units WHERE translation_text=''"
    ).fetchall()
    translator = TRANSLATOR + " (generic fallback)"
    for unit_id, original_text in rows:
        en_text = generic.get(original_text)
        if not en_text:
            continue
        cur = conn.execute(UPDATE_SQL, (en_text, translator, unit_id))
        if cur.rowcount:
            stats["generic_fallback_seeded"] += 1


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    known_ids = {row[0] for row in conn.execute("SELECT unit_id FROM translation_units")}

    stats: dict = defaultdict(int)
    stats["masterdb_unmatched"] = Counter()
    stats["adv_count_mismatch"] = []
    stats["adv_text_mismatch"] = []
    stats["table_memory_conflicts"] = Counter()
    stats["table_memory_empty"] = []
    stats["table_scoped_seeded"] = {}

    seed_masterdb(conn, known_ids, stats)
    seed_localization(conn, known_ids, stats)
    seed_adv(conn, stats)
    seed_table_scoped_fallback(conn, stats)
    seed_generic_fallback(conn, stats)
    conn.commit()

    total = conn.execute(
        "SELECT COUNT(*) FROM translation_units WHERE translation_text != ''"
    ).fetchone()[0]
    grand_total = conn.execute("SELECT COUNT(*) FROM translation_units").fetchone()[0]

    print("=== masterdb ===")
    print("seeded:", stats["masterdb_seeded"], "already_filled:", stats["masterdb_already_filled"])
    print("bad_key:", stats["masterdb_bad_key"])
    if stats["masterdb_unmatched"]:
        print("unmatched by table (EN source key had no corresponding DB unit):")
        for table, count in stats["masterdb_unmatched"].most_common(20):
            print(f"  {table}: {count}")

    print("\n=== localization ===")
    print("seeded:", stats["localization_seeded"], "already_filled:", stats["localization_already_filled"])
    print("unmatched:", stats["localization_unmatched"])

    print("\n=== adv ===")
    print("missing_src (work file with no src counterpart):", stats["adv_missing_src"])
    print("text_seeded:", stats["adv_text_seeded"], "already_filled:", stats["adv_already_filled"])
    print("no_en_text (src slot has no EN translation yet):", stats["adv_no_en_text"])
    print("place_seeded:", stats["adv_place_seeded"], "place_already_filled:", stats["adv_place_already_filled"])
    print("place_unmatched:", stats["adv_place_unmatched"], "place_no_en_text:", stats["adv_place_no_en_text"])
    print("extra_db_unit (DB had more ordered slots than src):", stats["adv_extra_db_unit"])
    print(f"files with count mismatch: {len(stats['adv_count_mismatch'])}")
    for stem, src_n, db_n in stats["adv_count_mismatch"][:20]:
        print(f"  {stem}: src={src_n} db={db_n}")
    print(f"text mismatches (position misaligned, not written): {len(stats['adv_text_mismatch'])}")
    for stem, idx, jp, db in stats["adv_text_mismatch"][:20]:
        print(f"  {stem}[{idx}]: src_jp={jp!r} db_jp={db!r}")

    print("\n=== table-scoped path-translation fallback ===")
    for table, seeded in stats["table_scoped_seeded"].items():
        print(f"  {table}: seeded={seeded}")
    if stats["table_memory_empty"]:
        print("  no memory available for:", stats["table_memory_empty"])
    if stats["table_memory_conflicts"]:
        print("  JP->EN conflicts within a table's memory (kept first, logged):")
        for table, count in stats["table_memory_conflicts"].most_common():
            print(f"    {table}: {count}")

    print("\n=== generic fallback ===")
    print("seeded:", stats["generic_fallback_seeded"])

    print(f"\n=== totals ===\ntranslated units: {total} / {grand_total}")

    conn.close()


if __name__ == "__main__":
    main()
