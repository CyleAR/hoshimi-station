import { readFileSync } from 'node:fs';

import { verifyUser } from '$lib/server/pin.js';import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Agent } from 'undici';
import { verifyAdmin } from '$lib/server/admin.js';
import { all, get, json, run } from '$lib/server/db.js';

const aiDispatcher = new Agent({
	headersTimeout: 15 * 60 * 1000,
	bodyTimeout: 15 * 60 * 1000,
	connectTimeout: 60 * 1000
});

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
	const keys = ['translation_text', 'translated_text', 'translatedText', 'translation', 'target_text', 'targetText', 'english', 'en', 'result', 'draft', 'text'];
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

function sanitizeEndingPunctuation(original, translated) {
	const orig = String(original ?? '').trim();
	let trans = String(translated ?? '').trim();
	if (!orig || !trans) return trans;

	// If the source has no trailing period (. or 。) but the translation ends with one, remove it (ellipses excluded)
	if (!/[.。]$/.test(orig) && trans.endsWith('.') && !trans.endsWith('..') && !trans.endsWith('….')) {
		trans = trans.slice(0, -1).trim();
	}

	// Period right before a closing quote/bracket (e.g. "Line." -> "Line")
	const quoteMatch = trans.match(/\.([」』"')\]）])$/);
	if (quoteMatch) {
		const closingChar = quoteMatch[1];
		const escapedClosing = closingChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const origClosingRegex = new RegExp(`[^.。]${escapedClosing}$`);
		if (origClosingRegex.test(orig)) {
			trans = trans.slice(0, -(closingChar.length + 1)) + closingChar;
		}
	}

	return trans;
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

function cleanOutputText(text) {
	let clean = String(text ?? '').trim();
	clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
	clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
	return clean;
}

function parseJsonText(text) {
	const clean = cleanOutputText(text);
	if (!clean) throw new Error('AI response is empty.');
	try {
		return JSON.parse(clean);
	} catch {
		const match = clean.match(/\[[\s\S]*\]/);
		if (!match) throw new Error('Could not find a JSON array in the AI response.');
		return JSON.parse(match[0]);
	}
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

// Gemini free tier is used when only GEMINI_API_KEY is set. Any OpenAI-compatible
// endpoint (including a LiteLLM proxy) works through OPENAI_BASE_URL/KEY/MODEL.
function useGemini() {
	return !process.env.HYPER_API_KEY && !process.env.OPENAI_API_KEY && Boolean(process.env.GEMINI_API_KEY);
}

// The provider is the one whose API key is set (Hyper, then OpenAI-compatible, then Gemini),
// and base URL / model come from that provider's variables so a stale HYPER_* default
// can never redirect an OpenAI key to the wrong host.
function aiProvider() {
	if (process.env.HYPER_API_KEY) return 'hyper';
	if (process.env.OPENAI_API_KEY) return 'openai';
	return useGemini() ? 'gemini' : 'hyper';
}

function aiBaseUrl() {
	const provider = aiProvider();
	const raw =
		provider === 'hyper' ? process.env.HYPER_BASE_URL || 'https://hyper.charm.land/v1'
		: provider === 'openai' ? process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
		: GEMINI_BASE_URL;
	return String(raw).replace(/\/+$/, '');
}

function aiApiKey() {
	return String(process.env.HYPER_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
}

function aiModel() {
	const provider = aiProvider();
	const raw =
		provider === 'hyper' ? process.env.HYPER_MODEL || 'deepseek-v4-flash-0731'
		: provider === 'openai' ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
		: process.env.OPENAI_MODEL || GEMINI_DEFAULT_MODEL;
	return String(raw).trim();
}

// Requests per minute allowed upstream; 0 disables the limiter (e.g. LiteLLM limits it).
// Defaults to 10 for Gemini free tier, unlimited otherwise.
function aiRpm() {
	const raw = process.env.AI_RPM;
	if (raw !== undefined && raw !== '') return Math.max(0, Number(raw) || 0);
	return useGemini() ? 10 : 0;
}

let nextAiSlot = 0;
async function waitForAiSlot() {
	const rpm = aiRpm();
	if (!rpm) return;
	const interval = Math.ceil(60000 / rpm);
	const now = Date.now();
	const start = Math.max(now, nextAiSlot);
	nextAiSlot = start + interval;
	if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

function aiReasoningEffort() {
	return String(process.env.HYPER_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT || '').trim();
}

async function callJson(url, body) {
	const apiKey = aiApiKey();
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(body),
			dispatcher: aiDispatcher
		});
		const raw = await response.text();
		let data = {};
		try {
			data = raw ? JSON.parse(raw) : {};
		} catch {
			data = { error: { message: raw.replace(/\s+/g, ' ').slice(0, 240), type: 'non_json_response' } };
		}
		return { response, raw, data };
	} catch (err) {
		const isTimeout = err.code === 'UND_ERR_HEADERS_TIMEOUT' || err.name === 'HeadersTimeoutError';
		const message = isTimeout
			? 'The AI response timed out (15 minute timeout).'
			: `Failed to connect to the AI server: ${err.message || String(err)}`;
		return {
			response: { ok: false, status: isTimeout ? 504 : 502 },
			raw: message,
			data: { error: { message, code: err.code || err.name } }
		};
	}
}

async function requestAi(model, prompt, reasoningEffort) {
	const baseUrl = aiBaseUrl();
	const reasoning = reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {};
	const chatReasoning = reasoningEffort ? { reasoning_effort: reasoningEffort } : {};
	const attempts = [
		{
			name: 'chat.completions',
			url: `${baseUrl}/chat/completions`,
			body: {
				model,
				...chatReasoning,
				messages: [{ role: 'user', content: prompt }]
			}
		},
		{
			name: 'chat.completions.plain',
			url: `${baseUrl}/chat/completions`,
			body: {
				model,
				messages: [{ role: 'user', content: prompt }]
			}
		},
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
		}
	];

	const failures = [];
	for (const attempt of attempts) {
		let retried = false;
		for (;;) {
			await waitForAiSlot();
			const { response, raw, data } = await callJson(attempt.url, attempt.body);
			console.info(`[ai-translate] ${attempt.name} status=${response.status} bytes=${raw.length}`);
			if (response.ok) return { data, attempt: attempt.name };
			failures.push({
				attempt: attempt.name,
				status: response.status,
				error: data?.error ?? data
			});
			// Rate limit / auth / server errors are not payload-format problems:
			// trying the other formats would only burn more quota.
			if (response.status === 429 && !retried) {
				retried = true;
				const retryAfter = Number(response.headers?.get?.('retry-after'));
				const waitMs = Math.min(60000, Math.max(5000, (Number.isFinite(retryAfter) ? retryAfter : 0) * 1000));
				await new Promise((resolve) => setTimeout(resolve, waitMs));
				continue;
			}
			if ([401, 403, 429].includes(response.status) || response.status >= 500) {
				return { failures, stop: true };
			}
			break;
		}
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
		const upstreamUrl = `${aiBaseUrl()}/chat/completions`;
		const aiResult = await requestAi(model, prompt, reasoningEffort);
		if (aiResult.failures) {
			console.info(`[ai-translate] all attempts failed=${JSON.stringify(aiResult.failures).slice(0, 1200)}`);
			aiJobs.set(jobId, {
				createdAt: Date.now(),
				status: 'complete',
				result: {
					error: aiResult.stop
						? `The AI provider refused the request (HTTP ${aiResult.failures.at(-1)?.status}). If this is 429, the rate limit was hit; try again shortly.`
						: 'AI upstream rejected every supported payload format.',
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
			throw new Error('The AI returned the source data instead of a translation. Run it again or reduce the number of requested rows.');
		}

		const byId = new Map(rows.map((row) => [String(row.unit_id), row]));
		const translations = [];
		const warnings = [];
		for (const item of parsed) {
			const unitId = String(item?.unit_id ?? '').trim();
			const row = byId.get(unitId);
			if (!row) continue;
			let translationText = readTranslationText(item).trim();
			if (!translationText) {
				warnings.push({ unit_id: unitId, message: `empty translation_text (keys: ${responseKeys(item)})` });
				continue;
			}
			translationText = sanitizeEndingPunctuation(row.original_text, translationText);
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
	if (!job) return json({ error: 'AI job not found. Please run it again.' }, { status: 404 });
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
		const reasoningEffort = aiReasoningEffort();
		const model = aiModel();
		const baseUrl = aiBaseUrl();
		const apiKey = aiApiKey();
		console.info(
			`[ai-translate] request nickname=${nickname} units=${unitIds.length} mode=${promptOnly ? 'prompt' : 'translate'} base=${baseUrl} model=${model} reasoning=${reasoningEffort || 'default'}`
		);

		const isAdmin = verifyAdmin(nickname, pin);
		if (!isAdmin) {
			const user = verifyUser(nickname, pin);
			if (!user) return json({ error: 'Nickname or password is incorrect.' }, { status: 401 });
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
			'You are preparing first-draft English translations for a Japanese game localization tool.',
			'Write natural, fluent, grammatically complete English that reads like an original game script.',
			'Avoid machine-translation artifacts: avoid literal word-for-word renderings, awkward possessive chains, and stiff phrasing; keep each character\'s voice.',
			'Return ONLY a JSON array. Each item must be {"unit_id":"...","translation_text":"..."} with no markdown.',
			'Translate every row whose needs_translation is true. Do not omit target rows and do not leave translation_text empty.',
			'Rows whose needs_translation is false contain approved English translations for context. Use them as style and terminology references, but do not return them.',
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
			'- translation_text must be a non-empty English first-draft translation string.',
			'- Never return null, empty string, an object, or an untranslated Japanese copy as translation_text.'
		].join('\n');

		if (promptOnly) {
			const targetRows = payload.filter((row) => row.needs_translation);
			const referenceRows = payload.filter((row) => !row.needs_translation);
			const externalPrompt = [
				[
					'Translate the following Japanese game text into natural, fluent English.',
					'Follow the translation guidelines below and keep the English natural and fluent.',
					'If existing translations are provided, use them only as a reference for terminology and tone.'
				].join('\n'),
				`AI translation guidelines:\n${guidelines}`,
				...(referenceRows.length
					? [`Existing translations for reference:\n${referenceRows
						.map(
							(row, index) =>
								`[Ref ${index + 1}] ${row.speaker ? `Speaker: ${row.speaker}\n` : ''}Source: ${row.original_text}\nTranslation: ${row.translation_text}`
						)
						.join('\n\n')}`]
					: []),
				`Text to translate:\n${targetRows
					.map(
						(row, index) =>
							`[${index + 1}]${row.speaker ? ` Speaker: ${row.speaker}` : ''}\n${row.original_text}`
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

		if (!apiKey) return json({ error: 'AI API Key is not set. (Set GEMINI_API_KEY, HYPER_API_KEY or OPENAI_API_KEY)' }, { status: 500 });

		const usage = isAdmin ? null : consumeDailyRequest(nickname);
		if (usage && !usage.allowed) {
			return json(
				{
					error: `You have used all ${DAILY_REQUEST_LIMIT} AI draft requests for today.`,
					usage
				},
				{ status: 429 }
			);
		}

		pruneAiJobs();
		const jobId = randomUUID();
		aiJobs.set(jobId, { createdAt: Date.now(), status: 'processing' });
		void completeAiJob(jobId, {
			model,
			prompt,
			reasoningEffort,
			rows,
			usage
		});
		return json({ ok: true, status: 'processing', job_id: jobId, usage }, { status: 202 });
	} catch (err) {
		console.error('[ai-translate] failed', err);
		return json({ error: err.message || String(err) }, { status: 500 });
	}
}
