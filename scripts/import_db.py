from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, TextIO


ROOT = Path(__file__).resolve().parents[1]
MASTERDB_DIR = ROOT / "res" / "masterdb"
ADV_DIR = ROOT / "res" / "adv" / "resource"
LOCALIZATION_PATH = ROOT / "res" / "localization.json"
LOCALIZATION_TRANSLATION_PATH = ROOT / "output" / "local-files" / "localization.json"
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"
PREFILL_TRANSLATIONS_PATH = ROOT / "scripts" / "prefill_translations.json"
PREFILL_TRANSLATOR = "[BOT] auto-prefill"
PREFILL_FORMAT_PLACEHOLDER_RE = re.compile(r"\{(\d+)\}")


def load_ipr_rules() -> tuple[dict[str, Any], list[re.Pattern[str]]]:
    path = ROOT / "scripts" / "ipr_rules.py"
    spec = importlib.util.spec_from_file_location("ipr_rules", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.IPR_RULES, module.IPR_IGNORE_PATTERNS


def load_auto_skill_module() -> Any:
    path = ROOT / "scripts" / "auto_translate_skills.py"
    module_name = "hoshimi_auto_translate_skills"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


IPR_RULES, IPR_IGNORE_PATTERNS = load_ipr_rules()
AUTO_SKILL_MODULE = load_auto_skill_module()

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("data", data) if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else []


def normalize_prefill_text(value: Any) -> str:
    return (
        str(value)
        .replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
    )


def has_prefill_placeholder(value: str) -> bool:
    return bool(PREFILL_FORMAT_PLACEHOLDER_RE.search(value))


def compile_prefill_pattern(format_text: str) -> tuple[re.Pattern[str], list[str]]:
    placeholders: list[str] = []
    pattern = "^"
    offset = 0
    for match in PREFILL_FORMAT_PLACEHOLDER_RE.finditer(format_text):
        pattern += re.escape(format_text[offset : match.start()])
        pattern += r"([0-9０-９]+)"
        placeholders.append(match.group(1))
        offset = match.end()
    pattern += re.escape(format_text[offset:])
    pattern += "$"
    return re.compile(pattern), placeholders


def apply_prefill_format(template: str, placeholders: list[str], match: re.Match[str]) -> str | None:
    captures: dict[str, str] = {}
    for index, key in enumerate(placeholders, start=1):
        value = match.group(index)
        existing = captures.get(key)
        if existing is not None and existing != value:
            return None
        captures[key] = value

    unknown = [key for key in PREFILL_FORMAT_PLACEHOLDER_RE.findall(template) if key not in captures]
    if unknown:
        return None
    return PREFILL_FORMAT_PLACEHOLDER_RE.sub(lambda item: captures[item.group(1)], template)


def prefill_literal_weight(format_text: str) -> tuple[int, int]:
    literals = PREFILL_FORMAT_PLACEHOLDER_RE.split(format_text)[::2]
    return sum(len(part) for part in literals), len(format_text)


def load_prefill_translations(path: Path = PREFILL_TRANSLATIONS_PATH) -> tuple[dict[str, str], list[tuple[str, str]], int]:
    if not path.exists():
        return {}, [], 0
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}, [], 0

    translations: dict[str, str] = {}
    formats: list[tuple[str, str]] = []
    conflicts = 0
    for items in data.values():
        if not isinstance(items, dict):
            continue
        for original, translation in items.items():
            original_text = normalize_prefill_text(original)
            translation_text = normalize_prefill_text(translation)
            if not original_text or not translation_text:
                continue
            if has_prefill_placeholder(original_text):
                formats.append((original_text, translation_text))
                continue
            existing = translations.get(original_text)
            if existing is not None and existing != translation_text:
                conflicts += 1
                continue
            translations[original_text] = translation_text
    formats.sort(key=lambda item: prefill_literal_weight(item[0]), reverse=True)
    return translations, formats, conflicts


def message_thread_id(message_id: str) -> str:
    match = re.match(r"^(.+)-\d{3}$", str(message_id or ""))
    return match.group(1) if match else ""


def card_id_from_home_talk_id(home_talk_id: str) -> str:
    match = re.match(r"^home-talk-(card-.+)-talk-\d+$", str(home_talk_id or ""))
    return match.group(1) if match else ""


def strip_thread_suffix(name: str) -> str:
    return re.sub(r"[①②③④⑤⑥⑦⑧⑨⑩]$", "", str(name or "")).strip()


def should_ignore(text: Any) -> bool:
    if not isinstance(text, str) or not text.strip():
        return True
    stripped = text.strip()
    if stripped == "{user}":
        return True
    return any(pattern.match(stripped) for pattern in IPR_IGNORE_PATTERNS)


def serialize_leaf(value: Any) -> str | None:
    if isinstance(value, str):
        return None if should_ignore(value) else value
    if isinstance(value, list) and all(isinstance(x, (str, int, float)) for x in value):
        text = "[LA_F]" + "[LA_N_F]".join(str(x) for x in value)
        return None if should_ignore(text) else text
    return None


def pk_value(item: dict[str, Any], pk_fields: list[str]) -> str:
    return "_".join(str(item.get(field, "0")) for field in pk_fields)


