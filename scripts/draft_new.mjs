#!/usr/bin/env node
// Batch first-draft translations for newly imported units.
// Uses the same AI config/prompt/filters as the web UI (app/src/lib/server/ai-client.js) and
// writes ai_suggestions rows; nothing touches translation_text unless DRAFT_AUTO_ACCEPT=1.
//
//   node scripts/draft_new.mjs [--limit N] [--batch N] [--refs N] [--dry-run] [--db PATH]
//   env: DRAFT_AUTO_ACCEPT=1 (accept gate-passing drafts), DRAFT_ACCEPT_AS=<translator name>
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'app/src/lib/server');

// Load KEY=value lines from sync.env (gitignored) without overriding the real environment.
try {
	for (const line of readFileSync(path.join(root, 'sync.env'), 'utf8').split('\n')) {
		const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!m || process.env[m[1]] !== undefined) continue;
		process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
	}
} catch {}

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : fallback;
};
const dryRun = args.includes('--dry-run');
const limit = Number(opt('limit', 0)) || Infinity;
const batchSize = Math.min(Number(opt('batch', 40)) || 40, 150);
const refLimit = Number(opt('refs', 20));
const autoAccept = process.env.DRAFT_AUTO_ACCEPT === '1';
const acceptAs = process.env.DRAFT_ACCEPT_AS || 'ai-draft';
process.env.DB_PATH = path.resolve(opt('db', process.env.DB_PATH || path.join(root, 'data/hoshimi.sqlite3')));
process.env.PROJECT_ROOT ||= root;

