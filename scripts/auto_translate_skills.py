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

JP_RE = re.compile(r"[\u3040-\u30fa\u30fc-\u30ff\u3400-\u9fff]")
NUM_RE = re.compile(r"\d+(?:\.\d+)?")
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


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def has_japanese(text: str) -> bool:
    return JP_RE.search(text) is not None


def numbers(text: str) -> list[str]:
    return NUM_RE.findall(text.replace("％", "%"))


def same_numbers(original: str, translated: str) -> bool:
    return numbers(original) == numbers(translated)


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


def build_exact_memory(conn: sqlite3.Connection, categories: set[str]) -> dict[tuple[str, str, str], str]:
    grouped: dict[tuple[str, str, str], Counter[str]] = defaultdict(Counter)
    rows = conn.execute(
        """
        SELECT category, field_path, original_text, translation_text
        FROM translation_units
        WHERE source_type = 'masterdb'
          AND translation_text <> ''
        """
    )
    for row in rows:
        category = row["category"]
        if category not in categories:
            continue
        key = (category, row["field_path"], row["original_text"])
        grouped[key][row["translation_text"]] += 1

    memory: dict[tuple[str, str, str], str] = {}
    for key, counter in grouped.items():
        if len(counter) == 1:
            memory[key] = next(iter(counter))
    return memory


def build_cross_field_memory(conn: sqlite3.Connection, categories: set[str]) -> dict[str, str]:
    grouped: dict[str, Counter[str]] = defaultdict(Counter)
    rows = conn.execute(
        """
        SELECT category, original_text, translation_text
        FROM translation_units
        WHERE source_type = 'masterdb'
          AND translation_text <> ''
        """
    )
    for row in rows:
        if row["category"] in categories:
            grouped[row["original_text"]][row["translation_text"]] += 1

    memory: dict[str, str] = {}
    for original, counter in grouped.items():
        if len(counter) == 1:
            memory[original] = next(iter(counter))
    return memory


STATUS_PARTS = {
    "ダンス": "댄스",
    "ボーカル": "보컬",
    "ビジュアル": "비주얼",
    "スコア": "스코어",
    "ビート": "비트",
    "Aスキル": "A스킬",
    "Pスキル": "P스킬",
    "SPスキル": "SP스킬",
    "クリティカル": "크리티컬",
    "スタミナ": "스태미나",
    "メンタル": "멘탈",
    "コンボ": "콤보",
    "テンション": "텐션",
    "アップ": "UP",
    "ステルス": "스텔스",
    "集目": "주목",
    "カバー": "커버",
    "成功率": "성공률",
    "係数": "계수",
    "消費": "소비",
    "継続": "지속",
    "回復": "회복",
    "封印": "봉인",
    "低下": "저하",
    "上昇": "상승",
    "追加": "추가",
    "防止": "방지",
    "反射": "반사",
    "強化": "강화",
    "段階数": "단계 수",
    "制限": "제한",
    "上限開放": "상한 해제",
    "超化": "초화",
    "ブースト": "부스트",
    "不調": "컨디션 난조",
}

