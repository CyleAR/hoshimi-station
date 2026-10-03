import { randomUUID } from 'node:crypto';
import { get, getDb, json } from '$lib/server/db.js';
import { requireCodexToken } from '$lib/server/codex-auth.js';
import { recordReview } from '$lib/server/codex-reviews.js';

// The bot submits proposals here; it cannot overwrite current translations.
export async function POST({ request }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	let body;
	try { body = await request.json(); } catch { return json({ error: 'JSON 형식이 필요합니다.' }, { status: 400 }); }
	if (!body || typeof body.unit_id !== 'string' || typeof body.translation_text !== 'string' || !body.translation_text.trim()
		|| typeof body.reason !== 'string' || !body.reason.trim() || !Number.isInteger(body.base_revision)
		|| typeof body.base_original_text !== 'string' || typeof body.base_translation_text !== 'string'
		|| body.translation_text.length > 20000 || body.reason.length > 20000
		|| (body.reference_unit_ids !== undefined && (!Array.isArray(body.reference_unit_ids) || body.reference_unit_ids.length > 20 || body.reference_unit_ids.some((id) => typeof id !== 'string')))) {
		return json({ error: '원문·번역·버전 스냅샷, 제안문, 이유와 유효한 참고 항목 목록이 필요합니다.' }, { status: 400 });
	}
	const db = getDb();
	db.exec('BEGIN IMMEDIATE');
	try {
		const unit = get('SELECT * FROM translation_units WHERE unit_id = $id', { $id: body.unit_id });
		if (!unit) { db.exec('ROLLBACK'); return json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 }); }
		if (unit.revision !== body.base_revision || unit.original_text !== body.base_original_text || unit.translation_text !== body.base_translation_text) {
			db.exec('ROLLBACK');
			return json({ error: '항목이 변경되었습니다. 다시 읽고 제안해 주세요.' }, { status: 409 });
		}
		const missing = [...new Set(unit.original_text.match(/\{[A-Za-z0-9_]+\}/g) ?? [])].filter((tag) => !body.translation_text.includes(tag));
		if (missing.length) { db.exec('ROLLBACK'); return json({ error: `placeholder 누락: ${missing.join(', ')}` }, { status: 400 }); }
		const references = [...new Set(body.reference_unit_ids ?? [])];
		if (references.some((id) => !get('SELECT unit_id FROM translation_units WHERE unit_id = $id', { $id: id }))) {
			db.exec('ROLLBACK');
			return json({ error: '참고 항목을 찾을 수 없습니다.' }, { status: 400 });
		}
		// UUID suffix makes replacements distinguishable even within one millisecond.
		const createdAt = `${new Date().toISOString()}/${randomUUID()}`;
		getDb().prepare(`INSERT INTO ai_suggestions
			(unit_id, translation_text, reason, reference_unit_ids, base_revision, base_original_text, base_translation_text, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(unit_id) DO UPDATE SET translation_text = excluded.translation_text, reason = excluded.reason,
			reference_unit_ids = excluded.reference_unit_ids, base_revision = excluded.base_revision,
			base_original_text = excluded.base_original_text, base_translation_text = excluded.base_translation_text,
			created_at = excluded.created_at, accepted_at = NULL, accepted_by = NULL`)
			.run(unit.unit_id, body.translation_text, body.reason, JSON.stringify(references), unit.revision, unit.original_text, unit.translation_text, createdAt);
		recordReview(body, 'suggested', body.reason);
		db.exec('COMMIT');
		return json({ ok: true, created_at: createdAt });
	} catch (error) { db.exec('ROLLBACK'); throw error; }
}
