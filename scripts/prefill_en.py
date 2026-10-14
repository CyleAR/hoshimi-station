from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

import import_db


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"
# Official EN shelf (e.g. ~/GLB-Datamine/528 exports). Hint-only: see docs/TRANSLATION_POLICY.md section 1.
JSON_EN_DIR = ROOT / "json-en"
ADV_EN_DIR = ROOT / "adv-en"


def read_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("data", data) if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else []


class UnitUpdater:
    def __init__(self, conn: sqlite3.Connection, *, overwrite: bool, dry_run: bool) -> None:
        self.conn = conn
        self.dry_run = dry_run
        conn.execute("CREATE TABLE IF NOT EXISTS official_en_hints (unit_id TEXT PRIMARY KEY, hint_text TEXT NOT NULL)")
        guard = "" if overwrite else "AND translation_text = ''"
        rows = conn.execute(
            f"""
            SELECT unit_id, source_type, category, source_file, record_id, field_path, line_no, original_text
            FROM translation_units
            WHERE 1 = 1 {guard}
            """
        ).fetchall()
        self.master: dict[tuple[str, str, str], sqlite3.Row] = {}
        self.adv_text: dict[tuple[str, int, str], sqlite3.Row] = {}
        self.adv_name: dict[tuple[str, str], sqlite3.Row] = {}
        self.updated: set[str] = set()
        for row in rows:
            if row["source_type"] == "masterdb":
                self.master[(row["category"], row["record_id"], row["field_path"])] = row
            elif row["source_type"] == "adv":
                if row["field_path"] == "name":
                    self.adv_name[(row["source_file"], row["original_text"])] = row
                elif row["line_no"] is not None:
                    self.adv_text[(row["source_file"], int(row["line_no"]), row["field_path"])] = row

    def update_row(self, row: sqlite3.Row | None, translation: str | None) -> int:
        if row is None or translation is None or not str(translation).strip():
            return 0
        if row["unit_id"] in self.updated:
            return 0
        if row["original_text"] == translation:
            return 0
        self.updated.add(row["unit_id"])
        if self.dry_run:
            return 1
        # Official EN is never copied into translation_text (policy section 1);
        # it is stored as a disambiguation hint only.
        self.conn.execute(
            """
            INSERT INTO official_en_hints (unit_id, hint_text) VALUES ($unitId, $translation)
            ON CONFLICT(unit_id) DO UPDATE SET hint_text = excluded.hint_text
            """,
            {"translation": translation, "unitId": row["unit_id"]},
        )
        return 1

    def update_master(self, category: str, record: str, field_path: str, translation: str | None) -> int:
        return self.update_row(self.master.get((category, record, field_path)), translation)

    def update_adv_text(self, source_file: str, line_no: int, field_path: str, translation: str | None) -> int:
        return self.update_row(self.adv_text.get((source_file, line_no, field_path)), translation)

    def update_adv_name(self, source_file: str, original_name: str, translation: str | None) -> int:
        return self.update_row(self.adv_name.get((source_file, original_name)), translation)


def prefill_masterdb(updater: UnitUpdater) -> tuple[int, dict[str, int]]:
    total = 0
    by_category: dict[str, int] = {}
    for category, rule in sorted(import_db.IPR_RULES.items()):
        path = JSON_EN_DIR / f"{category}.json"
        if not path.exists():
            continue
        pk_fields = rule.get("pk", ["id"])
        count = 0
        for item in read_json(path):
            if not isinstance(item, dict):
                continue
            record = import_db.pk_value(item, pk_fields)
            for parts, field_path in import_db.iter_rule_paths(rule):
                for actual_path, value in import_db.extract_path(item, parts, field_path):
                    count += updater.update_master(category, record, actual_path, value)
        if count:
            by_category[category] = count
            total += count
    return total, by_category


def en_adv_units(path: Path) -> tuple[dict[tuple[int, str], str], dict[tuple[int, str], str]]:
    text_units: dict[tuple[int, str], str] = {}
    name_units: dict[tuple[int, str], str] = {}
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        match = import_db.TAG_RE.match(line)
        if not match:
            continue
        tag = match.group("tag")
        body = match.group("body")
        attrs = import_db.parse_attrs(body)
        if tag in {"message", "narration"}:
            if attrs.get("name"):
                name_units[(line_no, "name")] = attrs["name"]
            if attrs.get("text"):
                text_units[(line_no, "text")] = attrs["text"]
        elif tag == "title" and attrs.get("title"):
            text_units[(line_no, "title")] = attrs["title"]
        elif tag == "choicegroup":
            for idx, text_match in enumerate(re.finditer(r"(?<![A-Za-z])text=(.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\])", body)):
                text_units[(line_no, f"choice[{idx}].text")] = text_match.group(1)
    return text_units, name_units


def original_adv_names(path: Path) -> dict[tuple[int, str], str]:
    names: dict[tuple[int, str], str] = {}
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        match = import_db.TAG_RE.match(line)
        if not match:
            continue
        tag = match.group("tag")
        if tag not in {"message", "narration"}:
            continue
        name = import_db.parse_attrs(match.group("body")).get("name")
        if name:
            names[(line_no, "name")] = name
    return names


def prefill_adv(updater: UnitUpdater) -> tuple[int, dict[str, int]]:
    total = 0
    by_file: dict[str, int] = {}
    for en_path in sorted(ADV_EN_DIR.glob("adv_*.txt")):
        source_path = import_db.ADV_DIR / en_path.name
        if not source_path.exists():
            continue
        text_units, en_names = en_adv_units(en_path)
        original_names = original_adv_names(source_path)
        count = 0

        for (line_no, field_path), value in text_units.items():
            count += updater.update_adv_text(en_path.name, line_no, field_path, value)

        for key, en_name in en_names.items():
            original_name = original_names.get(key)
            if not original_name:
                continue
            count += updater.update_adv_name(en_path.name, original_name, en_name)

        if count:
            by_file[en_path.name] = count
            total += count
    return total, by_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Record official English as hints from json-en and adv-en (official English, hint-only).")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing non-empty translations.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        updater = UnitUpdater(conn, overwrite=args.overwrite, dry_run=args.dry_run)
        master_total, master_by_category = prefill_masterdb(updater)
        adv_total, adv_by_file = prefill_adv(updater)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    finally:
        conn.close()

    print(f"masterdb_prefill={master_total} categories={len(master_by_category)}")
    print(f"adv_prefill={adv_total} files={len(adv_by_file)}")
    if master_by_category:
        print("top_masterdb=" + ", ".join(f"{k}:{v}" for k, v in sorted(master_by_category.items(), key=lambda item: item[1], reverse=True)[:20]))
    if adv_by_file:
        print("top_adv=" + ", ".join(f"{k}:{v}" for k, v in sorted(adv_by_file.items(), key=lambda item: item[1], reverse=True)[:20]))


if __name__ == "__main__":
    main()