PHRASES = [
    ("[ライブバトルのみ]", "[라이브 배틀 한정]"),
    ("ライブバトルのみ", "라이브 배틀 한정"),
    ("ライブ中1回のみ", "라이브 중 1회만"),
    ("ライブ中2回のみ", "라이브 중 2회만"),
    ("ライブ中１回のみ", "라이브 중 1회만"),
    ("ライブ中２回のみ", "라이브 중 2회만"),
    ("ライブ中", "라이브 중"),
    ("月のテンペストメンバー", "달의 템페스트 멤버"),
    ("プレイ時", "플레이 시"),
    ("誰かが", "누군가가 "),
    ("誰かの", "누군가의 "),
    ("ビートUPスキル", "비트 UP 스킬"),
    ("付与する", "부여하는 "),
    ("与える", "부여하는 "),
    ("受けた時", "받았을 때"),
    ("受ける", "받는 "),
    ("与・", "부여・"),
    ("被・", "받는・"),
    ("いずれかの", "어느 하나의 "),
    ("いずれか", "어느 하나"),
    ("延長します", "연장합니다"),
    ("段階増強します", "단계 증강합니다"),
    ("増強します", "증강합니다"),
    ("パッシブスキル発動時", "패시브 스킬 발동 시"),
    ("クリティカル発動時", "크리티컬 발동 시"),
    ("スキル発動前", "스킬 발동 전"),
    ("SPスキルスコア追加効果", "SP스킬 스코어 추가 효과"),
    ("Aスキルスコア追加効果", "A스킬 스코어 추가 효과"),
    ("Pスキルスコア追加効果", "P스킬 스코어 추가 효과"),
    ("SPスキルスコア上昇効果", "SP스킬 스코어 상승 효과"),
    ("Aスキルスコア上昇効果", "A스킬 스코어 상승 효과"),
    ("Pスキルスコア上昇効果", "P스킬 스코어 상승 효과"),
    ("Aスキルチャンス譲渡状態", "A스킬 찬스 양도 상태"),
    ("Pスキルチャンス譲渡状態", "P스킬 찬스 양도 상태"),
    ("SPスキルチャンス譲渡状態", "SP스킬 찬스 양도 상태"),
    ("ビートスコア上昇効果", "비트 스코어 상승 효과"),
    ("コンボスコア上昇効果", "콤보 스코어 상승 효과"),
    ("クリティカルスコア上昇効果", "크리티컬 스코어 상승 효과"),
    ("クリティカル係数アップ", "크리티컬 계수 UP"),
    ("クリティカル係数上昇効果", "크리티컬 계수 상승 효과"),
    ("クリティカル率上昇効果", "크리티컬 확률 상승 효과"),
    ("ダンス上昇上限開放", "댄스 상승 상한 해제"),
    ("ダンス上昇上限解放", "댄스 상승 상한 해제"),
    ("ボーカル上昇上限開放", "보컬 상승 상한 해제"),
    ("ボーカル上昇上限解放", "보컬 상승 상한 해제"),
    ("ビジュアル上昇上限開放", "비주얼 상승 상한 해제"),
    ("ビジュアル上昇上限解放", "비주얼 상승 상한 해제"),
    ("ダンス上昇超化", "댄스 상승 초화"),
    ("ボーカル上昇超化", "보컬 상승 초화"),
    ("ビジュアル上昇超化", "비주얼 상승 초화"),
    ("スコア上昇超化", "스코어 상승 초화"),
    ("ビートスコア上昇超化", "비트 스코어 상승 초화"),
    ("コンボ継続", "콤보 지속"),
    ("スキル成功率上昇効果", "스킬 성공률 상승 효과"),
    ("スキル成功率UP", "스킬 성공률 UP"),
    ("スキル成功率上昇超化", "스킬 성공률 상승 초화"),
    ("SPスキルスコア上昇超化", "SP스킬 스코어 상승 초화"),
    ("Aスキルスコア上昇超化", "A스킬 스코어 상승 초화"),
    ("Pスキルスコア上昇超化", "P스킬 스코어 상승 초화"),
    ("テンションUP超化", "텐션 UP 초화"),
    ("スタミナ消費増加効果", "스태미나 소비 증가 효과"),
    ("スタミナ継続消費効果", "스태미나 지속 소비 효과"),
    ("スタミナ継続回復", "스태미나 지속 회복"),
    ("スタミナ継続消費", "스태미나 지속 소비"),
    ("消費スタミナ上昇効果", "소비 스태미나 상승 효과"),
    ("消費スタミナ増加効果", "소비 스태미나 증가 효과"),
    ("消費スタミナ低下効果", "소비 스태미나 감소 효과"),
    ("消費スタミナ低下状態", "소비 스태미나 저하 상태"),
    ("消費スタミナ低下", "소비 스태미나 저하"),
    ("スタミナ継続回復効果", "스태미나 지속 회복 효과"),
    ("スタミナ回復効果", "스태미나 회복 효과"),
    ("ダンス上昇効果", "댄스 상승 효과"),
    ("ボーカル上昇効果", "보컬 상승 효과"),
    ("ビジュアル上昇効果", "비주얼 상승 효과"),
    ("ダンスアップ", "댄스 UP"),
    ("ボーカルアップ", "보컬 UP"),
    ("ビジュアルアップ", "비주얼 UP"),
    ("スコアアップ", "스코어 UP"),
    ("スコアアップ状態", "스코어 UP 상태"),
    ("ダンス低下効果", "댄스 저하 효과"),
    ("ボーカル低下効果", "보컬 저하 효과"),
    ("ビジュアル低下効果", "비주얼 저하 효과"),
    ("ダンスブースト効果", "댄스 부스트 효과"),
    ("ボーカルブースト効果", "보컬 부스트 효과"),
    ("ビジュアルブースト効果", "비주얼 부스트 효과"),
    ("ビートブースト効果", "비트 부스트 효과"),
    ("ビートブースト上昇効果", "비트 부스트 상승 효과"),
    ("スコア上昇効果", "스코어 상승 효과"),
    ("スコア獲得倍率", "스코어 획득 배율"),
    ("スコア獲得", "스코어 획득"),
    ("割合スコア獲得", "비율 스코어 획득"),
    ("低下効果防止", "저하 효과 방지"),
    ("低下効果反転", "저하 효과 반전"),
    ("低下効果状態", "저하 효과 상태"),
    ("効果状態", "효과 상태"),
    ("強化効果消去", "강화 효과 제거"),
    ("強化効果段階数制限", "강화 효과 단계 수 제한"),
    ("強化効果回数増加", "강화 효과 횟수 증가"),
    ("強化効果増強", "강화 효과 증강"),
    ("強化効果譲渡", "강화 효과 양도"),
    ("強化効果", "강화 효과"),
    ("状態変化", "상태 변화"),
    ("不調効果", "컨디션 난조 효과"),
    ("不調", "컨디션 난조"),
    ("状態の段階数が多い程効果上昇", "상태의 단계 수가 많을수록 효과 상승"),
    ("コンボ数が多い程効果上昇", "콤보 수가 많을수록 효과 상승"),
    ("コンボ数が少ない程効果上昇", "콤보 수가 적을수록 효과 상승"),
    ("スキル成功率が高い程効果上昇", "스킬 성공률이 높을수록 효과 상승"),
    ("強化効果が多い程効果上昇", "강화 효과가 많을수록 효과 상승"),
    ("残スタミナが多い程効果上昇", "남은 스태미나가 많을수록 효과 상승"),
    ("残スタミナが少ない程効果上昇", "남은 스태미나가 적을수록 효과 상승"),
    ("消費したスタミナが多い程効果上昇", "소비한 스태미나가 많을수록 효과 상승"),
    ("このスキルで消費したスタミナが多い程効果上昇", "이 스킬로 소비한 스태미나가 많을수록 효과 상승"),
    ("パッシブスキル発動", "패시브 스킬 발동"),
    ("アクセサリパラメータ", "액세서리 파라미터"),
    ("アイドルパラメータ", "아이돌 파라미터"),
    ("アイドル", "아이돌"),
    ("隣接アイドル", "인접 아이돌"),
    ("相手全員", "상대 전원"),
    ("相手の", "상대의 "),
    ("同じレーンの相手", "같은 레인의 상대"),
    ("スコアラータイプ", "스코어러 타입"),
    ("バッファータイプ", "버퍼 타입"),
    ("サポータータイプ", "서포터 타입"),
    ("ボーカルタイプ", "보컬 타입"),
    ("ダンスタイプ", "댄스 타입"),
    ("ビジュアルタイプ", "비주얼 타입"),
    ("ボーカルレーン", "보컬 레인"),
    ("ダンスレーン", "댄스 레인"),
    ("ビジュアルレーン", "비주얼 레인"),
    ("味方全員に", "아군 전원에게 "),
    ("味方全員の", "아군 전원의 "),
    ("味方全員", "아군 전원"),
    ("全員の", "전원의 "),
    ("全員に", "전원에게 "),
    ("全員", "전원"),
    ("全体に", "전체에게 "),
    ("全体の", "전체의 "),
    ("全体", "전체"),
    ("自身の発動したスキル数が多い程効果上昇", "자신이 발동한 스킬 수가 많을수록 효과 상승"),
    ("自身の獲得スコアの割合スコア獲得", "자신의 획득 스코어의 비율 스코어 획득"),
    ("自身の", "자신의 "),
    ("自身が", "자신이 "),
    ("自身に", "자신에게 "),
    ("自身", "자신"),
    ("隣接する", "인접한"),
    ("右端に編成時", "오른쪽 끝에 편성 시"),
    ("左端に編成時", "왼쪽 끝에 편성 시"),
    ("左隣", "왼쪽 옆"),
    ("右隣", "오른쪽 옆"),
    ("右端", "오른쪽 끝"),
    ("左端", "왼쪽 끝"),
    ("センター", "센터"),
    ("スコアラー", "스코어러"),
    ("バッファー", "버퍼"),
    ("サポーター", "서포터"),
    ("ライブボーナス", "라이브 보너스"),
    ("獲得スキル", "획득 스킬"),
    ("スタミナ多", "스태미나 많음"),
    ("プロモーションマネージャー", "프로모션 매니저"),
    ("マネージャー", "매니저"),
    ("メンバー", "멤버"),
    ("フォト品質", "포토 품질"),
    ("消費スタ減", "소비 스태미나 감소"),
    ("クリティカル率", "크리티컬 확률"),
    ("クリティカル係数", "크리티컬 계수"),
    ("スキル成功率", "스킬 성공률"),
    ("ビートスコア", "비트 스코어"),
    ("コンボスコア", "콤보 스코어"),
    ("コンボ", "콤보"),
    ("Aスコア", "A스코어"),
    ("Pスコア", "P스코어"),
    ("SPスコア", "SP스코어"),
    ("集目上限開放", "주목 상한 해제"),
    ("集目上限解放", "주목 상한 해제"),
    ("集目", "주목"),
    ("ステルス効果", "스텔스 효과"),
    ("カバー効果", "커버 효과"),
    ("ステルス", "스텔스"),
    ("カバー", "커버"),
    ("対象最大スタミナ", "대상 최대 스태미나"),
    ("対象", "대상"),
    ("スキル", "스킬"),
    ("スコア", "스코어"),
    ("ダンス", "댄스"),
    ("ボーカル", "보컬"),
    ("ビジュアル", "비주얼"),
    ("クリティカル", "크리티컬"),
    ("スタミナ", "스태미나",
    ),
    ("メンタル", "멘탈"),
    ("テンションUP", "텐션 UP"),
    ("テンションアップ超化", "텐션 UP 초화"),
    ("上昇上限解放効果", "상승 상한 해제 효과"),
    ("低下の強化", "저하 강화"),
    ("上昇超化効果", "상승 초화 효과"),
    ("上限解放効果", "상한 해제 효과"),
    ("上限開放効果", "상한 해제 효과"),
    ("ボーカルブースト", "보컬 부스트"),
    ("ダンスブースト", "댄스 부스트"),
    ("ビジュアルブースト", "비주얼 부스트"),
    ("ブースト効果", "부스트 효과"),
    ("ブースト", "부스트"),
    ("超化効果", "초화 효과"),
    ("上昇効果", "상승 효과"),
    ("追加効果", "추가 효과"),
    ("低下効果", "저하 효과"),
    ("回復効果", "회복 효과"),
    ("上限開放", "상한 해제"),
    ("上限解放", "상한 해제"),
    ("段階数", "단계 수"),
    ("成功率", "성공률"),
    ("消費量", "소비량"),
    ("消費", "소비"),
    ("回復", "회복"),
    ("増加", "증가"),
    ("増強", "증강"),
    ("制限", "제한"),
    ("譲渡", "양도"),
    ("防止", "방지"),
    ("反射", "반사"),
    ("反転", "반전"),
    ("封印", "봉인"),
    ("継続", "지속"),
    ("状態", "상태"),
    ("確率", "확률"),
    ("倍率", "배율"),
    ("延長", "연장"),
    ("上昇", "상승"),
    ("低下", "저하"),
    ("獲得", "획득"),
    ("発動", "발동"),
    ("多い程", "많을수록"),
    ("少ない程", "적을수록"),
    ("高い程", "높을수록"),
    ("低い程", "낮을수록"),
    ("以上", "이상"),
    ("多い", "많은"),
    ("少ない", "적은"),
    ("高い", "높은"),
    ("低い", "낮은"),
    ("時", "시"),
]


