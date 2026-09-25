from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
MASTERDB_DIR = ROOT / "res" / "masterdb"
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"
REPORT_PATH = ROOT / "tmp" / "reports" / "auto_translate_skills_report.md"
AUDIT_REPORT_PATH = ROOT / "tmp" / "reports" / "auto_translate_skills_audit_report.md"
REPORT_CANDIDATE_PREVIEW_LIMIT = 300
AUTO_SKILL_TRANSLATOR = "[BOT] auto-skill"

SKILL_CATEGORIES = {
    "Skill",
    "SkillEfficacy",
    "LiveAbility",
    "PhotoAbility",
    "StatusEffectName",
}

SOURCE_FILES = {
    "Skill": ["Skill.json"],
    "SkillEfficacy": ["SkillEfficacy.json"],
    "LiveAbility": ["LiveAbility.json"],
    "PhotoAbility": ["PhotoAbility.json"],
    "StatusEffectName": ["StatusEffectName.json", "statusEffectName.json"],
}

if __package__:
    from .skill_translation_rules import (
        JP_RE, NUM_RE, compact, has_japanese, numbers, same_numbers,
        normalize_korean_spacing, translate_rule_text, translate_status_name,
    )
    from .skill_translation_catalog import translate_catalog
else:
    from skill_translation_rules import (
        JP_RE, NUM_RE, compact, has_japanese, numbers, same_numbers,
        normalize_korean_spacing, translate_rule_text, translate_status_name,
    )
    from skill_translation_catalog import translate_catalog

LEVEL_PATH_RE = re.compile(r"levels\[(\d+);level\]\.(description|shortDescription)$")


@dataclass(frozen=True)
class Candidate:
    unit_id: str
    category: str
    record_id: str
    field_path: str
    original: str
    old: str
    new: str
    reason: str
    confidence: str


@dataclass(frozen=True)
class Blocked:
    unit_id: str
    category: str
    record_id: str
    field_path: str
    original: str
    reason: str


@dataclass(frozen=True)
class AuditIssue:
    unit_id: str
    category: str
    record_id: str
    field_path: str
    original: str
    translated: str
    reason: str
    detail: str


