from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable


TAG_RE = re.compile(r"^\[(?P<tag>[a-zA-Z0-9_]+)\s*(?P<body>.*)\]$")
ATTR_RE = re.compile(r"(?P<key>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\]?$)")
PLACE_RE = re.compile(r"(?<![A-Za-z0-9_])place=(?P<value>.*?)(?=\]|\s+[A-Za-z_][A-Za-z0-9_]*=|$)")


def duplicate_story_map(
    stories: list[dict[str, Any]],
    translation_values: Callable[[dict[str, Any]], dict[str, str]],
) -> dict[str, str]:
    stories_by_id = {str(story.get("id", "")): story for story in stories}
    duplicates: dict[str, str] = {}
    for story_id, story in stories_by_id.items():
        if not story_id.endswith("-limited"):
            continue
        base_id = story_id.removesuffix("-limited")
        base = stories_by_id.get(base_id)
        if base is not None and translation_values(story) == translation_values(base):
            duplicates[story_id] = base_id

    event_stories_by_values: dict[tuple[tuple[str, str], ...], list[str]] = {}
    for story_id, story in stories_by_id.items():
        if story_id.startswith("st-eve-"):
            values = tuple(sorted(translation_values(story).items()))
            event_stories_by_values.setdefault(values, []).append(story_id)
    for story_id, story in stories_by_id.items():
        if not story_id.startswith("st-shelf-"):
            continue
        values = tuple(sorted(translation_values(story).items()))
        candidates = event_stories_by_values.get(values, [])
        if len(candidates) == 1:
            duplicates[story_id] = candidates[0]
    return duplicates


def story_text_adv_assets(story: dict[str, Any]) -> list[str]:
    assets = [str(asset) for asset in story.get("advAssetIds", []) or [] if asset]
    play_types = story.get("advPlayTypes", []) or []
    if len(play_types) != len(assets):
        return assets
    return [asset for play_type, asset in zip(play_types, assets) if play_type == 1]


def parse_attrs(body: str) -> dict[str, str]:
    return {match.group("key"): match.group("value").strip() for match in ATTR_RE.finditer(body)}


def adv_dialogue_values(adv_dir: Path, asset_id: str) -> list[tuple[str, str]]:
    path = adv_dir / f"adv_{asset_id}.txt"
    if not path.exists():
        return []
    values: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = TAG_RE.match(line)
        if not match:
            continue
        tag = match.group("tag")
        body = match.group("body")
        attrs = parse_attrs(body)
        if tag in {"message", "narration"} and attrs.get("text"):
            values.append(("text", attrs["text"]))
        elif tag == "title" and attrs.get("title"):
            values.append(("title", attrs["title"]))
        elif tag == "choicegroup":
            for index, text_match in enumerate(re.finditer(r"(?<![A-Za-z])text=(.*?)(?=\s+[A-Za-z_][A-Za-z0-9_]*=|\])", body)):
                values.append((f"choice[{index}].text", text_match.group(1)))
    return values


def adv_reference_values(adv_dir: Path, asset_id: str) -> set[tuple[str, str]]:
    path = adv_dir / f"adv_{asset_id}.txt"
    if not path.exists():
        return set()
    values: set[tuple[str, str]] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = TAG_RE.match(line)
        if not match:
            continue
        tag = match.group("tag")
        body = match.group("body")
        attrs = parse_attrs(body)
        if tag in {"message", "narration"} and attrs.get("name"):
            values.add(("name", attrs["name"]))
        for place_match in PLACE_RE.finditer(body):
            place = place_match.group("value").strip()
            if place:
                values.add(("place", place))
    return values


def without_repeated_titles(values: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[str] = set()
    result: list[tuple[str, str]] = []
    for field, value in values:
        if field == "title":
            if value in seen:
                continue
            seen.add(value)
        result.append((field, value))
    return result


def duplicate_shelf_adv_map(
    stories: list[dict[str, Any]],
    story_duplicates: dict[str, str],
    adv_dir: Path,
) -> dict[str, list[str]]:
    stories_by_id = {str(story.get("id", "")): story for story in stories}
    duplicates: dict[str, list[str]] = {}
    for shelf_id, event_id in story_duplicates.items():
        if not shelf_id.startswith("st-shelf-") or not event_id.startswith("st-eve-"):
            continue
        shelf_story = stories_by_id.get(shelf_id)
        event_story = stories_by_id.get(event_id)
        if shelf_story is None or event_story is None:
            continue
        shelf_assets = story_text_adv_assets(shelf_story)
        event_assets = story_text_adv_assets(event_story)
        if not shelf_assets or not event_assets:
            continue
        target_assets = [asset for asset in shelf_assets if asset not in event_assets]
        if not target_assets:
            continue
        event_values = [value for asset in event_assets for value in adv_dialogue_values(adv_dir, asset)]
        event_references = set().union(*(adv_reference_values(adv_dir, asset) for asset in event_assets))
        for target_asset in target_assets:
            target_values = adv_dialogue_values(adv_dir, target_asset)
            target_references = adv_reference_values(adv_dir, target_asset)
            if target_references.issubset(event_references) and target_values and (
                target_values == event_values
                or target_values == without_repeated_titles(event_values)
            ):
                duplicates[f"adv_{target_asset}.txt"] = [f"adv_{asset}.txt" for asset in event_assets]
    return duplicates
