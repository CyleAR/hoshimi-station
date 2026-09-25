import unittest

from auto_translate_skills import candidate_for_row, numbers, translate_rule_text


class CompoundCTTranslationTests(unittest.TestCase):
    def test_scorer_a_skill_levels_preserve_numbers_and_lines(self):
        for stage, beat, reduction, stamina in (
            (5, 25, 5, 140), (5, 28, 6, 160), (5, 32, 7, 183),
            (6, 32, 8, 217), (6, 36, 9, 244), (6, 40, 11, 279),
        ):
            for line_break in ("\n", " \n", " \r\n"):
                with self.subTest(stage=stage, beat=beat, line_break=line_break):
                    original = (
                        f"スコアラータイプ2人に{stage}段階Aスキルスコア上昇効果[{beat}ビート]"
                        f"とCTを{reduction}減少{line_break}スタミナ{stamina}消費 CT:50"
                    )
                    translated = translate_rule_text(original)
                    self.assertEqual(translated, (
                        f"스코어러 타입 2명에게 {stage}단계 A스킬 스코어 상승 효과 [{beat}비트] "
                        f"및 CT를 {reduction} 감소\n스태미나 {stamina} 소비 CT:50"
                    ))
                    self.assertEqual(numbers(original), numbers(translated))
                    self.assertEqual(len(original.splitlines()), len(translated.splitlines()))

    def test_existing_related_rules_are_unchanged(self):
        cases = (
            (
                "スコアラータイプ2人に5段階Aスキルスコア上昇効果[32ビート]\nスタミナ183消費 CT:50",
                "스코어러 타입 2명에게 5단계 A스킬 스코어 상승 효과 [32비트]\n스태미나 183 소비 CT:50",
            ),
            (
                "スコアラータイプ2人のCTを7減少\nスタミナ183消費 CT:50",
                "스코어러 타입 2명의 CT 7 감소\n스태미나 183 소비 CT:50",
            ),
            (
                "スコアラータイプ2人に5段階Aスキルスコア上昇効果[33ビート]と7段階クリティカル係数上昇効果[33ビート]\nスタミナ224消費 CT:50",
                "스코어러 타입 2명에게 5단계 A스킬 스코어 상승 효과 [33비트] 및 7단계 크리티컬 계수 상승 효과 [33비트]\n스태미나 224 소비 CT:50",
            ),
        )
        for original, expected in cases:
            with self.subTest(original=original):
                self.assertEqual(translate_rule_text(original), expected)

    def test_other_target_keeps_existing_memory_translation(self):
        original = "センターに7段階クリティカル係数上昇効果[27ビート]とCTを9減少 \nスタミナ141消費 CT:50"
        translated = "센터에게 7단계 크리티컬 계수 상승 효과 [27비트]와 CT를 9 감소\n스태미나 141 소비 CT:50"
        row = dict(unit_id="center", category="Skill", record_id="center", field_path="levels[1;level].description",
                   original_text=original, translation_text=translated)
        self.assertIsNone(translate_rule_text(original))
        candidate, blocked = candidate_for_row(
            row, {("Skill", row["field_path"], original): translated}, {}, "overwrite",
        )
        self.assertIsNone(blocked)
        self.assertEqual(candidate.new, translated)
        self.assertEqual(candidate.reason, "same category/field exact memory")

    def test_unknown_trailing_clause_is_not_silently_dropped(self):
        original = "スコアラータイプ2人に5段階Aスキルスコア上昇効果[32ビート]とCTを7減少\nスタミナ183消費 CT:50\n未知の条件"
        self.assertIsNone(translate_rule_text(original))


if __name__ == "__main__":
    unittest.main()
