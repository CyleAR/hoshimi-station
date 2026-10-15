import { randomUUID } from 'node:crypto';
import { verifyUser } from '$lib/server/pin.js';
import { verifyAdmin } from '$lib/server/admin.js';
import { all, get, json, run } from '$lib/server/db.js';
import {
	aiApiKey,
	aiBaseUrl,
	aiModel,
	aiReasoningEffort,
	buildPrompt,
	extractOutputText,
	isSourceEcho,
	loadAiGuidelines,
	missingPlaceholders,
	parseJsonText,
	readTranslationText,
	requestAi,
	responseKeys,
	sanitizeEndingPunctuation
} from '$lib/server/ai-client.js';

const MAX_UNITS = 150;
const MAX_REFERENCE_UNITS = 200;
const DAILY_REQUEST_LIMIT = 10;
const JOB_TTL_MS = 30 * 60 * 1000;
const aiJobs = new Map();


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

		const prompt = buildPrompt(guidelines, payload);

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