def translate_status_name(text: str) -> str | None:
    out = text
    for jp, ko in sorted(STATUS_PARTS.items(), key=lambda item: len(item[0]), reverse=True):
        out = out.replace(jp, ko)
    out = compact(out)
    out = normalize_korean_spacing(out)
    if not out or has_japanese(out):
        return None
    return out


def normalize_korean_spacing(text: str) -> str:
    out = text
    out = out.replace("‚", ",")
    out = re.sub(r"\b(Da|Vo|Vi)(부스트|스코어|상승|증강|연장)", r"\1 \2", out)
    out = re.sub(r"(댄스|보컬|비주얼|스코어|텐션)up", r"\1 UP", out, flags=re.IGNORECASE)
    out = re.sub(r"(댄스|보컬|비주얼|비트|콤보|크리티컬|스킬 성공률|텐션)(부스트|스코어|상승|저하|연장|증강|스킬)", r"\1 \2", out)
    out = re.sub(r"(콤보)(지속)(효과)", r"\1 \2 \3", out)
    out = re.sub(r"(A스킬|P스킬|SP스킬)스코어", r"\1 스코어", out)
    out = re.sub(r"(A스코어|P스코어|SP스코어|스코어|부스트|텐션)UP", r"\1 UP", out)
    out = re.sub(r"(스코어러|버퍼|서포터|대상)(\d+명)", r"\1 \2", out)
    out = re.sub(r"([가-힣])exp(?=상승|저하|증가|감소|획득|$)", r"\1 exp", out)
    out = re.sub(r"exp(상승|저하|증가|감소|획득)", r"exp \1", out)
    out = re.sub(r"(부스트|스코어|상승|회복|연장|증강|감소|주목)스킬", r"\1 스킬", out)
    out = re.sub(r"(성공률|확률|계수|주목|텐션)스킬", r"\1 스킬", out)
    out = re.sub(r"(\{[0-9]+\})(연장|증강|회복|소비|감소|증가)", r"\1 \2", out)
    out = re.sub(r"(효과)(상승|저하|증가|감소|회복|연장|증강|반전|상태|방지|횟수|단계)", r"\1 \2", out)
    out = re.sub(r"(댄스|보컬|비주얼|스코어|크리티컬 계수|크리티컬계수)\s*(상승)\s*(상한 해제|초화)", r"\1 \2 \3", out)
    out = re.sub(r"(스텔스|주목|커버|부스트|상한 해제)(초화)", r"\1 \2", out)
    out = re.sub(r"(댄스|보컬|비주얼|스코어|비트 스코어|A스킬 스코어|P스킬 스코어|SP스킬 스코어)\s*(상승)\s*(상한 해제|초화)", r"\1 \2 \3", out)
    out = re.sub(r"(크리티컬)(계수|확률)", r"\1 \2", out)
    out = re.sub(r"(스태미나)(저하|상승|회복|소비)", r"\1 \2", out)
    out = re.sub(r"(주목|스텔스|커버)(상한 해제)", r"\1 \2", out)
    out = re.sub(r"(콤보)(지속)", r"\1 \2", out)
    out = re.sub(r"(스태미나)(지속)(회복|소비)", r"\1 \2 \3", out)
    out = re.sub(r"(초화|지속|상한 해제)(효과)", r"\1 \2", out)
    out = re.sub(r"(상승|저하|UP|DOWN)(상태)", r"\1 \2", out)
    out = re.sub(r"(UP|DOWN)(초화|효과)", r"\1 \2", out)
    out = re.sub(r"(성공률|스코어|댄스|보컬|비주얼)(UP)", r"\1 \2", out)
    out = re.sub(r"(많을수록|적을수록|높을수록|낮을수록)(효과)", r"\1 \2", out)
    out = re.sub(r"(성공률|계수|확률|스코어|스태미나|주목|감소|상승|부스트)(효과|상승|회복|소비|감소|증가|연장|증강|추가)", r"\1 \2", out)
    out = re.sub(r"(스코어)(\d+(?:\.\d+)?%?)", r"\1 \2", out)
    out = re.sub(r"(댄스|보컬|비주얼|스태미나|크리티컬|텐션|멘탈|포토 품질)(\d+(?:\.\d+)?%?)", r"\1 \2", out)
    out = re.sub(r"(\d+(?:\.\d+)?%)(상승|저하|증가|감소)", r"\1 \2", out)
    out = re.sub(r"(\d+)(소비|획득|상승|저하|회복|연장|증강|증가|감소)", r"\1 \2", out)
    out = re.sub(r"(\d+%)(스코어|확률|스태미나)", r"\1 \2", out)
    out = re.sub(r"(\d+단계) 의 ", r"\1 ", out)
    out = re.sub(r"(\d+단계)([가-힣A-Z])", r"\1 \2", out)
    out = re.sub(r"(\d+단계)\s+의\s+", r"\1 ", out)
    out = out.replace("스태미나이", "스태미나가")
    out = out.replace("댄스이", "댄스가")
    out = out.replace("댄스높은", "댄스가 높은")
    out = out.replace("보컬가", "보컬이")
    out = out.replace("보컬높은", "보컬이 높은")
    out = out.replace("비주얼가", "비주얼이")
    out = out.replace("비주얼높은", "비주얼이 높은")
    out = out.replace("스코어이", "스코어가")
    out = out.replace("크리티컬이", "크리티컬이")
    out = out.replace("상승로", "상승으로")
    out = out.replace("저하로", "저하로")
    out = out.replace("소비스태미나", "소비 스태미나")
    out = re.sub(r"(낮은|높은)(\d+명)", r"\1 \2", out)
    out = re.sub(r"([A-Za-z0-9\"'])플레이", r"\1 플레이", out)
    out = re.sub(r"라이브 중(\d+회만)", r"라이브 중 \1", out)
    out = out.replace("인접한아이돌", "인접한 아이돌")
    out = out.replace("상태 시", "상태일 때")
    out = re.sub(r"CT를 (증가|감소)", r"CT \1", out)
    out = out.replace("때 ,", "때,")
    out = out.replace("시 ,", "시,")
    out = out.replace("만>누군가", "만> 누군가")
    out = out.replace("UP효과", "UP 효과")
    out = out.replace("효과[", "효과 [")
    out = out.replace("상태[", "상태 [")
    out = out.replace(" [을/를]", "[을/를]")
    out = re.sub(r"(스코어러|버퍼|서포터|댄스|보컬|비주얼)\s*타입\s*(\d+명)", r"\1 타입 \2", out)
    out = re.sub(r"(댄스|보컬|비주얼|스코어|스태미나|크리티컬 계수|크리티컬 확률)\s*(상승|저하)\s*(초화|상한 해제)", r"\1 \2 \3", out)
    out = re.sub(r"(소비)\s*(스태미나)\s*(상승|저하|증가|감소)", r"\1 \2 \3", out)
    out = re.sub(r"(스태미나)\s*(지속)\s*(회복)", r"\1 \2 \3", out)
    out = re.sub(r"(상승|저하)(초화|상한 해제)", r"\1 \2", out)
    out = re.sub(r"(스태미나|크리티컬|스킬)\s*(\d+)$", r"\1 \2", out)
    out = re.sub(r"\b(A|P|SP)스킬\s*UP", r"\1스킬 UP", out)
    out = re.sub(r"일 때\s*에게\s*,\s*", "일 때, ", out)
    out = re.sub(r"때\s*에게\s*,\s*", "때, ", out)
    out = re.sub(r"(시|때),\s*확률로", r"\1, 일정 확률로", out)
    out = re.sub(r"CT를\s*저하", "CT 감소", out)
    out = re.sub(r"CT\s*저하", "CT 감소", out)
    out = re.sub(r"(라이브 중 \d+회만)\s*CT", r"\1 CT", out)
    out = re.sub(r" {2,}", " ", out)
    out = re.sub(r" ?\n ?", "\n", out)
    return out


