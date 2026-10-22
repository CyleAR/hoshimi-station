import sqlite3
import unittest

import import_db


class ImportRevisionTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.addCleanup(self.conn.close)
        import_db.ensure_schema(self.conn)

    def unit(self, unit_id, original="original", translation="", revision=0):
        import_db.unit_upsert(self.conn, unit_id, "adv", "adv/test", "test.txt", unit_id, "text", original)
        self.conn.execute("UPDATE translation_units SET translation_text=?, revision=? WHERE unit_id=?", (translation, revision, unit_id))

    def rebuild(self, originals, final_translations=None):
        import_db.preserve_existing_unit_inventory(self.conn)
        import_db.preserve_existing_translations(self.conn)
        self.conn.execute("DROP TABLE translation_units")
        import_db.ensure_schema(self.conn)
        for unit_id, original in originals.items():
            self.unit(unit_id, original)
        import_db.restore_existing_translations(self.conn, {})
        for unit_id, translation in (final_translations or {}).items():
            self.conn.execute("UPDATE translation_units SET translation_text=? WHERE unit_id=?", (translation, unit_id))
        import_db.restore_existing_unit_revisions(self.conn)

    def test_schema_includes_revision_and_upgrades_legacy_tables(self):
        self.unit("test")
        self.conn.execute("ALTER TABLE translation_units DROP COLUMN revision")
        import_db.ensure_schema(self.conn)
        self.assertEqual(self.conn.execute("SELECT revision FROM translation_units").fetchone(), (0,))

    def test_reimport_preserves_revisions_for_translated_and_cleared_units(self):
        self.unit("translated", translation="human translation", revision=7)
        self.unit("cleared", revision=4)
        self.rebuild({"translated": "original", "cleared": "original", "new": "new original"})
        self.assertEqual(dict(self.conn.execute("SELECT unit_id, revision FROM translation_units")), {"translated": 7, "cleared": 4, "new": 0})
        self.assertEqual(self.conn.execute("SELECT translation_text FROM translation_units WHERE unit_id='translated'").fetchone()[0], "human translation")

    def test_changed_original_or_prefill_advances_revision_and_does_not_revert(self):
        self.unit("source", translation="old translation", revision=8)
        self.unit("prefill", revision=3)
        self.rebuild({"source": "changed", "prefill": "original"}, {"prefill": "prefilled"})
        self.assertEqual(dict(self.conn.execute("SELECT unit_id, revision FROM translation_units")), {"source": 9, "prefill": 4})
        self.rebuild({"source": "original", "prefill": "original"})
        self.assertEqual(dict(self.conn.execute("SELECT unit_id, revision FROM translation_units")), {"source": 10, "prefill": 4})

    def test_inventory_supports_database_without_revision(self):
        self.unit("legacy", translation="kept")
        self.conn.execute("ALTER TABLE translation_units DROP COLUMN revision")
        self.rebuild({"legacy": "original"})
        self.assertEqual(self.conn.execute("SELECT translation_text, revision FROM translation_units").fetchone(), ("kept", 0))

    def test_import_installs_revision_tracking_without_server_migration(self):
        self.unit("test", translation="before", revision=5)
        import_db.install_change_tracking(self.conn)
        self.conn.execute("UPDATE translation_units SET translation_text='after' WHERE unit_id='test'")
        self.assertEqual(self.conn.execute("SELECT revision FROM translation_units").fetchone(), (6,))
        self.conn.execute("UPDATE translation_units SET translation_text='after', translator_name='other' WHERE unit_id='test'")
        self.assertEqual(self.conn.execute("SELECT revision FROM translation_units").fetchone(), (6,))
        self.conn.execute("UPDATE translation_units SET original_text='changed' WHERE unit_id='test'")
        self.assertEqual(self.conn.execute("SELECT revision FROM translation_units").fetchone(), (7,))
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM translation_changes").fetchone(), (1,))


if __name__ == "__main__":
    unittest.main()