def read_json_rows(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("data", data) if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else []


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_source_inventory(masterdb_dir: Path) -> dict[str, int]:
    inventory: dict[str, int] = {}
    for category, names in SOURCE_FILES.items():
        seen: set[str] = set()
        for name in names:
            path = masterdb_dir / name
            if path.exists():
                for index, row in enumerate(read_json_rows(path)):
                    key = row.get("statusEffectType") if category == "StatusEffectName" else row.get("id")
                    seen.add(str(key if key is not None else index))
        inventory[category] = len(seen)
    return inventory


def rule_candidate(row: sqlite3.Row) -> Candidate | None:
    category = row["category"]
    field_path = row["field_path"]
    original = row["original_text"]
    unit_id = row["unit_id"]
    record_id = row["record_id"]
    old = row["translation_text"]

    # Skill titles are deliberately outside automatic skill translation.
    if category == "Skill" and field_path == "name":
        return None
    if field_path != "name" and field_path != "description" and not LEVEL_PATH_RE.fullmatch(field_path):
        return None
    translated = translate_catalog(category, field_path, record_id, original)
    if translated is not None:
        return Candidate(unit_id, category, record_id, field_path, original, old, translated,
                         "catalog rule", "safe")

    if field_path == "name":
        if category == "StatusEffectName":
            translated = translate_status_name(original)
            if translated:
                return Candidate(unit_id, category, record_id, field_path, original, old, translated, "status effect glossary", "safe")
        if category in {"SkillEfficacy", "PhotoAbility", "LiveAbility"} or original == "ライブボーナス":
            translated = translate_rule_text(original)
            if translated:
                return Candidate(unit_id, category, record_id, field_path, original, old, translated, "rule parsed effect name", "review")
        return None

    if field_path == "description" or LEVEL_PATH_RE.match(field_path):
        translated = translate_rule_text(original)
        if translated:
            return Candidate(unit_id, category, record_id, field_path, original, old, translated, "rule parsed effect text", "review")
        return None

    return None


def candidate_for_row(row: sqlite3.Row) -> tuple[Candidate | None, Blocked | None]:
    category = row["category"]
    field_path = row["field_path"]
    original = row["original_text"]
    unit_id = row["unit_id"]
    record_id = row["record_id"]

    candidate = rule_candidate(row)

    if candidate:
        return candidate, None

    if field_path == "name":
        return None, Blocked(unit_id, category, record_id, field_path, original, "effect name needs a glossary or grammar rule")

    if field_path == "description" or LEVEL_PATH_RE.match(field_path):
        return None, Blocked(unit_id, category, record_id, field_path, original, "unparsed syntax, proper noun, or creative sentence")

    return None, Blocked(unit_id, category, record_id, field_path, original, "unsupported field")


def collect_candidates(
    conn: sqlite3.Connection,
    categories: set[str],
    mode: str,
    limit: int | None,
) -> tuple[list[Candidate], list[Blocked], dict[str, int]]:
    where = [
        "source_type = 'masterdb'",
        f"category IN ({','.join('?' for _ in categories)})",
        "NOT (category = 'Skill' AND field_path = 'name')",
    ]
    params: list[str] = sorted(categories)
    if mode == "missing":
        where.append("translation_text = ''")

    sql = f"""
        SELECT unit_id, category, record_id, field_path, original_text, translation_text
        FROM translation_units
        WHERE {' AND '.join(where)}
        ORDER BY category, record_id, field_path
    """
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    candidates: list[Candidate] = []
    blocked: list[Blocked] = []
    stats = {
        # Retained for report/import API compatibility. Rules no longer read
        # translations from the input DB, so a cold rebuild follows the same path.
        "exact_memory": 0,
        "cross_memory": 0,
    }
    for row in conn.execute(sql, params):
        candidate, block = candidate_for_row(row)
        if candidate and candidate.new != candidate.old:
            candidates.append(candidate)
        if block:
            blocked.append(block)
    return candidates, blocked, stats


def apply_candidates(conn: sqlite3.Connection, candidates: Iterable[Candidate], nickname: str, include_review: bool) -> int:
    applied = 0
    for item in candidates:
        if item.confidence != "safe" and not include_review:
            continue
        cursor = conn.execute(
            """
            UPDATE translation_units
            SET translation_text = ?,
                status = 'prefilled',
                translator_name = ?,
                updated_at = ?
            WHERE unit_id = ?
              AND translation_text = ?
            """,
            (item.new, nickname, now(), item.unit_id, item.old),
        )
        applied += cursor.rowcount
    return applied


def prefill_missing_skills(
    conn: sqlite3.Connection,
    *,
    translator: str = AUTO_SKILL_TRANSLATOR,
    include_review: bool = True,
) -> dict[str, object]:
    original_row_factory = conn.row_factory
    conn.row_factory = sqlite3.Row
    try:
        candidates, blocked, stats = collect_candidates(conn, set(SKILL_CATEGORIES), "missing", None)
    finally:
        conn.row_factory = original_row_factory
    applicable = [
        item for item in candidates
        if include_review or item.confidence == "safe"
    ]
    applied = apply_candidates(conn, applicable, translator, include_review)
    return {
        "candidates": len(candidates),
        "blocked": len(blocked),
        "applied": applied,
        "safe": sum(item.confidence == "safe" for item in applicable),
        "review": sum(item.confidence == "review" for item in applicable),
        "exact_memory": stats["exact_memory"],
        "cross_memory": stats["cross_memory"],
        "changes": applicable,
    }


def preview_pattern_key(item: Candidate) -> tuple[str, str, str, str]:
    original = item.original.replace("％", "%")
    original = re.sub(r"[A-Za-zⅢ]+メンバー", "GROUPメンバー", original)
    original = re.sub(r"(月のテンペスト|サニーピース|星見プロダクション|LizNoir|TRINITYAiLE|ⅢX)メンバー", "GROUPメンバー", original)
    original = re.sub(r"(スコアラー|バッファー|サポーター|ダンス|ボーカル|ビジュアル)タイプ", "TYPEタイプ", original)
    original = re.sub(r"(ダンス|ボーカル|ビジュアル|スタミナ|スコア|メンタル|クリティカル)", "PARAM", original)
    original = re.sub(r"(A|P|SP)スキル", "Xスキル", original)
    original = re.sub(r"(A|P|SP)スコア", "Xスコア", original)
    original = re.sub(r"\d+(?:\.\d+)?%?", "N", original)
    original = re.sub(r"\[[^\]]+\]", "[N]", original)
    original = re.sub(r"CT:N", "CT:N", original)
    original = re.sub(r"\s+", " ", original).strip()
    original = original[:140]
    path = LEVEL_PATH_RE.sub("levels[N].\\2", item.field_path)
    return item.reason, item.category, path, original


def varied_candidate_preview(candidates: list[Candidate], limit: int = REPORT_CANDIDATE_PREVIEW_LIMIT) -> list[Candidate]:
    buckets: dict[tuple[str, str, str, str], list[Candidate]] = defaultdict(list)
    for item in candidates:
        buckets[preview_pattern_key(item)].append(item)

    picked: list[Candidate] = []
    seen: set[tuple[str, str, str, str]] = set()

    # Prefer broad coverage of grammar-derived review items, then catalog rules.
    ordered = sorted(
        buckets,
        key=lambda key: (
            0 if key[0].startswith("rule parsed") else 1,
            key[1],
            key[2],
            key[3],
        ),
    )
    for key in ordered:
        if len(picked) >= limit:
            break
        seen.add(key)
        picked.append(buckets[key][0])

    if len(picked) < limit:
        for item in candidates:
            key = preview_pattern_key(item)
            if key in seen:
                continue
            picked.append(item)
            seen.add(key)
            if len(picked) >= limit:
                break

    return picked


def write_report(
    path: Path,
    inventory: dict[str, int],
    candidates: list[Candidate],
    blocked: list[Blocked],
    stats: dict[str, int],
    applied: int,
    mode: str,
    preview_limit: int,
) -> None:
    by_reason = Counter(item.reason for item in candidates)
    blocked_by_reason = Counter(item.reason for item in blocked)
    safe = sum(1 for item in candidates if item.confidence == "safe")
    review = sum(1 for item in candidates if item.confidence == "review")

    lines = [
        "# Skill Auto Translation Report",
        "",
        f"- mode: `{mode}`",
        f"- source rows: `{inventory}`",
        f"- exact memory entries: `{stats['exact_memory']}`",
        f"- cross-field memory entries: `{stats['cross_memory']}`",
        f"- candidates: `{len(candidates)}` (`safe={safe}`, `review={review}`)",
        f"- blocked: `{len(blocked)}`",
        f"- applied: `{applied}`",
        "",
        "## Automatically Fillable",
        "",
        "- Rule-normalized skill/effect text that preserves every number, CT, beat token, placeholder, and line break.",
        "- StatusEffectName names composed from the fixed status glossary.",
        "- Category/field catalogs preserve established wording and whitespace; numeric templates support new values.",
        "- Saved DB translations are not used as translation input. Skill.name is excluded.",
        "",
        "## Needs Review Or Manual Translation",
        "",
        "- Effect names that are not covered by the glossary or grammar.",
        "- Descriptions with syntax not covered by rules.",
        "- Rows where the generated Korean would still contain Japanese characters or mismatched numbers.",
        "",
        "## Candidate Reasons",
        "",
    ]
    if by_reason:
        lines.extend(f"- {reason}: `{count}`" for reason, count in sorted(by_reason.items()))
    else:
        lines.append("- none")

    lines.extend(["", "## Blocked Reasons", ""])
    if blocked_by_reason:
        lines.extend(f"- {reason}: `{count}`" for reason, count in sorted(blocked_by_reason.items()))
    else:
        lines.append("- none")

    preview_items = varied_candidate_preview(candidates, preview_limit)
    lines.extend(["", "## Candidate Preview", ""])
    lines.append(f"- showing `{len(preview_items)}` varied pattern samples")
    lines.append("")
    for item in preview_items:
        lines.extend(
            [
                f"### {item.unit_id}",
                "",
                f"- confidence: `{item.confidence}`",
                f"- reason: `{item.reason}`",
                f"- JP: {item.original}",
                f"- OLD: {item.old}",
                f"- NEW: {item.new}",
                "",
            ]
        )
    if len(candidates) > len(preview_items):
        lines.append(f"... {len(candidates) - len(preview_items)} more candidates")
        lines.append("")

    lines.extend(["## Blocked Preview", ""])
    for item in blocked[:50]:
        lines.extend(
            [
                f"### {item.unit_id}",
                "",
                f"- reason: `{item.reason}`",
                f"- JP: {item.original}",
                "",
            ]
        )
    if len(blocked) > 50:
        lines.append(f"... {len(blocked) - 50} more blocked rows")
        lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


AUDIT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("glued compound", re.compile(r"(상승상한|저하상한|스태미나저하|스태미나상승|스태미나회복|소비스태미나|크리티컬계수|크리티컬확률|스킬성공률|상한해제|지속회복|소비 스태미나저하|상승초화|저하초화)")),
    ("bad particle or punctuation", re.compile(r"(에게\s*,|전에게|시에\s*,|시에게|에게\s+효과|에게\s+\n|,\s*\n|^\s*,|,\s*$)")),
    ("missing space before numeric token", re.compile(r"[\uac00-\ud7a3](?:\d+(?:\.\d+)?%?)(?:명|단계|비트|회|콤보|%|점)?")),
    ("missing space after bracketed effect word", re.compile(r"(효과|상태|반사|양도|제거|초화|봉인|방지|제한|해제)\[")),
    ("awkward Korean fragment", re.compile(r"(수마다|발동 전에게|발동 전에에게|대상\d+명|낮은\d+명|높은\d+명|많은\d+명|적은\d+명)")),
]


