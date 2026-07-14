import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { verifyAdmin } from '$lib/server/admin.js';
import { all, get, json, run } from '$lib/server/db.js';

const MAX_UNITS = 150;
const MAX_REFERENCE_UNITS = 200;
const DAILY_REQUEST_LIMIT = 10;
const JOB_TTL_MS = 30 * 60 * 1000;
const aiJobs = new Map();

function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	return path.resolve(process.cwd(), '..');
}

function loadAiGuidelines() {
	const candidates = process.env.AI_GUIDELINES_PATH
		? [path.resolve(process.env.AI_GUIDELINES_PATH)]
		: [
			path.resolve(projectRoot(), 'docs', 'ai-guidelines.txt'),
			path.resolve(projectRoot(), 'docs', 'ai-guildlines.txt')
		];
	for (const guidelinesPath of candidates) {
		try {
			return readFileSync(guidelinesPath, 'utf8');
		} catch {
			// Try the legacy misspelled filename next.
		}
	}
	return '';
}

function placeholders(text) {
	return [...new Set(String(text ?? '').match(/\{[A-Za-z0-9_]+\}/g) ?? [])];
}

function missingPlaceholders(original, translated) {
	const draft = String(translated ?? '');
	return placeholders(original).filter((placeholder) => !draft.includes(placeholder));
}

function readTranslationText(item) {
	const keys = ['translation_text', 'translated_text', 'translatedText', 'translation', 'target_text', 'targetText', 'korean', 'ko', 'result', 'draft', 'text'];
	for (const key of keys) {
		const value = item?.[key];
		if (typeof value === 'string') return value;
		if (value && typeof value === 'object') {
			for (const nestedKey of keys) {
				if (typeof value[nestedKey] === 'string') return value[nestedKey];
			}
		}
	}
	return '';
}

function responseKeys(item) {
	if (!item || typeof item !== 'object') return 'non-object';
	return Object.keys(item).slice(0, 12).join(', ') || 'no keys';
}

