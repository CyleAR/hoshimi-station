import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const dbUrl = dataUrl(`export const getDb = () => globalThis.__phoneDraftDb;
export const json = (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });`);
const phoneUrl = dataUrl(read('../src/lib/server/phone-subtitles.js').replace("'./db.js'", JSON.stringify(dbUrl)));
const draftUrl = dataUrl(read('../src/lib/server/phone-subtitle-drafts.js').replace("'./db.js'", JSON.stringify(dbUrl)).replace("'./phone-subtitles.js'", JSON.stringify(phoneUrl)));
const authUrl = dataUrl(read('../src/lib/server/codex-auth.js').replace("'$lib/server/db.js'", JSON.stringify(dbUrl)));
const apiUrl = dataUrl(read('../src/routes/api/codex/phone-subtitles/+server.js')
	.replace("'$lib/server/db.js'", JSON.stringify(dbUrl)).replace("'$lib/server/codex-auth.js'", JSON.stringify(authUrl))
	.replace("'$lib/server/phone-subtitle-drafts.js'", JSON.stringify(draftUrl)));
const publicUrl = dataUrl(read('../src/routes/api/phone-subtitles/+server.js')
	.replace("'$lib/server/db.js'", JSON.stringify(dbUrl)).replace("'$lib/server/phone-subtitles.js'", JSON.stringify(phoneUrl))
	.replace("'$lib/server/phone-subtitle-drafts.js'", JSON.stringify(draftUrl)));
const phoneService = await import(phoneUrl), drafts = await import(draftUrl), api = await import(apiUrl), publicApi = await import(publicUrl);
const id = 'tel-card-ai-05-idol-00', clip = 'sud_vo_phone_' + id;
const schema = `CREATE TABLE phone_subtitle_clips (clip_name TEXT PRIMARY KEY, lines_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
CREATE TABLE phone_subtitle_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE phone_subtitle_links (telephone_id TEXT PRIMARY KEY, clip_name TEXT NOT NULL);
CREATE TABLE phone_subtitle_drafts (telephone_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL, accepted_at TEXT, accepted_by TEXT);
CREATE TABLE users (nickname TEXT, pin TEXT);
CREATE TABLE entities (entity_type TEXT, entity_id TEXT, label TEXT, meta_json TEXT);
CREATE TABLE translation_units (unit_id TEXT PRIMARY KEY, translation_text TEXT);
INSERT INTO phone_subtitle_settings VALUES ('imported', 'test');
INSERT INTO users VALUES ('tester', '123456');
INSERT INTO entities VALUES ('telephone', '${id}', '電話', '{"characterId":"char-ai"}');
INSERT INTO entities VALUES ('telephone', 'tel-new', '新規', '{"characterId":"char-yu","assetId":"tel-new-asset"}');
INSERT INTO entities VALUES ('character', 'char-ai', '小美山愛', '{}');
INSERT INTO translation_units VALUES ('masterdb:Character:char-ai:name', '코미야마 아이');`;

const priorToken = process.env.CODEX_API_TOKEN;
process.env.CODEX_API_TOKEN = 'phone-test-secret';
after(() => { delete globalThis.__phoneDraftDb; if (priorToken === undefined) delete process.env.CODEX_API_TOKEN; else process.env.CODEX_API_TOKEN = priorToken; });
function database(t, lines = [], filename = ':memory:') {
	const db = new DatabaseSync(filename);
	db.exec(schema);
	if (lines.length) db.prepare('INSERT INTO phone_subtitle_clips (clip_name, lines_json) VALUES (?, ?)').run(clip, JSON.stringify(lines));
	globalThis.__phoneDraftDb = db;
	t.after(() => db.close());
	return db;
}
function proposal(db, overrides = {}) {
	return { telephone_id: id, audio_clip_name: clip, audio_sha256: 'a'.repeat(64), expected_draft_id: null,
		base: drafts.getPhoneSubtitleWork(id, db).snapshot,
		transcript: { model: 'faster-whisper/large-v3', segments: [{ start: 0.5, end: 2, text: 'もしもし。' }, { start: 3, end: 5, text: '聞こえますか？' }] },
		lines: [{ line: 1, time: 0.5, text: '여보세요.', source_segments: [1], needs_review: false },
			{ line: 2, time: 3, text: '', source_segments: [2], needs_review: true, note: '연결 불확실' }], ...overrides };
}
const rejects = (fn, status) => assert.throws(fn, (error) => error.status === status);
const user = { nickname: 'tester', pin: '123456' };
function get(query = {}, token = 'phone-test-secret') {
	const url = new URL('http://localhost/api/codex/phone-subtitles');
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
	return api.GET({ url, request: new Request(url, { headers: { authorization: `Bearer ${token}` } }) });
}
function post(body, token = 'phone-test-secret', headers = {}) {
	return api.POST({ request: new Request('http://localhost/api/codex/phone-subtitles', { method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) }) });
}

