#!/usr/bin/env python3
"""Import shipped translations (idolypride-en-data/local-files) into the DB.

The shipped output is the source of truth: a non-empty shipped value replaces
whatever the DB holds (including Global EN text). Empty shipped values never
clear a row. Dry run unless --apply; changes land in translation_changes via
the DB trigger.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import export_output as ex

TRANSLATOR = "[import] idolypride-en-data"


def master_updates(conn, shipped: Path):
    for ref in sorted((shipped / "masterTrans").glob("*.json")):
        category = ref.stem
        if category not in ex.IPR_RULES:
            continue
        data = json.loads(ref.read_text(encoding="utf-8")).get("data", {})
        path_map, key_map = ex.build_export_maps(category)
        index = defaultdict(list)
        for uid, rid, fp in conn.execute(
            "SELECT unit_id, record_id, field_path FROM translation_units WHERE source_type='masterdb' AND category=?",
            (category,),
        ):
            index[f"{key_map.get(rid, rid)}|{path_map.get((rid, fp), fp)}"].append(uid)
        for key, value in data.items():
            if not value:
                continue
            uids = index.get(key)
            yield category, key, uids, value


def adv_updates(conn, shipped: Path, stats: Counter):
    units_by_file = defaultdict(list)
    for row in conn.execute(
        "SELECT unit_id, source_file, line_no, field_path, original_text FROM translation_units WHERE source_type='adv'"
    ):
        units_by_file[row[1]].append(row)
    adv_dir = shipped / "resource" / "adv"
    for source_file, units in sorted(units_by_file.items()):
        out = adv_dir / source_file
        src = ex.ADV_DIR / source_file
        if not out.exists() or not src.exists():
            stats["adv_file_missing"] += 1
            continue
        s_lines = src.read_text(encoding="utf-8").splitlines()
        o_lines = out.read_text(encoding="utf-8").splitlines()
        if len(s_lines) != len(o_lines):
            stats["adv_file_linecount_mismatch"] += 1
            continue
        by_line = defaultdict(list)
        names, places = {}, {}
        for uid, _f, line_no, fp, orig in units:
            if fp == "name":
                names[orig] = uid
            elif fp == "place":
                places[orig] = uid
            elif line_no:
                by_line[int(line_no)].append((uid, fp))
        for idx, (s, o) in enumerate(zip(s_lines, o_lines), start=1):
            for uid, fp in by_line.get(idx, []):
                if fp in ("text", "title"):
                    val = ex.parse_attrs(o).get(fp)
                elif fp.startswith("choice[") and fp.endswith("].text"):
                    n = int(fp.removeprefix("choice[").split("]", 1)[0])
                    m = list(ex.CHOICE_RE.finditer(o))
                    val = m[n].group("value") if n < len(m) else None
                else:
                    continue
                if val:
                    yield uid, val
            sn, on = ex.parse_attrs(s).get("name"), ex.parse_attrs(o).get("name")
            if sn in names and on:
                yield names[sn], on
            sp, op = ex.PLACE_ATTR_RE.search(s), ex.PLACE_ATTR_RE.search(o)
            if sp and op and sp.group("value").strip() in places:
                yield places[sp.group("value").strip()], op.group("value").strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=ex.DB_PATH)
    ap.add_argument("--shipped", type=Path, default=Path.home() / "idolypride-en-data" / "local-files")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    conn = sqlite3.connect(args.db)
    stats: Counter = Counter()
    pending: dict[str, str] = {}
    for category, key, uids, value in master_updates(conn, args.shipped):
        if not uids:
            stats["master_key_unmatched"] += 1
            continue
        for uid in uids:
            pending[uid] = value
    for uid, value in adv_updates(conn, args.shipped, stats):
        pending[uid] = value
    loc = args.shipped / "localization.json"
    if loc.exists():
        for k, v in json.loads(loc.read_text(encoding="utf-8")).items():
            if v:
                row = conn.execute(
                    "SELECT unit_id FROM translation_units WHERE source_type='localization' AND category='Localization' AND record_id=?",
                    (k,),
                ).fetchone()
                if row:
                    pending[row[0]] = v
                else:
                    stats["localization_unmatched"] += 1
    cur = {u: t for u, t in conn.execute("SELECT unit_id, translation_text FROM translation_units")}
    for uid, val in pending.items():
        old = cur.get(uid)
        stats["fill" if old == "" else "same" if old == val else "overwrite"] += 1
    todo = [(v, TRANSLATOR, u) for u, v in pending.items() if cur.get(u) != v]
    print(dict(stats), f"to_write={len(todo)}")
    if args.apply:
        conn.executemany(
            "UPDATE translation_units SET translation_text=?, translator_name=?, status='prefilled', updated_at=datetime('now') WHERE unit_id=?",
            todo,
        )
        conn.commit()
        print("applied")


if __name__ == "__main__":
    main()
