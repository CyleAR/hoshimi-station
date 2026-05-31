from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
MASTERDB_DIR = ROOT / "res" / "masterdb"
ADV_DIR = ROOT / "res" / "adv" / "resource"
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"


def load_ipr_rules() -> tuple[dict[str, Any], list[re.Pattern[str]]]:
    path = ROOT / "note-scripts" / "ipr_rules.py"
    spec = importlib.util.spec_from_file_location("ipr_rules", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.IPR_RULES, module.IPR_IGNORE_PATTERNS


IPR_RULES, IPR_IGNORE_PATTERNS = load_ipr_rules()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("data", data) if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else []


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
        CREATE INDEX IF NOT EXISTS idx_units_category ON translation_units(category);
        CREATE INDEX IF NOT EXISTS idx_units_scope ON translation_units(scope_type, scope_id);
        CREATE INDEX IF NOT EXISTS idx_units_source ON translation_units(source_type, source_file);
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


def restore_existing_translations(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT 1 FROM sqlite_temp_master WHERE type = 'table' AND name = 'saved_translations'",
    ).fetchone()
    if row is None:
        return
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


def seed_entities_and_links(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
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
        for story in row.get("stories", []) or []:
            add_link(conn, "card", row["id"], "story", story.get("storyId", ""), "card_story", story)
        for message in row.get("messages", []) or []:
            add_link(conn, "card", row["id"], "message", message.get("messageId", ""), "card_message", message)
            add_link(conn, "card", row["id"], "telephone", message.get("telephoneId", ""), "card_telephone", message)
        for home_talk in row.get("homeTalks", []) or []:
            add_link(conn, "card", row["id"], "home_talk", home_talk.get("homeTalkId", ""), "card_home_talk", home_talk)

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
                    add_link(conn, "home_talk", entity_id, "call_pattern", f"{row.get('characterId', '')}_{call_pattern_id}", "call_pattern", row)

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

    for row in cache.get("CardEvolutionMessage", {}).values():
        entity_id = f"{row.get('cardId', '')}_{row.get('evolutionLevel', '')}_{row.get('number', '')}"
        upsert_entity(conn, "card_evolution_message", entity_id, row.get("evolveMessage", entity_id), row.get("cardId", ""), row)
        add_link(conn, "card", row.get("cardId", ""), "card_evolution_message", entity_id, "evolution_message", row)
        add_link(conn, "card", row.get("cardId", ""), "character", row.get("characterId", ""), "evolution_voice")

    for row in cache.get("Story", {}).values():
        for asset in row.get("advAssetIds", []) or []:
            add_adv_link(conn, "story", row["id"], asset, "uses_adv")
        for choice in row.get("branchChoices", []) or []:
            add_adv_link(conn, "story", row["id"], choice.get("advAssetId"), "choice_adv", choice)

    for row in cache.get("ExtraStoryPart", {}).values():
        upsert_entity(conn, "story_part", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        for story_id in row.get("extraStoryIds", []) or []:
            add_link(conn, "story_part", row["id"], "story_collection", story_id, "contains")

    for cat in ("EventStory", "ExtraStory"):
        for row in cache.get(cat, {}).values():
            upsert_entity(conn, "story_collection", row["id"], row.get("name", row["id"]), row.get("description", ""), row)
            add_link(conn, "story_part", row.get("extraStoryPartId", ""), "story_collection", row["id"], "contains")
            for episode in row.get("episodes", []) or []:
                add_link(conn, "story_collection", row["id"], "story", episode.get("storyId", ""), "episode", episode)

    for row in cache.get("StoryPart", {}).values():
        upsert_entity(conn, "story_part", row["id"], row.get("name", row["id"]), row.get("assetId", ""), row)
        for chapter in row.get("chapters", []) or []:
            for episode in chapter.get("episodes", []) or []:
                add_link(conn, "story_part", row["id"], "story", episode.get("storyId", ""), "chapter_episode", episode)
                if episode.get("assetId") in (cache.get("Story", {}).get(episode.get("storyId", ""), {}).get("advAssetIds", []) or []):
                    add_adv_link(conn, "story_part", row["id"], episode.get("assetId"), "chapter_adv", episode)

    for row in cache.get("Character", {}).values():
        for story in row.get("companyEnjoyStories", []) or []:
            add_link(conn, "character", row["id"], "story", story.get("storyId", ""), "company_enjoy_story", story)
            add_adv_link(conn, "character", row["id"], story.get("assetId"), "company_enjoy_adv", story)

    for row in cache.get("LoveStoryEpisode", {}).values():
        upsert_entity(conn, "love", row.get("loveId", ""), row.get("loveId", ""), "", row)
        add_link(conn, "love", row.get("loveId", ""), "story", row.get("storyId", ""), "episode", row)
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


def import_masterdb(conn: sqlite3.Connection) -> None:
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


def rebuild(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
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
        seed_entities_and_links(conn)
        import_masterdb(conn)
        import_adv(conn)
        restore_existing_translations(conn)
        conn.commit()
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Hoshimi translation SQLite database.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    args = parser.parse_args()
    rebuild(args.db)
    conn = sqlite3.connect(args.db)
    try:
        units = conn.execute("SELECT COUNT(*) FROM translation_units").fetchone()[0]
        entities = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
        links = conn.execute("SELECT COUNT(*) FROM links").fetchone()[0]
        print(f"Built {args.db}")
        print(f"translation_units={units} entities={entities} links={links}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
