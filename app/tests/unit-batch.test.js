import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const dbUrl = dataUrl(readFileSync(new URL('../src/lib/server/db.js', import.meta.url), 'utf8')
	.replace("import { dev } from '$app/environment';", 'const dev = false;')
	.replace('new DatabaseSync(dbPath)', "new DatabaseSync(':memory:')")
	.replace('migrate(db);', `db.exec("CREATE TABLE translation_units(unit_id TEXT PRIMARY KEY, translation_text TEXT DEFAULT '', original_text TEXT DEFAULT '', translator_name TEXT DEFAULT '', status TEXT DEFAULT 'new', updated_at TEXT DEFAULT '', source_type TEXT DEFAULT 'masterdb', category TEXT DEFAULT 'Accessory', field_path TEXT DEFAULT 'name')"); migrate(db);`));
const { getDb } = await import(dbUrl);
const db = getDb();
after(() => db.close());
const { POST } = await import(dataUrl(readFileSync(new URL('../src/routes/api/unit-batch/+server.js', import.meta.url), 'utf8')
	.replace("'$lib/server/db.js'", JSON.stringify(dbUrl))));
db.exec("INSERT INTO users VALUES('tester','123456','','')");

function reset() {
	db.exec("DELETE FROM translation_units; DELETE FROM translation_changes;");
	const insert = db.prepare('INSERT INTO translation_units(unit_id, original_text, translation_text, translator_name) VALUES(?,?,?,?)');
	insert.run('a', '同じ名前', '첫 번역', 'old');
	insert.run('b', '同じ名前', '둘째 번역', 'old');
}
function post(extra = {}) {
	return POST({ request: new Request('http://localhost/api/unit-batch', { method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ nickname: 'tester', pin: '123456', units: [{ unit_id: 'a', revision: 0 }, { unit_id: 'b', revision: 0 }], translation_text: '통일 번역', ...extra }) }) });
}

test('same-name batch saves every target with individual revisions and history', async () => {
	reset();
	const response = await post();
	assert.equal(response.status, 200);
	assert.equal((await response.json()).count, 2);
	assert.ok(db.prepare('SELECT * FROM translation_units').all().every(row => row.translation_text === '통일 번역' && row.translator_name === 'tester' && row.revision === 1));
	assert.equal(db.prepare('SELECT COUNT(*) n FROM translation_changes').get().n, 2);
});

test('a stale or deleted target prevents all batch updates', async () => {
	for (const change of ["UPDATE translation_units SET translation_text='다른 사람 수정' WHERE unit_id='b'", "DELETE FROM translation_units WHERE unit_id='b'"]) {
		reset(); db.exec(change);
		assert.equal((await post()).status, 409);
		assert.equal(db.prepare("SELECT translation_text FROM translation_units WHERE unit_id='a'").get().translation_text, '첫 번역');
	}
});

test('auth, duplicate ids, category and source mismatches are rejected without writes', async () => {
	reset();
	assert.equal((await post({ pin: '000000' })).status, 401);
	assert.equal((await post({ units: [{ unit_id: 'a', revision: 0 }, { unit_id: 'a', revision: 0 }] })).status, 400);
	for (const column of ['category', 'source_type', 'field_path']) {
		reset(); db.exec(`UPDATE translation_units SET ${column}='other' WHERE unit_id='b'`);
		assert.equal((await post()).status, 400);
		assert.equal(db.prepare("SELECT translation_text FROM translation_units WHERE unit_id='a'").get().translation_text, '첫 번역');
	}
});

test('unchanged translations retain their author and do not generate history', async () => {
	reset();
	const response = await post({ translation_text: '첫 번역' });
	assert.equal((await response.json()).count, 1);
	assert.equal(db.prepare("SELECT translator_name FROM translation_units WHERE unit_id='a'").get().translator_name, 'old');
	assert.equal(db.prepare('SELECT COUNT(*) n FROM translation_changes').get().n, 1);
});