def cache_key(category: str, row: dict[str, Any]) -> str:
    if category == "CardEvolutionMessage":
        return pk_value(row, ["cardId", "evolutionLevel", "number"])
    if category == "ExcursionGazeReaction":
        return pk_value(row, ["characterId", "excursionPlaceId", "number"])
    if category == "ExcursionPlaceSetting":
        return pk_value(row, ["characterId", "excursionPlaceId"])
    if category == "HomeTalkCallPattern":
        return pk_value(row, ["characterId", "patternId"])
    if category == "HomeAction":
        return str(row.get("homeActionId") or pk_value(row, ["homeActionId"]))
    return str(row.get("id") or row.get("homeTalkId") or pk_value(row, ["id"]))


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS entities (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            label TEXT NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            meta_json TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY(entity_type, entity_id)
        );
        CREATE TABLE IF NOT EXISTS links (
            from_type TEXT NOT NULL,
            from_id TEXT NOT NULL,
            to_type TEXT NOT NULL,
            to_id TEXT NOT NULL,
            relation TEXT NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY(from_type, from_id, to_type, to_id, relation)
        );
        CREATE TABLE IF NOT EXISTS translation_units (
            unit_id TEXT PRIMARY KEY,
            source_type TEXT NOT NULL,
            category TEXT NOT NULL,
            source_file TEXT NOT NULL,
            record_id TEXT NOT NULL,
            field_path TEXT NOT NULL,
            line_no INTEGER,
            speaker TEXT NOT NULL DEFAULT '',
            original_text TEXT NOT NULL,
            translation_text TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            translator_name TEXT NOT NULL DEFAULT '',
            scope_type TEXT NOT NULL DEFAULT 'category',
            scope_id TEXT NOT NULL DEFAULT '',
            context_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            nickname TEXT PRIMARY KEY,
            pin TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_daily_usage (
            nickname TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(nickname, usage_date)
        );
        CREATE TABLE IF NOT EXISTS new_import_units (
            unit_id TEXT NOT NULL,
            original_text TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            PRIMARY KEY(unit_id, original_text)
        );
        CREATE INDEX IF NOT EXISTS idx_units_category ON translation_units(category);
        CREATE INDEX IF NOT EXISTS idx_units_scope ON translation_units(scope_type, scope_id);
        CREATE INDEX IF NOT EXISTS idx_units_source ON translation_units(source_type, source_file);
        CREATE INDEX IF NOT EXISTS idx_new_import_units_time ON new_import_units(imported_at);
        CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_type, from_id);
        CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_type, to_id);
        """
    )


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in conn.execute(f"PRAGMA table_info({table})"))


def has_existing_localization_units(conn: sqlite3.Connection) -> bool:
    if not table_exists(conn, "translation_units"):
        return False
    return conn.execute(
        "SELECT 1 FROM translation_units WHERE source_type = 'localization' LIMIT 1"
    ).fetchone() is not None


def preserve_existing_translations(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS temp.saved_translations")
    if not table_exists(conn, "translation_units"):
        return
    translator_expr = "translator_name" if column_exists(conn, "translation_units", "translator_name") else "'' AS translator_name"
    conn.execute(
        f"""
        CREATE TEMP TABLE saved_translations AS
        SELECT unit_id, original_text, translation_text, status, {translator_expr}, updated_at
        FROM translation_units
        WHERE translation_text <> '' OR status <> 'new'
        """
    )
    conn.execute(
        """
        CREATE INDEX saved_translations_lookup
        ON saved_translations(unit_id, original_text)
        """
    )


def preserve_existing_unit_inventory(conn: sqlite3.Connection) -> bool:
    conn.execute("DROP TABLE IF EXISTS temp.existing_unit_inventory")
    if not table_exists(conn, "translation_units"):
        return False
    conn.execute(
        """
        CREATE TEMP TABLE existing_unit_inventory AS
        SELECT unit_id, original_text
        FROM translation_units
        """
    )
    conn.execute(
        """
        CREATE INDEX existing_unit_inventory_lookup
        ON existing_unit_inventory(unit_id, original_text)
        """
    )
    return conn.execute("SELECT 1 FROM existing_unit_inventory LIMIT 1").fetchone() is not None


def track_new_untranslated_units(conn: sqlite3.Connection, had_existing_units: bool) -> dict[str, int]:
    conn.execute(
        """
        DELETE FROM new_import_units
        WHERE NOT EXISTS (
            SELECT 1
            FROM translation_units unit
            WHERE unit.unit_id = new_import_units.unit_id
              AND unit.original_text = new_import_units.original_text
              AND unit.translation_text = ''
        )
        """
    )
    added = 0
    if had_existing_units:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO new_import_units(unit_id, original_text, imported_at)
            SELECT unit.unit_id, unit.original_text, ?
            FROM translation_units unit
            WHERE unit.translation_text = ''
              AND unit.original_text <> ''
              AND NOT EXISTS (
                  SELECT 1
                  FROM existing_unit_inventory old
                  WHERE old.unit_id = unit.unit_id
                    AND old.original_text = unit.original_text
              )
            """,
            (now(),),
        )
        added = cursor.rowcount
    total = conn.execute("SELECT COUNT(*) FROM new_import_units").fetchone()[0]
    return {"added": added, "total": total}


def restore_existing_translations(conn: sqlite3.Connection, duplicate_story_ids: set[str]) -> None:
    row = conn.execute(
        "SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'saved_translations'",
    ).fetchone()
    if row is None:
        return
    conn.execute("DROP TABLE IF EXISTS temp.duplicate_limited_stories")
    conn.execute("CREATE TEMP TABLE duplicate_limited_stories(limited_id TEXT PRIMARY KEY)")
    conn.executemany(
        "INSERT INTO duplicate_limited_stories(limited_id) VALUES(?)",
        [(story_id,) for story_id in sorted(duplicate_story_ids)],
    )
    conn.execute(
        """
        UPDATE translation_units
        SET translation_text = (
                SELECT saved.translation_text
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                  AND saved.original_text = translation_units.original_text
            ),
            status = (
                SELECT saved.status
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                  AND saved.original_text = translation_units.original_text
            ),
            translator_name = (
                SELECT saved.translator_name
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                  AND saved.original_text = translation_units.original_text
            ),
            updated_at = (
                SELECT saved.updated_at
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                  AND saved.original_text = translation_units.original_text
            )
        WHERE EXISTS (
            SELECT 1
            FROM saved_translations saved
            WHERE saved.unit_id = translation_units.unit_id
              AND saved.original_text = translation_units.original_text
        )
        """
    )
    conn.execute(
        """
        UPDATE translation_units
        SET translation_text = (
                SELECT saved.translation_text
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                LIMIT 1
            ),
            status = (
                SELECT saved.status
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                LIMIT 1
            ),
            translator_name = (
                SELECT saved.translator_name
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                LIMIT 1
            ),
            updated_at = (
                SELECT saved.updated_at
                FROM saved_translations saved
                WHERE saved.unit_id = translation_units.unit_id
                LIMIT 1
            )
        WHERE source_type = 'localization'
          AND EXISTS (
            SELECT 1
            FROM saved_translations saved
            WHERE saved.unit_id = translation_units.unit_id
          )
        """
    )
    conn.execute(
        """
        UPDATE translation_units
        SET translation_text = (
                SELECT saved.translation_text
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, ':' || translation_units.record_id || ':', ':' || translation_units.record_id || '-limited:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            ),
            status = (
                SELECT saved.status
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, ':' || translation_units.record_id || ':', ':' || translation_units.record_id || '-limited:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            ),
            translator_name = (
                SELECT saved.translator_name
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, ':' || translation_units.record_id || ':', ':' || translation_units.record_id || '-limited:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            ),
            updated_at = (
                SELECT saved.updated_at
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, ':' || translation_units.record_id || ':', ':' || translation_units.record_id || '-limited:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            )
        WHERE source_type = 'masterdb'
          AND category = 'Story'
          AND record_id NOT LIKE '%-limited'
          AND translation_text = ''
          AND EXISTS (
            SELECT 1
            FROM duplicate_limited_stories dup
            WHERE dup.limited_id = translation_units.record_id || '-limited'
          )
          AND EXISTS (
            SELECT 1
            FROM saved_translations saved
            WHERE saved.unit_id = replace(translation_units.unit_id, ':' || translation_units.record_id || ':', ':' || translation_units.record_id || '-limited:')
              AND saved.original_text = translation_units.original_text
          )
        """
    )
    conn.execute(
        """
        UPDATE translation_units
        SET translation_text = (
                SELECT saved.translation_text
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, '.txt:', '_short.txt:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            ),
            status = (
                SELECT saved.status
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, '.txt:', '_short.txt:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            ),
            translator_name = (
                SELECT saved.translator_name
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, '.txt:', '_short.txt:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            ),
            updated_at = (
                SELECT saved.updated_at
                FROM saved_translations saved
                WHERE saved.unit_id = replace(translation_units.unit_id, '.txt:', '_short.txt:')
                  AND saved.original_text = translation_units.original_text
                LIMIT 1
            )
        WHERE source_type = 'adv'
          AND source_file LIKE 'adv_card_%.txt'
          AND source_file NOT LIKE 'adv_card_%_short.txt'
          AND translation_text = ''
          AND EXISTS (
            SELECT 1
            FROM saved_translations saved
            WHERE saved.unit_id = replace(translation_units.unit_id, '.txt:', '_short.txt:')
              AND saved.original_text = translation_units.original_text
          )
        """
    )


