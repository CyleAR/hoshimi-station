import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

test('Python reimport preserves revisions and saving works on an already-open server connection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hoshimi-import-revision-'));
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = join(directory, 'test.sqlite3');
  let db;
  try {
    mkdirSync(join(directory, 'masterdb'));
    mkdirSync(join(directory, 'adv'));
    writeFileSync(join(directory, 'masterdb', 'Story.json'), '[]');
    writeFileSync(join(directory, 'masterdb', 'Character.json'), '[]');
    writeFileSync(join(directory, 'dictionary.json'), '{}');
    writeFileSync(join(directory, 'translations.json'), '{"test":{}}');
    const advPath = join(directory, 'adv', 'adv_revision_test.txt');
    const original = '最初の原文';
    const writeSource = (text) => writeFileSync(advPath, `[narration text=${text}]\n[narration text=次の原文]\n`);
    writeSource(original);
    function reimport(overwrite = false) {
      const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-X', 'utf8', '-c', `
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[2])
import import_db
root = Path(sys.argv[1])
with patch.multiple(import_db, MASTERDB_DIR=root/'masterdb', ADV_DIR=root/'adv',
    LOCALIZATION_PATH=root/'missing.json', LOCALIZATION_TRANSLATION_PATH=root/'missing.json',
    PREFILL_TRANSLATIONS_PATH=root/'translations.json', PREFILL_DICTIONARY_PATH=root/'dictionary.json'):
    import_db.rebuild(root/'test.sqlite3', overwrite_prefill=sys.argv[3] == 'true')
`, directory, fileURLToPath(new URL('../../scripts', import.meta.url)), String(overwrite)], { encoding: 'utf8', timeout: 30000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    reimport();
    const dbUrl = dataUrl(read('../src/lib/server/db.js').replace("import { dev } from '$app/environment';", 'const dev = false;'));
    const database = await import(dbUrl);
    db = database.getDb();
    db.prepare("INSERT INTO users VALUES ('tester','123456','','')").run();
    const save = (await import(dataUrl(read('../src/routes/api/unit/+server.js').replace("'$lib/server/db.js'", JSON.stringify(dbUrl))))).POST;
    const { attachSuggestions } = await import(dataUrl(read('../src/lib/server/ai-suggestions.js').replace("'$lib/server/db.js'", JSON.stringify(dbUrl))));
    const first = 'adv:adv_revision_test.txt:1:text';
    const second = 'adv:adv_revision_test.txt:2:text';
    const unit = (id) => db.prepare('SELECT * FROM translation_units WHERE unit_id=?').get(id);
    async function saveText(id, text, revision) {
      return save({ request: new Request('http://localhost/api/unit', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unit_id: id, translation_text: text, expected_revision: revision, nickname: 'tester', pin: '123456' }) }) });
    }
    let response = await saveText(first, 'translation', 0);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 1);
    db.prepare("UPDATE translation_units SET translation_text='temporary' WHERE unit_id=?").run(second);
    db.prepare("UPDATE translation_units SET translation_text='', status='new' WHERE unit_id=?").run(second);
    db.prepare("INSERT INTO ai_reviews VALUES (?,1,?,'translation','ok','reviewed','before')").run(first, original);
    db.prepare(`INSERT INTO ai_suggestions(unit_id,translation_text,reason,base_revision,base_original_text,base_translation_text,created_at)
      VALUES (?,'suggestion','reason',1,?,'translation','before')`).run(first, original);

    reimport();
    assert.equal(database.getDb(), db);
    assert.equal(unit(first).revision, 1);
    assert.equal(unit(second).revision, 2);
    assert.equal(unit(first).translation_text, 'translation');
    assert.equal(attachSuggestions([unit(first)])[0].ai_suggestion.stale, false);
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM ai_reviews r JOIN translation_units u ON u.unit_id=r.unit_id
      WHERE r.base_revision=u.revision AND r.base_original_text=u.original_text AND r.base_translation_text=u.translation_text`).get().count, 1);
    response = await saveText(first, 'after reimport', 1);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 2);
    assert.equal((await saveText(first, 'stale edit', 1)).status, 409);
    assert.equal(attachSuggestions([unit(first)])[0].ai_suggestion.stale, true);

    writeSource('変更した原文');
    reimport();
    assert.equal(unit(first).revision, 3);
    assert.equal(unit(first).translation_text, '');
    assert.equal((await saveText(first, 'stale edit', 2)).status, 409);
    writeSource(original);
    reimport();
    assert.equal(unit(first).revision, 4);
    assert.equal(unit(second).revision, 2);
    assert.equal(attachSuggestions([unit(first)])[0].ai_suggestion.stale, true);
    writeFileSync(join(directory, 'translations.json'), JSON.stringify({ test: { [original]: 'prefilled translation' } }));
    reimport();
    assert.equal(unit(first).revision, 5);
    assert.equal(unit(first).translation_text, 'prefilled translation');
    writeFileSync(join(directory, 'translations.json'), JSON.stringify({ test: { [original]: 'updated prefill' } }));
    reimport(true);
    assert.equal(unit(first).revision, 6);
    assert.equal(unit(first).translation_text, 'updated prefill');
    assert.equal(unit(first).translator_name, '[BOT] auto-prefill');
    response = await saveText(first, 'updated prefill');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 6);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    db?.close();
    if (previousDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = previousDbPath;
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true });
  }
});
