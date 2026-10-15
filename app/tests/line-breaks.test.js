import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLineBreaks } from '../src/lib/server/ai-client.js';

test('ADV source keeps literal \\n', () => {
	assert.equal(normalizeLineBreaks('あ\\nい', 'a\nb'), 'a\\nb');
	assert.equal(normalizeLineBreaks('あ\\nい', 'a\\nb'), 'a\\nb');
});
test('master source uses real breaks', () => {
	assert.equal(normalizeLineBreaks('あ\r\nい', 'a\\nb'), 'a\r\nb');
	assert.equal(normalizeLineBreaks('あ\nい', 'a\\nb'), 'a\nb');
});
test('no breaks in source: untouched', () => {
	assert.equal(normalizeLineBreaks('あ', 'a b'), 'a b');
});
