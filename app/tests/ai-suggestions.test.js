import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync } from 'node:fs';

// In-memory database: never open or modify the operating translation database.
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const dbUrl = dataUrl(readFileSync(new URL('../src/lib/server/db.js', import.meta.url), 'utf8')
	.replace("import { dev } from '$app/environment';", 'const dev = false;')
	.replace('migrate(db);', `db.exec("CREATE TABLE translation_units (unit_id TEXT PRIMARY KEY, original_text TEXT DEFAULT '原文', translation_text TEXT DEFAULT '', translator_name TEXT DEFAULT '', updated_at TEXT DEFAULT '', status TEXT DEFAULT 'new', scope_type TEXT DEFAULT 'story', scope_id TEXT DEFAULT 'story-1', source_type TEXT DEFAULT 'adv', source_file TEXT DEFAULT 'story.txt', field_path TEXT DEFAULT 'text')"); migrate(db);`)
	.replace('new DatabaseSync(dbPath)', "new DatabaseSync(':memory:')"));
const { getDb } = await import(dbUrl);
const db = getDb();
db.exec("CREATE TABLE entities(entity_type TEXT, entity_id TEXT, label TEXT); INSERT INTO users VALUES ('human', '123456', '', ''); INSERT INTO users VALUES ('사일', '654321', '', '')");
const suggestionsUrl = dataUrl(readFileSync(new URL('../src/lib/server/ai-suggestions.js', import.meta.url), 'utf8').replace("'$lib/server/db.js'", JSON.stringify(dbUrl)));
const { attachSuggestions, attachSuggestionsForUser } = await import(suggestionsUrl);
const authUrl = dataUrl(readFileSync(new URL('../src/lib/server/codex-auth.js', import.meta.url), 'utf8').replace("'$lib/server/db.js'", JSON.stringify(dbUrl)));
const reviewsUrl = dataUrl(readFileSync(new URL('../src/lib/server/codex-reviews.js', import.meta.url), 'utf8').replace("'$lib/server/db.js'", JSON.stringify(dbUrl)));
async function endpoint(name) {
	return import(dataUrl(readFileSync(new URL(`../src/routes/api/${name}/+server.js`, import.meta.url), 'utf8')
		.replace("'$lib/server/db.js'", JSON.stringify(dbUrl)).replace("'$lib/server/ai-suggestions.js'", JSON.stringify(suggestionsUrl)).replace("'$lib/server/codex-auth.js'", JSON.stringify(authUrl)).replace("'$lib/server/codex-reviews.js'", JSON.stringify(reviewsUrl))));
}
const submit = (await endpoint('ai-suggestions')).POST;
const accept = (await endpoint('ai-suggestions/accept')).POST;
const save = (await endpoint('unit')).POST;
const priorToken = process.env.CODEX_API_TOKEN;
process.env.CODEX_API_TOKEN = 'test-token';
after(() => { db.close(); if (priorToken === undefined) delete process.env.CODEX_API_TOKEN; else process.env.CODEX_API_TOKEN = priorToken; });
function post(handler, body, token = '') {
	return handler({ request: new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }) });
}
function unit(id) { return db.prepare('SELECT * FROM translation_units WHERE unit_id = ?').get(id); }
async function propose(id, extra = {}) {
	const current = unit(id);
	return post(submit, { unit_id: id, translation_text: '제안문', reason: '다른 스토리의 말투와 통일', base_revision: current.revision, base_original_text: current.original_text, base_translation_text: current.translation_text, ...extra }, 'test-token');
}
function seed(id) { db.prepare('INSERT INTO translation_units(unit_id) VALUES (?)').run(id); }
async function use(id, createdAt, extra = {}) {
	return post(accept, { unit_id: id, created_at: createdAt, nickname: '사일', pin: '654321', ...extra });
}

test('proposal stays separate, resolves references, and is saved once under the accepting human', async () => {
	seed('target'); seed('reference');
	assert.equal((await propose('target', { reference_unit_ids: ['reference'] })).status, 200);
	assert.equal(unit('target').translation_text, '');
	assert.equal(db.prepare("SELECT verdict FROM ai_reviews WHERE unit_id = 'target'").get().verdict, 'suggested');
	const [item] = attachSuggestions([unit('target')]);
	assert.equal(item.ai_suggestion.references[0].unit_id, 'reference');
	assert.equal(item.ai_suggestion.stale, false);
	assert.equal((await use('target', item.ai_suggestion.created_at)).status, 200);
	assert.equal(unit('target').translation_text, '제안문');
	assert.equal(unit('target').translator_name, '사일');
	assert.equal(unit('target').revision, 1);
	assert.equal((await use('target', item.ai_suggestion.created_at)).status, 409);
});
test('human edits and replacements reject stale acceptance, including change-and-revert', async () => {
	seed('conflict'); await propose('conflict');
	const old = attachSuggestions([unit('conflict')])[0].ai_suggestion;
	db.prepare("UPDATE translation_units SET translation_text = 'human' WHERE unit_id = 'conflict'").run();
	db.prepare("UPDATE translation_units SET translation_text = '' WHERE unit_id = 'conflict'").run();
	assert.equal((await use('conflict', old.created_at)).status, 409);
	assert.equal(unit('conflict').translation_text, '');
	await propose('conflict');
	assert.equal((await use('conflict', old.created_at)).status, 409);
	assert.equal((await post(save, { unit_id: 'conflict', nickname: 'human', pin: '123456', translation_text: 'old browser', expected_revision: 0 })).status, 409);
});
test('authentication, references, placeholders, and source snapshots are validated', async () => {
	seed('validation');
	assert.equal((await post(submit, {})).status, 401);
	assert.equal((await propose('validation', { reference_unit_ids: ['missing'] })).status, 400);
	assert.equal((await propose('validation', { base_original_text: 'old' })).status, 409);
	assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_reviews WHERE unit_id = 'validation'").get().count, 0);
	db.prepare("UPDATE translation_units SET original_text = '{user}' WHERE unit_id = 'validation'").run();
	assert.equal((await propose('validation')).status, 400);
	assert.equal((await propose('validation', { translation_text: '{user} 제안' })).status, 200);
	const suggestion = attachSuggestions([unit('validation')])[0].ai_suggestion;
	assert.equal((await use('validation', suggestion.created_at, { pin: '000000' })).status, 401);
	assert.equal(unit('validation').translation_text, '');
});


test('only authenticated 사일 can read and accept Codex proposals', async () => {
 seed('private'); await propose('private');
 const target = unit('private');
 const request = (pin) => new Request('http://localhost/api/units', { headers: pin ? { 'x-ai-suggestion-pin': pin } : {} });
 for (const pin of ['', '000000', '123456']) {
  assert.equal(attachSuggestionsForUser([target], request(pin))[0].ai_suggestion, null);
 }
 const suggestion = attachSuggestionsForUser([target], request('654321'))[0].ai_suggestion;
 assert.ok(suggestion);
 assert.equal((await use('private', suggestion.created_at, { nickname: 'human', pin: '123456' })).status, 403);
 assert.equal(unit('private').translation_text, '');
 assert.equal((await use('private', suggestion.created_at)).status, 200);
});
