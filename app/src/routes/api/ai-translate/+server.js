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
	if (!clean) throw new Error('AI response is empty.');
	try {
		return JSON.parse(clean);
	} catch {
		const match = clean.match(/\[[\s\S]*\]/);
		if (!match) throw new Error('Could not find a JSON array in the AI response.');
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
	try {
		const body = await request.json();
		const nickname = String(body.nickname ?? '').trim().slice(0, 24);
		const pin = String(body.pin ?? '').trim();
		const unitIds = Array.isArray(body.unit_ids) ? body.unit_ids.map((id) => String(id).trim()).filter(Boolean) : [];
		console.info(`[ai-translate] request nickname=${nickname} units=${unitIds.length} base=${openaiBaseUrl()} model=${process.env.OPENAI_MODEL || 'gpt-5.2'}`);

		if (!verifyAdmin(nickname, pin)) return json({ error: 'AI draft permission denied.' }, { status: 403 });
		if (!process.env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
		if (!unitIds.length) return json({ error: 'unit_ids is required' }, { status: 400 });
		if (unitIds.length > MAX_UNITS) return json({ error: `You can request up to ${MAX_UNITS} units at a time.` }, { status: 400 });

		const rows = unitRows(unitIds);
		if (!rows.length) return json({ error: 'No translation units found.' }, { status: 404 });

		const guidelines = loadGuidelines();
		const payload = rows.map((row) => ({
			unit_id: row.unit_id,
			category: row.category,
			field_path: row.field_path,
			speaker: row.speaker || '',
			original_text: row.original_text
		}));

		const model = process.env.OPENAI_MODEL || 'gpt-5.2';
		const upstreamUrl = `${openaiBaseUrl()}/responses`;
		const response = await fetch(upstreamUrl, {
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
							`Translation guidelines:\n${guidelines}`,
							`Translation units JSON:\n${JSON.stringify(payload, null, 2)}`
						].join('\n\n')
					}
				]
			})
		});

		const raw = await response.text();
		console.info(`[ai-translate] upstream status=${response.status} bytes=${raw.length}`);
		let data = {};
		try {
			data = raw ? JSON.parse(raw) : {};
		} catch {
			const snippet = raw.replace(/\s+/g, ' ').slice(0, 240);
			return json({ error: `Upstream returned non-JSON from ${upstreamUrl}: ${snippet}` }, { status: 502 });
		}

		if (!response.ok) {
			const message = data?.error?.message || data?.message || `OpenAI API HTTP ${response.status}`;
			return json({ error: message }, { status: 502 });
		}

		const parsed = parseJsonText(extractOutputText(data));
		if (!Array.isArray(parsed)) return json({ error: 'AI response is not a JSON array.' }, { status: 502 });

		const byId = new Map(rows.map((row) => [String(row.unit_id), row]));
		const translations = [];
		const warnings = [];
		for (const item of parsed) {
			const unitId = String(item?.unit_id ?? '').trim();
			const row = byId.get(unitId);
			if (!row) continue;
			const translationText = String(item?.translation_text ?? '');
			const missing = missingPlaceholders(row.original_text, translationText);
			if (missing.length) warnings.push({ unit_id: unitId, message: `missing placeholder: ${missing.join(', ')}` });
			translations.push({ unit_id: unitId, translation_text: translationText });
		}

		return json({ ok: true, model, translations, warnings });
	} catch (err) {
		console.error('[ai-translate] failed', err);
		return json({ error: err.message || String(err) }, { status: 500 });
	}
}