def write_prefill_log_row(handle: TextIO, mode: str, row: sqlite3.Row | tuple[Any, ...], new_text: str) -> None:
    unit_id, source_type, category, source_file, record_id, field_path, original_text, old_text = row
    values = [
        mode,
        str(unit_id),
        str(source_type),
        str(category),
        str(source_file),
        str(record_id),
        str(field_path),
        str(original_text).replace("\t", "\\t").replace("\n", "\\n"),
        str(old_text).replace("\t", "\\t").replace("\n", "\\n"),
        str(new_text).replace("\t", "\\t").replace("\n", "\\n"),
    ]
    handle.write("\t".join(values) + "\n")


def prefill_translations(
    conn: sqlite3.Connection,
    *,
    overwrite: bool = False,
    log_limit: int = 50,
    log_path: Path | None = None,
) -> dict[str, Any]:
    translations, formats, conflicts = load_prefill_translations()
    log_rows: list[dict[str, str]] = []
    log_count = 0
    log_handle: TextIO | None = None
    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_handle = log_path.open("w", encoding="utf-8", newline="")
        log_handle.write(
            "mode\tunit_id\tsource_type\tcategory\tsource_file\trecord_id\tfield_path\toriginal_text\told_translation\tnew_translation\n"
        )

    def remember_log(mode: str, row: sqlite3.Row | tuple[Any, ...], new_text: str) -> None:
        nonlocal log_count
        unit_id, source_type, category, source_file, record_id, field_path, original_text, old_text = row
        log_count += 1
        if log_handle is not None:
            write_prefill_log_row(log_handle, mode, row, new_text)
        if log_limit == 0 or len(log_rows) < log_limit:
            log_rows.append(
                {
                    "mode": mode,
                    "unit_id": str(unit_id),
                    "source_type": str(source_type),
                    "category": str(category),
                    "source_file": str(source_file),
                    "record_id": str(record_id),
                    "field_path": str(field_path),
                    "original_text": str(original_text),
                    "old_translation": str(old_text),
                    "new_translation": str(new_text),
                }
            )

    if not translations and not formats:
        if log_handle is not None:
            log_handle.close()
        return {
            "entries": 0,
            "formats": 0,
            "updated": 0,
            "exact_updated": 0,
            "format_updated": 0,
            "conflicts": conflicts,
            "overwrite": int(overwrite),
            "log_count": 0,
            "log_rows": [],
            "log_path": str(log_path) if log_path is not None else "",
        }

    try:
        exact_updated = 0
        if translations:
            conn.execute("DROP TABLE IF EXISTS temp.prefill_translations")
            conn.execute(
                """
                CREATE TEMP TABLE prefill_translations(
                    original_text TEXT PRIMARY KEY,
                    translation_text TEXT NOT NULL
                )
                """
            )
            conn.executemany(
                "INSERT INTO prefill_translations(original_text, translation_text) VALUES(?, ?)",
                sorted(translations.items()),
            )
            exact_where = "translation_units.translation_text != prefill.translation_text" if overwrite else "translation_units.translation_text = ''"
            exact_rows = conn.execute(
                """
                SELECT
                    translation_units.unit_id,
                    translation_units.source_type,
                    translation_units.category,
                    translation_units.source_file,
                    translation_units.record_id,
                    translation_units.field_path,
                    translation_units.original_text,
                    translation_units.translation_text,
                    prefill.translation_text
                FROM translation_units
                JOIN prefill_translations prefill
                  ON prefill.original_text = translation_units.original_text
                WHERE """ + exact_where + """
                ORDER BY translation_units.source_type, translation_units.category, translation_units.source_file,
                         translation_units.record_id, translation_units.line_no, translation_units.field_path
                """,
            ).fetchall()
            for row in exact_rows:
                remember_log("exact", row[:8], row[8])
            if exact_rows:
                conn.executemany(
                    """
                    UPDATE translation_units
                    SET translation_text = ?,
                        status = 'prefilled',
                        translator_name = ?,
                        updated_at = datetime('now')
                    WHERE unit_id = ?
                    """,
                    [(row[8], PREFILL_TRANSLATOR, row[0]) for row in exact_rows],
                )
            exact_updated = len(exact_rows)

        format_updated = 0
        compiled_formats = [
            (compile_prefill_pattern(original), translation)
            for original, translation in formats
        ]
        if compiled_formats:
            format_where = "1 = 1" if overwrite else "translation_text = ''"
            rows = conn.execute(
                """
                SELECT unit_id, source_type, category, source_file, record_id, field_path, original_text, translation_text
                FROM translation_units
                WHERE """ + format_where + """
                ORDER BY source_type, category, source_file, record_id, line_no, field_path
                """
            ).fetchall()
            updates: list[tuple[str, str, tuple[Any, ...]]] = []
            for row in rows:
                original_text = row[6]
                old_translation = row[7]
                for (regex, placeholders), template in compiled_formats:
                    match = regex.match(original_text)
                    if not match:
                        continue
                    translation = apply_prefill_format(template, placeholders, match)
                    if not translation or translation == original_text:
                        continue
                    if overwrite or old_translation == "":
                        if old_translation != translation:
                            updates.append((translation, row[0], row))
                    break
            for translation, _, row in updates:
                remember_log("format", row, translation)
            if updates:
                conn.executemany(
                    """
                    UPDATE translation_units
                    SET translation_text = ?,
                        status = 'prefilled',
                        translator_name = ?,
                        updated_at = datetime('now')
                    WHERE unit_id = ?
                    """,
                    [(translation, PREFILL_TRANSLATOR, unit_id) for translation, unit_id, _ in updates],
                )
                format_updated = len(updates)

        return {
            "entries": len(translations),
            "formats": len(formats),
            "updated": exact_updated + format_updated,
            "exact_updated": exact_updated,
            "format_updated": format_updated,
            "conflicts": conflicts,
            "overwrite": int(overwrite),
            "log_count": log_count,
            "log_rows": log_rows,
            "log_path": str(log_path) if log_path is not None else "",
        }
    finally:
        if log_handle is not None:
            log_handle.close()


def upsert_entity(conn: sqlite3.Connection, typ: str, entity_id: str, label: str, subtitle: str = "", meta: dict[str, Any] | None = None) -> None:
    compact_meta: dict[str, Any] = {}
    if isinstance(meta, dict):
        for key in ("order", "initialRarity", "assetId", "characterId", "cardId", "messageGroupId", "extraStoryPartId"):
            if key in meta:
                compact_meta[key] = meta[key]
    conn.execute(
        """
        INSERT INTO entities(entity_type, entity_id, label, subtitle, meta_json)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          label=excluded.label, subtitle=excluded.subtitle, meta_json=excluded.meta_json
        """,
        (typ, entity_id, label or entity_id, subtitle or "", json.dumps(compact_meta, ensure_ascii=False)),
    )


def add_link(conn: sqlite3.Connection, from_type: str, from_id: str, to_type: str, to_id: str, relation: str, meta: dict[str, Any] | None = None) -> None:
    if not from_id or not to_id:
        return
    conn.execute(
        """
        INSERT OR IGNORE INTO links(from_type, from_id, to_type, to_id, relation, meta_json)
        VALUES(?, ?, ?, ?, ?, ?)
        """,
        (from_type, from_id, to_type, to_id, relation, json.dumps(meta or {}, ensure_ascii=False)),
    )


def with_order(meta: dict[str, Any], order: int) -> dict[str, Any]:
    return {**meta, "order": order} if isinstance(meta, dict) else {"order": order}


