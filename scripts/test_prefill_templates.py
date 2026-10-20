from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import import_db
from prefill_templates import compile_template, load_prefill_rules


class PrefillTemplateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.dictionary = self.root / "dictionary.json"
        self.translations = self.root / "translations.json"

    def rules(self, dictionaries, translations):
        self.dictionary.write_text(json.dumps(dictionaries, ensure_ascii=False), encoding="utf-8")
        self.translations.write_text(json.dumps({"test": translations}, ensure_ascii=False), encoding="utf-8")
        return load_prefill_rules(self.translations, self.dictionary)

    def test_new_dictionary_and_multiple_slots_require_no_code_changes(self):
        rules = self.rules(
            {"weather": {"晴れ": "맑음"}, "costume": {"夏服": "하복"}},
            {"{weather}の日は{costume} Lv{0}": "{weather}에는 {costume} Lv{0}"},
        )
        self.assertEqual(rules.translate("晴れの日は夏服 Lv064"), "맑음에는 하복 Lv064")
        self.assertIsNone(rules.translate("雨の日は夏服 Lv064"))

    def test_given_and_full_name_keep_distinct_translations(self):
        rules = self.rules(
            {"chr": {"ココア": "코코아"}, "chr_full": {"ココア": "호토 코코아"}},
            {"{chr}の部屋": "{chr}의 방", "{chr_full}の缶バッジ": "{chr_full}의 캔뱃지"},
        )
        self.assertEqual(rules.translate("ココアの部屋"), "코코아의 방")
        self.assertEqual(rules.translate("ココアの缶バッジ"), "호토 코코아의 캔뱃지")
        self.assertIsNone(rules.translate("ココア"))
        self.assertEqual(rules.standalone_conflicts, 1)

    def test_aliases_use_the_spelling_found_in_the_original(self):
        rules = self.rules(
            {"group": {"月スト": "달템", "月のテンペスト": "달의 템페스트"}},
            {"{group}のメンバー": "{group} 멤버"},
        )
        self.assertEqual(rules.translate("月ストのメンバー"), "달템 멤버")
        self.assertEqual(rules.translate("月のテンペストのメンバー"), "달의 템페스트 멤버")

    def test_dictionary_spelling_is_literal_and_matches_the_whole_original(self):
        rules = self.rules(
            {"term": {"愛": "아이", "愛子": "아이코", "A+B (夏)": "여름"}},
            {"{term}へ": "{term}에게"},
        )
        self.assertEqual(rules.translate("愛子へ"), "아이코에게")
        self.assertEqual(rules.translate("A+B (夏)へ"), "여름에게")
        for original in ["愛情へ", "AAAB (夏)へ", "前愛へ", "愛へ後", "愛へ\n"]:
            with self.subTest(original=original):
                self.assertIsNone(rules.translate(original))

    def test_repeated_dictionary_variable_requires_the_same_source_spelling(self):
        rules = self.rules({"term": {"朝": "아침", "昼": "낮"}}, {"{term}/{term}": "{term}·{term}"})
        self.assertEqual(rules.translate("朝/朝"), "아침·아침")
        self.assertIsNone(rules.translate("朝/昼"))

    def test_numeric_width_leading_zeroes_and_repeated_numbers(self):
        rules = self.rules({}, {"{0}/{1}~{0}/{1}": "{0}월 {1}일~{0}월 {1}일"})
        for first, second in [("064", "009"), ("０６４", "００９")]:
            with self.subTest(first=first):
                self.assertEqual(rules.translate(f"{first}/{second}~{first}/{second}"), f"{first}월 {second}일~{first}월 {second}일")
        self.assertIsNone(rules.translate("1/2~1/3"))
        self.assertIsNone(rules.translate("123-456/2~123-456/2"))

    def test_runtime_placeholders_remain_literal(self):
        rules = self.rules(
            {"chr": {"愛": "아이"}},
            {"{chr}と{user}で{threshold}回": "{chr}[와/과] {user} {threshold}회"},
        )
        self.assertEqual(rules.translate("愛と{user}で{threshold}回"), "아이와 {user} {threshold}회")
        self.assertIsNone(rules.translate("愛と太郎で5回"))

    def test_particles_apply_to_dictionary_slots_but_not_numbers_or_runtime_tokens(self):
        rules = self.rules(
            {"term": {"愛": "아이", "fran": "fran", "夏服": "하복", "制服": "교복 (동복)"}, "_batchim": {"fran": True}},
            {"{term} {0} {user}": "{term}[와/과] {term}[은/는] {term}[을/를] {term}[이/가] {0}[을/를] {user}[은/는]"},
        )
        self.assertEqual(rules.translate("愛 01 {user}"), "아이와 아이는 아이를 아이가 01[을/를] {user}[은/는]")
        self.assertEqual(rules.translate("fran 01 {user}"), "fran과 fran은 fran을 fran이 01[을/를] {user}[은/는]")
        self.assertTrue(rules.translate("夏服 01 {user}").startswith("하복과"))
        self.assertTrue(rules.translate("制服 01 {user}").startswith("교복 (동복)과"))

    def test_exact_translation_has_priority_including_ambiguous_standalone_names(self):
        rules = self.rules(
            {"chr": {"ココア": "코코아"}, "chr_full": {"ココア": "호토 코코아"}},
            {"ココア": "기존 단독 표기", "{chr}の部屋": "{chr}의 방", "ココアの部屋": "기존 방 표기"},
        )
        self.assertEqual(rules.translate("ココア"), "기존 단독 표기")
        self.assertEqual(rules.translate("ココアの部屋"), "기존 방 표기")

    def test_equal_priority_disagreement_is_reported_and_skipped(self):
        rules = self.rules(
            {"one": {"同名": "첫째"}, "longer_name": {"同名": "둘째"}},
            {"{one}です": "{one}입니다", "{longer_name}です": "{longer_name}입니다"},
        )
        self.assertIsNone(rules.translate("同名です"))
        self.assertTrue(any("equal-priority" in warning for warning in rules.warnings))

    def test_multiple_dictionaries_are_not_expanded_into_cartesian_products(self):
        rules = self.rules(
            {"first": {f"A{i}": f"가{i}" for i in range(100)}, "second": {f"B{i}": f"나{i}" for i in range(100)}},
            {"{first}/{second}/{0}": "{first}·{second}·{0}"},
        )
        self.assertEqual(len(rules.templates), 1)
        self.assertEqual(rules.translate("A99/B17/001"), "가99·나17·001")

    def test_newline_normalization_keeps_other_whitespace(self):
        rules = self.rules({}, {"前\\n{0} 後 ": "앞\\n{0} 뒤 "})
        self.assertEqual(rules.translate("前\n064 後 "), "앞\n064 뒤 ")
        self.assertIsNone(rules.translate("前\n064 後"))

    def test_invalid_and_reserved_dictionary_names_and_values(self):
        for dictionaries in [{"threshold": {"1": "일"}}, {"user": {}}, {"bad-name": {}}, {"chr": {"愛": 1}}, {"_batchim": {"fran": "true"}}]:
            with self.subTest(dictionaries=dictionaries), self.assertRaises(ValueError):
                self.rules(dictionaries, {})

    def test_empty_dictionary_does_not_capture_arbitrary_text(self):
        rules = self.rules({"weather": {}}, {"{weather}です": "{weather}입니다"})
        self.assertIsNone(rules.translate("晴れです"))

    def test_duplicate_json_key_and_missing_file_show_the_path(self):
        self.rules({}, {})
        self.dictionary.write_text('{"chr":{"愛":"아이","愛":"사랑"}}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "dictionary.json.*duplicate JSON key"):
            load_prefill_rules(self.translations, self.dictionary)
        self.dictionary.unlink()
        with self.assertRaisesRegex(ValueError, "dictionary.json"):
            load_prefill_rules(self.translations, self.dictionary)

    def test_target_cannot_introduce_a_known_placeholder_missing_from_source(self):
        with self.assertRaisesRegex(ValueError, "translation placeholder"):
            self.rules({"chr": {"愛": "아이"}}, {"原文": "{chr}"})
        with self.assertRaisesRegex(ValueError, "translation placeholder"):
            compile_template("Lv{0}", "Lv{1}", {})

    def test_missing_only_overwrite_author_and_change_log_on_temporary_database(self):
        rules = self.rules({"chr": {"麻奈": "마나"}}, {"{chr}誕生日": "{chr} 생일"})
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        import_db.ensure_schema(conn)
        for unit, original, translated, author in [("empty", "麻奈誕生日", "", ""), ("manual", "麻奈誕生日", "수동 번역", "human"), ("name", "麻奈", "", "")]:
            conn.execute("INSERT INTO translation_units(unit_id,source_type,category,source_file,record_id,field_path,original_text,translation_text,translator_name,updated_at) VALUES(?,'masterdb','Test','Test.json',?,'name',?,?,?,'before')", (unit, unit, original, translated, author))
        log = self.root / "changes.tsv"
        stats = import_db.prefill_translations(conn, rules=rules, log_path=log, log_limit=1)
        self.assertEqual(stats["updated"], 2)
        self.assertEqual(stats["log_count"], 2)
        self.assertEqual(len(stats["log_rows"]), 1)
        self.assertIn("format\tempty", log.read_text(encoding="utf-8"))
        self.assertEqual(conn.execute("SELECT translation_text,translator_name FROM translation_units WHERE unit_id='manual'").fetchone(), ("수동 번역", "human"))
        self.assertEqual(conn.execute("SELECT translation_text,status,translator_name FROM translation_units WHERE unit_id='empty'").fetchone(), ("마나 생일", "prefilled", "[BOT] auto-prefill"))
        stats = import_db.prefill_translations(conn, rules=rules, overwrite=True)
        self.assertEqual(stats["updated"], 1)
        self.assertEqual(conn.execute("SELECT translation_text FROM translation_units WHERE unit_id='manual'").fetchone()[0], "마나 생일")

    def test_bad_configuration_is_rejected_before_database_or_skill_updates(self):
        self.dictionary.write_text("{broken", encoding="utf-8")
        with patch.object(import_db, "PREFILL_DICTIONARY_PATH", self.dictionary), patch.object(import_db.sqlite3, "connect") as connect:
            with self.assertRaises(ValueError):
                import_db.rebuild(self.root / "untouched.sqlite3")
            connect.assert_not_called()
        with patch.object(import_db, "PREFILL_DICTIONARY_PATH", self.dictionary), patch.object(import_db.AUTO_SKILL_MODULE, "prefill_missing_skills") as skills:
            with self.assertRaises(ValueError):
                import_db.prefill_import_translations(None)
            skills.assert_not_called()

    def test_full_rebuild_preserves_manual_translation_and_prefills_new_names(self):
        self.rules({"chr_full": {"長瀬琴乃": "나가세 코토노"}}, {})
        masterdb = self.root / "masterdb"
        adv = self.root / "adv"
        masterdb.mkdir()
        adv.mkdir()
        (masterdb / "Story.json").write_text("[]", encoding="utf-8")
        (masterdb / "Character.json").write_text(json.dumps([{"id": "char-test", "name": "長瀬琴乃", "assetId": "test"}], ensure_ascii=False), encoding="utf-8")
        filename = "adv_test_prefill.txt"
        (adv / filename).write_text("[message name=長瀬琴乃 text=テスト原文]\n", encoding="utf-8")
        db_path = self.root / "rebuild.sqlite3"
        manual_id = f"adv:{filename}:1:text"
        conn = sqlite3.connect(db_path)
        import_db.ensure_schema(conn)
        conn.execute("INSERT INTO translation_units(unit_id,source_type,category,source_file,record_id,field_path,line_no,original_text,translation_text,translator_name,updated_at) VALUES(?,'adv','adv/test',?,'1','text',1,'テスト原文','수동 번역','human','before')", (manual_id, filename))
        conn.commit()
        conn.close()
        with patch.multiple(import_db, MASTERDB_DIR=masterdb, ADV_DIR=adv, LOCALIZATION_PATH=self.root / "missing-localization.json", PREFILL_DICTIONARY_PATH=self.dictionary, PREFILL_TRANSLATIONS_PATH=self.translations):
            stats = import_db.rebuild(db_path)
        conn = sqlite3.connect(db_path)
        self.addCleanup(conn.close)
        self.assertGreater(stats["updated"], 0)
        self.assertEqual(conn.execute("SELECT translation_text,translator_name FROM translation_units WHERE unit_id=?", (manual_id,)).fetchone(), ("수동 번역", "human"))
        self.assertEqual(conn.execute("SELECT translation_text,status,translator_name FROM translation_units WHERE unit_id='masterdb:Character:char-test:name'").fetchone(), ("나가세 코토노", "prefilled", "[BOT] auto-prefill"))


class ProjectDictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = load_prefill_rules(import_db.PREFILL_TRANSLATIONS_PATH, import_db.PREFILL_DICTIONARY_PATH)

    def test_prefill_data_paths_use_docs_independently_of_working_directory(self):
        self.assertEqual(import_db.PREFILL_TRANSLATIONS_PATH, import_db.ROOT / "docs" / "prefill_translations.json")
        self.assertEqual(import_db.PREFILL_DICTIONARY_PATH, import_db.ROOT / "docs" / "prefill_dictionary.json")
        self.assertTrue(import_db.PREFILL_TRANSLATIONS_PATH.is_absolute())
        self.assertTrue(import_db.PREFILL_DICTIONARY_PATH.is_absolute())

    def test_music_dictionary_prefills_names_including_unchanged_english(self):
        translations = json.loads(import_db.PREFILL_TRANSLATIONS_PATH.read_text(encoding="utf-8"))
        self.assertNotIn("노래 이름 (Music Name)", translations)
        music = self.rules.dictionaries["music"]
        self.assertEqual(music["ありがとう to You"], "고마워 to You")
        self.assertEqual(music["IDOLY PRIDE"], "IDOLY PRIDE")
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        import_db.ensure_schema(conn)
        for index, original in enumerate(music):
            conn.execute("INSERT INTO translation_units(unit_id,source_type,category,source_file,record_id,field_path,original_text,updated_at) VALUES(?,'masterdb','Music','Music.json',?,'name',?,'before')", (str(index), str(index), original))
        stats = import_db.prefill_translations(conn, rules=self.rules)
        self.assertEqual(stats["updated"], len(music))
        for original, translated, status, author in conn.execute("SELECT original_text,translation_text,status,translator_name FROM translation_units"):
            with self.subTest(original=original):
                self.assertEqual((translated, status, author), (music[original], "prefilled", "[BOT] auto-prefill"))

    def test_music_can_be_used_as_a_template_slot_without_new_python_rules(self):
        template = compile_template("「{music}」を{0}回クリア", "'{music}' {0}회 클리어", self.rules.dictionaries)
        self.assertEqual(template.render("「ココロDistance」を003回クリア", self.rules.dictionaries, self.rules.batchim), "'코코로 Distance' 003회 클리어")
        self.assertEqual(template.render("「IDOLY PRIDE」を2回クリア", self.rules.dictionaries, self.rules.batchim), "'IDOLY PRIDE' 2회 클리어")
        self.assertIsNone(template.render("「未登録の新曲」を2回クリア", self.rules.dictionaries, self.rules.batchim))

    def test_classified_names_follow_their_actual_uses(self):
        dictionaries = self.rules.dictionaries
        for group in ("costume", "hair", "music"):
            self.assertEqual(dictionaries[group]["ありがとう to You"], "고마워 to You")
        for group in ("costume", "hair"):
            self.assertEqual(dictionaries[group]["全力振袖・椿"], "전력 후리소데・동백")
        self.assertEqual(dictionaries["hair"]["編み込みハーフアップ"], "땋은 반묶음 머리")
        self.assertNotIn("編み込みハーフアップ", dictionaries["costume"])
        self.assertNotIn("編み込みハーフアップ", dictionaries["music"])
        self.assertEqual(dictionaries["music"]["Shine Purity〜輝きの純度〜"], "Shine Purity ~광채의 순도~")
        self.assertNotIn("Shine Purity〜輝きの純度〜", dictionaries["costume"])
        self.assertNotIn("Shine Purity〜輝きの純度〜", dictionaries["hair"])

    def test_hair_and_costume_template_slots_do_not_capture_each_others_names(self):
        hair = compile_template("ヘア：{hair}", "헤어: {hair}", self.rules.dictionaries)
        costume = compile_template("衣装：{costume}", "의상: {costume}", self.rules.dictionaries)
        self.assertEqual(hair.render("ヘア：編み込みハーフアップ", self.rules.dictionaries, self.rules.batchim), "헤어: 땋은 반묶음 머리")
        self.assertIsNone(costume.render("衣装：編み込みハーフアップ", self.rules.dictionaries, self.rules.batchim))
        self.assertEqual(costume.render("衣装：ありがとう to You", self.rules.dictionaries, self.rules.batchim), "의상: 고마워 to You")
        self.assertEqual(hair.render("ヘア：ありがとう to You", self.rules.dictionaries, self.rules.batchim), "헤어: 고마워 to You")

    def test_all_classified_names_prefill_with_their_registered_translations(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        import_db.ensure_schema(conn)
        expected = {}
        for group in ("costume", "hair", "music"):
            for index, (original, translated) in enumerate(self.rules.dictionaries[group].items()):
                unit_id = f"{group}:{index}"
                expected[unit_id] = translated
                conn.execute("INSERT INTO translation_units(unit_id,source_type,category,source_file,record_id,field_path,original_text,updated_at) VALUES(?,'masterdb',?,'Test.json',?,'name',?,'before')", (unit_id, group, unit_id, original))
        stats = import_db.prefill_translations(conn, rules=self.rules)
        self.assertEqual(stats["updated"], len(expected))
        for unit, translated, status, author in conn.execute("SELECT unit_id,translation_text,status,translator_name FROM translation_units"):
            with self.subTest(unit=unit):
                self.assertEqual((translated, status, author), (expected[unit], "prefilled", "[BOT] auto-prefill"))

    def test_project_names_group_compatibility_and_runtime_placeholders(self):
        samples = {
            "郁乃誕生日ショップ": "이쿠노 생일 상점",
            "小泉ひばりの缶バッジです。": "코이즈미 히바리의 캔뱃지입니다.",
            "ココアの部屋": "코코아의 방",
            "ココアの缶バッジです。": "호토 코코아의 캔뱃지입니다.",
            "franとホームで会話を{threshold}回しましょう。": "fran과 홈에서 {threshold}회 대화하세요.",
            "月のテンペストのおでかけシリーズ限定★5アイドルが1人確定！": "달의 템페스트 외출 시리즈 한정 ★5 아이돌 1명 확정!",
            "復刻衣装メダル(LizNoir)": "복각 의상 메달(LizNoir)",
            "タペストリー TRINITYAiLE": "태피스트리 TRINITYAiLE",
            "月スト": "달템",
            "月ストっぽく": "달의 템페스트처럼",
            "おでかけスタイル": "외출 스타일",
        }
        for original, expected in samples.items():
            with self.subTest(original=original):
                self.assertEqual(self.rules.translate(original), expected)


if __name__ == "__main__":
    unittest.main()
