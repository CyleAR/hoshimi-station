from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


TOKEN_RE = re.compile(r"\{([0-9]+|[A-Za-z_][A-Za-z_0-9]*)\}")
DICTIONARY_NAME_RE = re.compile(r"[A-Za-z][A-Za-z_0-9]*\Z")
RESERVED_NAMES = {"user", "threshold"}
PARTICLES = {
    "[와/과]": ("와", "과"),
    "[은/는]": ("는", "은"),
    "[을/를]": ("를", "을"),
    "[이/가]": ("가", "이"),
}
REPLACEMENT_RE = re.compile(TOKEN_RE.pattern + r"(\[와/과\]|\[은/는\]|\[을/를\]|\[이/가\])?")


def normalize_text(value: str) -> str:
    return value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def _read_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=_unique_object)
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
        return data
    except (OSError, ValueError) as error:
        raise ValueError(f"{path}: {error}") from error


def _translation_pairs(items: Any, location: str) -> dict[str, str]:
    if not isinstance(items, dict):
        raise ValueError(f"{location}: expected an original-to-translation object")
    result = {}
    for original, translation in items.items():
        if not isinstance(translation, str) or not original.strip() or not translation.strip():
            raise ValueError(f"{location}: {original!r} must have a nonempty string translation")
        original, translation = normalize_text(original), normalize_text(translation)
        if original in result and result[original] != translation:
            raise ValueError(f"{location}: conflicting normalized key {original!r}")
        result[original] = translation
    return result


def has_final_consonant(text: str, overrides: dict[str, bool]) -> bool:
    if text in overrides:
        return overrides[text]
    ending = text.rstrip(" \t\r\n\"'’”)]}）］〉》」』")
    if not ending:
        return False
    code = ord(ending[-1])
    return 0xAC00 <= code <= 0xD7A3 and (code - 0xAC00) % 28 != 0


@dataclass
class PrefillTemplate:
    original: str
    translation: str
    pattern: re.Pattern[str]
    captures: dict[str, str]
    weight: tuple[int, int]

    def render(self, original: str, dictionaries: dict[str, dict[str, str]], batchim: dict[str, bool]) -> str | None:
        match = self.pattern.fullmatch(original)
        if match is None:
            return None

        def replace(token: re.Match[str]) -> str:
            key, marker = token.groups()
            if key not in self.captures:
                return token.group(0)
            value = match[self.captures[key]]
            if key not in dictionaries:
                return value + (marker or "")
            translated = dictionaries[key][value]
            if marker:
                translated += PARTICLES[marker][int(has_final_consonant(translated, batchim))]
            return translated

        return REPLACEMENT_RE.sub(replace, self.translation)


def compile_template(original: str, translation: str, dictionaries: dict[str, dict[str, str]]) -> PrefillTemplate:
    captures: dict[str, str] = {}
    pattern = []
    literal_length = 0
    offset = 0
    for token in TOKEN_RE.finditer(original):
        key = token[1]
        if not key.isdigit() and key not in dictionaries:
            continue
        literal = original[offset:token.start()]
        pattern.append(re.escape(literal))
        literal_length += len(literal)
        if key in captures:
            pattern.append(f"(?P={captures[key]})")
        else:
            group = f"value_{len(captures)}"
            captures[key] = group
            if key.isdigit():
                values = r"[0-9０-９]+"
            else:
                alternatives = sorted(dictionaries[key], key=lambda word: (-len(word), word))
                values = "|".join(re.escape(word) for word in alternatives) or "(?!)"
            pattern.append(f"(?P<{group}>{values})")
        offset = token.end()
    pattern.append(re.escape(original[offset:]))
    literal_length += len(original[offset:])
    for token in TOKEN_RE.finditer(translation):
        key = token[1]
        if (key.isdigit() or key in dictionaries) and key not in captures:
            raise ValueError(f"{original!r}: translation placeholder {{{key}}} is missing from the original")
    return PrefillTemplate(original, translation, re.compile("".join(pattern)), captures, (literal_length, -len(captures)))


@dataclass
class PrefillRules:
    exact: dict[str, str]
    templates: list[PrefillTemplate]
    dictionaries: dict[str, dict[str, str]]
    batchim: dict[str, bool]
    warnings: set[str] = field(default_factory=set)
    standalone_conflicts: int = 0
    templates_by_initial: dict[str, list[PrefillTemplate]] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.templates_by_initial = {}
        for template in self.templates:
            first = TOKEN_RE.match(template.original)
            key = first[1] if first else None
            if key in self.dictionaries:
                initials = {word[0] for word in self.dictionaries[key]}
            elif key is not None and key.isdigit():
                initials = set("0123456789０１２３４５６７８９")
            else:
                initials = {template.original[0]}
            for initial in initials:
                self.templates_by_initial.setdefault(initial, []).append(template)

    def format_translation(self, original: str) -> str | None:
        selected = None
        weight = None
        for template in self.templates_by_initial.get(original[:1], []):
            if weight is not None and template.weight < weight:
                break
            translated = template.render(original, self.dictionaries, self.batchim)
            if translated is None or translated == original:
                continue
            if selected is not None and translated != selected:
                self.warnings.add(f"equal-priority templates disagree for {original!r}; skipped")
                return None
            selected, weight = translated, template.weight
        return selected

    def translate(self, original: str) -> str | None:
        if original in self.exact:
            return self.exact[original]
        return self.format_translation(original)


def load_prefill_rules(translations_path: Path, dictionary_path: Path) -> PrefillRules:
    data = _read_object(dictionary_path)
    dictionaries = {}
    batchim = data.get("_batchim", {})
    if not isinstance(batchim, dict) or any(not name.strip() or type(flag) is not bool for name, flag in batchim.items()):
        raise ValueError(f"{dictionary_path}: _batchim must map translated text to booleans")
    for name, items in data.items():
        if name == "_batchim":
            continue
        if not DICTIONARY_NAME_RE.fullmatch(name) or name in RESERVED_NAMES:
            raise ValueError(f"{dictionary_path}: invalid or reserved dictionary name {name!r}")
        dictionaries[name] = _translation_pairs(items, f"{dictionary_path}: {name}")

    exact: dict[str, str] = {}
    templates = []
    warnings: set[str] = set()
    for section, items in _read_object(translations_path).items():
        for original, translation in _translation_pairs(items, f"{translations_path}: {section}").items():
            try:
                template = compile_template(original, translation, dictionaries)
            except ValueError as error:
                raise ValueError(f"{translations_path}: {section}: {error}") from error
            if template.captures:
                templates.append(template)
            elif original in exact and exact[original] != translation:
                warnings.add(f"conflicting explicit translation for {original!r}; kept the first entry")
            else:
                exact[original] = translation

    # A dictionary spelling can mean different things in different template slots.
    standalone: dict[str, set[str]] = {}
    for items in dictionaries.values():
        for original, translation in items.items():
            standalone.setdefault(original, set()).add(translation)
    standalone_conflicts = 0
    for original, translations in standalone.items():
        if original in exact:
            continue
        if len(translations) == 1:
            exact[original] = next(iter(translations))
        else:
            standalone_conflicts += 1
            warnings.add(f"dictionary spelling {original!r} has different translations; standalone prefill skipped")

    templates.sort(key=lambda template: template.weight, reverse=True)
    return PrefillRules(exact, templates, dictionaries, batchim, warnings, standalone_conflicts)
