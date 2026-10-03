import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real stdio MCP handshake, tools, API forwarding, validation and conflict reporting', async (t) => {
  const requests = [];
  const site = createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-secret') { res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return; }
    if (url.pathname === '/api/ai-suggestions') { res.statusCode = 409; res.end(JSON.stringify({ error: '항목이 변경되었습니다.' })); return; }
    res.end(JSON.stringify(url.pathname.endsWith('guidelines') ? { markdown: '지침' } : { units: [{ unit_id: '日本語', revision: 7 }], next_cursor: null }));
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => site.close(resolve)));
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    env: { ...env, HOSHIMI_SITE_URL: `http://127.0.0.1:${site.address().port}`, CODEX_API_TOKEN: 'test-secret' }
  });
  const client = new Client({ name: 'hoshimi-test', version: '1.0.0' });
  await client.connect(transport);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 8);
  assert.ok(!tools.some((tool) => /accept|sql|delete/.test(tool.name)));
  assert.ok(client.getInstructions().includes('Never auto-accept'));
  await client.callTool({ name: 'get_review_progress', arguments: { source_file: 'story.txt' } });
  assert.equal(requests.at(-1).path, '/api/codex/progress');
  await client.callTool({ name: 'mark_translation_reviewed', arguments: { unit_id: 'reviewed', base_revision: 3, base_original_text: '原文', base_translation_text: '번역', notes: '수정 불필요' } });
  assert.equal(requests.at(-1).path, '/api/codex/review');
  assert.equal(requests.at(-1).body.notes, '수정 불필요');
  await client.callTool({ name: 'translation_guidelines', arguments: {} });
  const result = await client.callTool({ name: 'search_translations', arguments: { q: '日本語', match: 'exact', limit: 2 } });
  assert.equal(result.structuredContent.units[0].unit_id, '日本語');
  assert.deepEqual(requests.at(-1).query, { q: '日本語', match: 'exact', limit: '2' });
  const count = requests.length;
  const invalid = await client.callTool({ name: 'get_translation_context', arguments: { unit_id: '日本語', radius: 999 } });
  assert.equal(invalid.isError, true);
  assert.equal(requests.length, count);
  const body = { unit_id: '日本語', translation_text: '한국어', reason: '문맥', base_revision: 7, base_original_text: '日本語', base_translation_text: '', reference_unit_ids: ['ref'] };
  const conflict = await client.callTool({ name: 'submit_ai_suggestion', arguments: body });
  assert.equal(conflict.isError, true);
  assert.equal(conflict.structuredContent.status, 409);
  assert.deepEqual(requests.at(-1).body, body);
  assert.ok(!JSON.stringify(conflict).includes('test-secret'));
});