def compatible_memory_translation(original: str, translated: str) -> bool:
    if "スキル" in original and "스킬" not in translated:
        return False
    return True


def translate_direct_rule_text(text: str) -> str | None:
    stripped = text.strip()

    match = re.fullmatch(r"けいおん！曲限定スキル(\d+)", stripped)
    if match:
        return f"케이온! 곡 한정 스킬 {match.group(1)}"

    match = re.fullmatch(r"ビート時、確率でスコアラータイプ(\d+)人にビジュアル上昇効果", stripped)
    if match:
        return f"비트 시, 일정 확률로 스코어러 타입 {match.group(1)}명에게 비주얼 상승 효과"

    match = re.fullmatch(r"ビート時、確率で自身にクリティカル率上昇効果\((\d+)回\)", stripped)
    if match:
        return f"비트 시, 일정 확률로 자신에게 크리티컬 확률 상승 효과 ({match.group(1)}회)"

    out = stripped.replace("誰かがクリティカル率アップ状態の時", "누군가가 크리티컬 확률 상승 상태일 때")
    match = re.fullmatch(
        r"ビート時\s*"
        r"(\d+)%のスコア獲得\s*"
        r"自身に(\d+)段階消費スタミナ低下効果\[(\d+)ビート\]\s*"
        r"スタミナ(\d+)消費 確率(\d+)% ライブ中(\d+)回のみ CT:(\d+)",
        out,
    )
    if match:
        score, stage, beat, stamina, chance, times, ct = match.groups()
        return "\n".join(
            [
                "비트 시",
                f"{score}% 스코어 획득",
                f"자신에게 {stage}단계 소비 스태미나 저하 효과 [{beat}비트]",
                f"스태미나 {stamina} 소비 확률 {chance}% 라이브 중 {times}회만 CT:{ct}",
            ]
        )

    match = re.fullmatch(
        r"誰かがクリティカル率アップ状態の時\s*"
        r"自身に(\d+)段階Aスキルスコア上昇効果\[(\d+)ビート\]\s*"
        r"スタミナ(\d+)消費 CT:(\d+)",
        stripped,
    )
    if match:
        stage, beat, stamina, ct = match.groups()
        return "\n".join(
            [
                "누군가가 크리티컬 확률 상승 상태일 때",
                f"자신에게 {stage}단계 A스킬 스코어 상승 효과 [{beat}비트]",
                f"스태미나 {stamina} 소비 CT:{ct}",
            ]
        )

    def translate_direct_fragment(fragment: str) -> str | None:
        out = fragment
        for jp, ko in PHRASES:
            out = out.replace(jp, ko)
        out = out.replace("効果", "효과")
        out = normalize_korean_spacing(out)
        return None if has_japanese(out) else out

    move_match = re.fullmatch(r"(.+?)の(.+?)を((?:SP|A|P)?スキル)前に移動", stripped)
    if move_match:
        owner = translate_direct_fragment(move_match.group(1))
        target = translate_direct_fragment(move_match.group(2))
        timing = translate_direct_fragment(move_match.group(3))
        if owner and target and timing:
            return f"{owner}의 {target}[을/를] {timing} 이전으로 이동"

    target_map = {
        "全員": "전원에게",
        "自身": "자신에게",
        "センター": "센터에게",
        "隣接するアイドル": "인접한 아이돌에게",
    }
    effect_line_re = re.compile(
        r"(?:(?P<combo>\d+)コンボ以上時\s*)?"
        r"(?P<target>全員|自身|センター|隣接するアイドル|(?P<type>.+?)タイプ(?P<count>\d+)人|対象(?P<target_count>\d+)人)"
        r"に(?:(?P<stage>\d+)段階)?(?P<effect>.+?効果)\[(?P<beat>\d+)ビート\]"
    )

    def convert_effect_line(line: str) -> str | None:
        def render_target(effect_match: re.Match[str]) -> str:
            if effect_match.group("type"):
                return f"{translate_rule_text(effect_match.group('type')) or effect_match.group('type')} 타입 {effect_match.group('count')}명에게"
            if effect_match.group("target_count"):
                return f"대상 {effect_match.group('target_count')}명에게"
            return target_map[effect_match.group("target")]

        def render_effect(effect: str) -> str | None:
            direct_effects = {
                "ビートスコア上昇超化効果": "비트 스코어 상승 초화 효과",
                "Aスキルスコア上昇超化効果": "A스킬 스코어 상승 초화 효과",
                "SPスキルスコア上昇超化効果": "SP스킬 스코어 상승 초화 효과",
                "Pスキルスコア上昇超化効果": "P스킬 스코어 상승 초화 효과",
            }
            effect = direct_effects.get(effect, effect)
            for jp, ko in PHRASES:
                effect = effect.replace(jp, ko)
            effect = effect.replace("効果", "효과")
            effect = normalize_korean_spacing(effect)
            return None if has_japanese(effect) else effect

        compound_match = re.fullmatch(
            r"(?:(?P<lane_owner>自身)が(?P<lane>.+?)レーンの時\s*)?"
            r"(?P<target>全員|自身|センター|隣接するアイドル|(?P<type>.+?)タイプ(?P<count>\d+)人|対象(?P<target_count>\d+)人)"
            r"に(?:(?P<stage>\d+)段階)?(?P<effect>.+?効果)\[(?P<beat>\d+)ビート\]"
            r"と(?:(?P<stage2>\d+)段階)?(?P<effect2>.+?効果)\[(?P<beat2>\d+)ビート\]",
            line.strip(),
        )
        if compound_match:
            target = render_target(compound_match)
            effect = render_effect(compound_match.group("effect"))
            effect2 = render_effect(compound_match.group("effect2"))
            if not effect or not effect2:
                return None
            stage = f"{compound_match.group('stage')}단계 " if compound_match.group("stage") else ""
            stage2 = f"{compound_match.group('stage2')}단계 " if compound_match.group("stage2") else ""
            prefix = ""
            if compound_match.group("lane_owner"):
                lane = translate_direct_fragment(compound_match.group("lane"))
                if not lane:
                    return None
                prefix = f"자신이 {lane} 레인일 때 "
            return (
                f"{prefix}{target} {stage}{effect} [{compound_match.group('beat')}비트] "
                f"및 {stage2}{effect2} [{compound_match.group('beat2')}비트]"
            )

        effect_match = effect_line_re.fullmatch(line.strip())
        if not effect_match:
            return None

        target = render_target(effect_match)
        effect = render_effect(effect_match.group("effect"))
        if not effect:
            return None

        stage = f"{effect_match.group('stage')}단계 " if effect_match.group("stage") else ""
        prefix = f"{effect_match.group('combo')}콤보 이상일 때 " if effect_match.group("combo") else ""
        return f"{prefix}{target} {stage}{effect} [{effect_match.group('beat')}비트]"

    def convert_direct_line(line: str) -> str | None:
        line = line.strip()
        score_match = re.fullmatch(r"(\d+)%のスコア獲得", line)
        if score_match:
            return f"{score_match.group(1)}% 스코어 획득"
        stamina_match = re.fullmatch(r"スタミナ(\d+)消費 CT:(\d+)", line)
        if stamina_match:
            return f"스태미나 {stamina_match.group(1)} 소비 CT:{stamina_match.group(2)}"
        move_line_match = re.fullmatch(r"(.+?)の(.+?)を((?:SP|A|P)?スキル)前に移動", line)
        if move_line_match:
            owner = translate_direct_fragment(move_line_match.group(1))
            target = translate_direct_fragment(move_line_match.group(2))
            timing = translate_direct_fragment(move_line_match.group(3))
            if owner and target and timing:
                return f"{owner}의 {target}를 {timing} 이전으로 이동"
        return convert_effect_line(line)

    if "上昇超化効果" in stripped or "移動" in stripped:
        converted_lines = []
        for line in stripped.splitlines():
            converted = convert_direct_line(line)
            if converted is None:
                converted_lines = []
                break
            converted_lines.append(converted)
        if converted_lines:
            return "\n".join(converted_lines)

    if out != stripped and not has_japanese(out):
        return out

    return None


