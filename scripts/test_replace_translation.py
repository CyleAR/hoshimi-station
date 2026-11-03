import contextlib
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import replace_translation


class ReplaceTranslationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = Path(self.directory.name) / "test.sqlite3"
        with sqlite3.connect(self.db) as conn:
            conn.executescript("""
                CREATE TABLE translation_units (unit_id TEXT, source_type TEXT, category TEXT, source_file TEXT,
                    record_id TEXT, field_path TEXT, translation_text TEXT, status TEXT, updated_at TEXT);
                CREATE TABLE phone_subtitle_clips (clip_name TEXT PRIMARY KEY, lines_json TEXT, revision INTEGER,
                    updated_by TEXT, updated_at TEXT);
                CREATE TABLE phone_subtitle_drafts (telephone_id TEXT, payload_json TEXT);
                INSERT INTO translation_units VALUES ('unit', 'adv', 'adv', 'file', '', 'text', '이전 단어', 'new', '');
                INSERT INTO phone_subtitle_drafts VALUES ('tel', '{"text":"이전 초안"}');
            """)
            self.lines = [{"line": 1, "time": 1.2, "text": "이전\\n내용"},
                          {"line": 2, "time": 4.0, "text": "이전 번 더"},
                          {"line": 3, "time": 6.0, "text": "유지"}]
            conn.execute("INSERT INTO phone_subtitle_clips VALUES (?, ?, 7, 'author', 'old')",
                         ("sud_vo_phone_tel-test", json.dumps(self.lines, ensure_ascii=False)))

    def run_script(self, *args):
        output = io.StringIO()
        with patch.object(sys, "argv", ["replace_translation.py", "이전", "이후", "--db", str(self.db), *args]), contextlib.redirect_stdout(output):
            replace_translation.main()
        return output.getvalue()

    def test_preview_and_apply_preserve_times_and_drafts_and_increment_revision(self):
        output = self.run_script()
        self.assertIn("matches=1", output)
        self.assertIn("phone_matches=2 phone_clips=1", output)
        self.assertIn("dry_run=true", output)
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT revision FROM phone_subtitle_clips").fetchone()[0], 7)
        output = self.run_script("--apply")
        self.assertIn("phone_updated=2 phone_clips_updated=1", output)
        with sqlite3.connect(self.db) as conn:
            lines_json, revision, updated_by = conn.execute("SELECT lines_json, revision, updated_by FROM phone_subtitle_clips").fetchone()
            lines = json.loads(lines_json)
            self.assertEqual([line["time"] for line in lines], [1.2, 4.0, 6.0])
            self.assertEqual([line["text"] for line in lines], ["이후\\n내용", "이후 번 더", "유지"])
            self.assertEqual((revision, updated_by), (8, "[bot] bulk-replace"))
            self.assertEqual(conn.execute("SELECT translation_text FROM translation_units").fetchone()[0], "이후 단어")
            self.assertEqual(conn.execute("SELECT payload_json FROM phone_subtitle_drafts").fetchone()[0], '{"text":"이전 초안"}')

    def test_no_phone_table_remains_supported(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("DROP TABLE phone_subtitle_clips")
        self.assertIn("phone_matches=0", self.run_script("--apply"))

    def test_newline_control_sequence_is_not_changed_by_single_letter_replacement(self):
        self.assertEqual(replace_translation.replace_phone_text("one\\ntwo", "n", "x"), "oxe\\ntwo")
        self.assertEqual(replace_translation.replace_phone_text("one\ntwo", "n", "x"), "oxe\ntwo")
        self.assertEqual(replace_translation.replace_phone_text("one\\ntwo", "\\n", " "), "one two")

    def test_wildcards_match_literally(self):
        with sqlite3.connect(self.db) as conn:
            conn.row_factory = sqlite3.Row
            self.assertEqual(replace_translation.count_rows(conn, "%")[0], 0)
            self.assertEqual(replace_translation.preview_rows(conn, "_", 10), [])

    def test_invalid_json_rolls_back_all_updates(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE phone_subtitle_clips SET lines_json = 'invalid'")
        with self.assertRaises(json.JSONDecodeError):
            self.run_script("--apply")
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT translation_text FROM translation_units").fetchone()[0], "이전 단어")
            self.assertEqual(conn.execute("SELECT revision FROM phone_subtitle_clips").fetchone()[0], 7)


if __name__ == "__main__":
    unittest.main()
