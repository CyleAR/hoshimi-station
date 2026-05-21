from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"
MASTERDB_DIR = ROOT / "res" / "masterdb"
ADV_DIR = ROOT / "res" / "adv" / "resource"
DEFAULT_OUTPUT_DIR = ROOT / "output"

ATTR_RE = re.compile(r"(?P<key>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\]?$)")


def load_ipr_rules() -> dict[str, Any]:
    path = ROOT / "note-scripts" / "ipr_rules.py"
    spec = importlib.util.spec_from_file_location("ipr_rules", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.IPR_RULES


IPR_RULES = load_ipr_rules()


def read_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("data", data) if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else []


def pk_value(item: dict[str, Any], pk_fields: list[str]) -> str:
    return "_".join(str(item.get(field, "0")) for field in pk_fields)


def cache_key(category: str, row: dict[str, Any]) -> str:
    if category == "CardEvolutionMessage":
        return pk_value(row, ["cardId", "evolutionLevel", "number"])
    if category == "HomeTalkCallPattern":
        return pk_value(row, ["characterId", "patternId"])
    return str(row.get("id") or row.get("homeTalkId") or pk_value(row, ["id"]))


def nested_identifier(child: dict[str, Any], index: int) -> Any:
    return (
        child.get("id")
        or child.get("messageDetailId")
        or child.get("voiceAssetId")
        or child.get("level")
        or child.get("index")
        or index
    )


def output_rule_paths(rule: dict[str, Any]) -> list[str]:
    pk_prefix = "|".join(rule.get("pk", ["id"]))
    paths = [f"{pk_prefix}|{field}" for field in rule.get("fields", {})]
    for nested_name, nested_rule in rule.get("nested", {}).items():
        for field in nested_rule.get("fields", {}):
            paths.append(f"{pk_prefix}|{nested_name}.{field}")
    return paths


def output_pk_value(item: dict[str, Any], pk_fields: list[str]) -> str:
    return "|".join(str(item.get(field, "0")) for field in pk_fields)


def build_export_maps(category: str) -> tuple[dict[tuple[str, str], str], dict[str, str]]:
    path = MASTERDB_DIR / f"{category}.json"
    if not path.exists():
        return {}, {}
    rule = IPR_RULES[category]
    pk_fields = rule.get("pk", ["id"])
    path_map: dict[tuple[str, str], str] = {}
    key_map: dict[str, str] = {}
    for item in read_json(path):
        if not isinstance(item, dict):
            continue
        record_id = pk_value(item, pk_fields)
        key_map[record_id] = output_pk_value(item, pk_fields)
        for field in rule.get("fields", {}):
            path_map[(record_id, field)] = field
        for nested_name, nested_rule in rule.get("nested", {}).items():
            index_key = nested_rule.get("index_key", "index")
            child = item.get(nested_name)
            if isinstance(child, list):
                for index, element in enumerate(child):
                    if not isinstance(element, dict):
                        continue
                    ident = nested_identifier(element, index)
                    for field in nested_rule.get("fields", {}):
                        path_map[(record_id, f"{nested_name}[{ident};{index_key}].{field}")] = f"{nested_name}[{index}].{field}"
            elif isinstance(child, dict):
                for field in nested_rule.get("fields", {}):
                    path_map[(record_id, f"{nested_name}[{index_key}].{field}")] = f"{nested_name}.{field}"
                    path_map[(record_id, f"{nested_name}.{field}")] = f"{nested_name}.{field}"
    return path_map, key_map


def export_masterdb(conn: sqlite3.Connection, out_dir: Path) -> int:
    master_dir = out_dir / "local-files" / "masterTrans"
    master_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for category in sorted(IPR_RULES):
        rows = conn.execute(
            """
            SELECT record_id, field_path, translation_text
            FROM translation_units
            WHERE source_type = 'masterdb'
              AND category = ?
              AND translation_text <> ''
            ORDER BY record_id, field_path
            """,
            (category,),
        ).fetchall()
        if not rows:
            continue
        path_map, key_map = build_export_maps(category)
        data: dict[str, str] = {}
        for record_id, field_path, translation in rows:
            export_path = path_map.get((record_id, field_path), field_path)
            export_key = key_map.get(record_id, record_id)
            data[f"{export_key}|{export_path}"] = translation
        payload = {"rule": output_rule_paths(IPR_RULES[category]), "data": data}
        (master_dir / f"{category}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        total += len(data)
    return total


def replace_attr(line: str, attr: str, value: str, occurrence: int = 0) -> str:
    seen = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal seen
        if match.group("key") != attr:
            return match.group(0)
        if seen == occurrence:
            seen += 1
            return f"{attr}={value}"
        seen += 1
        return match.group(0)

    return ATTR_RE.sub(repl, line)


def parse_attrs(line: str) -> dict[str, str]:
    return {match.group("key"): match.group("value").strip() for match in ATTR_RE.finditer(line)}


def export_adv(conn: sqlite3.Connection, out_dir: Path) -> int:
    adv_dir = out_dir / "local-files" / "resource" / "adv"
    adv_dir.mkdir(parents=True, exist_ok=True)
    rows = conn.execute(
        """
        SELECT source_file, line_no, field_path, original_text, translation_text
        FROM translation_units
        WHERE source_type = 'adv'
          AND translation_text <> ''
        ORDER BY source_file, line_no, field_path
        """
    ).fetchall()
    by_file: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        by_file[row["source_file"]].append(row)

    exported = 0
    for source_file, units in sorted(by_file.items()):
        source_path = ADV_DIR / source_file
        if not source_path.exists():
            continue
        lines = source_path.read_text(encoding="utf-8").splitlines()
        name_map = {row["original_text"]: row["translation_text"] for row in units if row["field_path"] == "name"}
        line_units: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for row in units:
            if row["field_path"] != "name" and row["line_no"]:
                line_units[int(row["line_no"])].append(row)

        for idx, line in enumerate(lines, start=1):
            for original, translated in name_map.items():
                attrs = parse_attrs(line)
                if attrs.get("name") == original:
                    line = replace_attr(line, "name", translated)
            for row in line_units.get(idx, []):
                field = row["field_path"]
                if field == "text":
                    line = replace_attr(line, "text", row["translation_text"])
                elif field == "title":
                    line = replace_attr(line, "title", row["translation_text"])
                elif field.startswith("choice[") and field.endswith("].text"):
                    occurrence = int(field.removeprefix("choice[").split("]", 1)[0])
                    line = replace_attr(line, "text", row["translation_text"], occurrence)
            lines[idx - 1] = line
        (adv_dir / source_file).write_text("\n".join(lines) + "\n", encoding="utf-8")
        exported += len(units)
    return exported


def write_metadata(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "version.txt").write_text(datetime.now().strftime("%Y%m%d_%H%M%S"), encoding="utf-8")


def clear_output_dir(out_dir: Path) -> None:
    targets = [
        out_dir / "version.txt",
        out_dir / "local-files" / "masterTrans",
        out_dir / "local-files" / "resource" / "adv",
    ]
    for target in targets:
        if not target.exists():
            continue
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description="Export translated DB rows into Localify output files.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    out_dir = args.out.resolve()
    if out_dir.exists() and args.overwrite:
        clear_output_dir(out_dir)
    elif out_dir.exists() and any(out_dir.iterdir()):
        raise SystemExit(f"{out_dir} already exists. Pass --overwrite to replace it.")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        write_metadata(out_dir)
        master_count = export_masterdb(conn, out_dir)
        adv_count = export_adv(conn, out_dir)
    finally:
        conn.close()
    print(f"Exported {master_count} masterdb units and {adv_count} adv units to {out_dir}")


if __name__ == "__main__":
    main()