test('new drafts preserve Japanese separately, never export until applied, and uncertain lines stay blank', (t) => {
	const db = database(t);
	const body = proposal(db), saved = drafts.submitPhoneSubtitleDraft(body, db);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db), {});
	const work = drafts.getPhoneSubtitleWork(id, db);
	assert.equal(work.phone.character_translation, '코미야마 아이');
	assert.equal(work.draft.transcript.segments[0].text, 'もしもし。');
	assert.equal(work.draft.stale, false);
	assert.equal(drafts.listPhoneSubtitleWork(new URLSearchParams({ draft_status: 'pending' }), db).phones[0].id, id);
	drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db)[clip], [{ line: 1, time: 0.5, text: '여보세요.' }, { line: 2, time: 3, text: '' }]);
	assert.equal(drafts.getPhoneSubtitleWork(id, db).draft.accepted_by, 'tester');
	rejects(() => drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db), 409);
	assert.equal(drafts.listPhoneSubtitleWork(new URLSearchParams({ draft_status: 'applied' }), db).phones.length, 1);
});

test('partial subtitles retain every existing translation and time, including untouched blank lines', (t) => {
	const existing = [{ line: 1, time: 0, text: '기존 번역\\n보존' }, { line: 2, time: 3.25, text: '' }, { line: 3, time: 7, text: '' }];
	const db = database(t, existing);
	const body = proposal(db, { lines: [{ line: 2, time: 3.25, text: '잘 들려요?\n여보세요?', source_segments: [2], needs_review: false }] });
	const saved = drafts.submitPhoneSubtitleDraft(body, db);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db)[clip], existing);
	drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db)[clip], [existing[0], { line: 2, time: 3.25, text: '잘 들려요?\\n여보세요?' }, existing[2]]);
});

test('identical retries are idempotent and replacing another draft requires its exact ID', (t) => {
	const db = database(t), body = proposal(db);
	const first = drafts.submitPhoneSubtitleDraft(body, db);
	const retry = drafts.submitPhoneSubtitleDraft(body, db);
	assert.equal(retry.duplicate, true);
	assert.equal(retry.draft_id, first.draft_id);
	const changed = { ...body, notes: '재검토' };
	rejects(() => drafts.submitPhoneSubtitleDraft(changed, db), 409);
	const second = drafts.submitPhoneSubtitleDraft({ ...changed, expected_draft_id: first.draft_id }, db);
	assert.notEqual(second.draft_id, first.draft_id);
	rejects(() => drafts.submitPhoneSubtitleDraft({ ...body, expected_draft_id: first.draft_id }, db), 409);
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_drafts').get().n, 1);
});

test('human edits and changed links reject stale submissions and applications without touching subtitles', (t) => {
	const db = database(t, [{ time: 0, text: '' }]), body = proposal(db);
	const saved = drafts.submitPhoneSubtitleDraft(body, db);
	db.prepare("UPDATE phone_subtitle_clips SET revision = revision + 1, lines_json = ? WHERE clip_name = ?").run('[{"time":0,"text":"사람 번역"}]', clip);
	const before = phoneService.exportPhoneSubtitles(db);
	assert.equal(drafts.getPhoneSubtitleWork(id, db).draft.stale, true);
	rejects(() => drafts.submitPhoneSubtitleDraft(body, db), 409);
	rejects(() => drafts.submitPhoneSubtitleDraft({ ...body, notes: '오래된 스냅샷', expected_draft_id: saved.draft_id }, db), 409);
	rejects(() => drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db), 409);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db), before);
	assert.equal(drafts.listPhoneSubtitleWork(new URLSearchParams({ draft_status: 'stale' }), db).phones.length, 1);
	const newBody = proposal(db, { telephone_id: 'tel-new', audio_clip_name: 'sud_vo_phone_tel-new-asset', base: drafts.getPhoneSubtitleWork('tel-new', db).snapshot });
	drafts.submitPhoneSubtitleDraft(newBody, db);
	db.prepare("INSERT INTO phone_subtitle_links VALUES ('tel-new', ?)").run(clip);
	rejects(() => drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: 'tel-new', draft_id: drafts.getPhoneSubtitleWork('tel-new', db).draft.draft_id }, db), 409);
});

