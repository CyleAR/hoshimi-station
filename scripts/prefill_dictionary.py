from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import uuid
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__:
    from .gacha_dictionary import find_gacha_reuse
    from .prefill_templates import DICTIONARY_NAME_RE, RESERVED_NAMES, _translation_pairs, _unique_object, normalize_text
else:
    from gacha_dictionary import find_gacha_reuse
    from prefill_templates import DICTIONARY_NAME_RE, RESERVED_NAMES, _translation_pairs, _unique_object, normalize_text

ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
    "card": {"label": "카드명", "category": "Card"},
    "gacha": {"label": "가차명", "category": "Gacha"},
    "music": {"label": "노래", "category": "Music"},
    "costume": {"label": "의상", "category": "Costume"},
    "hair": {"label": "헤어", "category": "Hair"},
    "item": {"label": "아이템", "category": "Item"},
    "accessory": {"label": "액세서리", "category": "Accessory"},
    "pose": {"label": "포즈", "category": "PhotoPose"},
}
STATES = ("new", "changed", "conflict", "review", "unchanged", "missing")
# Kana and Han, excluding shared punctuation such as the middle dot and long dash.
JAPANESE_RE = re.compile(r"[\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fd-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff]")


class DictionaryError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def read_dictionary(path: Path) -> tuple[bytes, dict[str, Any], dict[str, dict[str, str]]]:
    raw = path.read_bytes()
    try:
        data = json.loads(raw, object_pairs_hook=_unique_object)
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
        normalized = {}
        for name, values in data.items():
            if name == "_batchim":
                if not isinstance(values, dict) or any(not key.strip() or type(flag) is not bool for key, flag in values.items()):
                    raise ValueError("invalid _batchim")
            else:
                if not DICTIONARY_NAME_RE.fullmatch(name) or name in RESERVED_NAMES:
                    raise ValueError(f"invalid dictionary name: {name}")
                normalized[name] = _translation_pairs(values, name)
    except (ValueError, UnicodeError) as error:
        raise DictionaryError(f"사전 JSON을 확인해 주세요: {error}", 422) from error
    return raw, data, normalized


def selected_groups(value: Any) -> list[str]:
    if not isinstance(value, list) or not value or any(not isinstance(group, str) or group not in GROUPS for group in value):
        raise DictionaryError("사전 분류를 선택해 주세요.")
    return list(dict.fromkeys(value))


def entry_id(group: str, original: str, translation: str) -> str:
    return hashlib.sha256(json.dumps([group, original, translation], ensure_ascii=False).encode("utf-8")).hexdigest()


def preview(db_path: Path, dictionary_path: Path, groups: list[str]) -> dict[str, Any]:
    raw, _, dictionaries = read_dictionary(dictionary_path)
    placeholders = ",".join("?" for _ in groups)
    categories = [GROUPS[group]["category"] for group in groups]
    by_category = {GROUPS[group]["category"]: group for group in groups}
    terms: dict[tuple[str, str], dict[str, Any]] = {}
    gacha_reuse = {}
    conn = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=5)
    try:
        conn.execute("PRAGMA query_only=ON")
        for unit, category, original, translated, record, author, scope_type, scope_id, revision in conn.execute(
            f"""SELECT unit_id, category, original_text, translation_text, record_id, translator_name, scope_type, scope_id, revision
            FROM translation_units WHERE source_type='masterdb' AND field_path='name'
            AND category IN ({placeholders}) ORDER BY category, original_text, unit_id""", categories
        ):
            if not isinstance(original, str) or not original.strip():
                continue
            original, translated = normalize_text(original), normalize_text(translated or "")
            group = by_category[category]
            term = terms.setdefault((group, original), {"variants": defaultdict(lambda: {"count": 0, "authors": set()}), "records": [], "source_count": 0, "blank_count": 0, "units": []})
            term["source_count"] += 1
            term["units"].append({"unit_id": unit, "record_id": record,
                                  "scope_type": scope_type or "category", "scope_id": scope_id or category,
                                  "translation_text": translated, "revision": revision})
            if len(term["records"]) < 3:
                term["records"].append(record)
            if translated.strip():
                variant = term["variants"][translated]
                variant["count"] += 1
                if author:
                    variant["authors"].add(author)
            else:
                term["blank_count"] += 1
        if "gacha" in groups:
            item_rows = [(record, field, normalize_text(text or "")) for record, field, text in conn.execute(
                "SELECT record_id, field_path, original_text FROM translation_units "
                "WHERE source_type='masterdb' AND category='Item' AND field_path IN ('name', 'description')"
            )]
            gacha_reuse = find_gacha_reuse([text for group, text in terms if group == "gacha"], item_rows)
    finally:
        conn.close()

    items = []
    counts = {state: 0 for state in STATES}
    group_counts = {group: {state: 0 for state in STATES} for group in groups}
    for (group, original), term in sorted(terms.items()):
        if group == "gacha" and original not in gacha_reuse:
            continue
        variants = [{"text": text, "count": value["count"], "authors": sorted(value["authors"])} for text, value in sorted(term["variants"].items())]
        existing = dictionaries.get(group, {}).get(original)
        translation = variants[0]["text"] if len(variants) == 1 else None
        if not variants:
            state = "missing"
        elif len(variants) > 1:
            state = "conflict"
        elif existing is not None:
            state = "unchanged" if existing == translation else "changed"
        elif JAPANESE_RE.search(translation):
            state = "review"
        elif group == "gacha" and not gacha_reuse[original]["exact"]:
            state = "review"
        else:
            state = "new"
        shared = [{"group": name, "translation": entries[original]} for name, entries in dictionaries.items()
                  if name != group and original in entries and entries[original] != translation]
        items.append({"id": entry_id(group, original, translation or ""), "group": group,
                      "original": original, "existing": existing, "translation": translation,
                      "variants": variants, "state": state, "source_count": term["source_count"],
                      "blank_count": term["blank_count"], "records": term["records"],
                      "units": term["units"],
                      "gacha_reuse": gacha_reuse.get(original) if group == "gacha" else None,
                      "shared_differences": shared, "has_japanese": bool(translation and JAPANESE_RE.search(translation))})
        counts[state] += 1
        group_counts[group][state] += 1
    return {"ok": True, "dictionary_hash": hashlib.sha256(raw).hexdigest(),
            "groups": [{"key": group, **GROUPS[group]} for group in groups],
            "counts": counts, "group_counts": group_counts, "items": items}


