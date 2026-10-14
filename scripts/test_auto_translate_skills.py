import unittest

from auto_translate_skills import candidate_for_row, numbers, translate_rule_text
from skill_translation_catalog import translate_catalog


class CatalogTranslationTests(unittest.TestCase):
    def test_rule_engine_defers_to_llm_lane(self):
        original = "スコアラータイプ2人に5段階Aスキルスコア上昇効果[32ビート]\nスタミナ183消費 CT:50"
        self.assertIsNone(translate_rule_text(original))

    def test_unknown_trailing_clause_is_not_silently_dropped(self):
        original = "スコアラータイプ2人に5段階Aスキルスコア上昇効果[32ビート]とCTを7減少\nスタミナ183消費 CT:50\n未知の条件"
        self.assertIsNone(translate_rule_text(original))

    def test_catalog_hit_yields_english(self):
        original = "N%のスコア獲得".replace("N", "30")
        row = dict(unit_id="u", category="Skill", record_id="r", field_path="levels[1;level].description",
                   original_text=original, translation_text=None)
        candidate, blocked = candidate_for_row(row)
        if candidate:
            self.assertEqual(candidate.new, "Gain 30% score")
            self.assertEqual(numbers(original), numbers(candidate.new))
        else:
            self.assertIsNotNone(blocked)


if __name__ == "__main__":
    unittest.main()
