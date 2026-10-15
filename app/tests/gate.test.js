import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE translation_units (unit_id TEXT PRIMARY KEY, category TEXT, field_path TEXT, speaker TEXT, original_text TEXT, translation_text TEXT DEFAULT '');
CREATE TABLE official_en_hints (unit_id TEXT PRIMARY KEY, hint_text TEXT);
INSERT INTO translation_units VALUES ('a1','adv/card','text','kana','「{user}、おはよう」\\n行こう','');
INSERT INTO translation_units VALUES ('a2','adv/card','text','__narration__','――静かな朝。','');
INSERT INTO translation_units VALUES ('m1','Accessory','name','','<b>{0}</b>のバッジ','');
INSERT INTO translation_units VALUES ('b1','ConditionDescription','description','','5段階効果[22ビート]\\nスタミナ116消費','');
INSERT INTO official_en_hints VALUES ('a1','"{user}, good morning"\\nLet''s go');`);
const dbUrl = 'data:text/javascript;base64,' + Buffer.from(`export const get = (sql, p) => globalThis.__db.prepare(sql).get(p);`).toString('base64');
globalThis.__db = db;
const src = readFileSync(new URL('../src/lib/server/gate.js', import.meta.url), 'utf8').replace("'$lib/server/db.js'", JSON.stringify(dbUrl));
const { validateForUnitId } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

test('valid candidates pass; clearing is allowed', () => {
	assert.equal(validateForUnitId('a1', '"{user}, morning!"\\nLet us go').ok, true);
	assert.equal(validateForUnitId('a1', '').ok, true);
	assert.equal(validateForUnitId('m1', 'Badge for <b>{0}</b>').ok, true);
	assert.equal(validateForUnitId('b1', '5-stage effect [22 Beat]\\nConsumes 116 Stamina').ok, true);
});
test('broken candidates are rejected', () => {
	for (const [id, bad] of [
		['a1', 'おはよう {user}\\nok'], ['a1', 'Hi\\nok'], ['a1', 'Hi {user}'], ['a1', 'Hi {user}\\nok '],
		['a1', 'Hi [x] {user}\\nok'], ['b1', '5-stage effect 22 Beat\\nConsumes 116 Stamina'], ['a1', 'Ye ken {user}\\nok'], ['a2', 'A quiet morning.'], ['m1', 'Badge for {0}'], ['m1', 'バッジ <b>{0}</b>'], ['a1', '정말 {user}\\nok'], ['a1', 'ㅡㅡ {user}\\nok'], ['m1', 'Badge 55만원 <b>{0}</b>']
	]) assert.equal(validateForUnitId(id, bad).ok, false, `${id}: ${bad}`);
});
test('Gate 4 rejects an official copy and reports skipped without reference', () => {
	const copy = validateForUnitId('a1', '"{user}, good morning"\\nLet\'s go');
	assert.equal(copy.ok, false); assert.equal(copy.gate4, 'fail');
	assert.equal(validateForUnitId('a2', '――A quiet morning.').gate4, 'skipped');
});
test('unknown unit returns null', () => assert.equal(validateForUnitId('zz', 'x'), null));
