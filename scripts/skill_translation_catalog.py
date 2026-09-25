"""Category/field-specific wording rules, independent of saved DB translations.

The grammar handles ordinary sentences. This catalog preserves established wording
that cannot be inferred from a global replacement (including whitespace). Numeric
slots generalize a sentence across levels; literal game placeholders such as {0}
remain literal. Skill titles are intentionally excluded.
"""
from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
import re


DATA_DIR = Path(__file__).with_name("skill_translation_data")
NUMBER_OR_PLACEHOLDER = re.compile(r"\{\d+\}|\d+(?:\.\d+)?")
SLOT = re.compile(r"\{n(\d+)\}")


@lru_cache(maxsize=32768)
def numeric_shape(text: str) -> tuple[str, tuple[str, ...]]:
    values: list[str] = []

    def replace(match: re.Match[str]) -> str:
        if match[0].startswith("{"):
            return match[0]
        values.append(match[0])
        return "{n" + str(len(values) - 1) + "}"

    return NUMBER_OR_PLACEHOLDER.sub(replace, text), tuple(values)


def _unique_keys(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate skill rule: {key!r}")
        result[key] = value
    return result


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    catalog = {}
    for path in sorted(DATA_DIR.glob("*.json")):
        fields = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_keys)
        if path.stem == "Skill" and "name" in fields:
            raise ValueError("Skill.name must not be automatically translated")
        for rules in fields.values():
            for source, translated in rules["templates"].items():
                slots = SLOT.findall(source)
                if slots != [str(i) for i in range(len(slots))] or SLOT.findall(translated) != slots:
                    raise ValueError(f"Invalid numeric slots in {path.name}: {source!r}")
            overrides = {}
            for rule in rules["record_overrides"]:
                key = (rule["record_id"], rule["source"])
                if key in overrides:
                    raise ValueError(f"Duplicate contextual rule: {key}")
                overrides[key] = rule["translation"]
            rules["record_overrides"] = overrides
        catalog[path.stem] = fields
    return catalog


def translate_catalog(category: str, field_path: str, record_id: str, original: str) -> str | None:
    field = field_path.rsplit(".", 1)[-1]
    rules = load_catalog().get(category, {}).get(field)
    if rules is None:
        return None
    contextual = rules["record_overrides"].get((record_id, original))
    if contextual is not None:
        return contextual
    literal = rules["phrases"].get(original)
    if literal is not None:
        return literal
    shape, values = numeric_shape(original)
    template = rules["templates"].get(shape)
    if template is None:
        return None
    # Do not run global whitespace/wording normalization on an established rule.
    return SLOT.sub(lambda match: values[int(match[1])], template)