def audit_issue_pattern_key(item: AuditIssue) -> tuple[str, str, str, str]:
    original = item.original
    original = re.sub(r"\d+(?:\.\d+)?%?", "N", original)
    original = re.sub(r"\[[^\]]+\]", "[N]", original)
    original = re.sub(r"\s+", " ", original).strip()[:120]
    path = LEVEL_PATH_RE.sub("levels[N].\\2", item.field_path)
    return item.reason, item.category, path, original


def collect_audit_issues(
    conn: sqlite3.Connection,
    categories: set[str],
    limit: int | None,
) -> list[AuditIssue]:
    where = [
        "source_type = 'masterdb'",
        f"category IN ({','.join('?' for _ in categories)})",
        "NOT (category = 'Skill' AND field_path = 'name')",
        "translation_text <> ''",
    ]
    params: list[str | int] = sorted(categories)
    sql = f"""
        SELECT unit_id, category, record_id, field_path, original_text, translation_text
        FROM translation_units
        WHERE {' AND '.join(where)}
        ORDER BY category, record_id, field_path
    """
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    issues: list[AuditIssue] = []
    for row in conn.execute(sql, params):
        original = row["original_text"]
        translated = row["translation_text"]

        if has_japanese(translated):
            issues.append(
                AuditIssue(
                    row["unit_id"],
                    row["category"],
                    row["record_id"],
                    row["field_path"],
                    original,
                    translated,
                    "japanese remains",
                    "translation contains Japanese characters",
                )
            )

        if numbers(original) != numbers(translated):
            issues.append(
                AuditIssue(
                    row["unit_id"],
                    row["category"],
                    row["record_id"],
                    row["field_path"],
                    original,
                    translated,
                    "number mismatch",
                    f"JP numbers={numbers(original)} / KO numbers={numbers(translated)}",
                )
            )

        for reason, pattern in AUDIT_PATTERNS:
            match = pattern.search(translated)
            if match:
                issues.append(
                    AuditIssue(
                        row["unit_id"],
                        row["category"],
                        row["record_id"],
                        row["field_path"],
                        original,
                        translated,
                        reason,
                        match.group(0),
                    )
                )
                break

    return issues


