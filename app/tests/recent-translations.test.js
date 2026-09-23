import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { translationDiff } from '../src/lib/translation-diff.js';

const directory = mkdtempSync(join(tmpdir(), 'hoshimi-recent-test-'));
const previousDbPath = process.env.DB_PATH;
process.env.DB_PATH = join(directory, 'test.sqlite3');
const seed = new DatabaseSync(process.env.DB_PATH);
seed.exec(`CREATE TABLE translation_units (
 unit_id TEXT PRIMARY KEY, source_type TEXT DEFAULT 'adv', category TEXT DEFAULT 'adv/card',
 source_file TEXT DEFAULT 'card.txt', record_id TEXT DEFAULT 'card', field_path TEXT DEFAULT 'text',
 scope_type TEXT DEFAULT 'card', scope_id TEXT DEFAULT 'card-1', line_no INTEGER DEFAULT 1,
 speaker TEXT DEFAULT '', original_text TEXT DEFAULT 'original', translation_text TEXT DEFAULT '',
 translator_name TEXT DEFAULT '', status TEXT DEFAULT 'new', updated_at TEXT DEFAULT ''
)`);
seed.exec(`CREATE TABLE translation_changes (
 id INTEGER PRIMARY KEY, unit_id TEXT NOT NULL, original_text TEXT NOT NULL,
 previous_text TEXT NOT NULL, translation_text TEXT NOT NULL,
 translator_name TEXT NOT NULL, changed_at TEXT NOT NULL
)`);
seed.close();

const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const dbSource = readFileSync(new URL('../src/lib/server/db.js', import.meta.url), 'utf8')
 .replace("import { dev } from '$app/environment';", 'const dev = false;');
const dbUrl = dataUrl(dbSource);
const { getDb } = await import(dbUrl);
const db = getDb();
assert.ok(db.prepare('PRAGMA table_info(translation_changes)').all()
 .some((column) => column.name === 'previous_translator_name'));
const recentWorkUrl = dataUrl(readFileSync(new URL('../src/lib/server/recent-work.js', import.meta.url), 'utf8')
 .replace("'$lib/server/db.js'", JSON.stringify(dbUrl)));
for (const nickname of ['alice', 'bob']) {
 db.prepare("INSERT INTO users VALUES (?, '123456', '', '')").run(nickname);
}
async function endpoint(route) {
 const source = readFileSync(new URL(`../src/routes/api/${route}/+server.js`, import.meta.url), 'utf8')
  .replace("'$lib/server/db.js'", JSON.stringify(dbUrl))
  .replace("'$lib/server/recent-work.js'", JSON.stringify(recentWorkUrl));
 return await import(dataUrl(source));
}
const recent = (await endpoint('admin/recent')).POST;
const save = (await endpoint('unit')).POST;
const recentApi = (await endpoint('recent-work')).GET;
async function post(handler, body) {
 const response = await handler({ request: new Request('http://localhost/test', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nickname: 'alice', pin: '123456', ...body })
 }) });
 assert.equal(response.status, 200);
 return response.json();
}
async function item(id, filter = {}) {
 return (await post(recent, filter)).items.find((row) => row.unit_id === id);
}
function create(id) {
 db.prepare('INSERT INTO translation_units(unit_id) VALUES (?)').run(id);
}
after(() => {
 db.close();
 if (previousDbPath === undefined) delete process.env.DB_PATH;
 else process.env.DB_PATH = previousDbPath;
 assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
 rmSync(directory, { recursive: true });
});

test('comparison survives an unchanged save by the same or another user', async () => {
 create('resave');
 await post(save, { unit_id: 'resave', translation_text: 'before' });
 assert.equal((await item('resave')).previous_text, null);
 await post(save, { unit_id: 'resave', translation_text: 'after' });
 assert.equal((await item('resave')).previous_text, 'before');
 db.prepare("UPDATE translation_changes SET changed_at='2020-01-01 00:00:00' WHERE unit_id='resave'").run();
 await post(save, { unit_id: 'resave', translation_text: 'after' });
 assert.equal((await item('resave')).previous_text, 'before');
 await post(save, { unit_id: 'resave', translation_text: 'after', nickname: 'bob' });
 const row = await item('resave', { translator_name: 'bob' });
 assert.equal(row.previous_text, 'before');
 assert.equal(row.change_translator_name, 'alice');
 assert.equal(row.changed_at, '2020-01-01 00:00:00');
 assert.equal(row.previous_translator_name, 'alice');
});