test('a changed audio asset invalidates a draft even if its linked subtitle snapshot is unchanged', (t) => {
	const db = database(t, [{ time: 0, text: '' }]), body = proposal(db);
	const saved = drafts.submitPhoneSubtitleDraft(body, db);
	db.prepare("UPDATE entities SET meta_json = ? WHERE entity_type = 'telephone' AND entity_id = ?").run('{"characterId":"char-ai","assetId":"new-asset"}', id);
	assert.equal(drafts.getPhoneSubtitleWork(id, db).draft.stale, true);
	assert.equal(drafts.listPhoneSubtitleWork(new URLSearchParams({ draft_status: 'stale' }), db).phones[0].id, id);
	rejects(() => drafts.submitPhoneSubtitleDraft(body, db), 409);
	rejects(() => drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db), 409);
});

test('rejects invalid recognition data, wrong audio mapping, filled-line overwrite and changed timestamps', (t) => {
	const db = database(t, [{ time: 0, text: '기존 번역' }, { time: 3, text: '' }]);
	const body = proposal(db, { lines: [{ line: 2, time: 3, text: '잘 들려요?', source_segments: [2], needs_review: false }] });
	const before = phoneService.exportPhoneSubtitles(db);
	for (const patch of [
		{ transcript: { model: 'large-v3', segments: [] } }, { audio_sha256: 'bad' }, { expected_draft_id: undefined },
		{ lines: [{ ...body.lines[0], line: 1, time: 0 }] }, { lines: [{ ...body.lines[0], time: 3.5 }] },
		{ lines: [{ ...body.lines[0], source_segments: [99] }] }, { lines: [{ ...body.lines[0], needs_review: true, note: '불확실' }] },
		{ lines: [{ ...body.lines[0], needs_review: true, text: '', note: '' }] }, { base: { ...body.base, lines: [null] } },
		{ transcript: { model: 'large-v3', segments: [{ start: 2, end: 1, text: '逆' }] } }
	]) rejects(() => drafts.submitPhoneSubtitleDraft({ ...body, ...patch }, db), 400);
	rejects(() => drafts.submitPhoneSubtitleDraft({ ...body, audio_clip_name: 'sud_vo_phone_wrong' }, db), 409);
	rejects(() => drafts.submitPhoneSubtitleDraft({ ...body, telephone_id: 'absent' }, db), 404);
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_drafts').get().n, 0);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db), before);
});

test('an all-review draft cannot be applied and drafts do not initialize empty export state', (t) => {
	const db = database(t);
	db.exec('DELETE FROM phone_subtitle_settings');
	const priorPath = process.env.PHONE_SUBTITLES_PATH, priorRoot = process.env.PROJECT_ROOT;
	const directory = mkdtempSync(path.join(tmpdir(), 'phone-draft-empty-'));
	delete process.env.PHONE_SUBTITLES_PATH; process.env.PROJECT_ROOT = directory;
	t.after(() => { if (priorPath === undefined) delete process.env.PHONE_SUBTITLES_PATH; else process.env.PHONE_SUBTITLES_PATH = priorPath;
		if (priorRoot === undefined) delete process.env.PROJECT_ROOT; else process.env.PROJECT_ROOT = priorRoot; rmSync(directory, { recursive: true, force: true }); });
	const body = proposal(db, { lines: [{ line: 1, time: 0, text: '', source_segments: [], needs_review: true, note: '인식 불확실' }] });
	const saved = drafts.submitPhoneSubtitleDraft(body, db);
	rejects(() => drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db), 400);
	assert.equal(db.prepare('SELECT COUNT(*) AS n FROM phone_subtitle_settings').get().n, 0);
	assert.deepEqual(phoneService.exportPhoneSubtitles(db), {});
});

