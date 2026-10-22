"""Identify reusable gacha titles without treating dictionary entries as templates."""

import re


def compact(text: str) -> str:
    return re.sub(r"\s+", "", text)


def is_generic_gacha(title: str) -> bool:
    text = compact(title)
    if any(word in text for word in ("誕生日", "確定", "無料", "引き放題", "ロックオン", "ドリームギフト", "セレクション")):
        return True
    if re.fullmatch(r"(?:選べる|初心者|カムバック)?アイプラフェス(?:ガチャ|絆|ピックアップ[0-9０-９]+|[ⅠⅡ])?", text):
        return True
    if re.fullmatch(r"(?:選べる)?(?:★[0-9０-９]+)?(?:ビジュアル|ボーカル|ダンス|スコアラー|バッファー|サポーター)ガチャ", text):
        return True
    if text.startswith("選べる★") or text.startswith("【シリアル】選べる"):
        return True
    if re.fullmatch(r"(?:感謝の)?[0-9０-９]+連ガチャ|缶バッジパックVol\.[0-9０-９]+", text):
        return True
    return text in {
        "ダイヤガチャ", "チケットガチャ", "プレミアムガチャ", "プロモーションガチャ",
        "ファンイベントガチャ", "補助券ガチャ", "福引券ガチャ", "アイテム抽選券ガチャ",
        "チョコ引券ガチャ", "リリース記念ガチャ", "復刻選べる絆シリーズ",
    }


def find_gacha_reuse(titles: list[str], item_rows: list[tuple[str, str, str]]) -> dict[str, dict]:
    """Match complete item names or quoted gacha references, never arbitrary substrings."""
    rows = [(record, field, text, compact(text)) for record, field, text in item_rows if text]
    result = {}
    for title in titles:
        if is_generic_gacha(title):
            continue
        escaped = re.escape(compact(title))
        name_pattern = re.compile(r"(?:【復刻】)?(?:「" + escaped + r"」|" + escaped + r")(?:ピックアップガチャPt|ガチャPt|Pt|専用ガチャチケット|ガチャチケット)")
        quoted_pattern = re.compile(r"[「『]" + escaped + r"(?:ピックアップガチャ|ガチャ)?[」』]")
        matches = []
        for record, field, text, normalized in rows:
            if (field == "name" and name_pattern.fullmatch(normalized)) or (field == "description" and quoted_pattern.search(normalized)):
                matches.append({"record_id": record, "field_path": field, "exact": title in text})
        if matches:
            result[title] = {"count": len({entry['record_id'] for entry in matches}),
                             "exact": any(entry["exact"] for entry in matches), "examples": matches[:3]}
    return result
