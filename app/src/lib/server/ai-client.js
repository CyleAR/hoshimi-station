import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Shared AI plumbing for the web UI route and scripts/draft_new.mjs.
// Relative imports only so plain node can load it.

// undici ships with the app image; on a bare host (scripts/draft_new.mjs) it may be absent, so fall back to
// plain fetch (default ~5 min header timeout).
let aiDispatcher;
let aiFetch = fetch;
try {
	const { Agent, fetch: undiciFetch } = await import('undici');
	// Node's built-in fetch bundles its own undici; a dispatcher from the npm package only works with the matching fetch.
	aiFetch = undiciFetch;
	aiDispatcher = new Agent({
		headersTimeout: 15 * 60 * 1000,
		bodyTimeout: 15 * 60 * 1000,
		connectTimeout: 60 * 1000
	});
} catch {
	aiDispatcher = undefined;
	aiFetch = fetch;
}

export function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	return path.resolve(process.cwd(), '..');
}

export function loadAiGuidelines() {
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

export function placeholders(text) {
	return [...new Set(String(text ?? '').match(/\{[A-Za-z0-9_]+\}/g) ?? [])];
}

export function missingPlaceholders(original, translated) {
	const draft = String(translated ?? '');
	return placeholders(original).filter((placeholder) => !draft.includes(placeholder));
}

export function readTranslationText(item) {
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

export function sanitizeEndingPunctuation(original, translated) {
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

export function responseKeys(item) {
	if (!item || typeof item !== 'object') return 'non-object';
	return Object.keys(item).slice(0, 12).join(', ') || 'no keys';
}

export function isSourceEcho(item) {
	return Boolean(item && typeof item === 'object' && 'original_text' in item && !readTranslationText(item).trim());
}

export function extractOutputText(response) {
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

export function cleanOutputText(text) {
	let clean = String(text ?? '').trim();
	clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
	clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
	return clean;
}

export function parseJsonText(text) {
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
export function aiProvider() {
	if (process.env.HYPER_API_KEY) return 'hyper';
	if (process.env.OPENAI_API_KEY) return 'openai';
	return useGemini() ? 'gemini' : 'hyper';
}

export function aiBaseUrl() {
	const provider = aiProvider();
	const raw =
		provider === 'hyper' ? process.env.HYPER_BASE_URL || 'https://hyper.charm.land/v1'
		: provider === 'openai' ? process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
		: GEMINI_BASE_URL;
	return String(raw).replace(/\/+$/, '');
}

export function aiApiKey() {
	return String(process.env.HYPER_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
}

export function aiModel() {
	const provider = aiProvider();
	const raw =
		provider === 'hyper' ? process.env.HYPER_MODEL || 'deepseek-v4-flash-0731'
		: provider === 'openai' ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
		: process.env.OPENAI_MODEL || GEMINI_DEFAULT_MODEL;
	return String(raw).trim();
}

// Requests per minute allowed upstream; 0 disables the limiter (e.g. LiteLLM limits it).
// Defaults to 10 for Gemini free tier, unlimited otherwise.
export function aiRpm() {
	const raw = process.env.AI_RPM;
	if (raw !== undefined && raw !== '') return Math.max(0, Number(raw) || 0);
	return useGemini() ? 10 : 0;
}

let nextAiSlot = 0;
export async function waitForAiSlot() {
	const rpm = aiRpm();
	if (!rpm) return;
	const interval = Math.ceil(60000 / rpm);
	const now = Date.now();
	const start = Math.max(now, nextAiSlot);
	nextAiSlot = start + interval;
	if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

export function aiReasoningEffort() {
	return String(process.env.HYPER_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT || '').trim();
}

// Extra request headers: AI_EXTRA_HEADERS (JSON object) plus the session header opencode.ai requires.
const aiSessionId = randomUUID();
function aiExtraHeaders(url) {
	const headers = {};
	if (/^https?:\/\/([^/]*\.)?opencode\.ai\//i.test(url)) headers['x-opencode-session'] = aiSessionId;
	try {
		const extra = JSON.parse(process.env.AI_EXTRA_HEADERS || '{}');
		for (const [key, value] of Object.entries(extra)) headers[key] = String(value);
	} catch {
		console.warn('[ai-translate] AI_EXTRA_HEADERS is not valid JSON; ignored');
	}
	return headers;
}

async function callJson(url, body) {
	const apiKey = aiApiKey();
	try {
		const response = await aiFetch(url, {
			method: 'POST',
			headers: {
				...aiExtraHeaders(url),
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(body),
			...(aiDispatcher ? { dispatcher: aiDispatcher } : {})
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
			: `Failed to connect to the AI server: ${err.message || String(err)}${err.cause ? ` (${err.cause.code || err.cause.name}: ${err.cause.message})` : ''}`;
		return {
			response: { ok: false, status: isTimeout ? 504 : 502 },
			raw: message,
			data: { error: { message, code: err.code || err.name } }
		};
	}
}

export async function requestAi(model, prompt, reasoningEffort) {
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

export function buildPrompt(guidelines, payload) {
	return [
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
}