def condition_wear_costume_ids(conditions: dict[str, dict[str, Any]], condition_id: str, seen: set[str] | None = None) -> set[str]:
    if not condition_id:
        return set()
    if seen is None:
        seen = set()
    if condition_id in seen:
        return set()
    seen.add(condition_id)

    row = conditions.get(condition_id)
    if not isinstance(row, dict):
        return set()

    costume_ids: set[str] = set()

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            wear = value.get("wearCostume")
            if isinstance(wear, dict) and wear.get("costumeId"):
                costume_ids.add(str(wear["costumeId"]))
            nested_condition_id = value.get("conditionId")
            if nested_condition_id:
                costume_ids.update(condition_wear_costume_ids(conditions, str(nested_condition_id), seen))
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(row)
    return costume_ids


def adv_filename(asset_id: Any) -> str:
    return f"adv_{asset_id}.txt"


def adv_filenames(asset_id: Any) -> list[str]:
    if not asset_id:
        return []
    exact = adv_filename(asset_id)
    if (ADV_DIR / exact).exists():
        return [exact]
    split = sorted(path.name for path in ADV_DIR.glob(f"adv_{asset_id}_*.txt") if re.search(r"_\d+\.txt$", path.name))
    return split


def add_adv_link(conn: sqlite3.Connection, from_type: str, from_id: str, asset_id: Any, relation: str, meta: dict[str, Any] | None = None) -> None:
    for filename in adv_filenames(asset_id):
        add_link(conn, from_type, from_id, "adv_file", filename, relation, meta)


def link_short_card_advs(conn: sqlite3.Connection) -> None:
    for path in ADV_DIR.glob("adv_card_*_short.txt"):
        short_name = path.name
        base_name = short_name.replace("_short.txt", ".txt")
        if not (ADV_DIR / base_name).exists():
            continue
        rows = conn.execute(
            """
            SELECT from_type, from_id, relation, meta_json
            FROM links
            WHERE to_type = 'adv_file' AND to_id = ?
            """,
            (base_name,),
        ).fetchall()
        for from_type, from_id, relation, meta_json in rows:
            meta = json.loads(meta_json or "{}")
            meta["baseAdvFile"] = base_name
            add_link(conn, from_type, from_id, "adv_file", short_name, f"{relation}_short", meta)


def iter_condition_ids(item: Any) -> Iterable[tuple[str, str]]:
    def walk(value: Any, path: str = "") -> Iterable[tuple[str, str]]:
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f"{path}.{key}" if path else key
                if "condition" in key.lower():
                    if isinstance(child, str) and child:
                        yield child_path, child
                    elif isinstance(child, list):
                        for nested in child:
                            if isinstance(nested, str) and nested:
                                yield child_path, nested
                yield from walk(child, child_path)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child, path)

    yield from walk(item)


def infer_scope(category: str, item: dict[str, Any]) -> tuple[str, str]:
    if category == "CardEvolutionMessage":
        return "card_evolution_message", pk_value(item, ["cardId", "evolutionLevel", "number"])
    if category == "HomeTalkCallPattern":
        return "call_pattern", pk_value(item, ["characterId", "patternId"])
    direct = {
        "CharacterGroup": "group",
        "MessageGroup": "message_group",
        "Story": "story",
        "StoryPart": "story_part",
        "EventStory": "story_collection",
        "ExtraStory": "story_collection",
        "Message": "message",
        "HomeTalk": "home_talk",
        "HomeTalkCallPattern": "call_pattern",
        "Telephone": "telephone",
        "Costume": "costume",
        "Skill": "skill",
        "SkillEfficacy": "skill_efficacy",
        "LiveAbility": "live_ability",
        "ActivityAbility": "activity_ability",
        "CardEvolutionMessage": "card_evolution_message",
        "ShowcaseToy": "showcase_toy",
        "ShowcaseToyCategory": "showcase_toy_category",
        "Accessory": "accessory",
        "Hair": "hair",
        "HomeAction": "home_action",
        "LoveHomeAction": "love_home_action",
        "CompanyEnjoyHomeAction": "company_enjoy_home_action",
        "ConditionDescription": "condition_description",
        "ExcursionPlace": "excursion_place",
        "ExtraStoryPart": "story_part",
    }
    if category in direct:
        entity_id = item.get("id") or item.get("homeTalkId") or item.get("homeActionId")
        if entity_id:
            return direct[category], str(entity_id)
    if category == "Character" and item.get("id"):
        return "character", str(item["id"])
    if category == "Card" and item.get("id"):
        return "card", str(item["id"])
    if item.get("cardId"):
        return "card", str(item["cardId"])
    if item.get("characterId"):
        return "character", str(item["characterId"])
    return "category", category


def iter_rule_paths(rule: dict[str, Any]) -> Iterable[tuple[list[str], str]]:
    for field in rule.get("fields", {}):
        yield [field], field
    for nested_name, nested_rule in rule.get("nested", {}).items():
        index_key = nested_rule.get("index_key", "index")
        for field in nested_rule.get("fields", {}):
            yield [nested_name, field], f"{nested_name}[{index_key}].{field}"


def extract_path(item: Any, path: list[str], label_path: str) -> Iterable[tuple[str, str]]:
    if not path:
        text = serialize_leaf(item)
        if text is not None:
            yield label_path, text
        return
    key, rest = path[0], path[1:]
    if isinstance(item, dict) and key in item:
        yield from extract_path(item[key], rest, label_path)
    elif isinstance(item, list):
        for idx, child in enumerate(item):
            if isinstance(child, dict) and key in child:
                ident = child.get("id") or child.get("messageDetailId") or child.get("voiceAssetId") or child.get("level") or child.get("index") or idx
                child_path = label_path.replace("[", f"[{ident};", 1) if "[" in label_path else label_path
                yield from extract_path(child[key], rest, child_path)


def translation_values(item: dict[str, Any], rule: dict[str, Any]) -> dict[str, str]:
    values: dict[str, str] = {}
    for parts, field_path in iter_rule_paths(rule):
        for actual_path, original in extract_path(item, parts, field_path):
            values[actual_path] = original
    return values


def duplicate_limited_story_ids() -> set[str]:
    path = MASTERDB_DIR / "Story.json"
    if not path.exists() or "Story" not in IPR_RULES:
        return set()
    stories = {str(row.get("id", "")): row for row in read_json(path) if isinstance(row, dict)}
    rule = IPR_RULES["Story"]
    duplicates: set[str] = set()
    for story_id, story in stories.items():
        if not story_id.endswith("-limited"):
            continue
        base_id = story_id.removesuffix("-limited")
        base = stories.get(base_id)
        if base is not None and translation_values(story, rule) == translation_values(base, rule):
            duplicates.add(story_id)
    return duplicates


def canonical_story_id(story_id: Any, duplicate_story_ids: set[str]) -> str:
    story_id = str(story_id or "")
    return story_id.removesuffix("-limited") if story_id in duplicate_story_ids else story_id


DETAIL_ID_RE = re.compile(r"details\[([^;\]]+);messageDetailId\]\.(.+)$")


def message_detail_for_path(item: dict[str, Any], actual_path: str) -> tuple[dict[str, Any] | None, str]:
    match = DETAIL_ID_RE.match(actual_path)
    if not match:
        return None, ""
    detail_id, field = match.groups()
    for detail in item.get("details", []) or []:
        if str(detail.get("messageDetailId", "")) == detail_id:
            return detail, field
    return None, field