@contextmanager
def dictionary_lock(path: Path):
    lock = path.with_name(path.name + ".lock")
    # Keep the lock file in place; OS locks release even if a worker is killed.
    with lock.open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            if lock.stat().st_size == 0:
                handle.write(b"\0")
                handle.flush()
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                raise DictionaryError("다른 사전 저장 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409) from error
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise DictionaryError("다른 사전 저장 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.", 409) from error
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def apply(db_path: Path, dictionary_path: Path, backup_dir: Path, request: dict[str, Any]) -> dict[str, Any]:
    groups = selected_groups(request.get("groups"))
    ids = request.get("ids")
    if not isinstance(ids, list) or not ids or len(ids) > 4096 or any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value) for value in ids):
        raise DictionaryError("추가할 항목을 선택해 주세요.")
    version = request.get("dictionary_hash")
    with dictionary_lock(dictionary_path):
        raw, data, _ = read_dictionary(dictionary_path)
        if hashlib.sha256(raw).hexdigest() != version:
            raise DictionaryError("미리보기 이후 사전이 변경됐습니다. 다시 조회해 주세요.", 409)
        latest = preview(db_path, dictionary_path, groups)
        allow_updates = request.get("allow_updates") is True
        candidates = {item["id"]: item for item in latest["items"] if item["state"] == "new" or (
            allow_updates and item["state"] == "changed" and not item["has_japanese"]
            and (not item["gacha_reuse"] or item["gacha_reuse"]["exact"]))}
        chosen = list(dict.fromkeys(ids))
        additions = [candidates[value] for value in chosen if value in candidates]
        if not additions:
            raise DictionaryError("선택 항목의 DB 번역이 변경됐거나 추가할 수 없는 항목입니다. 다시 조회해 주세요.", 409)
        for item in additions:
            data.setdefault(item["group"], {})[item["original"]] = item["translation"]
        output = (json.dumps(data, ensure_ascii=False, indent=4) + "\n").encode("utf-8")
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}.json"
        with backup.open("xb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(dir=dictionary_path.parent, prefix=".prefill-dictionary-", suffix=".tmp", delete=False) as handle:
                temp_path = Path(handle.name)
                handle.write(output)
                handle.flush()
                os.fsync(handle.fileno())
            read_dictionary(temp_path)
            os.chmod(temp_path, dictionary_path.stat().st_mode & 0o777)
            if dictionary_path.read_bytes() != raw:
                raise DictionaryError("저장 중 사전이 변경됐습니다. 다시 조회해 주세요.", 409)
            os.replace(temp_path, dictionary_path)
        finally:
            if temp_path is not None and temp_path.exists():
                temp_path.unlink()
    return {"ok": True, "added": sum(item["state"] == "new" for item in additions),
            "updated": sum(item["state"] == "changed" for item in additions),
            "skipped": len(chosen) - len(additions), "backup": backup.name,
            "added_items": [{"group": item["group"], "original": item["original"], "translation": item["translation"]} for item in additions],
            "dictionary_hash": hashlib.sha256(output).hexdigest()}


def execute(db_path: Path, dictionary_path: Path, backup_dir: Path, request: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(request, dict):
        raise DictionaryError("잘못된 요청입니다.")
    action = request.get("action", "preview")
    if action == "download":
        raw, _, _ = read_dictionary(dictionary_path)
        return {"ok": True, "content": raw.decode("utf-8-sig")}
    if action == "preview":
        return preview(db_path, dictionary_path, selected_groups(request.get("groups")))
    if action == "apply":
        return apply(db_path, dictionary_path, backup_dir, request)
    raise DictionaryError("지원하지 않는 사전 작업입니다.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview and merge DB names into the prefill dictionary.")
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "hoshimi.sqlite3")
    parser.add_argument("--dictionary", type=Path, default=ROOT / "docs" / "prefill_dictionary.json")
    parser.add_argument("--backups", type=Path, default=ROOT / "backups" / "prefill-dictionary")
    args = parser.parse_args()
    try:
        result = execute(args.db, args.dictionary, args.backups, json.load(sys.stdin))
    except DictionaryError as error:
        result = {"ok": False, "error": str(error), "status": error.status}
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"prefill dictionary: {type(error).__name__}: {error}", file=sys.stderr)
        result = {"ok": False, "error": "사전 파일·DB 접근 또는 저장에 실패했습니다. 서버 로그와 파일 권한을 확인해 주세요.", "status": 500}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    main()
