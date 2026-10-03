import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

test('review records survive a database reopen and migration imports only current legacy proposals', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hoshimi-review-test-'));
  const priorDbPath = process.env.DB_PATH;
  process.env.DB_PATH = join(directory, 'test.sqlite3');
  let db;
  try {
    const seed = new DatabaseSync(process.env.DB_PATH);
    seed.exec(`CREATE TABLE translation_units(unit_id TEXT PRIMARY KEY, original_text TEXT DEFAULT '原文',
      translation_text TEXT DEFAULT '번역', translator_name TEXT DEFAULT '', updated_at TEXT DEFAULT '',
      status TEXT DEFAULT 'translated', scope_type TEXT DEFAULT 'story', scope_id TEXT DEFAULT 'story-1',
      source_type TEXT DEFAULT 'adv', source_file TEXT DEFAULT 'story.txt', field_path TEXT DEFAULT 'text',
      category TEXT DEFAULT 'adv', speaker TEXT DEFAULT '', line_no INTEGER, record_id TEXT DEFAULT '');
      CREATE TABLE entities(entity_type TEXT, entity_id TEXT, label TEXT);
      INSERT INTO translation_units(unit_id) VALUES ('done'), ('legacy'), ('stale');`);
    seed.close();
    const dbSource = read('../src/lib/server/db.js').replace("import { dev } from '$app/environment';", 'const dev = false;');
    const firstDbUrl = dataUrl(dbSource);
    db = (await import(firstDbUrl)).getDb();
    const firstReviewsUrl = dataUrl(read('../src/lib/server/codex-reviews.js').replace("'$lib/server/db.js'", JSON.stringify(firstDbUrl)));
    const { completeUnchangedReview } = await import(firstReviewsUrl);
    completeUnchangedReview({ unit_id: 'done', base_revision: 0, base_original_text: '原文', base_translation_text: '번역', notes: '확인 완료' });
    const insert = db.prepare(`INSERT INTO ai_suggestions(unit_id, translation_text, reason, base_revision, base_original_text, base_translation_text, created_at)
      VALUES (?, '제안', '기존 제안', 0, '原文', '번역', 'legacy-id')`);
    insert.run('legacy'); insert.run('stale');
    db.prepare("UPDATE translation_units SET translation_text = '사람 수정' WHERE unit_id = 'stale'").run();
    db.close(); db = undefined;
    // New module instance opens the same file and reruns migrations, like a site restart.
    const secondDbUrl = dataUrl(dbSource) + '#restart';
    db = (await import(secondDbUrl)).getDb();
    const secondReviewsUrl = dataUrl(read('../src/lib/server/codex-reviews.js').replace("'$lib/server/db.js'", JSON.stringify(secondDbUrl)));
    const suggestionsUrl = dataUrl(read('../src/lib/server/ai-suggestions.js').replace("'$lib/server/db.js'", JSON.stringify(secondDbUrl)));
    const unitsUrl = dataUrl(read('../src/lib/server/codex-units.js')
      .replace("'$lib/server/db.js'", JSON.stringify(secondDbUrl))
      .replace("'$lib/server/codex-reviews.js'", JSON.stringify(secondReviewsUrl))
      .replace("'$lib/server/ai-suggestions.js'", JSON.stringify(suggestionsUrl)));
    const { listCodexUnits, getReviewProgress } = await import(unitsUrl);
    assert.deepEqual(listCodexUnits(new URLSearchParams({ review: 'pending' })).units.map((unit) => unit.unit_id), ['stale']);
    assert.equal(db.prepare("SELECT notes FROM ai_reviews WHERE unit_id = 'done'").get().notes, '확인 완료');
    assert.equal(getReviewProgress(new URLSearchParams()).reviewed, 2);
    db.prepare("UPDATE translation_units SET original_text = '新原文' WHERE unit_id = 'done'").run();
    assert.deepEqual(listCodexUnits(new URLSearchParams({ review: 'pending' })).units.map((unit) => unit.unit_id), ['done', 'stale']);
  } finally {
    db?.close();
    if (priorDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = priorDbPath;
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true });
  }
});
