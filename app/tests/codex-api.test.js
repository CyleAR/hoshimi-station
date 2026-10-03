import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync } from 'node:fs';

const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dbUrl = dataUrl(read('../src/lib/server/db.js').replace("import { dev } from '$app/environment';", 'const dev = false;')
  .replace('new DatabaseSync(dbPath)', "new DatabaseSync(':memory:')")
  .replace('migrate(db);', `db.exec("CREATE TABLE translation_units(unit_id TEXT PRIMARY KEY, original_text TEXT NOT NULL, translation_text TEXT DEFAULT '', translator_name TEXT DEFAULT '', status TEXT DEFAULT 'new', updated_at TEXT DEFAULT '', source_type TEXT DEFAULT 'adv', source_file TEXT DEFAULT 'story.txt', scope_type TEXT DEFAULT 'story', scope_id TEXT DEFAULT 'story-1', category TEXT DEFAULT 'adv', speaker TEXT DEFAULT 'speaker', line_no INTEGER, record_id TEXT DEFAULT '', field_path TEXT DEFAULT 'text')"); migrate(db);`));
const { getDb } = await import(dbUrl);
const db = getDb();
db.exec("CREATE TABLE entities(entity_type TEXT, entity_id TEXT, label TEXT); INSERT INTO users VALUES ('private-user', '654321', '', '')");
const replaceDb = (source) => source.replace("'$lib/server/db.js'", JSON.stringify(dbUrl));
const authUrl = dataUrl(replaceDb(read('../src/lib/server/codex-auth.js')));
const suggestionsUrl = dataUrl(replaceDb(read('../src/lib/server/ai-suggestions.js')));
const reviewsUrl = dataUrl(replaceDb(read('../src/lib/server/codex-reviews.js')));
const unitsUrl = dataUrl(replaceDb(read('../src/lib/server/codex-units.js')).replace("'$lib/server/ai-suggestions.js'", JSON.stringify(suggestionsUrl)).replace("'$lib/server/codex-reviews.js'", JSON.stringify(reviewsUrl)));
const guidelinesUrl = dataUrl(replaceDb(read('../src/routes/api/guidelines/+server.js')));
async function endpoint(name, method = 'GET') {
  return (await import(dataUrl(replaceDb(read(`../src/routes/api/codex/${name}/+server.js`))
    .replace("'$lib/server/codex-auth.js'", JSON.stringify(authUrl)).replace("'$lib/server/codex-units.js'", JSON.stringify(unitsUrl))
    .replace("'../../guidelines/+server.js'", JSON.stringify(guidelinesUrl)).replace("'$lib/server/codex-reviews.js'", JSON.stringify(reviewsUrl)))))[method];
}
const list = await endpoint('units'), single = await endpoint('unit'), context = await endpoint('context');
const guidelines = await endpoint('guidelines');
const progress = await endpoint('progress'), review = await endpoint('review', 'POST');
const priorToken = process.env.CODEX_API_TOKEN;
process.env.CODEX_API_TOKEN = 'api-test-secret';
after(() => { db.close(); if (priorToken === undefined) delete process.env.CODEX_API_TOKEN; else process.env.CODEX_API_TOKEN = priorToken; });
function request(handler, query = {}, token = 'api-test-secret') {
  const url = new URL('http://localhost/api');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return handler({ url, request: new Request(url, { headers: { authorization: `Bearer ${token}` } }) });
}
const insert = db.prepare('INSERT INTO translation_units(unit_id, original_text, translation_text, line_no, source_file) VALUES (?, ?, ?, ?, ?)');
insert.run('c', '三番目', '', 3, 'story.txt');
insert.run('a', '一番目', '첫 대사', 1, 'story.txt');
insert.run('b', '二番目', '', 2, 'story.txt');
insert.run('outside', '別の話', '다른 스토리', 2, 'other.txt');
insert.run('wildcard', '100%_!', '기호', 9, 'symbols.txt');

test('requires configured token before reading any data', async () => {
  assert.equal(request(list, {}, '').status, 401);
  assert.equal(request(guidelines, {}, '').status, 401);
  const response = request(guidelines);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok((await response.json()).markdown.includes('번역'));
  delete process.env.CODEX_API_TOKEN;
  assert.equal(request(single, { unit_id: 'a' }).status, 503);
  process.env.CODEX_API_TOKEN = 'api-test-secret';
});

