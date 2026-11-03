import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const dir = mkdtempSync(path.join(tmpdir(), 'phone-subtitles-'));
process.env.PHONE_SUBTITLES_PATH = path.join(dir, 'phoneSubtitles.json');
const original = {
	'sud_vo_phone_tel-card-ai-05-idol-00': [{ line: 1, time: 0, text: '기존\\n자막' }],
	'sud_vo_phone_tel-message-single-ai-001': [{ line: 1, time: 0, text: '' }]
};
writeFileSync(process.env.PHONE_SUBTITLES_PATH, JSON.stringify(original));
const source = readFileSync(new URL('../src/lib/server/phone-subtitles.js', import.meta.url), 'utf8')
	.replace("import { getDb } from './db.js';", 'const getDb = () => globalThis.__phoneTestDb;');
const serviceUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const service = await import(serviceUrl);
const draftSource = readFileSync(new URL('../src/lib/server/phone-subtitle-drafts.js', import.meta.url), 'utf8')
	.replace("import { getDb } from './db.js';", 'const getDb = () => globalThis.__phoneTestDb;')
	.replace("'./phone-subtitles.js'", JSON.stringify(serviceUrl));
const draftsUrl = 'data:text/javascript;base64,' + Buffer.from(draftSource).toString('base64');
const db = new DatabaseSync(':memory:');
globalThis.__phoneTestDb = db;
const schema = `CREATE TABLE phone_subtitle_clips (clip_name TEXT PRIMARY KEY, lines_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
CREATE TABLE phone_subtitle_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE phone_subtitle_links (telephone_id TEXT PRIMARY KEY, clip_name TEXT NOT NULL);
CREATE TABLE phone_subtitle_drafts (telephone_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL, accepted_at TEXT, accepted_by TEXT);
CREATE TABLE users (nickname TEXT, pin TEXT);
CREATE TABLE entities (entity_type TEXT, entity_id TEXT, label TEXT, meta_json TEXT);
CREATE TABLE translation_units (unit_id TEXT PRIMARY KEY, translation_text TEXT);
INSERT INTO users VALUES ('tester', '123456');
INSERT INTO entities VALUES ('telephone', 'tel-card-ai-05-idol-00', '기존 전화', '{}');
INSERT INTO entities VALUES ('telephone', 'tel-card-ai-05-new-00', '새 전화', '{}');`;
db.exec(schema);

function freshDb(t) {
	const database = new DatabaseSync(':memory:');
	database.exec(schema);
	t.after(() => database.close());
	return database;
}
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); delete process.env.PHONE_SUBTITLES_PATH; delete globalThis.__phoneTestDb; });

test('existing subtitles are imported once, with unmatched clips retained', () => {
	const list = service.listPhoneSubtitles(db);
	assert.equal(list.phones.length, 2);
	assert.equal(list.phones[0].translated, true);
	assert.equal(list.phones[1].matched, false);
	assert.equal(list.unlinked.length, 1);
	assert.deepEqual(service.exportPhoneSubtitles(db), original);
	writeFileSync(process.env.PHONE_SUBTITLES_PATH, '{}');
	assert.deepEqual(service.exportPhoneSubtitles(db), original);
});

test('save a new clip and association, preserve line breaks and reject conflicting edits', () => {
	const body = { telephone_id: 'tel-card-ai-05-new-00', expected_link: '', clip_name: 'sud_vo_phone_tel-card-ai-05-new-00', revision: 0, exists: false, nickname: 'tester', pin: '123456', lines: [{ time: 1.5, text: '첫 줄\n둘째 줄' }] };
	assert.equal(service.savePhoneSubtitle({ ...body, pin: '000000' }, db).status, 401);
	assert.equal(service.savePhoneSubtitle(body, db).status, 200);
	assert.equal(service.savePhoneSubtitle(body, db).status, 409);
	assert.equal(service.listPhoneSubtitles(db).phones[1].translated, true);
	assert.deepEqual(service.exportPhoneSubtitles(db)[body.clip_name], [{ line: 1, time: 1.5, text: '첫 줄\\n둘째 줄' }]);
	assert.equal(service.savePhoneSubtitle({ ...body, exists: true, revision: 1, expected_link: body.clip_name, lines: [{ time: -1, text: 'x' }] }, db).status, 400);
	assert.equal(service.savePhoneSubtitle({ ...body, exists: true, revision: 1, expected_link: body.clip_name }, db).status, 200);
	assert.equal(service.savePhoneSubtitle({ ...body, exists: true, revision: 1, expected_link: body.clip_name }, db).status, 409);
	assert.deepEqual(service.exportPhoneSubtitles(db)['sud_vo_phone_tel-card-ai-05-idol-00'], original['sud_vo_phone_tel-card-ai-05-idol-00']);
});