def message_speaker(item: dict[str, Any], actual_path: str, character_names: dict[str, str]) -> str:
    detail, field = message_detail_for_path(item, actual_path)
    if not detail:
        return ""
    if field == "choiceText":
        return "__player_choice__"
    character_id = str(detail.get("characterId") or "")
    if character_id:
        return character_names.get(character_id) or character_id
    if field == "text" and detail.get("choiceText"):
        return "__player_text__"
    return ""


def skill_efficacy_ids(skill: dict[str, Any] | None) -> set[str]:
    ids: set[str] = set()
    if not skill:
        return ids
    for level in skill.get("levels", []) or []:
        for detail in level.get("skillDetails", []) or []:
            efficacy_id = detail.get("efficacyId")
            if efficacy_id:
                ids.add(str(efficacy_id))
    return ids


def level_skill_ids(ability: dict[str, Any] | None) -> set[str]:
    ids: set[str] = set()
    if not ability:
        return ids
    for level in ability.get("levels", []) or []:
        skill_id = level.get("skillId")
        if skill_id:
            ids.add(str(skill_id))
    return ids


def unit_upsert(
    conn: sqlite3.Connection,
    unit_id: str,
    source_type: str,
    category: str,
    source_file: str,
    record_id: str,
    field_path: str,
    original: str,
    *,
    line_no: int | None = None,
    speaker: str = "",
    scope_type: str = "category",
    scope_id: str = "",
    context: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO translation_units(
          unit_id, source_type, category, source_file, record_id, field_path, line_no,
          speaker, original_text, scope_type, scope_id, context_json, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(unit_id) DO UPDATE SET
          category=excluded.category,
          source_file=excluded.source_file,
          record_id=excluded.record_id,
          field_path=excluded.field_path,
          line_no=excluded.line_no,
          speaker=excluded.speaker,
          original_text=excluded.original_text,
          scope_type=excluded.scope_type,
          scope_id=excluded.scope_id,
          context_json=excluded.context_json
        """,
        (
            unit_id,
            source_type,
            category,
            source_file,
            record_id,
            field_path,
            line_no,
            speaker,
            original,
            scope_type,
            scope_id,
            json.dumps(context or {}, ensure_ascii=False),
            now(),
        ),
    )


def seed_entities_and_links(conn: sqlite3.Connection, duplicate_story_ids: set[str]) -> dict[str, dict[str, Any]]:
    cache: dict[str, dict[str, Any]] = {}
    for filename in MASTERDB_DIR.glob("*.json"):
        cache[filename.stem] = {cache_key(filename.stem, row): row for row in read_json(filename)}

    for row in cache.get("Character", {}).values():
        upsert_entity(conn, "character", row["id"], row.get("name", row["id"]), row.get("enName", ""), row)
        add_link(conn, "group", row.get("characterGroupId", ""), "character", row["id"], "member")

    for row in cache.get("CharacterGroup", {}).values():
        upsert_entity(conn, "group", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        for mapping in row.get("mappings", []) or []:
            add_link(conn, "group", row["id"], "character", mapping.get("characterId", ""), "member", mapping)

    for row in cache.get("MessageGroup", {}).values():
        upsert_entity(conn, "message_group", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        for character_id in row.get("characterIds", []) or []:
            add_link(conn, "character", character_id, "message_group", row["id"], "message_group")

    for row in cache.get("ConditionDescription", {}).values():
        condition_id = row.get("id", "")
        upsert_entity(conn, "condition_description", condition_id, row.get("description") or condition_id, "", row)

    for row in cache.get("ExcursionPlace", {}).values():
        place_id = row.get("id", "")
        upsert_entity(conn, "excursion_place", place_id, row.get("name", place_id), row.get("advAssetId", ""), row)

    for row in cache.get("ExcursionPlaceSetting", {}).values():
        add_link(conn, "character", row.get("characterId", ""), "excursion_place", row.get("excursionPlaceId", ""), "excursion_place", row)

    for row in cache.get("HomeTalkCallPattern", {}).values():
        entity_id = f"{row.get('characterId', '')}_{row.get('patternId', '')}"
        upsert_entity(conn, "call_pattern", entity_id, row.get("managerCallText") or row.get("characterArrivalText") or entity_id, row.get("characterId", ""), row)
        add_link(conn, "character", row.get("characterId", ""), "call_pattern", entity_id, "call_pattern")

    for row in cache.get("Card", {}).values():
        upsert_entity(conn, "card", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        add_link(conn, "character", row.get("characterId", ""), "card", row["id"], "has_card")
        for key in ("skillId1", "skillId2", "skillId3", "skillId4"):
            skill_id = row.get(key, "")
            add_link(conn, "card", row["id"], "skill", skill_id, key)
            for efficacy_id in skill_efficacy_ids(cache.get("Skill", {}).get(str(skill_id))):
                add_link(conn, "card", row["id"], "skill_efficacy", efficacy_id, f"{key}_efficacy")
        add_link(conn, "card", row["id"], "live_ability", row.get("liveAbilityId", ""), "liveAbilityId")
        add_link(conn, "card", row["id"], "activity_ability", row.get("activityAbilityId", ""), "activityAbilityId")
        for skill_id in level_skill_ids(cache.get("LiveAbility", {}).get(str(row.get("liveAbilityId", "")))):
            add_link(conn, "card", row["id"], "skill", skill_id, "liveAbilitySkill")
            for efficacy_id in skill_efficacy_ids(cache.get("Skill", {}).get(skill_id)):
                add_link(conn, "card", row["id"], "skill_efficacy", efficacy_id, "liveAbilitySkill_efficacy")
        add_link(conn, "card", row["id"], "costume", row.get("rewardCostumeId", ""), "reward_costume")
        for hair_id in [row.get("rewardHairId", ""), *(row.get("rewardHairIds", []) or [])]:
            add_link(conn, "card", row["id"], "hair", hair_id, "reward_hair")
        for index, story in enumerate(row.get("stories", []) or []):
            add_link(conn, "card", row["id"], "story", canonical_story_id(story.get("storyId", ""), duplicate_story_ids), "card_story", with_order(story, index))
        for index, message in enumerate(row.get("messages", []) or []):
            add_link(conn, "card", row["id"], "message", message.get("messageId", ""), "card_message", with_order(message, index))
            add_link(conn, "card", row["id"], "telephone", message.get("telephoneId", ""), "card_telephone", with_order(message, index))
        for index, home_talk in enumerate(row.get("homeTalks", []) or []):
            add_link(conn, "card", row["id"], "home_talk", home_talk.get("homeTalkId", ""), "card_home_talk", with_order(home_talk, index))

    message_threads: dict[str, list[dict[str, Any]]] = {}
    for row in cache.get("Message", {}).values():
        thread_id = message_thread_id(row.get("id", ""))
        if thread_id:
            message_threads.setdefault(thread_id, []).append(row)

    for thread_id, rows in message_threads.items():
        if len(rows) < 2:
            continue
        rows.sort(key=lambda item: item.get("id", ""))
        first = rows[0]
        label = strip_thread_suffix(first.get("name", "")) or thread_id
        group_id = first.get("messageGroupId", "")
        upsert_entity(conn, "message_thread", thread_id, label, group_id, {"id": thread_id, "messages": [row.get("id") for row in rows]})
        if group_id:
            add_link(conn, "message_group", group_id, "message_thread", thread_id, "message_thread")
            add_link(conn, "message_thread", thread_id, "message_group", group_id, "in_group")
        for character_id in sorted({row.get("characterId", "") for row in rows if row.get("characterId", "")}):
            add_link(conn, "character", character_id, "message_thread", thread_id, "message_thread")
        for card_id in sorted({row.get("cardId", "") for row in rows if row.get("cardId", "")}):
            add_link(conn, "card", card_id, "message_thread", thread_id, "message_thread")
        for row in rows:
            message_id = row.get("id", "")
            add_link(conn, "message_thread", thread_id, "message", message_id, "thread_message", row)
            add_link(conn, "message", message_id, "message_thread", thread_id, "in_thread", row)
            condition_id = row.get("unlockConditionId", "")
            if condition_id:
                add_link(conn, "message_thread", thread_id, "condition_description", condition_id, "message_condition", row)
            for detail in row.get("details", []) or []:
                telephone_id = detail.get("telephoneId", "")
                if telephone_id:
                    add_link(conn, "message_thread", thread_id, "telephone", telephone_id, "message_telephone", detail)

    for row in cache.get("ShowcaseToyCategory", {}).values():
        upsert_entity(conn, "showcase_toy_category", row["id"], row.get("name", row["id"]), "", row)

    for row in cache.get("ShowcaseToy", {}).values():
        toy_id = row.get("id", "")
        upsert_entity(conn, "showcase_toy", toy_id, row.get("name", toy_id), row.get("assetId", ""), row)
        add_link(conn, "showcase_toy_category", row.get("categoryId", ""), "showcase_toy", toy_id, "has_showcase_toy")
        if "_card-" in toy_id:
            card_id = toy_id.split("_", 1)[1]
            if card_id in cache.get("Card", {}):
                add_link(conn, "card", card_id, "showcase_toy", toy_id, "card_goods", row)
        for character_id in row.get("photoShootingCharacterIds", []) or []:
            add_link(conn, "character", character_id, "showcase_toy", toy_id, "character_goods", row)

    for typ, cat in (("story", "Story"), ("message", "Message"), ("home_talk", "HomeTalk"), ("telephone", "Telephone")):
        for row in cache.get(cat, {}).values():
            entity_id = str(row.get("id") or row.get("homeTalkId"))
            card_id = str(row.get("cardId") or "")
            if typ == "home_talk" and not card_id:
                inferred_card_id = card_id_from_home_talk_id(entity_id)
                if inferred_card_id in cache.get("Card", {}):
                    card_id = inferred_card_id
            upsert_entity(conn, typ, entity_id, row.get("name") or row.get("title") or entity_id, row.get("assetId", ""), row)
            add_link(conn, "character", row.get("characterId", ""), typ, entity_id, f"has_{typ}")
            add_link(conn, "card", card_id, typ, entity_id, f"has_{typ}")
            condition_id = row.get("unlockConditionId", "")
            if condition_id:
                add_link(conn, typ, entity_id, "condition_description", condition_id, "unlock_condition", row)
                add_link(conn, "character", row.get("characterId", ""), "condition_description", condition_id, f"{typ}_condition", row)
                add_link(conn, "card", card_id, "condition_description", condition_id, f"{typ}_condition", row)
            if typ in {"message", "telephone"}:
                add_link(conn, typ, entity_id, "message_group", row.get("messageGroupId", ""), "in_group")
                add_link(conn, "message_group", row.get("messageGroupId", ""), typ, entity_id, f"has_{typ}")
                if condition_id:
                    add_link(conn, "message_group", row.get("messageGroupId", ""), "condition_description", condition_id, f"{typ}_condition", row)
            if typ == "message":
                for detail in row.get("details", []) or []:
                    telephone_id = detail.get("telephoneId", "")
                    if telephone_id:
                        add_link(conn, "message", entity_id, "telephone", telephone_id, "message_telephone", detail)
            if typ == "home_talk":
                call_pattern_id = row.get("callPatternId", "")
                if call_pattern_id:
                    call_pattern_entity_id = f"{row.get('characterId', '')}_{call_pattern_id}"
                    add_link(conn, "home_talk", entity_id, "call_pattern", call_pattern_entity_id, "call_pattern", row)
                    add_link(conn, "card", card_id, "call_pattern", call_pattern_entity_id, "card_call_pattern", row)

    for row in cache.get("Skill", {}).values():
        upsert_entity(conn, "skill", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        for efficacy_id in skill_efficacy_ids(row):
            add_link(conn, "skill", row["id"], "skill_efficacy", efficacy_id, "skill_efficacy")

    for typ, cat in (("live_ability", "LiveAbility"), ("activity_ability", "ActivityAbility"), ("skill_efficacy", "SkillEfficacy")):
        for row in cache.get(cat, {}).values():
            upsert_entity(conn, typ, row["id"], row.get("name", row["id"]), row.get("description", ""), row)
            if typ in {"live_ability", "activity_ability"}:
                for skill_id in level_skill_ids(row):
                    add_link(conn, typ, row["id"], "skill", skill_id, "level_skill")

    for row in cache.get("Costume", {}).values():
        upsert_entity(conn, "costume", row["id"], row.get("name", row["id"]), row.get("bodyAssetId", ""), row)
        add_link(conn, "character", row.get("characterId", ""), "costume", row["id"], "has_costume")
        add_link(conn, "costume", row["id"], "hair", row.get("defaultHairId", ""), "default_hair", row)

    for row in cache.get("Hair", {}).values():
        upsert_entity(conn, "hair", row["id"], row.get("name", row["id"]), row.get("hairAssetId", ""), row)
        add_link(conn, "character", row.get("characterId", ""), "hair", row["id"], "has_hair")
        add_link(conn, "costume", row.get("fittingCostumeId", ""), "hair", row["id"], "fitting_hair")
        for costume_id in row.get("wearableCostumeIds", []) or []:
            add_link(conn, "hair", row["id"], "costume", costume_id, "wearable_costume", row)
        for costume_id in row.get("notWearableCostumeIds", []) or []:
            add_link(conn, "hair", row["id"], "costume", costume_id, "not_wearable_costume", row)

    for row in cache.get("Accessory", {}).values():
        upsert_entity(conn, "accessory", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        add_link(conn, "character", row.get("characterId", ""), "accessory", row["id"], "has_accessory")
        add_link(conn, "group", row.get("characterGroupId", ""), "accessory", row["id"], "has_accessory")

    for entity_type, category, id_key, relation in (
        ("home_action", "HomeAction", "homeActionId", "home_action"),
        ("love_home_action", "LoveHomeAction", "id", "love_home_action"),
        ("company_enjoy_home_action", "CompanyEnjoyHomeAction", "id", "company_enjoy_home_action"),
    ):
        for row in cache.get(category, {}).values():
            entity_id = str(row.get(id_key) or row.get("id"))
            upsert_entity(conn, entity_type, entity_id, row.get("text", entity_id), row.get("voiceAssetId", ""), row)
            add_link(conn, "character", row.get("characterId", ""), entity_type, entity_id, relation)
            add_link(conn, "costume", row.get("costumeId", ""), entity_type, entity_id, "costume_home_action")
            for costume_id in sorted(condition_wear_costume_ids(cache.get("Condition", {}), str(row.get("conditionId", "")))):
                add_link(conn, "costume", costume_id, entity_type, entity_id, "condition_costume_home_action", row)

    for row in cache.get("CardEvolutionMessage", {}).values():
        entity_id = f"{row.get('cardId', '')}_{row.get('evolutionLevel', '')}_{row.get('number', '')}"
        upsert_entity(conn, "card_evolution_message", entity_id, row.get("evolveMessage", entity_id), row.get("cardId", ""), row)
        add_link(conn, "card", row.get("cardId", ""), "card_evolution_message", entity_id, "evolution_message", row)
        add_link(conn, "card", row.get("cardId", ""), "character", row.get("characterId", ""), "evolution_voice")

    for row in cache.get("Story", {}).values():
        story_id = canonical_story_id(row["id"], duplicate_story_ids)
        for asset in row.get("advAssetIds", []) or []:
            add_adv_link(conn, "story", story_id, asset, "uses_adv")
        for choice in row.get("branchChoices", []) or []:
            add_adv_link(conn, "story", story_id, choice.get("advAssetId"), "choice_adv", choice)

    for row in cache.get("ExtraStoryPart", {}).values():
        upsert_entity(conn, "story_part", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        for index, story_id in enumerate(row.get("extraStoryIds", []) or []):
            add_link(conn, "story_part", row["id"], "story_collection", story_id, "contains", {"order": index})

    for cat in ("EventStory", "ExtraStory"):
        for row in cache.get(cat, {}).values():
            if cat == "EventStory":
                upsert_entity(conn, "story_collection", row["id"], row.get("description") or row.get("name", row["id"]), row.get("name", ""), row)
            else:
                upsert_entity(conn, "story_collection", row["id"], row.get("name", row["id"]), row.get("description", ""), row)
            add_link(conn, "story_part", row.get("extraStoryPartId", ""), "story_collection", row["id"], "contains")
            for index, episode in enumerate(row.get("episodes", []) or []):
                add_link(conn, "story_collection", row["id"], "story", canonical_story_id(episode.get("storyId", ""), duplicate_story_ids), "episode", with_order(episode, index))

    for row in cache.get("StoryPart", {}).values():
        upsert_entity(conn, "story_part", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        episode_order = 0
        for chapter in row.get("chapters", []) or []:
            for episode in chapter.get("episodes", []) or []:
                story_id = canonical_story_id(episode.get("storyId", ""), duplicate_story_ids)
                add_link(conn, "story_part", row["id"], "story", story_id, "chapter_episode", with_order(episode, episode_order))
                if episode.get("assetId") in (cache.get("Story", {}).get(episode.get("storyId", ""), {}).get("advAssetIds", []) or []):
                    add_adv_link(conn, "story_part", row["id"], episode.get("assetId"), "chapter_adv", with_order(episode, episode_order))
                episode_order += 1

    for row in cache.get("Character", {}).values():
        for story in row.get("companyEnjoyStories", []) or []:
            add_link(conn, "character", row["id"], "story", canonical_story_id(story.get("storyId", ""), duplicate_story_ids), "company_enjoy_story", story)
            add_adv_link(conn, "character", row["id"], story.get("assetId"), "company_enjoy_adv", story)

    for row in cache.get("LoveStoryEpisode", {}).values():
        upsert_entity(conn, "love", row.get("loveId", ""), row.get("loveId", ""), "", row)
        add_link(conn, "love", row.get("loveId", ""), "story", canonical_story_id(row.get("storyId", ""), duplicate_story_ids), "episode", row)
        add_adv_link(conn, "love", row.get("loveId", ""), row.get("assetId"), "episode_adv", row)

    for row in cache.get("Setting", {}).values():
        upsert_entity(conn, "setting", row.get("id", "1"), row.get("tutorialAdvTitle") or row.get("id", "1"), row.get("tutorialAdvSubTitle", ""), row)
        add_adv_link(conn, "setting", row.get("id", "1"), row.get("tutorialAdvAssetId"), "tutorial_adv", row)

    for category, rows in cache.items():
        if category not in IPR_RULES:
            continue
        for row in rows.values():
            scope_type, scope_id = infer_scope(category, row)
            if scope_type == "condition_description":
                continue
            for path, condition_id in iter_condition_ids(row):
                add_link(conn, scope_type, scope_id, "condition_description", condition_id, "condition", {"category": category, "path": path})

    link_short_card_advs(conn)

    return cache


def import_masterdb(conn: sqlite3.Connection, duplicate_story_ids: set[str]) -> None:
    character_names = {str(row.get("id", "")): str(row.get("name") or row.get("id") or "") for row in read_json(MASTERDB_DIR / "Character.json")}
    for category, rule in IPR_RULES.items():
        path = MASTERDB_DIR / f"{category}.json"
        if not path.exists():
            continue
        pk_fields = rule.get("pk", ["id"])
        for item in read_json(path):
            if not isinstance(item, dict):
                continue
            record = pk_value(item, pk_fields)
            if category == "Story" and record in duplicate_story_ids:
                continue
            scope_type, scope_id = infer_scope(category, item)
            for parts, field_path in iter_rule_paths(rule):
                for actual_path, original in extract_path(item, parts, field_path):
                    unit_id = f"masterdb:{category}:{record}:{actual_path}"
                    unit_upsert(
                        conn,
                        unit_id,
                        "masterdb",
                        category,
                        path.name,
                        record,
                        actual_path,
                        original,
                        speaker=message_speaker(item, actual_path, character_names) if category == "Message" else "",
                        scope_type=scope_type,
                        scope_id=scope_id,
                        context={"pk": {key: item.get(key) for key in pk_fields}},
                    )


def read_localization(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return {str(key): str(value) for key, value in data.items() if isinstance(value, str)}


def import_localization(conn: sqlite3.Connection) -> int:
    imported = 0
    for key, original in read_localization(LOCALIZATION_PATH).items():
        unit_upsert(
            conn,
            f"localization:{key}",
            "localization",
            "Localization",
            LOCALIZATION_PATH.name,
            key,
            "value",
            original,
            scope_type="category",
            scope_id="Localization",
            context={"key": key},
        )
        imported += 1
    return imported


def seed_localization_translations(conn: sqlite3.Connection) -> int:
    translations = read_localization(LOCALIZATION_TRANSLATION_PATH)
    updates = [
        (translation, PREFILL_TRANSLATOR, f"localization:{key}")
        for key, translation in translations.items()
        if translation
    ]
    if not updates:
        return 0
    cursor = conn.executemany(
        """
        UPDATE translation_units
        SET translation_text = ?,
            status = 'prefilled',
            translator_name = ?,
            updated_at = datetime('now')
        WHERE unit_id = ?
          AND translation_text = ''
        """,
        updates,
    )
    return cursor.rowcount


TAG_RE = re.compile(r"^\[(?P<tag>[a-zA-Z0-9_]+)\s*(?P<body>.*)\]$")
ATTR_RE = re.compile(r"(?P<key>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\]?$)")


def parse_attrs(body: str) -> dict[str, str]:
    return {m.group("key"): m.group("value").strip() for m in ATTR_RE.finditer(body)}


def adv_category(filename: str) -> str:
    stem = filename.removeprefix("adv_").removesuffix(".txt")
    return stem.split("_", 1)[0] if "_" in stem else stem


def adv_scope(filename: str) -> tuple[str, str]:
    stem = filename.removeprefix("adv_").removesuffix(".txt")
    parts = stem.split("_")
    if parts[0] == "bond" and len(parts) >= 2:
        return "character", "char-" + parts[1]
    if parts[0] == "hbd" and len(parts) >= 3:
        return "character", "char-" + parts[2]
    if parts[0] == "userhbd" and len(parts) >= 3:
        return "character", "char-" + parts[2]
    if parts[0] == "event" and len(parts) >= 4 and parts[1] == "cmn":
        return "character", "char-" + parts[2]
    if parts[0] == "event" and len(parts) >= 4 and re.fullmatch(r"\d{4}", parts[1]) and parts[2] == "02" and re.fullmatch(r"[a-z]{2,3}", parts[3]):
        return "character", "char-" + parts[3]
    return "adv_file", filename


def adv_name_unit_id(filename: str, name: str) -> str:
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12]
    return f"adv:{filename}:name:{digest}"


def import_adv(conn: sqlite3.Connection) -> None:
    for path in sorted(ADV_DIR.glob("adv_*.txt")):
        category = f"adv/{adv_category(path.name)}"
        scope_type, scope_id = adv_scope(path.name)
        upsert_entity(conn, "adv_file", path.name, path.name, category)
        if path.name.startswith("adv_card_") and path.name.endswith("_short.txt"):
            continue
        if scope_type != "adv_file":
            add_link(conn, scope_type, scope_id, "adv_file", path.name, "has_adv")

        order = 0
        seen_names: set[str] = set()
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            match = TAG_RE.match(line)
            if not match:
                continue
            tag = match.group("tag")
            attrs = parse_attrs(match.group("body"))
            name = attrs.get("name", "")
            if tag in {"message", "narration"} and name and name not in seen_names and not should_ignore(name):
                seen_names.add(name)
                unit_upsert(
                    conn,
                    adv_name_unit_id(path.name, name),
                    "adv",
                    category,
                    path.name,
                    path.stem,
                    "name",
                    name,
                    line_no=line_no,
                    speaker=name,
                    scope_type=scope_type,
                    scope_id=scope_id,
                    context={"tag": tag, "nameSource": "speaker"},
                )
            candidates: list[tuple[str, str, str]] = []
            if tag in {"message", "narration"} and attrs.get("text"):
                candidates.append(("text", attrs["text"], attrs.get("name", "__narration__")))
            elif tag == "title" and attrs.get("title"):
                candidates.append(("title", attrs["title"], "__title__"))
            elif tag == "choicegroup":
                for idx, text_match in enumerate(re.finditer(r"(?<![A-Za-z])text=(.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\])", match.group("body"))):
                    candidates.append((f"choice[{idx}].text", text_match.group(1), ""))
            for field, original, speaker in candidates:
                if should_ignore(original):
                    continue
                order += 1
                unit_id = f"adv:{path.name}:{order}:{field}"
                unit_upsert(
                    conn,
                    unit_id,
                    "adv",
                    category,
                    path.name,
                    path.stem,
                    field,
                    original,
                    line_no=line_no,
                    speaker=speaker,
                    scope_type=scope_type,
                    scope_id=scope_id,
                    context={"tag": tag, "order": order},
                )


def rebuild(
    db_path: Path,
    *,
    overwrite_prefill: bool = False,
    prefill_log_limit: int = 50,
    prefill_log_path: Path | None = None,
) -> dict[str, Any]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        duplicate_story_ids = duplicate_limited_story_ids()
        had_localization_units = has_existing_localization_units(conn)
        had_existing_units = preserve_existing_unit_inventory(conn)
        preserve_existing_translations(conn)
        conn.executescript(
            """
            PRAGMA busy_timeout=5000;
            DROP TABLE IF EXISTS translation_units;
            DROP TABLE IF EXISTS links;
            DROP TABLE IF EXISTS entities;
            """
        )
        ensure_schema(conn)
        seed_entities_and_links(conn, duplicate_story_ids)
        import_masterdb(conn, duplicate_story_ids)
        import_adv(conn)
        localization_imported = import_localization(conn)
        restore_existing_translations(conn, duplicate_story_ids)
        localization_seeded = 0 if had_localization_units else seed_localization_translations(conn)
        prefill_stats = prefill_translations(
            conn,
            overwrite=overwrite_prefill,
            log_limit=prefill_log_limit,
            log_path=prefill_log_path,
        )
        auto_skill_stats = AUTO_SKILL_MODULE.prefill_missing_skills(conn)
        prefill_stats["auto_skill"] = auto_skill_stats
        prefill_stats["new_untranslated"] = track_new_untranslated_units(conn, had_existing_units)
        prefill_stats["localization_imported"] = localization_imported
        prefill_stats["localization_seeded"] = localization_seeded
        conn.commit()
        return prefill_stats
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Hoshimi translation SQLite database.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument(
        "--overwrite-prefill",
        action="store_true",
        help="Overwrite existing translations when they match scripts/prefill_translations.json.",
    )
    parser.add_argument(
        "--prefill-log-limit",
        type=int,
        default=50,
        help="Number of prefill changes to print. Use 0 to print all.",
    )
    parser.add_argument(
        "--prefill-log",
        type=Path,
        default=None,
        help="Write all prefill changes to a TSV file.",
    )
    args = parser.parse_args()
    prefill_stats = rebuild(
        args.db,
        overwrite_prefill=args.overwrite_prefill,
        prefill_log_limit=max(0, args.prefill_log_limit),
        prefill_log_path=args.prefill_log,
    )
    conn = sqlite3.connect(args.db)
    try:
        units = conn.execute("SELECT COUNT(*) FROM translation_units").fetchone()[0]
        entities = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
        links = conn.execute("SELECT COUNT(*) FROM links").fetchone()[0]
        print(f"Built {args.db}")
        print(f"translation_units={units} entities={entities} links={links}")
        print(
            "prefill_translations="
            f"{prefill_stats['updated']} entries={prefill_stats['entries']} formats={prefill_stats['formats']} "
            f"exact={prefill_stats['exact_updated']} format={prefill_stats['format_updated']} "
            f"conflicts={prefill_stats['conflicts']} overwrite={prefill_stats['overwrite']}"
        )
        print(
            f"localization_units={prefill_stats['localization_imported']} "
            f"seeded={prefill_stats['localization_seeded']}"
        )
        auto_skill = prefill_stats["auto_skill"]
        print(
            "auto_skill_translations="
            f"{auto_skill['applied']} candidates={auto_skill['candidates']} "
            f"blocked={auto_skill['blocked']} safe={auto_skill['safe']} review={auto_skill['review']}"
        )
        for item in auto_skill["changes"][:50]:
            original_text = item.original.replace("\n", "\\n")
            new_text = item.new.replace("\n", "\\n")
            print(
                "auto_skill_change "
                f"confidence={item.confidence} unit_id={item.unit_id} "
                f"original={original_text} new={new_text}"
            )
        if len(auto_skill["changes"]) > 50:
            print(f"auto_skill_change ... plus={len(auto_skill['changes']) - 50}")
        new_untranslated = prefill_stats["new_untranslated"]
        print(
            "new_untranslated="
            f"{new_untranslated['total']} added={new_untranslated['added']}"
        )
        if prefill_stats["log_path"]:
            print(f"prefill_log={prefill_stats['log_path']}")
        if prefill_stats["log_count"]:
            shown = len(prefill_stats["log_rows"])
            total = prefill_stats["log_count"]
            print(f"prefill_changes showing={shown} total={total}")
            for row in prefill_stats["log_rows"]:
                old_text = row["old_translation"].replace("\n", "\\n") or "<empty>"
                original_text = row["original_text"].replace("\n", "\\n")
                new_text = row["new_translation"].replace("\n", "\\n")
                print(
                    "prefill_change "
                    f"mode={row['mode']} unit_id={row['unit_id']} "
                    f"old={old_text} original={original_text} new={new_text}"
                )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