test('previous translator follows the author whose text was actually replaced', async () => {
 create('authorship');
 await post(save, { unit_id: 'authorship', translation_text: 'first' });
 await post(save, { unit_id: 'authorship', translation_text: 'second', nickname: 'bob' });
 assert.equal((await item('authorship')).previous_translator_name, 'alice');
 await post(save, { unit_id: 'authorship', translation_text: 'third' });
 assert.equal((await item('authorship')).previous_translator_name, 'bob');
});

async function api(path, token) {
 const url = new URL(`http://localhost${path}`);
 return recentApi({ request: new Request(url, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
 }), url });
}

test('external API requires a token and pages through current items and all changes', async () => {
 const oldToken = process.env.RECENT_WORK_API_TOKEN;
 try {
  delete process.env.RECENT_WORK_API_TOKEN;
  assert.equal((await api('/api/recent-work')).status, 503);
  process.env.RECENT_WORK_API_TOKEN = 'test-secret';
  assert.equal((await api('/api/recent-work')).status, 401);
  assert.equal((await api('/api/recent-work', 'wrong')).status, 401);
  assert.equal((await api('/api/recent-work?cursor=bad', 'test-secret')).status, 400);
  const first = await api('/api/recent-work?limit=1', 'test-secret');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const page = await first.json();
  assert.equal(page.items.length, 1);
  assert.ok(page.next_cursor);
  const next = await (await api(`/api/recent-work?limit=1&cursor=${page.next_cursor}`, 'test-secret')).json();
  assert.notEqual(next.items[0].unit_id, page.items[0].unit_id);
  const changes = await (await api('/api/recent-work?view=changes&limit=200', 'test-secret')).json();
  assert.ok(changes.items.some((row) => row.unit_id === 'authorship' && row.previous_translator_name === 'alice'));
  assert.ok(changes.items.some((row) => row.unit_id === 'authorship' && row.previous_translator_name === 'bob'));
 } finally {
  if (oldToken === undefined) delete process.env.RECENT_WORK_API_TOKEN;
  else process.env.RECENT_WORK_API_TOKEN = oldToken;
 }
});

test('latest edit wins, and clearing/refilling does not revive an old comparison', async () => {
 create('latest');
 for (const translation_text of ['first', 'second', 'third', 'second']) {
  await post(save, { unit_id: 'latest', translation_text });
 }
 assert.equal((await item('latest')).previous_text, 'third');
 await post(save, { unit_id: 'latest', translation_text: '' });
 await post(save, { unit_id: 'latest', translation_text: 'second' });
 assert.equal((await item('latest')).previous_text, null);
});

test('a different original cannot use a stale comparison', async () => {
 create('source');
 await post(save, { unit_id: 'source', translation_text: 'before' });
 await post(save, { unit_id: 'source', translation_text: 'after' });
 db.prepare("UPDATE translation_units SET original_text='different' WHERE unit_id='source'").run();
 assert.equal((await item('source')).previous_text, null);
});

test('short and long comparisons preserve exact text including Unicode and line breaks', () => {
 for (const [before, after] of [
  ['안녕, 좋은 하루', '안녕하세요, 좋은 밤'],
  ['같은 문장', '같은 문장'],
  ['', '추가'],
  ['삭제', ''],
  ['가'.repeat(500) + '\n이전', '가'.repeat(500) + '\n이후'],
  ['𠮷'.repeat(500) + '끝', '𠮷'.repeat(500) + '새 끝'],
  ['가'.repeat(500), '가'.repeat(500)],
 ]) {
  const diff = translationDiff(before, after);
  assert.equal(diff.oldSegments.map((part) => part.text).join(''), before);
  assert.equal(diff.newSegments.map((part) => part.text).join(''), after);
  for (const segment of [...diff.oldSegments, ...diff.newSegments]) assert.equal(typeof segment.text, 'string');
 }
});
