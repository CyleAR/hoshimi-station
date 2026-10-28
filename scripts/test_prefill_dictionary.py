from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import prefill_dictionary as manager
from prefill_templates import load_prefill_rules
from gacha_dictionary import find_gacha_reuse, is_generic_gacha


class DictionaryManagerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.db = self.root / "test.sqlite3"
        self.dictionary = self.root / "prefill_dictionary.json"
        self.backups = self.root / "backups"
        self.original = {
            "chr": {"愛": "아이"}, "group": {"月スト": "달템"},
            "music": {"旧曲": "기존 곡"}, "costume": {"制服": "교복"},
            "future_category": {"独自": "직접 등록"}, "_batchim": {"fran": True},
        }
        self.dictionary.write_text(json.dumps(self.original, ensure_ascii=False, indent=4), encoding="utf-8")
        c = sqlite3.connect(self.db)
        c.execute("CREATE TABLE translation_units(unit_id TEXT, category TEXT, original_text TEXT, translation_text TEXT, record_id TEXT, translator_name TEXT, source_type TEXT, field_path TEXT, scope_type TEXT, scope_id TEXT, revision INTEGER NOT NULL DEFAULT 0)")
        c.close()

    def insert(self, original, translation, category="Item", field="name", source="masterdb", author="human"):
        with sqlite3.connect(self.db) as c:
            unit = str(c.execute("SELECT COUNT(*) FROM translation_units").fetchone()[0])
            c.execute("INSERT INTO translation_units VALUES(?,?,?,?,?,?,?,?,?,?,?)", (unit, category, original, translation, unit, author, source, field, category.lower(), unit, 0))

    def test_links_identify_every_unit_including_translated_duplicates(self):
        self.insert("同名", "")
        self.insert("同名", "")
        self.insert("同名", "동명")
        item = self.preview()["items"][0]
        self.assertEqual(item["units"], [
            {"unit_id": "0", "record_id": "0", "scope_type": "item", "scope_id": "0", "translation_text": "", "revision": 0},
            {"unit_id": "1", "record_id": "1", "scope_type": "item", "scope_id": "1", "translation_text": "", "revision": 0},
            {"unit_id": "2", "record_id": "2", "scope_type": "item", "scope_id": "2", "translation_text": "동명", "revision": 0},
        ])

    def test_gacha_names_can_be_saved_and_used_in_ticket_templates(self):
        self.insert("特別ガチャ", "특별 가차", category="Gacha")
        self.insert("説明", "설명", category="Gacha", field="description")
        self.insert("10回引く", "10회 뽑기", category="GachaButton")
        self.insert("未翻訳ガチャ", "", category="Gacha")
        self.insert("特別ガチャPt", "", category="Item")
        self.insert("未翻訳ガチャPt", "", category="Item")
        preview = self.preview(["gacha"])
        self.assertEqual(preview["counts"]["new"], 1)
        self.assertEqual(preview["counts"]["missing"], 1)
        self.apply(self.request(preview))
        self.assertEqual(json.loads(self.dictionary.read_bytes())["gacha"], {"特別ガチャ": "특별 가차"})
        templates = self.root / "templates.json"
        templates.write_text(json.dumps({"test": {"{gacha}チケット": "{gacha} 티켓"}}, ensure_ascii=False), encoding="utf-8")
        rules = load_prefill_rules(templates, self.dictionary)
        self.assertEqual(rules.translate("特別ガチャチケット"), "특별 가차 티켓")

    def test_card_names_can_be_saved_and_used_in_derived_item_templates(self):
        self.insert("君と過ごす日", "너와 보내는 날", category="Card")
        self.insert("説明", "설명", category="Card", field="description")
        self.insert("未翻訳カード", "", category="Card")
        preview = self.preview(["card"])
        self.assertEqual(preview["counts"]["new"], 1)
        self.assertEqual(preview["counts"]["missing"], 1)
        self.apply(self.request(preview))
        self.assertEqual(json.loads(self.dictionary.read_bytes())["card"], {"君と過ごす日": "너와 보내는 날"})
        templates = self.root / "templates.json"
        templates.write_text(json.dumps({"test": {"【{card}】ピース": "[{card}] 피스"}}, ensure_ascii=False), encoding="utf-8")
        rules = load_prefill_rules(templates, self.dictionary)
        self.assertEqual(rules.translate("【君と過ごす日】ピース"), "[너와 보내는 날] 피스")

    def test_pose_names_can_be_saved_without_descriptions_or_motion_names(self):
        self.insert("狐っぽく", "여우처럼", category="PhotoPose")
        self.insert("狐っぽく", "여우처럼", category="PhotoPose")
        self.insert("未翻訳ポーズ", "", category="PhotoPose")
        self.insert("長瀬麻奈", "나가세 마나", category="PhotoPose", field="description")
        self.insert("モーション名", "모션 이름", category="PhotoPoseMotion")
        self.insert("ADVポーズ", "대사 포즈", category="PhotoPose", source="adv")
        before_db, before_dictionary = self.db.read_bytes(), self.dictionary.read_bytes()
        preview = self.preview(["pose"])
        self.assertEqual(preview["groups"], [{"key": "pose", "label": "포즈", "category": "PhotoPose"}])
        self.assertEqual({item["original"] for item in preview["items"]}, {"狐っぽく", "未翻訳ポーズ"})
        self.assertEqual((preview["counts"]["new"], preview["counts"]["missing"]), (1, 1))
        candidate = next(item for item in preview["items"] if item["state"] == "new")
        self.assertEqual((candidate["source_count"], len(candidate["units"])), (2, 2))
        self.apply(self.request(preview))
        data = json.loads(self.dictionary.read_bytes())
        self.assertEqual(data["pose"], {"狐っぽく": "여우처럼"})
        for group, values in self.original.items():
            self.assertEqual(data[group], values)
        self.assertEqual(self.db.read_bytes(), before_db)
        self.assertEqual(next(self.backups.glob("*.json")).read_bytes(), before_dictionary)
        templates = self.root / "templates.json"
        templates.write_text(json.dumps({"test": {"「{pose}」で撮影": "'{pose}' 포즈로 촬영"}}, ensure_ascii=False), encoding="utf-8")
        rules = load_prefill_rules(templates, self.dictionary)
        self.assertEqual(rules.translate("狐っぽく"), "여우처럼")
        self.assertEqual(rules.translate("「狐っぽく」で撮影"), "'여우처럼' 포즈로 촬영")

    def test_conflicting_pose_translations_cannot_be_forced_into_the_dictionary(self):
        self.insert("同じポーズ", "첫 번역", category="PhotoPose")
        self.insert("同じポーズ", "다른 번역", category="PhotoPose")
        preview = self.preview(["pose"])
        self.assertEqual(preview["counts"]["conflict"], 1)
        before = self.dictionary.read_bytes()
        with self.assertRaises(manager.DictionaryError) as error:
            self.apply(self.request(preview, ids=[preview["items"][0]["id"]]))
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(self.dictionary.read_bytes(), before)

    def test_future_gacha_titles_are_detected_without_known_ids(self):
        self.insert("未来の新タイトル", "미래의 새 제목", category="Gacha")
        self.insert("未来の新タイトルガチャPt", "", category="Item")
        self.insert("miho誕生日\n2027", "miho 생일\n2027", category="Gacha")
        self.insert("miho誕生日2027ガチャPt", "", category="Item")
        self.insert("再利用なし", "재사용 없음", category="Gacha")
        found = self.preview(["gacha"])["items"]
        self.assertEqual([entry["original"] for entry in found], ["未来の新タイトル"])
        self.assertEqual(found[0]["gacha_reuse"]["count"], 1)

    def test_gacha_reuse_requires_full_names_or_quoted_references(self):
        titles = ["SUN", "The SUN", "新しい題名Ⅰ", "説明だけの題名"]
        found = find_gacha_reuse(titles, [
            ("1", "name", "The SUNガチャPt"),
            ("2", "name", "「新しい題名Ⅰ」専用ガチャチケット"),
            ("3", "description", "対象ガチャ：「説明だけの題名ピックアップガチャ」など"),
        ])
        self.assertEqual(set(found), set(titles) - {"SUN"})

    def test_revival_gacha_titles_are_excluded_but_base_titles_remain(self):
        titles = ["The SUN", "【復刻】The SUN", "【復刻】\nThe SUN", "復刻The SUN"]
        rows = [(str(index), "name", title + "ガチャPt") for index, title in enumerate(titles)]
        self.assertEqual(set(find_gacha_reuse(titles, rows)), {"The SUN"})
        self.assertEqual(set(find_gacha_reuse(["The SUN"], [("rev", "name", "【復刻】The SUNガチャPt")])), {"The SUN"})

    def test_guaranteed_pull_tickets_detect_full_roman_numeral_title(self):
        titles = ["月明かりの\nweekendⅠ", "月明かりの\nweekendⅡ", "月明かりの\nweekendⅢ"]
        found = find_gacha_reuse(titles, [
            ("ticket1", "name", "月明かりのweekendⅠ1人★5確定10連ガチャチケ"),
            ("ticket2", "name", "月明かりのweekendⅡ1人★5確定10連ガチャチケ"),
        ])
        self.assertEqual(set(found), set(titles[:2]))
        self.assertFalse(found[titles[1]]["exact"])
        self.assertEqual(found[titles[1]]["examples"][0]["record_id"], "ticket2")

    def test_whitespace_only_gacha_reuse_is_review_not_auto_addition(self):
        self.insert("新しい\n題名", "새로운\n제목", category="Gacha")
        self.insert("新しい題名ガチャPt", "", category="Item")
        result = self.preview(["gacha"])
        self.assertEqual(result["items"][0]["state"], "review")
        self.assertFalse(result["items"][0]["gacha_reuse"]["exact"])

    def test_generic_gacha_patterns_do_not_swallow_roman_numeral_titles(self):
        for title in ["miho誕生日\n2027", "無料20連ガチャ", "缶バッジパック Vol.8", "1人★5確定2STEP", "ドリームギフト\nガチャ Part3", "選べる★5ボーカルガチャ"]:
            self.assertTrue(is_generic_gacha(title), title)
        for title in ["新しい物語Ⅲ", "The ⅢX", "The SUN", "みんななかよく♪ドリームパレード！Ⅰ"]:
            self.assertFalse(is_generic_gacha(title), title)

    def preview(self, groups=None):
        return manager.execute(self.db, self.dictionary, self.backups, {"action": "preview", "groups": groups or list(manager.GROUPS)})

    def request(self, preview, ids=None):
        return {"action": "apply", "groups": [group["key"] for group in preview["groups"]],
                "dictionary_hash": preview["dictionary_hash"], "ids": ids or [item["id"] for item in preview["items"] if item["state"] == "new"]}

    def apply(self, request):
        return manager.execute(self.db, self.dictionary, self.backups, request)

    def test_preview_classifies_names_only_and_does_not_write_anything(self):
        rows = [("新曲", "새 곡", "Music"), ("制服", "제복", "Costume"), ("同名", "하나", "Item"),
                ("同名", "둘", "Item"), ("未翻訳", "", "Item"), ("一部日本語", "일부 日本語", "Item"),
                ("ヘア", "땋은 머리", "Hair"), ("靴", "신발", "Accessory"), ("旧曲", "기존 곡", "Music")]
        for original, translation, category in rows:
            self.insert(original, translation, category)
        self.insert("説明", "설명", field="description")
        self.insert("ADV", "대사", source="adv")
        before_db, before_file = self.db.read_bytes(), self.dictionary.read_bytes()
        result = self.preview()
        self.assertEqual(result["counts"], {"new": 3, "changed": 1, "conflict": 1, "review": 1, "unchanged": 1, "missing": 1})
        self.assertEqual({item["original"] for item in result["items"]}, {row[0] for row in rows})
        self.assertTrue(all(len(item["units"]) == item["source_count"] for item in result["items"]))
        self.assertEqual({item["state"] for item in result["items"] if item["units"]}, set(manager.STATES))
        self.assertEqual(self.db.read_bytes(), before_db)
        self.assertEqual(self.dictionary.read_bytes(), before_file)
        self.assertFalse(self.backups.exists())

    def test_merge_is_add_only_with_exact_backup_and_template_compatibility(self):
        self.insert("新アイテム", "새 아이템")
        self.insert("アクセサリー", "액세서리", "Accessory")
        self.insert("制服", "제복", "Costume")
        before_db, before_file = self.db.read_bytes(), self.dictionary.read_bytes()
        result = self.apply(self.request(self.preview()))
        self.assertEqual(result["added"], 2)
        self.assertEqual(next(self.backups.glob("*.json")).read_bytes(), before_file)
        data = json.loads(self.dictionary.read_bytes())
        for group, terms in self.original.items():
            self.assertEqual(data[group], terms)
        self.assertEqual(data["item"]["新アイテム"], "새 아이템")
        self.assertEqual(data["accessory"]["アクセサリー"], "액세서리")
        self.assertEqual(self.db.read_bytes(), before_db)
        with manager.dictionary_lock(self.dictionary):
            pass
        templates = self.root / "templates.json"
        templates.write_text(json.dumps({"test": {"{item}を{0}個": "{item} {0}개", "{accessory}を装備": "{accessory} 장착"}}, ensure_ascii=False), encoding="utf-8")
        rules = load_prefill_rules(templates, self.dictionary)
        self.assertEqual(rules.translate("新アイテムを064個"), "새 아이템 064개")
        self.assertEqual(rules.translate("アクセサリーを装備"), "액세서리 장착")

    def test_changed_database_rows_are_rechecked_and_skipped(self):
        self.insert("変更前", "변경 전")
        self.insert("保持", "유지")
        request = self.request(self.preview())
        with sqlite3.connect(self.db) as c:
            c.execute("UPDATE translation_units SET translation_text='변경 후' WHERE original_text='変更前'")
        result = self.apply(request)
        self.assertEqual((result["added"], result["skipped"]), (1, 1))
        self.assertEqual(json.loads(self.dictionary.read_bytes())["item"], {"保持": "유지"})

    def test_new_conflict_or_empty_translation_cannot_be_saved_from_stale_preview(self):
        for new_translation in ["", "日本語"]:
            with self.subTest(new_translation=new_translation):
                self.insert("保留", "보류")
                request = self.request(self.preview())
                with sqlite3.connect(self.db) as c:
                    c.execute("UPDATE translation_units SET translation_text=? WHERE original_text='保留'", (new_translation,))
                before = self.dictionary.read_bytes()
                with self.assertRaises(manager.DictionaryError) as error:
                    self.apply(request)
                self.assertEqual(error.exception.status, 409)
                self.assertEqual(self.dictionary.read_bytes(), before)

    def test_cannot_force_conflicts_review_items_existing_values_or_other_groups(self):
        for translation in ["하나", "둘"]:
            self.insert("競合", translation)
        self.insert("残存", "日本語")
        self.insert("制服", "제복", "Costume")
        result = self.preview()
        before = self.dictionary.read_bytes()
        for item in result["items"]:
            with self.subTest(original=item["original"]), self.assertRaises(manager.DictionaryError):
                self.apply(self.request(result, [item["id"]]))
        self.insert("有効", "유효")
        result = self.preview()
        request = self.request(result)
        request["groups"] = ["music"]
        with self.assertRaises(manager.DictionaryError):
            self.apply(request)
        self.assertEqual(self.dictionary.read_bytes(), before)

    def test_existing_dictionary_updates_require_explicit_opt_in_and_preserve_others(self):
        self.insert("制服", "새 교복", "Costume")
        preview = self.preview()
        item = next(item for item in preview["items"] if item["state"] == "changed")
        request = self.request(preview, [item["id"]])
        with self.assertRaises(manager.DictionaryError):
            self.apply(request)
        before = self.dictionary.read_bytes()
        request["allow_updates"] = True
        result = self.apply(request)
        self.assertEqual((result["added"], result["updated"]), (0, 1))
        data = json.loads(self.dictionary.read_bytes())
        self.assertEqual(data["costume"]["制服"], "새 교복")
        self.assertEqual(data["chr"], self.original["chr"])
        self.assertEqual(next(self.backups.glob("*.json")).read_bytes(), before)

    def test_stale_update_and_japanese_translation_cannot_replace_dictionary(self):
        self.insert("制服", "새 교복", "Costume")
        preview = self.preview()
        request = self.request(preview, [preview["items"][0]["id"]])
        request["allow_updates"] = True
        before = self.dictionary.read_bytes()
        with sqlite3.connect(self.db) as c:
            c.execute("UPDATE translation_units SET translation_text='日本語'")
        with self.assertRaises(manager.DictionaryError):
            self.apply(request)
        preview = self.preview()
        request = self.request(preview, [preview["items"][0]["id"]])
        request["allow_updates"] = True
        with self.assertRaises(manager.DictionaryError):
            self.apply(request)
        self.assertEqual(self.dictionary.read_bytes(), before)

    def test_stale_dictionary_version_requires_refresh_before_backup(self):
        self.insert("新規", "신규")
        request = self.request(self.preview())
        self.dictionary.write_bytes(self.dictionary.read_bytes() + b"\n")
        before = self.dictionary.read_bytes()
        with self.assertRaises(manager.DictionaryError) as error:
            self.apply(request)
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(self.dictionary.read_bytes(), before)
        self.assertFalse(self.backups.exists())

    def test_atomic_replace_failure_preserves_original_and_cleans_temporary_files(self):
        self.insert("新規", "신규")
        request = self.request(self.preview())
        before = self.dictionary.read_bytes()
        with patch.object(manager.os, "replace", side_effect=PermissionError("test")), self.assertRaises(PermissionError):
            self.apply(request)
        self.assertEqual(self.dictionary.read_bytes(), before)
        self.assertEqual(next(self.backups.glob("*.json")).read_bytes(), before)
        with manager.dictionary_lock(self.dictionary):
            pass
        self.assertFalse(list(self.root.glob(".prefill-dictionary-*.tmp")))

    def test_external_dictionary_edit_during_save_is_not_overwritten(self):
        self.insert("新規", "신규")
        request = self.request(self.preview())
        real_chmod = manager.os.chmod
        replacement = b'{"custom":{"external":"edit"}}\n'

        def chmod_then_edit(*args):
            real_chmod(*args)
            self.dictionary.write_bytes(replacement)

        with patch.object(manager.os, "chmod", side_effect=chmod_then_edit), self.assertRaises(manager.DictionaryError):
            self.apply(request)
        self.assertEqual(self.dictionary.read_bytes(), replacement)

    def test_parallel_saves_and_existing_lock_cannot_overwrite_each_other(self):
        self.insert("新規", "신규")
        request = self.request(self.preview())
        with manager.dictionary_lock(self.dictionary), self.assertRaises(manager.DictionaryError):
            self.apply(request)
        barrier = threading.Barrier(2)

        def save():
            barrier.wait()
            try:
                return self.apply(request)["ok"]
            except manager.DictionaryError as error:
                return error.status

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: save(), range(2)))
        self.assertEqual(sorted(map(str, results)), ["409", "True"])
        self.assertEqual(len(list(self.backups.glob("*.json"))), 1)

    def test_killed_worker_does_not_leave_a_permanent_save_lock(self):
        self.insert("新規", "신규")
        request = self.request(self.preview())
        code = "import sys,time; from pathlib import Path; sys.path.insert(0,sys.argv[1]); import prefill_dictionary as m; context=m.dictionary_lock(Path(sys.argv[2])); context.__enter__(); print('locked',flush=True); time.sleep(30)"
        worker = subprocess.Popen([sys.executable, "-X", "utf8", "-c", code, str(Path(manager.__file__).parent), str(self.dictionary)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
        try:
            self.assertEqual(worker.stdout.readline().strip(), "locked")
            with self.assertRaises(manager.DictionaryError):
                self.apply(request)
        finally:
            worker.kill()
            worker.communicate(timeout=5)
        self.assertEqual(self.apply(request)["added"], 1)

    def test_bad_json_duplicate_keys_invalid_groups_and_missing_db_fail_closed(self):
        before_db = self.db.read_bytes()
        for raw in [b'{"item":{"x":"one","x":"two"}}', b'{"item":{"x":null}}', b'{"_batchim":{"x":"true"}}', b'broken']:
            self.dictionary.write_bytes(raw)
            with self.assertRaises(manager.DictionaryError):
                self.preview()
            self.assertEqual(self.dictionary.read_bytes(), raw)
        self.assertEqual(self.db.read_bytes(), before_db)
        for groups in [[], ["../../file"], ["chr"], "music"]:
            with self.assertRaises(manager.DictionaryError):
                manager.execute(self.db, self.dictionary, self.backups, {"action": "preview", "groups": groups})
        self.dictionary.write_text("{}", encoding="utf-8")
        missing = self.root / "missing.sqlite3"
        with self.assertRaises(sqlite3.Error):
            manager.preview(missing, self.dictionary, ["item"])
        self.assertFalse(missing.exists())

    def test_shared_punctuation_english_and_line_breaks_are_not_mistranslation_flags(self):
        self.insert("英語", "IDOLY PRIDE", "Music")
        self.insert("記号", "스위트・브라이드")
        self.insert("改行\\nあり", "줄바꿈\\n있음")
        result = self.preview()
        self.assertEqual(result["counts"]["new"], 3)
        data = self.apply(self.request(result))
        self.assertEqual(data["added"], 3)
        self.assertIn("改行\nあり", json.loads(self.dictionary.read_bytes())["item"])

    def test_duplicates_deduplicate_and_cross_category_differences_remain_visible(self):
        self.insert("制服", "다른 용도의 제복", "Item")
        self.insert("制服", "다른 용도의 제복", "Item", author="another")
        item = self.preview()["items"][0]
        self.assertEqual(item["state"], "new")
        self.assertEqual(item["source_count"], 2)
        self.assertEqual(item["variants"][0]["authors"], ["another", "human"])
        self.assertEqual(item["shared_differences"], [{"group": "costume", "translation": "교복"}])

    def test_cli_download_and_errors_are_utf8_json(self):
        command = [sys.executable, "-X", "utf8", str(Path(manager.__file__)), "--db", str(self.db), "--dictionary", str(self.dictionary), "--backups", str(self.backups)]
        completed = subprocess.run(command, input=json.dumps({"action": "download"}), capture_output=True, text=True, encoding="utf-8", check=True)
        result = json.loads(completed.stdout)
        self.assertEqual(json.loads(result["content"]), self.original)
        completed = subprocess.run(command, input='{"action":"invalid"}', capture_output=True, text=True, encoding="utf-8", check=True)
        result = json.loads(completed.stdout)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 400)


if __name__ == "__main__":
    unittest.main()
