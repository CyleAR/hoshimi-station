import { readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyAdmin } from '$lib/server/admin.js';
import { all, get, json } from '$lib/server/db.js';

const MAX_UNITS = 100;

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

function readTranslationText(item) {
	for (const key of ['translation_text', 'translated_text', 'translation', 'text']) {
		if (typeof item?.[key] === 'string') return item[key];
	}
	return '';
}

function extractOutputText(response) {
	if (typeof response.output_text === 'string') return response.output_text;
	if (typeof response.choices?.[0]?.message?.content === 'string') return response.choices[0].message.content;
	const parts = [];
	for (const item of response.output ?? []) {
		for (const content of item.content ?? []) {
			if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
			if (content.type === 'text' && typeof content.text === 'string') parts.push(content.text);
		}
	}
	return parts.join('\n');
}

function extractGeminiText(response) {
	const parts = [];
	for (const candidate of response.candidates ?? []) {
		for (const part of candidate.content?.parts ?? []) {
			if (typeof part.text === 'string') parts.push(part.text);
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

async function callJson(url, body) {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	const raw = await response.text();
	let data = {};
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: { message: raw.replace(/\s+/g, ' ').slice(0, 240), type: 'non_json_response' } };
	}
	return { response, raw, data };
}

async function callGeminiJson(apiKey, model, prompt) {
	const cleanModel = String(model || 'gemini-3.5-flash').trim();
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: { responseMimeType: 'application/json' }
		})
	});
	const raw = await response.text();
	let data = {};
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: { message: raw.replace(/\s+/g, ' ').slice(0, 240), type: 'non_json_response' } };
	}
	return { response, raw, data };
}

async function requestAi(model, prompt) {
	const baseUrl = openaiBaseUrl();
	const attempts = [
		{
			name: 'responses.input_string',
			url: `${baseUrl}/responses`,
			body: { model, input: prompt }
		},
		{
			name: 'responses.input_text_part',
			url: `${baseUrl}/responses`,
			body: {
				model,
				input: [
					{
						role: 'user',
						content: [{ type: 'input_text', text: prompt }]
					}
				]
			}
		},
		{
			name: 'chat.completions',
			url: `${baseUrl}/chat/completions`,
			body: {
				model,
				messages: [{ role: 'user', content: prompt }]
			}
		}
	];

	const failures = [];
	for (const attempt of attempts) {
		const { response, raw, data } = await callJson(attempt.url, attempt.body);
		console.info(`[ai-translate] ${attempt.name} status=${response.status} bytes=${raw.length}`);
		if (response.ok) return { data, attempt: attempt.name };
		failures.push({
			attempt: attempt.name,
			status: response.status,
			error: data?.error ?? data
		});
	}
	return { failures };
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
		const geminiApiKey = String(body.gemini_api_key ?? '').trim();
		const geminiModel = String(body.gemini_model ?? 'gemini-3.5-flash').trim() || 'gemini-3.5-flash';
		const useGemini = Boolean(geminiApiKey);
		console.info(
			`[ai-translate] request nickname=${nickname} units=${unitIds.length} provider=${useGemini ? 'gemini' : 'openai'} base=${useGemini ? 'google-gemini' : openaiBaseUrl()} model=${useGemini ? geminiModel : process.env.OPENAI_MODEL || 'gpt-5.2'}`
		);

		const isAdmin = verifyAdmin(nickname, pin);
		if (!isAdmin) {
			if (!useGemini) return json({ error: 'AI draft permission denied. Gemini API 키를 입력하면 개인 키로 사용할 수 있습니다.' }, { status: 403 });
			const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
			if (!user) return json({ error: '닉네임 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });
		}
		if (!useGemini && !process.env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });
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

		const prompt = [
			'You are preparing first-draft Korean translations for a Japanese game localization tool.',
			'Return ONLY a JSON array. Each item must be {"unit_id":"...","translation_text":"..."} with no markdown.',
			'Preserve placeholders exactly, including {user}. Preserve literal \\n when it appears in source text.',
			'Do not translate IDs, tags, markup, or variables. Use the provided translation guidelines.',
			'',
			`Translation guidelines:\n${guidelines}`,
			'',
			`Translation units JSON:\n${JSON.stringify(payload, null, 2)}`
		].join('\n');

		let model;
		let responseText;
		if (useGemini) {
			model = geminiModel;
			const geminiResult = await callGeminiJson(geminiApiKey, model, prompt);
			console.info(`[ai-translate] gemini status=${geminiResult.response.status} bytes=${geminiResult.raw.length}`);
			if (!geminiResult.response.ok) {
				return json({
					error: geminiResult.data?.error?.message || 'Gemini upstream request failed.',
					provider: 'gemini',
					model
				});
			}
			responseText = extractGeminiText(geminiResult.data);
		} else {
			model = process.env.OPENAI_MODEL || 'gpt-5.2';
			const upstreamUrl = `${openaiBaseUrl()}/responses`;
			const aiResult = await requestAi(model, prompt);
			if (aiResult.failures) {
				console.info(`[ai-translate] all attempts failed=${JSON.stringify(aiResult.failures).slice(0, 1200)}`);
				return json({
					error: 'AI upstream rejected every supported payload format.',
					upstream_url: upstreamUrl,
					failures: aiResult.failures
				});
			}
			console.info(`[ai-translate] success attempt=${aiResult.attempt}`);
			responseText = extractOutputText(aiResult.data);
		}

		const parsed = parseJsonText(responseText);
		if (!Array.isArray(parsed)) return json({ error: 'AI response is not a JSON array.' });

		const byId = new Map(rows.map((row) => [String(row.unit_id), row]));
		const translations = [];
		const warnings = [];
		for (const item of parsed) {
			const unitId = String(item?.unit_id ?? '').trim();
			const row = byId.get(unitId);
			if (!row) continue;
			const translationText = readTranslationText(item).trim();
			if (!translationText) {
				warnings.push({ unit_id: unitId, message: 'empty translation_text' });
				continue;
			}
			const missing = missingPlaceholders(row.original_text, translationText);
			if (missing.length) {
				warnings.push({ unit_id: unitId, message: `missing placeholder: ${missing.join(', ')}` });
				continue;
			}
			translations.push({ unit_id: unitId, translation_text: translationText });
		}

		return json({ ok: true, model, translations, warnings });
	} catch (err) {
		console.error('[ai-translate] failed', err);
		return json({ error: err.message || String(err) }, { status: 500 });
	}
}
