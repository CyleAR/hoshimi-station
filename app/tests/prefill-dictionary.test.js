import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';

const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const dbUrl = dataUrl(readFileSync(new URL('../src/lib/server/db.js', import.meta.url), 'utf8')
	.replace("import { dev } from '$app/environment';", 'const dev = false;')
	.replace('new DatabaseSync(dbPath)', "new DatabaseSync(':memory:')")
	.replace('migrate(db);', `db.exec("CREATE TABLE translation_units(unit_id TEXT PRIMARY KEY, translation_text TEXT DEFAULT '', original_text TEXT DEFAULT '', translator_name TEXT DEFAULT '', status TEXT DEFAULT 'new', updated_at TEXT DEFAULT '')"); migrate(db);`));
const { getDb } = await import(dbUrl);
const db = getDb();
db.exec("INSERT INTO users VALUES('owner','123456','',''),('ordinary','654321','','')");
after(() => db.close());
const calls = [];
let response = { ok: true, items: [] };
globalThis.dictionaryTestCommand = async (...args) => { calls.push(args); return response; };
after(() => { delete globalThis.dictionaryTestCommand; });
const commandUrl = dataUrl('export const runDictionaryCommand = (...args) => globalThis.dictionaryTestCommand(...args);');
const { POST } = await import(dataUrl(readFileSync(new URL('../src/routes/api/admin/prefill-dictionary/+server.js', import.meta.url), 'utf8')
	.replace("'$lib/server/db.js'", JSON.stringify(dbUrl))
	.replace("'$lib/server/prefill-dictionary.js'", JSON.stringify(commandUrl))));
function post(body, headers = {}) {
	return POST({ request: new Request('http://localhost/api/admin/prefill-dictionary', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}
const auth = { nickname: 'owner', pin: '123456', action: 'preview', groups: ['item'] };

test('every authenticated user may preview, apply or download without admin settings', async () => {
	response = { ok: true, items: [], content: '{}' };
	for (const action of ['preview', 'apply', 'download']) {
		for (const credentials of [{ nickname: 'ordinary', pin: '654321' }, { nickname: 'owner', pin: '123456' }]) {
			const before = calls.length;
			assert.equal((await post({ action, ...credentials })).status, 200);
			assert.equal(calls.length, before + 1);
		}
	}
});

test('missing, unknown and invalid login credentials never run the helper', async () => {
	for (const action of ['preview', 'apply', 'download']) {
		for (const credentials of [{ nickname: 'ordinary', pin: '000000' }, { nickname: 'owner', pin: '000000' }, { nickname: 'unknown', pin: '123456' }, {}]) {
			const before = calls.length;
			assert.equal((await post({ action, ...credentials })).status, 401);
			assert.equal(calls.length, before);
		}
	}
});

test('invalid JSON, cross-origin requests and oversized bodies never run the helper', async () => {
	const before = calls.length;
	assert.equal((await post('{broken')).status, 400);
	assert.equal((await post('null')).status, 400);
	assert.equal((await post(auth, { origin: 'https://other.example' })).status, 403);
	assert.equal((await post(auth, { 'content-type': 'text/plain' })).status, 415);
	assert.equal((await post({ ...auth, padding: 'x'.repeat(256 * 1024) })).status, 413);
	assert.equal((await post({ ...auth, action: 'delete' })).status, 400);
	assert.equal(calls.length, before);
});

test('credentials and browser-supplied file paths are not forwarded to the helper', async () => {
	response = { ok: true, items: [] };
	const result = await post({ ...auth, db: 'wrong', dictionary: '/other/file', backups: '/other/path' });
	assert.equal(result.status, 200);
	assert.equal(result.headers.get('cache-control'), 'no-store');
	assert.deepEqual(calls.at(-1)[0], { action: 'preview', groups: ['item'], ids: undefined, dictionary_hash: undefined, allow_updates: false });
	assert.ok(!JSON.stringify(calls.at(-1)).includes('123456'));
});

test('pose dictionary requests preserve the selected group and item IDs', async () => {
	response = { ok: true, items: [] };
	assert.equal((await post({ ...auth, groups: ['pose'] })).status, 200);
	assert.deepEqual(calls.at(-1)[0].groups, ['pose']);
	const ids = ['a'.repeat(64)];
	assert.equal((await post({ ...auth, action: 'apply', groups: ['pose'], ids, dictionary_hash: 'current' })).status, 200);
	assert.deepEqual(calls.at(-1)[0], { action: 'apply', groups: ['pose'], ids, dictionary_hash: 'current', allow_updates: false });
});

test('dictionary replacement is forwarded only with explicit boolean opt-in', async () => {
	for (const flag of [true, false, 'true']) {
		await post({ ...auth, action: 'apply', allow_updates: flag });
		assert.equal(calls.at(-1)[0].allow_updates, flag === true);
	}
});

test('HTTPS terminated at a same-host reverse proxy is allowed, but opaque origins are denied', async () => {
	response = { ok: true, items: [] };
	assert.equal((await post(auth, { origin: 'https://localhost' })).status, 200);
	assert.equal((await post(auth, { origin: 'null' })).status, 403);
});

test('save conflicts remain JSON errors and downloads are authenticated attachments', async () => {
	response = { ok: false, status: 409, error: '다시 조회해 주세요.' };
	const result = await post({ ...auth, action: 'apply', ids: ['selected'], dictionary_hash: 'version' });
	assert.equal(result.status, 409);
	assert.equal((await result.json()).error, '다시 조회해 주세요.');
	response = { ok: true, content: '{"item":{"原文":"번역"}}\n' };
	const download = await post({ ...auth, action: 'download' });
	assert.equal(download.status, 200);
	assert.equal(download.headers.get('content-disposition'), 'attachment; filename="prefill_dictionary.json"');
	assert.equal(download.headers.get('cache-control'), 'no-store');
	assert.equal(await download.text(), response.content);
});