def translate_rule_text(text: str) -> str | None:
    direct = translate_direct_rule_text(text)
    if direct:
        return normalize_korean_spacing(direct)

    out = text.replace("％", "%")
    leading_ws = re.match(r"^[ \t\r\n]*", text).group(0)
    trailing_ws = re.search(r"[ \t\r\n]*$", text).group(0)
    out = re.sub(r"月のテンペストメンバーの編成数毎に", r"달의 템페스트 멤버 편성 수당 ", out)
    out = re.sub(r"自身の獲得スコアの割合スコア獲得", r"자신의 획득 스코어의 비율 스코어 획득", out)
    out = re.sub(r"楽曲が｢(.+?)｣の時", r"악곡이 ｢\1｣일 때", out)
    out = re.sub(
        r"誰かが((?:SP|A|P)スキル)発動前に、",
        lambda match: f"누군가가 {match.group(1).replace('スキル', '스킬')} 발동 전에, ",
        out,
    )
    out = re.sub(r"(.+?)メンバーを(\d+)人以上編成時", r"\1 멤버를 \2명 이상 편성 시", out)
    out = re.sub(r"(.+?)メンバーの編成数毎に", r"\1 멤버 편성 수당 ", out)
    out = re.sub(r"(.+)状態の段階数が多い程効果上昇", r"\1 상태의 단계 수가 많을수록 효과 상승", out)
    out = re.sub(r"(.+)の編成数が多い程効果上昇", r"\1의 편성 수가 많을수록 효과 상승", out)
    out = re.sub(r"(\d+)%の確率で", r"\1% 확률로 ", out)
    out = re.sub(r"(\d+)%のスコア獲得", r"\1% 스코어 획득", out)
    out = re.sub(r"スコア獲得倍率が(\d+)%に上昇", r"스코어 획득 배율이 \1%로 상승", out)
    out = re.sub(r"自身の獲得スコアの(\d+)%のスコア獲得", r"자신의 획득 스코어의 \1% 스코어 획득", out)
    out = re.sub(r"(\d+)コンボ以下(?:の)?時", r"\1콤보 이하일 때 ", out)
    out = re.sub(r"(\d+)コンボ以上(?:の)?時", r"\1콤보 이상일 때 ", out)
    out = re.sub(r"(\d+)コンボ到達時", r"\1콤보 도달 시 ", out)
    out = re.sub(r"(\d+)コンボ時", r"\1콤보 시 ", out)
    out = re.sub(r"スタミナ(\d+)%以下(?:の)?時", r"스태미나 \1% 이하일 때 ", out)
    out = re.sub(r"スタミナ(\d+)%以上(?:の)?時", r"스태미나 \1% 이상일 때 ", out)
    out = re.sub(r"スタミナ(\d+)%以下の対象(\d+)人の", r"스태미나 \1% 이하인 대상 \2명의 ", out)
    out = re.sub(r"スタミナ(\d+)%以上の対象(\d+)人の", r"스태미나 \1% 이상인 대상 \2명의 ", out)
    out = re.sub(r"スタミナ(\d+)%以下の対象(\d+)人に", r"스태미나 \1% 이하인 대상 \2명에게 ", out)
    out = re.sub(r"スタミナ(\d+)%以上の対象(\d+)人に", r"스태미나 \1% 이상인 대상 \2명에게 ", out)
    out = re.sub(r"相手のスタミナが(\d+)%以下の対象(\d+)人に", r"상대의 스태미나가 \1% 이하인 대상 \2명에게 ", out)
    out = re.sub(r"相手のスタミナが(\d+)%以上の対象(\d+)人に", r"상대의 스태미나가 \1% 이상인 대상 \2명에게 ", out)
    out = re.sub(r"スタミナが低い ?(\d+)人にスタミナ回復-固定値", r"스태미나가 낮은 \1명에게 스태미나 회복-고정치", out)
    out = re.sub(r"スタミナが高い ?(\d+)人にスタミナ回復-固定値", r"스태미나가 높은 \1명에게 스태미나 회복-고정치", out)
    out = re.sub(r"自身のスタミナが(\d+)%以下の時", r"자신의 스태미나가 \1% 이하일 때 ", out)
    out = re.sub(r"誰かの(.+?)状態が(\d+)段階以上の時", r"누군가의 \1 상태가 \2단계 이상일 때", out)
    out = re.sub(r"誰かのスタミナが(\d+)%以下の時", r"누군가의 스태미나가 \1% 이하일 때", out)
    out = re.sub(r"誰かのスタミナが(\d+)%以上の時", r"누군가의 스태미나가 \1% 이상일 때", out)
    out = re.sub(r"誰かが(.+?)状態の時", r"누군가가 \1 상태일 때", out)
    out = re.sub(r"誰かが(.+?)状態時", r"누군가가 \1 상태일 때", out)
    out = re.sub(r"誰かが(.+?)の時", r"누군가가 \1일 때", out)
    out = re.sub(r"スタミナ(\d+)消費", r"스태미나 \1 소비", out)
    out = re.sub(r"スタミナを(\d+)回復", r"스태미나를 \1 회복", out)
    out = re.sub(r"対象(\d+)人のスタミナを(\d+)回復", r"대상 \1명의 스태미나를 \2 회복", out)
    out = re.sub(r"同じレーンの相手のスタミナを(\d+)消費", r"같은 레인의 상대의 스태미나 \1 소비", out)
    out = re.sub(r"同じレーンの相手のスタミナを消費", r"같은 레인의 상대의 스태미나 소비", out)
    out = re.sub(r"相手のセンターのスタミナを(\d+)消費", r"상대 센터의 스태미나 \1 소비", out)
    out = re.sub(r"相手の(.+?)タイプ ?(\d+)人のスタミナを(\d+)消費", r"상대 \1 타입 \2명의 스태미나 \3 소비", out)
    out = re.sub(r"ライブボーナスのCTを(\d+)減少", r"라이브 보너스 CT \1 감소", out)
    out = re.sub(r"ライブボーナスのCTを(\d+)増加", r"라이브 보너스 CT \1 증가", out)
    out = re.sub(r"全員のCTを(\d+)減少", r"전원의 CT \1 감소", out)
    out = re.sub(r"全員のCTを(\d+)増加", r"전원의 CT \1 증가", out)
    out = re.sub(r"(.+?)タイプ ?(\d+)人のCTを減少", r"\1 타입 \2명의 CT 감소", out)
    out = re.sub(r"(.+?)タイプ ?(\d+)人のCTを増加", r"\1 타입 \2명의 CT 증가", out)
    out = re.sub(r"(.+?)タイプ ?(\d+)人にCT減少", r"\1 타입 \2명에게 CT 감소", out)
    out = re.sub(r"(.+?)タイプ ?(\d+)人にCT増加", r"\1 타입 \2명에게 CT 증가", out)
    out = re.sub(r"同じレーンの相手のCT減少", r"같은 레인의 상대 CT 감소", out)
    out = re.sub(r"同じレーンの相手のCT増加", r"같은 레인의 상대 CT 증가", out)
    out = re.sub(r"隣接するアイドルのCTを(\d+)減少", r"인접한 아이돌의 CT \1 감소", out)
    out = re.sub(r"隣接するアイドルのCTを(\d+)増加", r"인접한 아이돌의 CT \1 증가", out)
    out = re.sub(r"(.+?)タイプ ?(\d+)人のCTを(\d+)減少", r"\1 타입 \2명의 CT \3 감소", out)
    out = re.sub(r"(.+?)タイプ ?(\d+)人のCTを(\d+)増加", r"\1 타입 \2명의 CT \3 증가", out)
    out = re.sub(r"(.+?)が高い ?(\d+)人のCTを(\d+)減少", r"\1이 높은 \2명의 CT \3 감소", out)
    out = re.sub(r"(.+?)が高い ?(\d+)人のCTを(\d+)増加", r"\1이 높은 \2명의 CT \3 증가", out)
    out = re.sub(r"(.+?)が低い ?(\d+)人のCTを(\d+)減少", r"\1이 낮은 \2명의 CT \3 감소", out)
    out = re.sub(r"(.+?)が低い ?(\d+)人のCTを(\d+)増加", r"\1이 낮은 \2명의 CT \3 증가", out)
    out = re.sub(r"同じレーンの相手のCTを(\d+)増加", r"같은 레인의 상대 CT \1 증가", out)
    out = re.sub(r"同じレーンの相手のCTを(\d+)減少", r"같은 레인의 상대 CT \1 감소", out)
    out = re.sub(
        r"自身の((?:SP|A|P)スキル)のCTをリセット",
        lambda match: f"자신의 {match.group(1).replace('スキル', '스킬')} CT 초기화",
        out,
    )
    out = re.sub(
        r"自身が(.+?)レーンの時 (.+?)タイプ ?(\d+)人の強化効果を((?:SP|A|P)スキル)前に移動",
        lambda match: f"자신이 {translate_rule_text(match.group(1)) or match.group(1)} 레인일 때 {translate_rule_text(match.group(2)) or match.group(2)} 타입 {match.group(3)}명의 강화 효과[을/를] {match.group(4).replace('スキル', '스킬')} 이전으로 이동",
        out,
    )
    out = re.sub(
        r"相手の(.+?)タイプ ?(\d+)人の強化効果消去",
        r"상대의 \1 타입 \2명의 강화 효과 제거",
        out,
    )
    out = re.sub(
        r"相手の(.+?)タイプ ?(\d+)人の((?:SP|A|P)スキル)を封印\[(\d+)ビート\]",
        lambda match: f"상대 {match.group(1)} 타입 {match.group(2)}명의 {match.group(3).replace('スキル', '스킬')}을 봉인 [{match.group(4)}비트]",
        out,
    )
    out = re.sub(r"自身を(.+?状態)\[(\d+)ビート\]", r"자신을 \1 [\2비트]", out)
    out = re.sub(r"同じレーンの相手の強化効果消去", r"같은 레인의 상대 강화 효과 제거", out)
    out = re.sub(r"同じレーンの相手の(.+?上昇効果)消去", r"같은 레인의 상대의 \1 제거", out)
    out = re.sub(r"同じレーンの相手の(.+?)を(.+?)に状態変化", r"같은 레인의 상대의 \1[을/를] \2로 상태 변화", out)
    out = re.sub(
        r"(.+?)タイプ ?(\d+)人の(.+?)を(.+?)に状態変化",
        r"\1 타입 \2명의 \3[을/를] \4로 상태 변화",
        out,
    )
    out = re.sub(
        r"(.+?)タイプ ?(\d+)人の((?:SP|A|P)スキル)のCTをリセット",
        lambda match: f"{match.group(1)} 타입 {match.group(2)}명의 {match.group(3).replace('スキル', '스킬')} CT 초기화",
        out,
    )
    out = re.sub(r"(.+)レーンの時", r"\1 레인일 때 ", out)
    out = re.sub(r"自身が(.+)レーンの時", r"자신이 \1 레인일 때 ", out)
    out = re.sub(r"(.+)状態の時", r"\1 상태일 때 ", out)
    out = re.sub(r"<(.+)タイプのみ>", r"<\1 타입만>", out)
    out = re.sub(r"(.+)タイプ ?(\d+)人に", r"\1 타입 \2명에게 ", out)
    out = re.sub(r"(.+)タイプ ?(\d+)人へ", r"\1 타입 \2명에게 ", out)
    out = re.sub(r"(.+)タイプ ?(\d+)人の", r"\1 타입 \2명의 ", out)
    out = re.sub(r"(.+)レーン ?(\d+)人に", r"\1 레인 \2명에게 ", out)
    out = re.sub(r"(.+?)の高い ?(\d+)人に", r"\1이 높은 \2명에게 ", out)
    out = re.sub(r"(.+?)の低い ?(\d+)人に", r"\1이 낮은 \2명에게 ", out)
    out = re.sub(r"(ダンス|ボーカル|ビジュアル|スタミナ|スコア)高い ?(\d+)人に", r"\1이 높은 \2명에게 ", out)
    out = re.sub(r"(ダンス|ボーカル|ビジュアル|スタミナ|スコア)低い ?(\d+)人に", r"\1이 낮은 \2명에게 ", out)
    out = re.sub(r"(.+)が高い ?(\d+)人に", r"\1이 높은 \2명에게 ", out)
    out = re.sub(r"(.+)が低い ?(\d+)人に", r"\1이 낮은 \2명에게 ", out)
    out = re.sub(r"対象 ?(\d+)人に", r"대상 \1명에게 ", out)
    out = re.sub(r"対象 ?(\d+)人の", r"대상 \1명의 ", out)
    out = re.sub(r"強化効果を(\d+)延長", r"강화 효과를 \1 연장", out)
    out = re.sub(r"強化効果を(\d+)段階増強", r"강화 효과를 \1단계 증강", out)
    out = re.sub(r"(\d+)段階", r"\1단계", out)
    out = re.sub(r"\[(\d+)ビート\]", r"[\1비트]", out)
    out = re.sub(r"(\d+)回のみ", r"\1회만", out)
    out = re.sub(r"(\d+)回", r"\1회", out)
    out = re.sub(r"(\d+)人へ", r"\1명에게 ", out)
    out = re.sub(r"(\d+)人に", r"\1명에게 ", out)
    out = re.sub(r"(\d+)人の", r"\1명의 ", out)
    out = re.sub(r"(\d+)人", r"\1명", out)
    out = out.replace("、", ", ")
    out = out.replace("&", " 및 ")
    out = out.replace(" / ", "\n")
    for jp, ko in PHRASES:
        out = out.replace(jp, ko)
    out = out.replace("を", "를 ")
    out = out.replace("へ", "에게 ")
    out = out.replace("に", "에게 ")
    out = out.replace("の", "의 ")
    out = out.replace("と", " 및 ")
    out = out.replace("が", "가 ")
    out = out.replace("で", "로 ")
    out = out.replace("します", "합니다")
    out = out.replace("効果", "효과")
    out = out.replace("タイプ 타입", "타입")
    out = out.replace("타입에게", "타입에게")
    out = out.replace("타입에게", "타입에게")
    out = out.replace("스코어러 타입에게", "스코어러 타입에게")
    out = out.replace("버퍼 타입에게", "버퍼 타입에게")
    out = out.replace("서포터 타입에게", "서포터 타입에게")
    out = out.replace("레인 레인", "레인")
    out = out.replace("자신이 자신이", "자신이")
    out = out.replace("스태미나를 를", "스태미나를")
    out = out.replace("를 소비", "소비")
    out = out.replace("상태의 의", "상태의")
    out = out.replace("효과를", "효과를")
    out = out.replace("전원의 의", "전원의")
    out = out.replace("상대의 의", "상대의")
    out = re.sub(r"상대의\s+", "상대 ", out)
    out = re.sub(r"같은 레인의 상대 (?=(?:스태미나|CT|강화|댄스|보컬|비주얼))", "같은 레인의 상대의 ", out)
    out = out.replace("자신의 의", "자신의")
    out = re.sub(r"(자신|센터|대상|전원)의 획득스코어의", r"\1 획득 스코어의", out)
    out = re.sub(r"(자신|센터|대상|전원)의 획득 스코어의", r"\1 획득 스코어의", out)
    out = out.replace("자신의 획득스코어의", "자신 획득 스코어의")
    out = out.replace("자신의 획득 스코어의", "자신 획득 스코어의")
    out = out.replace("대상의 의", "대상의")
    out = out.replace("에게  효과", "에게 효과")
    out = out.replace("에게  ", "에게 ")
    out = out.replace("의  ", "의 ")
    out = out.replace("가  ", "가 ")
    out = out.replace("스태미나가 낮은", "스태미나가 낮은")
    out = out.replace("댄스가 높은", "댄스가 높은")
    out = out.replace("보컬가 높은", "보컬이 높은")
    out = out.replace("비주얼가 높은", "비주얼이 높은")
    out = out.replace("스태미나가 높은", "스태미나가 높은")
    out = out.replace("스코어가 높은", "스코어가 높은")
    out = out.replace("상승상한", "상승 상한")
    out = out.replace("효과[", "효과 [")
    out = out.replace("상태[", "상태 [")
    out = out.replace("방지[", "방지 [")
    out = out.replace("제한[", "제한 [")
    out = out.replace("봉인[", "봉인 [")
    out = out.replace("회복효과", "회복 효과")
    out = out.replace("부스트상한", "부스트 상한")
    out = re.sub(r"(\d+(?:\.\d+)?%)제한", r"\1 제한", out)
    out = out.replace("P스킬를", "P스킬을")
    out = out.replace("A스킬를", "A스킬을")
    out = out.replace("SP스킬를", "SP스킬을")
    out = out.replace("UP스킬", "UP 스킬")
    out = out.replace("UP시", "UP 시")
    out = out.replace("상승시", "상승 시")
    out = out.replace("상태시", "상태 시")
    out = out.replace("상승스킬", "상승 스킬")
    out = out.replace("회복스킬", "회복 스킬")
    out = out.replace("크리티컬스킬", "크리티컬 스킬")
    out = out.replace("스코어스킬", "스코어 스킬")
    out = re.sub(r"([가-힣])([0-9]+(?:\.[0-9]+)?%)", r"\1 \2", out)
    out = re.sub(r"([가-힣])([0-9]+(?:\.[0-9]+)?)\b", r"\1 \2", out)
    out = re.sub(r"\]([가-힣])", r"] \1", out)
    out = out.replace(" [을/를]", "[을/를]")
    out = re.sub(r" +", " ", out)
    out = re.sub(r" ?\n ?", "\n", out).strip()
    out = normalize_korean_spacing(out)
    out = f"{leading_ws}{out}{trailing_ws}"
    if not out or has_japanese(out):
        return None
    if not same_numbers(text, out):
        return None
    return out