test('API validates authorization, input, paging and exposes drafts without secrets', async (t) => {
	const db = database(t), body = proposal(db);
	assert.equal(get({}, '').status, 401);
	assert.equal((await post(body, '')).status, 401);
	assert.equal((await post(body, 'phone-test-secret', { 'content-type': 'text/plain' })).status, 415);
	assert.equal((await post(null)).status, 400);
	assert.equal((await post({ padding: 'x'.repeat(2 * 1024 * 1024) })).status, 413);
	assert.equal((await api.POST({ request: new Request('http://localhost/api', { method: 'POST', headers: { authorization: 'Bearer phone-test-secret', 'content-type': 'application/json' }, body: '{' }) })).status, 400);
	delete process.env.CODEX_API_TOKEN;
	assert.equal(get().status, 503); process.env.CODEX_API_TOKEN = 'phone-test-secret';
	for (const filter of [{ limit: '0' }, { limit: '1.5' }, { limit: 'foo' }, { draft_status: 'bad' }, { translation_status: 'bad' }, { character_id: '' }]) assert.equal(get(filter).status, 400);
	assert.equal(get({ telephone_id: '' }).status, 400);
	assert.equal(get({ telephone_id: 'absent' }).status, 404);
	const first = await get({ limit: '1' }).json();
	const second = await get({ limit: '1', cursor: first.next_cursor }).json();
	assert.equal(first.phones.length, 1); assert.equal(second.phones.length, 1); assert.equal(second.next_cursor, null);
	assert.notEqual(first.phones[0].id, second.phones[0].id);
	assert.equal((await get({ character_id: 'char-yu' }).json()).phones[0].audio_clip_name, 'sud_vo_phone_tel-new-asset');
	const saved = await (await post(body)).json();
	assert.equal((await get({ draft_status: 'missing' }).json()).phones.length, 1);
	assert.equal(get().headers.get('cache-control'), 'no-store');
	const work = await get({ telephone_id: id }).json();
	assert.equal(work.draft.draft_id, saved.draft_id);
	assert.ok(!JSON.stringify(work).includes('123456'));
	const publicWork = await publicApi.GET({ url: new URL(`http://localhost/api/phone-subtitles?telephone=${id}`) }).json();
	assert.equal(publicWork.draft.draft_id, saved.draft_id);
	const apply = (pin, origin) => publicApi.POST({ request: new Request('http://localhost/api/phone-subtitles', { method: 'POST',
		headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ action: 'apply_draft', telephone_id: id, draft_id: saved.draft_id, ...user, pin }) }) });
	assert.equal((await apply('000000')).status, 401);
	assert.equal((await apply(user.pin, 'http://other.example')).status, 403);
	assert.equal((await apply(user.pin)).status, 200);
});

test('drafts and completion survive closing and reopening the database', (t) => {
	const directory = mkdtempSync(path.join(tmpdir(), 'phone-draft-resume-'));
	const filename = path.join(directory, 'phone.sqlite3');
	let db = new DatabaseSync(filename); db.exec(schema);
	const body = proposal(db), saved = drafts.submitPhoneSubtitleDraft(body, db);
	db.close(); db = new DatabaseSync(filename);
	assert.equal(drafts.getPhoneSubtitleWork(id, db).draft.draft_id, saved.draft_id);
	assert.equal(drafts.submitPhoneSubtitleDraft(body, db).duplicate, true);
	drafts.applyPhoneSubtitleDraft({ ...user, telephone_id: id, draft_id: saved.draft_id }, db);
	db.close(); db = new DatabaseSync(filename);
	t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
	assert.equal(drafts.listPhoneSubtitleWork(new URLSearchParams({ draft_status: 'applied' }), db).phones.length, 1);
	assert.equal(drafts.listPhoneSubtitleWork(new URLSearchParams({ draft_status: 'missing' }), db).phones[0].id, 'tel-new');
});
