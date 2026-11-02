from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import export_output
import import_db


class PhoneSubtitleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.db = self.root / "test.sqlite3"
        self.out = self.root / "output"
        self.phone_file = self.out / "local-files" / "phoneSubtitles.json"
        self.masterdb = self.root / "masterdb"
        self.masterdb.mkdir()
        self.adv = self.root / "adv"
        self.adv.mkdir()
        self.localization = self.root / "localization.json"
        self.localization_translation = self.root / "localization-translated.json"
        self.dictionary = self.root / "dictionary.json"
        self.templates = self.root / "templates.json"
        for path in (self.dictionary, self.templates, self.localization_translation):
            path.write_text("{}", encoding="utf-8")
        self.localization.write_text('{"example":"source"}', encoding="utf-8")
        resources = {
            "Character": [{"id": "char-ai", "name": "\u611b"}],
            "Story": [],
            "Telephone": [{"id": "tel-test", "characterId": "char-ai", "name": "\u96fb\u8a71"}],
        }
        for category, rows in resources.items():
            (self.masterdb / f"{category}.json").write_text(json.dumps(rows), encoding="utf-8")
        (self.adv / "adv_test.txt").write_text('[message name=\u611b text=\u3082\u3057\u3082\u3057]\n', encoding="utf-8")
        self.clips = {
            "sud_vo_phone_z_unlinked": [],
            "sud_vo_phone_a_custom": [
                {"line": 1, "time": 0, "text": "\uccab \uc904\\n\ub458\uc9f8 \uc904"},
                {"line": 2, "time": 1.25, "text": "\uc2e4\uc81c\n\uac1c\ud589\r\n\ubcf4\uc874"},
                {"line": 3, "time": 2.5, "text": ""},
            ],
        }
        conn = sqlite3.connect(self.db)
        try:
            import_db.ensure_schema(conn)
            with patch.object(import_db, "LOCALIZATION_PATH", self.localization):
                import_db.import_localization(conn)
            conn.execute("UPDATE translation_units SET translation_text = 'before'")
            conn.commit()
        finally:
            conn.close()

    def subtitle_schema(self, *, initialized=True, clips=None):
        conn = sqlite3.connect(self.db)
        try:
            conn.executescript("""
                CREATE TABLE phone_subtitle_clips (
                    clip_name TEXT PRIMARY KEY,
                    lines_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0,
                    updated_by TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE phone_subtitle_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE phone_subtitle_links (telephone_id TEXT PRIMARY KEY, clip_name TEXT NOT NULL);
                CREATE TABLE phone_subtitle_drafts (
                    telephone_id TEXT PRIMARY KEY,
                    draft_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    accepted_at TEXT,
                    accepted_by TEXT
                );
            """)
            if initialized:
                conn.execute("INSERT INTO phone_subtitle_settings VALUES ('imported', ?)", (str(self.phone_file),))
            for name, lines in (self.clips if clips is None else clips).items():
                conn.execute(
                    "INSERT INTO phone_subtitle_clips VALUES (?, ?, 7, 'tester', '2026-11-02')",
                    (name, json.dumps(lines, ensure_ascii=False)),
                )
            conn.execute("INSERT INTO phone_subtitle_links VALUES ('tel-test', 'sud_vo_phone_a_custom')")
            conn.execute(
                "INSERT INTO phone_subtitle_drafts VALUES ('tel-test', 'draft-id', ?, 'hash', '2026-11-02', NULL, NULL)",
                (json.dumps({"transcript": {"model": "large-v3", "segments": [{"start": 0, "end": 1, "text": "\u3082\u3057\u3082\u3057"}]},
                             "lines": [{"line": 1, "time": 0, "text": "unapplied draft"}]}),),
            )
            conn.commit()
        finally:
            conn.close()

    def existing_file(self, data):
        self.phone_file.parent.mkdir(parents=True, exist_ok=True)
        self.phone_file.write_bytes(data)

    def run_export(self, *, overwrite=True):
        argv = ["export_output.py", "--db", str(self.db), "--out", str(self.out)]
        if overwrite:
            argv.append("--overwrite")
        output = io.StringIO()
        with patch.multiple(
            export_output,
            MASTERDB_DIR=self.masterdb,
            ADV_DIR=self.adv,
            LOCALIZATION_PATH=self.localization,
            PREFILL_DICTIONARY_PATH=self.dictionary,
        ), patch("sys.argv", argv), redirect_stdout(output):
            export_output.main()
        return output.getvalue()

    def subtitle_rows(self):
        conn = sqlite3.connect(self.db)
        try:
            return {
                table: conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
                for table in ("phone_subtitle_clips", "phone_subtitle_settings", "phone_subtitle_links", "phone_subtitle_drafts")
            }
        finally:
            conn.close()

    def test_missing_tables_preserve_existing_file_byte_for_byte(self):
        original = b'{"legacy":[]}\r\n'
        self.existing_file(original)
        self.run_export()
        self.assertEqual(self.phone_file.read_bytes(), original)

    def test_missing_either_table_preserves_file(self):
        self.subtitle_schema()
        for table in ("phone_subtitle_settings", "phone_subtitle_clips"):
            with self.subTest(table=table):
                conn = sqlite3.connect(self.db)
                try:
                    conn.execute("BEGIN")
                    conn.execute(f"ALTER TABLE {table} RENAME TO hidden")
                    conn.commit()
                    self.existing_file(b"do not parse or replace")
                    self.run_export()
                    self.assertEqual(self.phone_file.read_bytes(), b"do not parse or replace")
                    conn.execute(f"ALTER TABLE hidden RENAME TO {table}")
                    conn.commit()
                finally:
                    conn.close()

    def test_uninitialized_database_preserves_empty_and_nonempty_files(self):
        self.subtitle_schema(initialized=False)
        for data in (b"", b"{}\r\n", b"invalid-but-preserved"):
            with self.subTest(data=data):
                self.existing_file(data)
                self.run_export()
                self.assertEqual(self.phone_file.read_bytes(), data)

    def test_uninitialized_export_does_not_create_subtitle_file(self):
        self.subtitle_schema(initialized=False, clips={})
        self.run_export(overwrite=False)
        self.assertFalse(self.phone_file.exists())

    def test_initialized_export_preserves_lines_unlinked_clips_and_database(self):
        self.subtitle_schema()
        before = self.subtitle_rows()
        log = self.run_export(overwrite=False)
        self.assertIn("Exported 2 phone subtitle clips", log)
        self.assertEqual(json.loads(self.phone_file.read_bytes()), self.clips)
        self.assertEqual(list(json.loads(self.phone_file.read_bytes())), sorted(self.clips))
        self.assertIn("\uccab \uc904".encode("utf-8"), self.phone_file.read_bytes())
        self.assertEqual(self.subtitle_rows(), before)

    def test_initialized_export_replaces_empty_or_stale_file(self):
        self.subtitle_schema()
        for data in (b"", b'{"old":[]}'):
            with self.subTest(data=data):
                self.existing_file(data)
                self.run_export()
                self.assertEqual(json.loads(self.phone_file.read_bytes()), self.clips)

    def test_unapplied_drafts_never_appear_in_export(self):
        self.subtitle_schema()
        self.run_export()
        self.assertNotIn(b"unapplied draft", self.phone_file.read_bytes())
        self.assertEqual(json.loads(self.phone_file.read_bytes()), self.clips)

    def test_initialized_empty_database_is_authoritative(self):
        self.subtitle_schema(clips={})
        self.existing_file(b'{"old":[]}')
        self.run_export()
        self.assertEqual(json.loads(self.phone_file.read_bytes()), {})

    def test_imported_sentinel_presence_not_value_controls_export(self):
        self.subtitle_schema()
        conn = sqlite3.connect(self.db)
        try:
            conn.execute("UPDATE phone_subtitle_settings SET value = ''")
            conn.commit()
        finally:
            conn.close()
        self.run_export()
        self.assertEqual(json.loads(self.phone_file.read_bytes()), self.clips)

    def test_invalid_stored_json_does_not_truncate_existing_file(self):
        self.subtitle_schema()
        conn = sqlite3.connect(self.db)
        try:
            conn.execute("UPDATE phone_subtitle_clips SET lines_json = 'invalid'")
            conn.commit()
        finally:
            conn.close()
        self.existing_file(b"preserve on failure")
        with self.assertRaises(json.JSONDecodeError):
            self.run_export()
        self.assertEqual(self.phone_file.read_bytes(), b"preserve on failure")

    def test_export_uses_one_snapshot_during_concurrent_edit(self):
        self.subtitle_schema()
        original_export = export_output.export_masterdb

        def edit_after_first_read(conn, out_dir):
            result = original_export(conn, out_dir)
            writer = sqlite3.connect(self.db)
            try:
                writer.execute("UPDATE translation_units SET translation_text = 'after'")
                writer.execute("UPDATE phone_subtitle_clips SET lines_json = '[]'")
                writer.execute("DELETE FROM phone_subtitle_settings WHERE key = 'imported'")
                writer.commit()
            finally:
                writer.close()
            return result

        with patch.object(export_output, "export_masterdb", side_effect=edit_after_first_read):
            self.run_export()
        self.assertEqual(json.loads(self.phone_file.read_bytes()), self.clips)
        localization_file = self.out / "local-files" / "localization.json"
        self.assertEqual(json.loads(localization_file.read_bytes()), {"example": "before"})
        self.assertEqual(self.subtitle_rows()["phone_subtitle_settings"], [])

    def test_actual_rebuild_preserves_subtitles_metadata_and_associations(self):
        self.subtitle_schema()
        before = self.subtitle_rows()
        with patch.multiple(
            import_db,
            MASTERDB_DIR=self.masterdb,
            ADV_DIR=self.adv,
            LOCALIZATION_PATH=self.localization,
            LOCALIZATION_TRANSLATION_PATH=self.localization_translation,
            PREFILL_TRANSLATIONS_PATH=self.templates,
            PREFILL_DICTIONARY_PATH=self.dictionary,
        ), redirect_stdout(io.StringIO()):
            for _ in range(2):
                stats = import_db.rebuild(self.db)
                self.assertEqual(stats["localization_imported"], 1)
                self.assertEqual(self.subtitle_rows(), before)
        conn = sqlite3.connect(self.db)
        try:
            self.assertEqual(conn.execute("SELECT entity_id FROM entities WHERE entity_type = 'telephone'").fetchall(), [("tel-test",)])
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM translation_units WHERE source_type = 'masterdb'").fetchone()[0], 0)
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM translation_units WHERE source_type = 'adv'").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT translation_text FROM translation_units WHERE source_type = 'localization'").fetchone(), ("before",))
            self.assertEqual(conn.execute("SELECT to_id FROM links WHERE from_id = 'char-ai' AND to_type = 'telephone'").fetchall(), [("tel-test",)])
        finally:
            conn.close()
        self.run_export()
        self.assertEqual(json.loads(self.phone_file.read_bytes()), self.clips)


if __name__ == "__main__":
    unittest.main()