def memory_candidate(
    row: sqlite3.Row,
    exact_memory: dict[tuple[str, str, str], str],
    cross_memory: dict[str, str],
) -> Candidate | None:
    category = row["category"]
    field_path = row["field_path"]
    original = row["original_text"]
    unit_id = row["unit_id"]
    record_id = row["record_id"]
    old = row["translation_text"]

    exact = exact_memory.get((category, field_path, original))
    if exact and compatible_memory_translation(original, exact):
        exact = normalize_korean_spacing(exact)
        return Candidate(unit_id, category, record_id, field_path, original, old, exact, "same category/field exact memory", "safe")

    cross = cross_memory.get(original)
    if cross and compatible_memory_translation(original, cross):
        cross = normalize_korean_spacing(cross)
        return Candidate(unit_id, category, record_id, field_path, original, old, cross, "cross-field exact memory", "review")

    return None


def rule_candidate(row: sqlite3.Row) -> Candidate | None:
    category = row["category"]
    field_path = row["field_path"]
    original = row["original_text"]
    unit_id = row["unit_id"]
    record_id = row["record_id"]
    old = row["translation_text"]

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


def candidate_for_row(row: sqlite3.Row, exact_memory: dict[tuple[str, str, str], str], cross_memory: dict[str, str], mode: str) -> tuple[Candidate | None, Blocked | None]:
    category = row["category"]
    field_path = row["field_path"]
    original = row["original_text"]
    unit_id = row["unit_id"]
    record_id = row["record_id"]

    candidate = rule_candidate(row) or memory_candidate(row, exact_memory, cross_memory)

    if candidate:
        return candidate, None

    if field_path == "name":
        return None, Blocked(unit_id, category, record_id, field_path, original, "name needs human wording unless exact memory exists")

    if field_path == "description" or LEVEL_PATH_RE.match(field_path):
        return None, Blocked(unit_id, category, record_id, field_path, original, "unparsed syntax, proper noun, or creative sentence")

    return None, Blocked(unit_id, category, record_id, field_path, original, "unsupported field")


def collect_candidates(
    conn: sqlite3.Connection,
    categories: set[str],
    mode: str,
    limit: int | None,
) -> tuple[list[Candidate], list[Blocked], dict[str, int]]:
    exact_memory = build_exact_memory(conn, categories)
    cross_memory = build_cross_field_memory(conn, categories)
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
        "exact_memory": len(exact_memory),
        "cross_memory": len(cross_memory),
    }
    for row in conn.execute(sql, params):
        candidate, block = candidate_for_row(row, exact_memory, cross_memory, mode)
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
                status = 'translated',
                translator_name = ?,
                updated_at = ?
            WHERE unit_id = ?
              AND translation_text = ?
            """,
            (item.new, nickname, now(), item.unit_id, item.old),
        )
        applied += cursor.rowcount
    return applied


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

    # Prefer broad coverage of rule-derived review items first, then memory/safe items.
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
        "- Exact memory is used only as a fallback when a row cannot be normalized by rules.",
        "",
        "## Needs Review Or Manual Translation",
        "",
        "- Ability names and creative names that cannot be normalized as effect text.",
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
    ("missing space after effect word", re.compile(r"(효과|상태|초화|해제)\[")),
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
    parser.add_argument("--translator", default="auto-skill")
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
