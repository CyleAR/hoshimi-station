import json
import sqlite3
import unittest

from compact_db import compact_metadata
from import_db import add_link, ensure_schema, install_change_tracking, unit_upsert


class CompactDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        ensure_schema(self.conn)
        unit_upsert(self.conn, "unit-1", "adv", "adv/card", "card.txt", "card", "text", "original",
                    line_no=42, speaker="speaker", scope_type="card", scope_id="card-1",
                    context={"tag": "text", "order": 3})
        self.conn.execute("UPDATE translation_units SET translation_text='translation', translator_name='user', context_json='{}'")
        install_change_tracking(self.conn)
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_preserves_source_translation_links_and_order(self):
        metadata = {"order": 0, "sortOrder": 2, "number": None, "episodeNumber": 4, "episodeNo": 5,
                    "assetId": "asset", "storyId": "story", "baseAdvFile": "base.txt"}
        for relation in ("episode", "in_thread", "message_condition"):
            self.conn.execute("INSERT INTO links VALUES (?,?,?,?,?,?)",
                              ("card", "card-1", "story", "story-1", relation,
                               json.dumps({**metadata, "details": [{"text": "unused full dialogue"}]})))
        self.conn.execute("UPDATE translation_units SET context_json='{}'")
        self.conn.execute("UPDATE translation_units SET context_json=?", ('{"tag":"text"}',))
        self.conn.commit()
        columns = [r[1] for r in self.conn.execute("PRAGMA table_info(translation_units)") if r[1] != "context_json"]
        sql = "SELECT " + ",".join(columns) + " FROM translation_units"
        units = self.conn.execute(sql).fetchall()
        links = self.conn.execute("SELECT from_type,from_id,to_type,to_id,relation FROM links").fetchall()
        self.assertEqual(compact_metadata(self.conn), (3, 1))
        self.assertEqual(self.conn.execute(sql).fetchall(), units)
        self.assertEqual(self.conn.execute("SELECT from_type,from_id,to_type,to_id,relation FROM links").fetchall(), links)
        for (raw,) in self.conn.execute("SELECT meta_json FROM links"):
            self.assertEqual(json.loads(raw), metadata)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM translation_changes").fetchone()[0], 0)
        self.assertEqual(compact_metadata(self.conn), (0, 0))

    def test_new_imports_store_compact_metadata(self):
        add_link(self.conn, "card", "c", "story", "s", "episode", {"order": 0, "details": ["large"]})
        self.assertEqual(json.loads(self.conn.execute("SELECT meta_json FROM links").fetchone()[0]), {"order": 0})
        self.assertEqual(self.conn.execute("SELECT context_json FROM translation_units").fetchone()[0], "{}")

    def test_bad_metadata_does_not_partially_modify_db(self):
        self.conn.execute("INSERT INTO links VALUES ('card','a','story','b','episode','not-json')")
        self.conn.execute("UPDATE translation_units SET context_json=?", ('{"keep":true}',))
        self.conn.commit()
        with self.assertRaises(ValueError):
            compact_metadata(self.conn)
        self.assertEqual(self.conn.execute("SELECT context_json FROM translation_units").fetchone()[0], '{"keep":true}')


if __name__ == "__main__":
    unittest.main()