def varied_audit_preview(issues: list[AuditIssue], limit: int) -> list[AuditIssue]:
    buckets: dict[tuple[str, str, str, str], list[AuditIssue]] = defaultdict(list)
    for issue in issues:
        buckets[audit_issue_pattern_key(issue)].append(issue)
    ordered = sorted(buckets, key=lambda key: (key[0], key[1], key[2], key[3]))
    return [buckets[key][0] for key in ordered[:limit]]


def write_audit_report(path: Path, issues: list[AuditIssue], preview_limit: int) -> None:
    by_reason = Counter(item.reason for item in issues)
    by_category = Counter(item.category for item in issues)
    preview_items = issues if len(issues) <= preview_limit else varied_audit_preview(issues, preview_limit)

    lines = [
        "# Skill Translation Audit Report",
        "",
        f"- suspicious rows: `{len(issues)}`",
        f"- preview: `{len(preview_items)}` varied pattern samples",
        "",
        "## Reasons",
        "",
    ]
    if by_reason:
        lines.extend(f"- {reason}: `{count}`" for reason, count in sorted(by_reason.items()))
    else:
        lines.append("- none")

    lines.extend(["", "## Categories", ""])
    if by_category:
        lines.extend(f"- {category}: `{count}`" for category, count in sorted(by_category.items()))
    else:
        lines.append("- none")

    lines.extend(["", "## Suspicious Preview", ""])
    for item in preview_items:
        lines.extend(
            [
                f"### {item.unit_id}",
                "",
                f"- category: `{item.category}`",
                f"- field: `{item.field_path}`",
                f"- reason: `{item.reason}`",
                f"- detail: `{item.detail}`",
                f"- JP: {item.original}",
                f"- KO: {item.translated}",
                "",
            ]
        )

    if len(issues) > len(preview_items):
        lines.append(f"... {len(issues) - len(preview_items)} more suspicious rows")
        lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def parse_categories(value: str) -> set[str]:
    if value.lower() == "all":
        return set(SKILL_CATEGORIES)
    categories = {part.strip() for part in value.split(",") if part.strip()}
    unknown = categories - SKILL_CATEGORIES
    if unknown:
        raise argparse.ArgumentTypeError(f"Unknown categories: {', '.join(sorted(unknown))}")
    return categories


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize deterministic skill-related translations.")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--masterdb-dir", type=Path, default=MASTERDB_DIR)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--audit-report", type=Path, default=None, help="Write a completed-translation audit report for suspicious saved translations.")
    parser.add_argument("--categories", type=parse_categories, default=set(SKILL_CATEGORIES), help="Comma-separated categories or all.")
    parser.add_argument("--mode", choices=["missing", "overwrite", "all"], default="missing", help="missing normalizes empty translations only; overwrite normalizes translated and empty rows. all is an alias for overwrite.")
    parser.add_argument("--limit", type=int, default=0, help="Limit scanned rows for debugging.")
    parser.add_argument("--preview-limit", type=int, default=REPORT_CANDIDATE_PREVIEW_LIMIT, help="Number of varied candidate samples to show in the markdown report.")
    parser.add_argument("--apply", action="store_true", help="Write safe candidates to translation_units.")
    parser.add_argument("--apply-review", action="store_true", help="Also write review candidates. Use only after inspecting the report.")
    parser.add_argument("--translator", default=AUTO_SKILL_TRANSLATOR)
    args = parser.parse_args()

    inventory = load_source_inventory(args.masterdb_dir)
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    mode = "overwrite" if args.mode == "all" else args.mode
    candidates, blocked, stats = collect_candidates(
        conn,
        args.categories,
        mode,
        args.limit or None,
    )
    applied = 0
    if args.apply or args.apply_review:
        applied = apply_candidates(conn, candidates, args.translator, args.apply_review)
        conn.commit()
    write_report(args.report, inventory, candidates, blocked, stats, applied, mode, max(0, args.preview_limit))
    audit_count = 0
    if args.audit_report:
        audit_issues = collect_audit_issues(conn, args.categories, args.limit or None)
        audit_count = len(audit_issues)
        write_audit_report(args.audit_report, audit_issues, max(0, args.preview_limit))
    print(f"candidates={len(candidates)} blocked={len(blocked)} applied={applied} audit={audit_count} report={args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