test('a changed phone association cannot be overwritten by a stale editor', () => {
	const clip_name = 'sud_vo_phone_tel-card-ai-05-idol-00';
	const result = service.savePhoneSubtitle({ telephone_id: 'tel-card-ai-05-new-00', expected_link: '', clip_name, revision: 0, exists: true, nickname: 'tester', pin: '123456', lines: [{ time: 0, text: '덮어쓰기' }] }, db);
	assert.equal(result.status, 409);
	assert.deepEqual(service.exportPhoneSubtitles(db)[clip_name], original[clip_name]);
});

test('endpoint serves lists, downloads and validation errors', async () => {
	const jsonUrl = 'data:text/javascript;base64,' + Buffer.from("export function json(data, init = {}) { return new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init.headers } }); }").toString('base64');
	const endpointSource = readFileSync(new URL('../src/routes/api/phone-subtitles/+server.js', import.meta.url), 'utf8')
		.replace("'$lib/server/db.js'", JSON.stringify(jsonUrl))
		.replace("'$lib/server/phone-subtitles.js'", JSON.stringify(serviceUrl))
		.replace("'$lib/server/phone-subtitle-drafts.js'", JSON.stringify(draftsUrl));
	const api = await import('data:text/javascript;base64,' + Buffer.from(endpointSource).toString('base64'));
	const list = api.GET({ url: new URL('http://localhost/api/phone-subtitles') });
	assert.equal((await list.json()).phones.length, 2);
	const download = api.GET({ url: new URL('http://localhost/api/phone-subtitles?export=1') });
	assert.match(download.headers.get('content-disposition'), /phoneSubtitles\.json/);
	assert.equal(Object.keys(await download.json()).length, 3);
	assert.equal(list.headers.get('cache-control'), 'no-store');
	assert.equal(download.headers.get('cache-control'), 'no-store');
	const post = (body, headers = { 'content-type': 'application/json' }) => api.POST({ request: new Request('http://localhost/api/phone-subtitles', { method: 'POST', headers, body: JSON.stringify(body) }) });
	const bad = await post({ nickname: 'tester', pin: 'wrong' });
	assert.equal(bad.status, 401);
	assert.equal((await post(null)).status, 400);
	assert.equal((await post({}, { 'content-type': 'text/plain' })).status, 415);
	assert.equal((await post({}, { 'content-type': 'application/json', origin: 'https://other.example' })).status, 403);
	assert.equal((await post({ nickname: 'tester', pin: 'wrong' }, { 'content-type': 'application/json', origin: 'https://localhost' })).status, 401);
	assert.equal((await post({ padding: 'x'.repeat(2 * 1024 * 1024) })).status, 413);
	assert.equal((await api.GET({ url: new URL('http://localhost/api/phone-subtitles?clip=../test') })).status, 400);
	assert.equal((await api.GET({ url: new URL('http://localhost/api/phone-subtitles?clip=') })).status, 400);
	const phone = await api.GET({ url: new URL('http://localhost/api/phone-subtitles?telephone=tel-card-ai-05-idol-00') });
	assert.equal(phone.status, 200);
	assert.equal((await phone.json()).clip_name, 'sud_vo_phone_tel-card-ai-05-idol-00');
	assert.equal((await api.GET({ url: new URL('http://localhost/api/phone-subtitles?telephone=missing') })).status, 404);
});

