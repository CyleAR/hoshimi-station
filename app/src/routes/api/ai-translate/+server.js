import { readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyAdmin } from '$lib/server/admin.js';
import { all, json } from '$lib/server/db.js';

const MAX_UNITS = 30;

function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	return path.resolve(process.cwd(), '..');
}

function loadGuidelines() {
	try {
		const guidelinesPath = process.env.GUIDELINES_PATH
			? path.resolve(process.env.GUIDELINES_PATH)
			: path.resolve(projectRoot(), 'docs', 'translation-guidelines.md');
		return readFileSync(guidelinesPath, 'utf8').slice(0, 18000);
	} catch {
		return '';
	}
}

function placeholders(text) {
	return [...new Set(String(text ?? '').match(/\{[A-Za-z0-9_]+\}/g) ?? [])];
}

function missingPlaceholders(original, translated) {
	const draft = String(translated ?? '');
	return placeholders(original).filter((placeholder) => !draft.includes(placeholder));
}

function extractOutputText(response) {
	if (typeof response.output_text === 'string') return response.output_text;
	const parts = [];
	for (const item of response.output ?? []) {
		for (const content of item.content ?? []) {
			if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
			if (content.type === 'text' && typeof content.text === 'string') parts.push(content.text);
		}
	}
	return parts.join('\n');
}

function parseJsonText(text) {
	const clean = String(text ?? '').trim();
	if (!clean) throw new Error('AI 응답이 비어 있습니다.');
	try {
		return JSON.parse(clean);
	} catch {
		const match = clean.match(/\[[\s\S]*\]/);
		if (!match) throw new Error('AI 응답에서 JSON 배열을 찾지 못했습니다.');
		return JSON.parse(match[0]);
	}
}

function openaiBaseUrl() {
	return String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function unitRows(unitIds) {
	const params = {};
	const keys = unitIds.map((id, index) => {
		const key = `$id${index}`;
		params[key] = String(id);
		return key;
	});
	return all(
		`
		SELECT unit_id, source_type, category, source_file, record_id, field_path, speaker, original_text, translation_text
		FROM translation_units
		WHERE unit_id IN (${keys.join(', ')})
		ORDER BY source_type, category, source_file, record_id, line_no, field_path
		`,
		params
	);
}

export async function POST({ request }) {
	const body = await request.json();
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const unitIds = Array.isArray(body.unit_ids) ? body.unit_ids.map((id) => String(id).trim()).filter(Boolean) : [];

	if (!verifyAdmin(nickname, pin)) return json({ error: 'AI 초벌 권한이 없습니다.' }, { status: 403 });
	if (!process.env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY가 설정되어 있지 않습니다.' }, { status: 500 });
	if (!unitIds.length) return json({ error: 'unit_ids is required' }, { status: 400 });
	if (unitIds.length > MAX_UNITS) return json({ error: `한 번에 최대 ${MAX_UNITS}개까지만 요청할 수 있습니다.` }, { status: 400 });

	const rows = unitRows(unitIds);
	if (!rows.length) return json({ error: '번역할 항목을 찾지 못했습니다.' }, { status: 404 });

	const guidelines = loadGuidelines();
	const payload = rows.map((row) => ({
		unit_id: row.unit_id,
		category: row.category,
		field_path: row.field_path,
		speaker: row.speaker || '',
		original_text: row.original_text
	}));

	const model = process.env.OPENAI_MODEL || 'gpt-5.2';
	const response = await fetch(`${openaiBaseUrl()}/responses`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model,
			instructions: [
				'You are preparing first-draft Korean translations for a Japanese game localization tool.',
				'Return ONLY a JSON array. Each item must be {"unit_id":"...","translation_text":"..."} with no markdown.',
				'Preserve placeholders exactly, including {user}. Preserve literal \\n when it appears in source text.',
				'Do not translate IDs, tags, markup, or variables. Use the provided translation guidelines.'
			].join('\n'),
			input: [
				{
					role: 'user',
					content: [
						`번역 가이드:\n${guidelines}`,
						`번역할 항목 JSON:\n${JSON.stringify(payload, null, 2)}`
					].join('\n\n')
				}
			]
		})
	});

	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = data?.error?.message || `OpenAI API HTTP ${response.status}`;
		return json({ error: message }, { status: 502 });
	}

	let parsed;
	try {
		parsed = parseJsonText(extractOutputText(data));
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
	if (!Array.isArray(parsed)) return json({ error: 'AI 응답 형식이 배열이 아닙니다.' }, { status: 502 });

	const byId = new Map(rows.map((row) => [String(row.unit_id), row]));
	const translations = [];
	const warnings = [];
	for (const item of parsed) {
		const unitId = String(item?.unit_id ?? '').trim();
		const row = byId.get(unitId);
		if (!row) continue;
		const translationText = String(item?.translation_text ?? '');
		const missing = missingPlaceholders(row.original_text, translationText);
		if (missing.length) warnings.push({ unit_id: unitId, message: `placeholder 누락: ${missing.join(', ')}` });
		translations.push({ unit_id: unitId, translation_text: translationText });
	}

	return json({ ok: true, model, translations, warnings });
}