// '$lib' only resolves under Vite, so load server modules as data: URLs with the alias rewritten.
const cache = new Map();
function load(name) {
	if (!cache.has(name)) {
		let source = readFileSync(path.join(serverDir, name), 'utf8')
			.replace("import { dev } from '$app/environment';", 'const dev = false;');
		source = source.replace(/'\$lib\/server\/([\w.-]+)'/g, (_, dep) => JSON.stringify(load(dep)));
		cache.set(name, 'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
	}
	return cache.get(name);
}
const client = await import(pathToFileURL(path.join(serverDir, 'ai-client.js')).href);
const { getDb, all } = await import(load('db.js'));
const { validateCandidate } = await import(load('gate.js'));
const { recordReview } = await import(load('codex-reviews.js'));
const { acceptSuggestion } = await import(load('ai-suggestions.js'));

const db = getDb();
const targets = all(`SELECT u.unit_id, u.source_file, u.scope_id, u.category, u.field_path, u.speaker, u.original_text
	FROM new_import_units n JOIN translation_units u ON u.unit_id = n.unit_id AND u.original_text = n.original_text
	LEFT JOIN ai_suggestions s ON s.unit_id = u.unit_id
	WHERE TRIM(u.translation_text) = '' AND s.unit_id IS NULL
	ORDER BY u.source_file, u.unit_id`).slice(0, Number.isFinite(limit) ? limit : undefined);

console.log(`${targets.length} untranslated new units without a suggestion` + (dryRun ? ' (dry run)' : ''));
if (!targets.length) process.exit(0);
if (!dryRun && !client.aiApiKey()) {
	console.error('No AI key: set GEMINI_API_KEY, HYPER_API_KEY or OPENAI_API_KEY.');
	process.exit(2);
}

const guidelines = client.loadAiGuidelines();
const stats = { drafted: 0, rejected: 0, accepted: 0, failedBatches: 0 };

for (let start = 0; start < targets.length; start += batchSize) {
	const batch = targets.slice(start, start + batchSize);
	const ids = new Set(batch.map((r) => r.unit_id));
	// Translated neighbours from the same files give the model terminology and tone.
	const files = [...new Set(batch.map((r) => r.source_file))];
	const fileParams = Object.fromEntries(files.map((f, i) => [`f${i}`, f]));
	const refs = refLimit
		? all(`SELECT unit_id, category, field_path, speaker, original_text, translation_text FROM translation_units
			WHERE source_file IN (${files.map((_, i) => `:f${i}`).join(',')}) AND TRIM(translation_text) <> ''
			ORDER BY unit_id LIMIT ${refLimit}`, fileParams)
		: [];
	const payload = [
		...refs.map((r) => ({ ...r, speaker: r.speaker || '', needs_translation: false })),
		...batch.map((r) => ({ unit_id: r.unit_id, category: r.category, field_path: r.field_path, speaker: r.speaker || '',
			original_text: r.original_text, translation_text: '', needs_translation: true }))
	];
	console.log(`batch ${start / batchSize + 1}: ${batch.length} units, ${refs.length} refs`);
	if (dryRun) continue;

	const result = await client.requestAi(client.aiModel(), client.buildPrompt(guidelines, payload), client.aiReasoningEffort());
	if (!result.data) {
		console.error('  AI request failed:', JSON.stringify(result.failures ?? result).slice(0, 300));
		stats.failedBatches++;
		if (result.stop) break;
		continue;
	}
	let parsed;
	try { parsed = client.parseJsonText(client.extractOutputText(result.data)); } catch { parsed = null; }
	if (!Array.isArray(parsed)) { console.error('  unparseable AI output'); stats.failedBatches++; continue; }
	if (parsed.filter(client.isSourceEcho).length >= Math.max(3, Math.ceil(parsed.length * 0.5))) {
		console.error('  AI echoed the source text; skipping batch');
		stats.failedBatches++;
		continue;
	}

	for (const item of parsed) {
		const unitId = String(item?.unit_id ?? '');
		if (!ids.has(unitId)) continue;
		const unit = batch.find((r) => r.unit_id === unitId);
		const text = client.sanitizeEndingPunctuation(unit.original_text, client.readTranslationText(item) ?? '').trim();
		if (!text || client.missingPlaceholders(unit.original_text, text).length) { stats.rejected++; continue; }
		const gate = validateCandidate(unit, text);
		if (gate && !gate.ok) { stats.rejected++; console.error(`  ${unitId}: gate: ${gate.errors.join('; ')}`); continue; }

		const createdAt = `${new Date().toISOString()}/${randomUUID()}`;
		db.exec('BEGIN IMMEDIATE');
		try {
			const cur = db.prepare('SELECT revision, original_text, translation_text FROM translation_units WHERE unit_id = ?').get(unitId);
			if (!cur || cur.translation_text.trim()) { db.exec('ROLLBACK'); continue; }
			db.prepare(`INSERT INTO ai_suggestions (unit_id, translation_text, reason, reference_unit_ids,
				base_revision, base_original_text, base_translation_text, created_at)
				VALUES (?, ?, 'batch draft', ?, ?, ?, ?, ?)
				ON CONFLICT(unit_id) DO UPDATE SET translation_text = excluded.translation_text, reason = excluded.reason,
				reference_unit_ids = excluded.reference_unit_ids, base_revision = excluded.base_revision,
				base_original_text = excluded.base_original_text, base_translation_text = excluded.base_translation_text,
				created_at = excluded.created_at, accepted_at = NULL, accepted_by = NULL`)
				.run(unitId, text, JSON.stringify(refs.map((r) => r.unit_id)), cur.revision, cur.original_text, cur.translation_text, createdAt);
			recordReview({ unit_id: unitId, base_revision: cur.revision, base_original_text: cur.original_text,
				base_translation_text: cur.translation_text }, 'suggested', 'batch draft');
			db.exec('COMMIT');
		} catch (error) {
			db.exec('ROLLBACK');
			console.error(`  ${unitId}: ${error.message}`);
			continue;
		}
		stats.drafted++;
		if (autoAccept) {
			try { acceptSuggestion(unitId, acceptAs, createdAt); stats.accepted++; }
			catch (error) { console.error(`  ${unitId}: accept: ${error.message}`); }
		}
	}
}
console.log(JSON.stringify(stats));
process.exit(stats.failedBatches && !stats.drafted ? 1 : 0);
