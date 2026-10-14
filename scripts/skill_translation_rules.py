"""Skill-rule helpers. Wording lives in skill_translation_catalog.py; unmatched text goes to the LLM lane."""
from __future__ import annotations

import re

JP_RE = re.compile(r"[\u3040-\u30fa\u30fc-\u30ff\u3400-\u9fff]")
NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def has_japanese(text: str) -> bool:
    return JP_RE.search(text) is not None


def numbers(text: str) -> list[str]:
    return NUM_RE.findall(text.replace("％", "%"))




def translate_status_name(text: str) -> str | None:
    """Status names are resolved by the catalog; unknown names return None (LLM lane)."""
    return None


def translate_rule_text(text: str) -> str | None:
    """No grammar engine for English: only the catalog translates rule text."""
    return None


def same_numbers(original: str, translated: str) -> bool:
    return numbers(original) == numbers(translated)
