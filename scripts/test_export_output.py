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


class DictionaryExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.out = self.root / "output"
        self.dictionary = self.root / "dictionary.json"
        self.payload = {
            "chr": {"ココア": "코코아"},
            "chr_full": {"ココア": "호토 코코아"},
            "weather": {"晴れ": "맑음"},
            "_batchim": {"fran": True},
        }
        self.data = (json.dumps(self.payload, ensure_ascii=False, indent=4) + "\r\n").encode("utf-8")
        self.dictionary.write_bytes(self.data)
        self.masterdb = self.root / "masterdb"
        self.masterdb.mkdir()
        (self.masterdb / "Story.json").write_text("[]", encoding="utf-8")
        self.adv = self.root / "adv"
        self.adv.mkdir()
        self.localization = self.root / "localization.json"
        self.localization.write_text('{"english.example":"Japanese"}', encoding="utf-8")
        self.db = self.root / "test.sqlite3"
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE translation_units(source_type TEXT, category TEXT, source_file TEXT, record_id TEXT, field_path TEXT, line_no INTEGER, original_text TEXT, translation_text TEXT)")
        conn.execute("INSERT INTO translation_units(source_type,category,record_id,translation_text) VALUES('localization','Localization','english.example','한국어')")
        conn.commit()
        conn.close()

    def run_export(self, overwrite=False):
        argv = ["export_output.py", "--db", str(self.db), "--out", str(self.out)]
        if overwrite:
            argv.append("--overwrite")
        output = io.StringIO()
        with patch.multiple(export_output, PREFILL_DICTIONARY_PATH=self.dictionary, MASTERDB_DIR=self.masterdb, ADV_DIR=self.adv, LOCALIZATION_PATH=self.localization), patch("sys.argv", argv), redirect_stdout(output):
            export_output.main()
        return output.getvalue()

    def test_copy_is_byte_identical_and_preserves_all_categories_and_metadata(self):
        path = export_output.export_dictionary(self.out, self.data)
        self.assertEqual(path, self.out / "local-files" / "prefill_dictionary.json")
        self.assertEqual(path.read_bytes(), self.data)
        self.assertEqual(json.loads(path.read_bytes()), self.payload)
        self.assertFalse((self.out / "local-files" / "genericTrans").exists())

    def test_full_export_and_overwrite_do_not_read_or_change_existing_generic_files(self):
        generic = self.out / "local-files" / "genericTrans"
        generic.mkdir(parents=True)
        preserved = {
            generic / "generic.json": b"not-json-do-not-read-or-rewrite",
            generic / "generic.split.json": b'{"original":"existing translation"}\r\n',
            generic / "generic_dictionary.json": b"unrelated-existing-file",
            self.out / "local-files" / "generic.json": b"legacy-file",
        }
        for path, data in preserved.items():
            path.write_bytes(data)
        log = self.run_export(overwrite=True)
        path = self.out / "local-files" / "prefill_dictionary.json"
        self.assertEqual(path.read_bytes(), self.data)
        self.assertIn("Exported prefill dictionary to", log)
        self.assertEqual(json.loads((self.out / "local-files" / "localization.json").read_bytes()), {"english.example": "한국어"})
        self.dictionary.write_bytes(b'{"new_category":{"new":"value"}}\n')
        self.run_export(overwrite=True)
        self.assertEqual(path.read_bytes(), self.dictionary.read_bytes())
        self.assertEqual(set(generic.iterdir()), {p for p in preserved if p.parent == generic})
        for original, data in preserved.items():
            self.assertEqual(original.read_bytes(), data)

    def test_missing_dictionary_fails_before_output_cleanup_or_database_access(self):
        self.out.mkdir()
        version = self.out / "version.txt"
        version.write_bytes(b"keep this version")
        self.dictionary.unlink()
        with patch.object(export_output, "clear_output_dir") as cleanup, patch.object(export_output.sqlite3, "connect") as connect:
            with self.assertRaises(FileNotFoundError):
                self.run_export(overwrite=True)
            cleanup.assert_not_called()
            connect.assert_not_called()
        self.assertEqual(version.read_bytes(), b"keep this version")

    def test_nonempty_output_still_requires_explicit_overwrite(self):
        self.out.mkdir()
        keep = self.out / "keep.txt"
        keep.write_bytes(b"unchanged")
        with self.assertRaisesRegex(SystemExit, "Pass --overwrite"):
            self.run_export()
        self.assertEqual(keep.read_bytes(), b"unchanged")

    def test_real_project_dictionary_copies_without_omissions(self):
        data = export_output.PREFILL_DICTIONARY_PATH.read_bytes()
        path = export_output.export_dictionary(self.out, data)
        self.assertEqual(path.read_bytes(), data)
        self.assertIn("_batchim", json.loads(path.read_bytes()))


if __name__ == "__main__":
    unittest.main()