test('completion survives restarting traversal, reports scope progress, and earlier edits become pending again', async (t) => {
  t.after(() => {
    db.exec("DELETE FROM ai_reviews WHERE unit_id LIKE 'resume-%'; DELETE FROM translation_units WHERE source_file = 'resume.txt'");
  });
  for (const id of ['resume-a', 'resume-b', 'resume-c']) insert.run(id, '原文', '번역', 1, 'resume.txt');
  const scope = { source_file: 'resume.txt', review: 'pending', limit: '1' };
  async function next() { return (await request(list, scope).json()).units[0]; }
  async function complete(unit, extra = {}, token = 'api-test-secret') {
    return review({ request: new Request('http://localhost/api/codex/review', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ unit_id: unit.unit_id, base_revision: unit.revision, base_original_text: unit.original_text,
        base_translation_text: unit.translation_text, notes: '문맥과 용어 확인, 수정 불필요', ...extra }) }) });
  }
  const first = await next();
  assert.equal(first.unit_id, 'resume-a');
  assert.equal((await complete(first, {}, '')).status, 401);
  assert.equal((await complete(first)).status, 200);
  assert.equal((await next()).unit_id, 'resume-b');
  assert.equal((await request(single, { unit_id: first.unit_id }).json()).unit.review_status, 'reviewed');
  const counts = (await request(progress, scope).json()).progress;
  assert.deepEqual(counts, { total: 3, reviewed: 1, unchanged: 1, suggested: 0, changed: 0, unreviewed: 2, pending: 2, percent: 33.33 });
  // Change-and-revert still changes the revision and invalidates the previous review.
  db.prepare("UPDATE translation_units SET translation_text = '사람 수정' WHERE unit_id = 'resume-a'").run();
  db.prepare("UPDATE translation_units SET translation_text = '번역' WHERE unit_id = 'resume-a'").run();
  assert.equal((await next()).unit_id, 'resume-a');
  assert.equal((await complete(first)).status, 409);
  assert.equal((await request(progress, scope).json()).progress.changed, 1);
  assert.equal((await complete(await next())).status, 200);
  assert.equal((await complete(await next())).status, 200);
  assert.equal((await complete(await next())).status, 200);
  assert.equal(await next(), undefined);
  assert.equal((await request(progress, scope).json()).progress.percent, 100);
  insert.run('resume-0-new', '新增', '', 2, 'resume.txt');
  assert.equal((await next()).unit_id, 'resume-0-new');
  assert.equal((await complete(await next())).status, 400);
  assert.equal((await request(progress, scope).json()).progress.pending, 1);
});
test('cursor traverses the corpus and filters literal/exact searches without leaking credentials', async () => {
  let cursor, ids = [];
  do {
    const response = request(list, { limit: '2', ...(cursor ? { cursor } : {}) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json(); ids.push(...data.units.map((unit) => unit.unit_id)); cursor = data.next_cursor;
    assert.ok(!JSON.stringify(data).includes('654321'));
    assert.ok(!JSON.stringify(data).includes('private-user'));
  } while (cursor);
  assert.deepEqual(ids, ['a', 'b', 'c', 'outside', 'wildcard']);
  assert.deepEqual((await request(list, { q: '%_!' }).json()).units.map((unit) => unit.unit_id), ['wildcard']);
  assert.deepEqual((await request(list, { q: '첫 대사', match: 'exact' }).json()).units.map((unit) => unit.unit_id), ['a']);
  assert.deepEqual((await request(list, { status: 'untranslated', source_file: 'story.txt' }).json()).units.map((unit) => unit.unit_id), ['b', 'c']);
});
test('context follows file lines despite insertion order and excludes other stories', async () => {
  const data = await request(context, { unit_id: 'b', radius: '1' }).json();
  assert.deepEqual(data.units.map((unit) => unit.unit_id), ['a', 'b', 'c']);
  assert.equal((await request(single, { unit_id: 'a' }).json()).unit.revision, 0);
  assert.ok((await request(single, { unit_id: 'a' }).json()).unit.site_path.endsWith('#unit-a'));
  assert.equal(request(single, { unit_id: 'missing' }).status, 404);
});
test('fresh/stale proposal filters reflect human edits and reject malformed query input', async () => {
  db.prepare("INSERT INTO ai_suggestions(unit_id, translation_text, reason, base_revision, base_original_text, base_translation_text, created_at) VALUES ('b', '제안', '이유', 0, '二番目', '', 'id')").run();
  assert.deepEqual((await request(list, { suggestion: 'fresh' }).json()).units.map((unit) => unit.unit_id), ['b']);
  assert.ok(!(await request(list, { suggestion: 'missing' }).json()).units.some((unit) => unit.unit_id === 'b'));
  db.prepare("UPDATE translation_units SET translation_text = '사람 번역' WHERE unit_id = 'b'").run();
  assert.deepEqual((await request(list, { suggestion: 'stale' }).json()).units.map((unit) => unit.unit_id), ['b']);
  assert.ok((await request(list, { suggestion: 'missing' }).json()).units.some((unit) => unit.unit_id === 'b'));
  for (const query of [{ limit: '0' }, { limit: 'NaN' }, { cursor: 'garbage' }, { status: 'bad' }, { q: '' }, { match: 'bad' }]) assert.equal(request(list, query).status, 400);
  assert.equal(request(context, { unit_id: 'b', radius: '21' }).status, 400);
});