test('fresh installations and empty source objects support new subtitles', (t) => {
	const previousPath = process.env.PHONE_SUBTITLES_PATH;
	const previousRoot = process.env.PROJECT_ROOT;
	t.after(() => {
		process.env.PHONE_SUBTITLES_PATH = previousPath;
		if (previousRoot === undefined) delete process.env.PROJECT_ROOT;
		else process.env.PROJECT_ROOT = previousRoot;
	});
	delete process.env.PHONE_SUBTITLES_PATH;
	process.env.PROJECT_ROOT = dir;
	const database = freshDb(t);
	assert.deepEqual(service.exportPhoneSubtitles(database), {});
	assert.equal(database.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_settings').get().n, 0);
	const result = service.savePhoneSubtitle({ clip_name: 'sud_vo_phone_new', revision: 0, exists: false,
		nickname: 'tester', pin: '123456', lines: [{ time: 0, text: '새 자막' }] }, database);
	assert.equal(result.status, 200);
	assert.equal(database.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_settings').get().n, 1);
	assert.equal(service.readPhoneSubtitle('sud_vo_phone_new', database).lines[0].text, '새 자막');
	process.env.PHONE_SUBTITLES_PATH = previousPath;
	assert.deepEqual(service.exportPhoneSubtitles(freshDb(t)), {});
});

test('missing configured source does not initialize or overwrite subtitle data', (t) => {
	const previousPath = process.env.PHONE_SUBTITLES_PATH;
	t.after(() => { process.env.PHONE_SUBTITLES_PATH = previousPath; });
	const database = freshDb(t);
	process.env.PHONE_SUBTITLES_PATH = path.join(dir, 'absent.json');
	assert.throws(() => service.ensurePhoneSubtitles(database), /찾을 수 없습니다/);
	assert.equal(database.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_settings').get().n, 0);
	process.env.PHONE_SUBTITLES_PATH = previousPath;
	assert.deepEqual(service.exportPhoneSubtitles(database), {});
});

test('invalid input does not change data, revisions or associations', () => {
	const before = service.exportPhoneSubtitles(db);
	const body = { clip_name: 'sud_vo_phone_tel-card-ai-05-idol-00', revision: 0, exists: true,
		nickname: 'tester', pin: '123456', lines: [{ time: 0, text: 'valid' }] };
	for (const lines of [[null], [{}], [{ time: -1, text: 'x' }], [{ time: 2, text: 'x' }, { time: 1, text: 'x' }], [{ time: 0, text: 123 }], [{ time: 0, text: 'x'.repeat(10001) }]]) {
		assert.equal(service.savePhoneSubtitle({ ...body, lines }, db).status, 400);
	}
	assert.equal(service.savePhoneSubtitle({ ...body, telephone_id: 'missing' }, db).status, 400);
	assert.equal(service.readPhoneSubtitle(body.clip_name, db).revision, 0);
	assert.deepEqual(service.exportPhoneSubtitles(db), before);
});

test('malformed source import is atomic and can be retried after repair', (t) => {
	const database = freshDb(t);
	writeFileSync(process.env.PHONE_SUBTITLES_PATH, JSON.stringify({ ...original, 'sud_vo_phone_bad': [{ time: -1, text: 'bad' }] }));
	assert.throws(() => service.ensurePhoneSubtitles(database), /올바르지/);
	assert.equal(database.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_clips').get().n, 0);
	assert.equal(database.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_settings').get().n, 0);
	writeFileSync(process.env.PHONE_SUBTITLES_PATH, JSON.stringify(original));
	assert.deepEqual(service.exportPhoneSubtitles(database), original);
});

test('phone list includes title translations and falls back to asset IDs', (t) => {
	const database = freshDb(t);
	database.prepare("INSERT INTO translation_units VALUES ('masterdb:Telephone:tel-card-ai-05-idol-00:name', '번역된 전화 제목')").run();
	database.prepare('INSERT INTO entities VALUES (?, ?, ?, ?)').run('telephone', 'tel-asset-alias', '별도 클립', JSON.stringify({ assetId: 'tel-message-single-ai-001' }));
	const list = service.listPhoneSubtitles(database);
	assert.equal(list.phones.find((item) => item.id === 'tel-card-ai-05-idol-00').translation_label, '번역된 전화 제목');
	assert.equal(list.phones.find((item) => item.id === 'tel-asset-alias').clip_name, 'sud_vo_phone_tel-message-single-ai-001');
	assert.equal(list.unlinked.length, 0);
	assert.equal(service.readTelephoneSubtitle('tel-asset-alias', database).clip_name, 'sud_vo_phone_tel-message-single-ai-001');
	assert.equal(service.readTelephoneSubtitle('missing', database), null);
});

test('search finds saved phone text including escaped newlines but excludes drafts and unlinked clips', (t) => {
	const database = freshDb(t);
	service.ensurePhoneSubtitles(database);
	const existing = 'sud_vo_phone_tel-card-ai-05-idol-00';
	assert.equal(service.searchPhoneSubtitles('기존\n자막', database)[0].id, 'tel-card-ai-05-idol-00');
	assert.equal(service.searchPhoneSubtitles('기존\\n자막', database)[0].preferred_key, 'phone_subtitles');
	database.prepare('INSERT INTO phone_subtitle_drafts VALUES (?, ?, ?, ?, ?, NULL, NULL)').run('tel-card-ai-05-new-00', 'draft', JSON.stringify({ text: '초안 전용 단어' }), 'hash', 'now');
	database.prepare('INSERT INTO phone_subtitle_clips (clip_name, lines_json) VALUES (?, ?)').run('sud_vo_phone_unlinked', JSON.stringify([{ time: 0, text: '연결 없는 단어' }]));
	assert.deepEqual(service.searchPhoneSubtitles('초안 전용 단어', database), []);
	assert.deepEqual(service.searchPhoneSubtitles('연결 없는 단어', database), []);
	assert.equal(JSON.parse(database.prepare('SELECT lines_json FROM phone_subtitle_clips WHERE clip_name = ?').get(existing).lines_json)[0].text, '기존\\n자막');
});

test('global search returns matching phones with their subtitle editor section', async (t) => {
	const database = freshDb(t);
	service.ensurePhoneSubtitles(database);
	globalThis.__phoneTestDb = database;
	t.after(() => { globalThis.__phoneTestDb = db; });
	const stub = 'data:text/javascript;base64,' + Buffer.from(`
		export const all = (sql) => sql.includes('SELECT COUNT(*) total') ? [{ total: 0, done: 0 }] : [];
		export const json = (data) => new Response(JSON.stringify(data));
	`).toString('base64');
	const endpoint = readFileSync(new URL('../src/routes/api/items/+server.js', import.meta.url), 'utf8')
		.replace("'$lib/server/db.js'", JSON.stringify(stub))
		.replace("'$lib/server/phone-subtitles.js'", JSON.stringify(serviceUrl));
	const api = await import('data:text/javascript;base64,' + Buffer.from(endpoint).toString('base64'));
	const url = new URL('http://localhost/api/items?section=groups');
	url.searchParams.set('q', '기존\\n자막');
	const result = await api.GET({ url }).json();
	assert.equal(result.items[0].type, 'search');
	assert.deepEqual(result.items.slice(1).map((item) => [item.type, item.id, item.preferred_key]),
		[['telephone', 'tel-card-ai-05-idol-00', 'phone_subtitles']]);
});

test('export aliases saved legacy subtitle keys to audio assets without exporting drafts', (t) => {
	const database = freshDb(t);
	service.ensurePhoneSubtitles(database);
	const legacy = 'sud_vo_phone_tel-suntory-ai-22-0801';
	const asset = 'sud_vo_phone_tel-suntory-ai-001';
	database.prepare('INSERT INTO entities VALUES (?, ?, ?, ?)').run('telephone', 'tel-suntory-ai-22-0801', '전화', JSON.stringify({ assetId: 'tel-suntory-ai-001' }));
	database.prepare('INSERT INTO phone_subtitle_clips (clip_name, lines_json) VALUES (?, ?)').run(legacy, JSON.stringify([{ line: 1, time: 0, text: '' }]));
	database.prepare('INSERT INTO phone_subtitle_drafts VALUES (?, ?, ?, ?, ?, NULL, NULL)').run('tel-suntory-ai-22-0801', 'draft', JSON.stringify({ text: '초안' }), 'hash', 'now');
	assert.equal(service.exportPhoneSubtitles(database)[asset], undefined);
	const saved = [{ line: 1, time: 1, text: '저장된 자막' }];
	database.prepare('UPDATE phone_subtitle_clips SET lines_json = ? WHERE clip_name = ?').run(JSON.stringify(saved), legacy);
	assert.deepEqual(service.exportPhoneSubtitles(database)[asset], saved);
	assert.deepEqual(service.exportPhoneSubtitles(database)[legacy], saved);
	assert.equal(database.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_clips WHERE clip_name = ?').get(asset).n, 0);
	database.prepare('INSERT INTO phone_subtitle_clips (clip_name, lines_json) VALUES (?, ?)').run(asset, JSON.stringify([{ line: 1, time: 0, text: '기존 번역' }]));
	assert.throws(() => service.exportPhoneSubtitles(database), /전화 자막 충돌/);
	assert.equal(JSON.parse(database.prepare('SELECT lines_json FROM phone_subtitle_clips WHERE clip_name = ?').get(asset).lines_json)[0].text, '기존 번역');
});

test('telephone lookup follows saved links and the detail API exposes the embedded editor section', async () => {
	const phone = service.readTelephoneSubtitle('tel-card-ai-05-new-00', db);
	assert.equal(phone.saved_link, 'sud_vo_phone_tel-card-ai-05-new-00');
	assert.equal(phone.revision, 2);
	const stub = 'data:text/javascript;base64,' + Buffer.from(`
		export const all = () => [];
		export const get = (sql, params) => sql.includes('FROM entities') ? { type: params.$type, id: params.$id, label: 'phone' } : { total: 1, done: 1 };
		export const json = (data) => new Response(JSON.stringify(data));
	`).toString('base64');
	const source = readFileSync(new URL('../src/routes/api/detail/+server.js', import.meta.url), 'utf8')
		.replace("'$lib/server/db.js'", JSON.stringify(stub))
		.replace("'$lib/server/phone-subtitles.js'", JSON.stringify(serviceUrl));
	const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
	for (const id of ['tel-card-ai-05-idol-00', 'tel-card-ai-05-new-00']) {
		const data = await api.GET({ url: new URL(`http://localhost/api/detail?type=telephone&id=${id}`) }).json();
		assert.equal(data.sections[0].key, 'direct');
		assert.deepEqual(data.sections[1], { key: 'phone_subtitles', icon: '☎', label: '전화 자막', kind: 'phone_subtitles', total: 1, done: 1 });
	}
});