function isSourceEcho(item) {
	return Boolean(item && typeof item === 'object' && 'original_text' in item && !readTranslationText(item).trim());
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

async function requestAi(model, prompt, reasoningEffort) {
	const baseUrl = openaiBaseUrl();
	const reasoning = reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {};
	const chatReasoning = reasoningEffort ? { reasoning_effort: reasoningEffort } : {};
	const attempts = [
		{
			name: 'responses.input_string',
			url: `${baseUrl}/responses`,
			body: { model, input: prompt, ...reasoning }
		},
		{
			name: 'responses.input_text_part',
			url: `${baseUrl}/responses`,
			body: {
				model,
				...reasoning,
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
				...chatReasoning,
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

function consumeDailyRequest(nickname) {
	run("DELETE FROM ai_daily_usage WHERE usage_date < date('now', '+9 hours', '-30 days')");
	const result = run(
		`INSERT INTO ai_daily_usage(nickname, usage_date, request_count, updated_at)
		 VALUES($nickname, date('now', '+9 hours'), 1, datetime('now'))
		 ON CONFLICT(nickname, usage_date) DO UPDATE SET
		   request_count = ai_daily_usage.request_count + 1,
		   updated_at = datetime('now')
		 WHERE ai_daily_usage.request_count < $limit`,
		{ $nickname: nickname, $limit: DAILY_REQUEST_LIMIT }
	);
	const usage = get(
		`SELECT request_count
		 FROM ai_daily_usage
		 WHERE nickname = $nickname AND usage_date = date('now', '+9 hours')`,
		{ $nickname: nickname }
	);
	const count = Number(usage?.request_count ?? 0);
	return {
		allowed: result.changes > 0,
		count,
		limit: DAILY_REQUEST_LIMIT,
		remaining: Math.max(0, DAILY_REQUEST_LIMIT - count)
	};
}

function pruneAiJobs() {
	const cutoff = Date.now() - JOB_TTL_MS;
	for (const [jobId, job] of aiJobs) {
		if (job.createdAt < cutoff) aiJobs.delete(jobId);
	}
}

async function completeAiJob(jobId, { model, prompt, reasoningEffort, rows, usage }) {
	try {
		const upstreamUrl = `${openaiBaseUrl()}/responses`;
		const aiResult = await requestAi(model, prompt, reasoningEffort);
		if (aiResult.failures) {
			console.info(`[ai-translate] all attempts failed=${JSON.stringify(aiResult.failures).slice(0, 1200)}`);
			aiJobs.set(jobId, {
				createdAt: Date.now(),
				status: 'complete',
				result: {
					error: 'AI upstream rejected every supported payload format.',
					upstream_url: upstreamUrl,
					failures: aiResult.failures,
					usage
				}
			});
			return;
		}

		console.info(`[ai-translate] success attempt=${aiResult.attempt}`);
		const parsed = parseJsonText(extractOutputText(aiResult.data));
		if (!Array.isArray(parsed)) throw new Error('AI response is not a JSON array.');
		const sourceEchoes = parsed.filter(isSourceEcho).length;
		if (sourceEchoes >= Math.max(3, Math.ceil(parsed.length * 0.5))) {
			throw new Error('AI가 번역 대신 원문 데이터를 반환했습니다. 다시 실행하거나 요청 개수를 줄여 주세요.');
		}

		const byId = new Map(rows.map((row) => [String(row.unit_id), row]));
		const translations = [];
		const warnings = [];
		for (const item of parsed) {
			const unitId = String(item?.unit_id ?? '').trim();
			const row = byId.get(unitId);
			if (!row) continue;
			const translationText = readTranslationText(item).trim();
			if (!translationText) {
				warnings.push({ unit_id: unitId, message: `empty translation_text (keys: ${responseKeys(item)})` });
				continue;
			}
			const missing = missingPlaceholders(row.original_text, translationText);
			if (missing.length) {
				warnings.push({ unit_id: unitId, message: `missing placeholder: ${missing.join(', ')}` });
				continue;
			}
			translations.push({ unit_id: unitId, translation_text: translationText });
		}

		aiJobs.set(jobId, {
			createdAt: Date.now(),
			status: 'complete',
			result: { ok: true, model, translations, warnings, usage }
		});
	} catch (err) {
		console.error(`[ai-translate] job=${jobId} failed`, err);
		aiJobs.set(jobId, {
			createdAt: Date.now(),
			status: 'complete',
			result: { error: err.message || String(err), usage }
		});
	}
}

export function GET({ url }) {
	pruneAiJobs();
	const jobId = String(url.searchParams.get('job_id') ?? '');
	const job = aiJobs.get(jobId);
	if (!job) return json({ error: 'AI 작업을 찾을 수 없습니다. 다시 실행해 주세요.' }, { status: 404 });
	if (job.status === 'processing') return json({ ok: true, status: 'processing' });
	aiJobs.delete(jobId);
	return json(job.result);
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const nickname = String(body.nickname ?? '').trim().slice(0, 24);
		const pin = String(body.pin ?? '').trim();
		const unitIds = Array.isArray(body.unit_ids) ? body.unit_ids.map((id) => String(id).trim()).filter(Boolean) : [];
		const referenceUnitIds = Array.isArray(body.reference_unit_ids)
			? [...new Set(body.reference_unit_ids.map((id) => String(id).trim()).filter(Boolean))].slice(0, MAX_REFERENCE_UNITS)
			: [];
		const promptOnly = body.prompt_only === true;
		const openaiReasoningEffort = String(process.env.OPENAI_REASONING_EFFORT || '').trim();
		console.info(
			`[ai-translate] request nickname=${nickname} units=${unitIds.length} mode=${promptOnly ? 'prompt' : 'translate'} provider=openai base=${openaiBaseUrl()} model=${process.env.OPENAI_MODEL || 'gpt-5.2'} reasoning=${openaiReasoningEffort || 'default'}`
		);

		const isAdmin = verifyAdmin(nickname, pin);
		if (!isAdmin) {
			const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
			if (!user) return json({ error: '닉네임 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });
		}
		if (!unitIds.length) return json({ error: 'unit_ids is required' }, { status: 400 });
		if (unitIds.length > MAX_UNITS) return json({ error: `You can request up to ${MAX_UNITS} units at a time.` }, { status: 400 });

		const requestedIds = [...new Set(unitIds)];
		const targetIdSet = new Set(requestedIds);
		const contextIds = [...new Set([...requestedIds, ...referenceUnitIds.filter((id) => !targetIdSet.has(id))])];
		const contextRows = unitRows(contextIds);
		const rows = contextRows.filter(
			(row) => targetIdSet.has(String(row.unit_id)) && !String(row.translation_text ?? '').trim()
		);
		if (!rows.length) return json({ error: 'No untranslated translation units found.' }, { status: 404 });
		const actualTargetIds = new Set(rows.map((row) => String(row.unit_id)));

		const guidelines = loadAiGuidelines();
		const payload = contextRows
			.filter((row) => actualTargetIds.has(String(row.unit_id)) || String(row.translation_text ?? '').trim())
			.map((row) => ({
				unit_id: row.unit_id,
				category: row.category,
				field_path: row.field_path,
				speaker: row.speaker || '',
				original_text: row.original_text,
				translation_text: actualTargetIds.has(String(row.unit_id)) ? '' : row.translation_text,
				needs_translation: actualTargetIds.has(String(row.unit_id))
			}));

		const prompt = [
			'You are preparing first-draft Korean translations for a Japanese game localization tool.',
			'Return ONLY a JSON array. Each item must be {"unit_id":"...","translation_text":"..."} with no markdown.',
			'Translate every row whose needs_translation is true. Do not omit target rows and do not leave translation_text empty.',
			'Rows whose needs_translation is false contain approved Korean translations for context. Use them as style and terminology references, but do not return them.',
			'The input objects are context data. Only rows marked needs_translation are output targets.',
			'Never include category, field_path, speaker, original_text, needs_translation, or reference translation_text values in the output.',
			'Preserve placeholders exactly, including {user}. Preserve literal \\n when it appears in source text.',
			'Do not translate IDs, tags, markup, or variables. Use the provided translation guidelines.',
			'',
			`AI translation guidelines:\n${guidelines}`,
			'',
			`Translation units JSON:\n${JSON.stringify(payload, null, 2)}`,
			'',
			'Output contract:',
			'- Return one array element for every unit_id whose needs_translation is true.',
			'- Do not return rows whose needs_translation is false.',
			'- Use exactly these keys: unit_id, translation_text.',
			'- unit_id must be copied exactly from the input.',
			'- translation_text must be a non-empty Korean first-draft translation string.',
			'- Never return null, empty string, an object, or an untranslated Japanese copy as translation_text.'
		].join('\n');

		if (promptOnly) {
			const targetRows = payload.filter((row) => row.needs_translation);
			const referenceRows = payload.filter((row) => !row.needs_translation);
			const externalPrompt = [
				[
					'다음 일본어 게임 문구를 한국어로 번역해 주세요.',
					'아래 번역 지침을 따르고, placeholder, 제어 코드, 태그와 줄바꿈 표기를 원문 그대로 보존해 주세요.',
					'기존 번역이 함께 제공된 경우 용어와 말투를 맞추는 참고 자료로만 사용해 주세요.'
				].join('\n'),
				`AI 번역 지침:\n${guidelines}`,
				...(referenceRows.length
					? [`기존 번역 참고:\n${referenceRows
						.map(
							(row, index) =>
								`[참고 ${index + 1}] ${row.speaker ? `화자: ${row.speaker}\n` : ''}원문: ${row.original_text}\n번역: ${row.translation_text}`
						)
						.join('\n\n')}`]
					: []),
				`번역할 내용:\n${targetRows
					.map(
						(row, index) =>
							`[${index + 1}]${row.speaker ? ` 화자: ${row.speaker}` : ''}\n${row.original_text}`
					)
					.join('\n\n')}`
			].join('\n\n');
			return json({
				ok: true,
				prompt: externalPrompt,
				target_count: actualTargetIds.size,
				reference_count: payload.length - actualTargetIds.size
			});
		}

		if (!process.env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not set.' }, { status: 500 });

		const usage = isAdmin ? null : consumeDailyRequest(nickname);
		if (usage && !usage.allowed) {
			return json(
				{
					error: `오늘 AI 초벌 요청 ${DAILY_REQUEST_LIMIT}회를 모두 사용했습니다.`,
					usage
				},
				{ status: 429 }
			);
		}

		const model = process.env.OPENAI_MODEL || 'gpt-5.2';
		pruneAiJobs();
		const jobId = randomUUID();
		aiJobs.set(jobId, { createdAt: Date.now(), status: 'processing' });
		void completeAiJob(jobId, {
			model,
			prompt,
			reasoningEffort: openaiReasoningEffort,
			rows,
			usage
		});
		return json({ ok: true, status: 'processing', job_id: jobId, usage }, { status: 202 });
	} catch (err) {
		console.error('[ai-translate] failed', err);
		return json({ error: err.message || String(err) }, { status: 500 });
	}
}
