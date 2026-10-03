import { get, getDb } from '$lib/server/db.js';

export const currentReviewSql = '(r.base_revision = u.revision AND r.base_original_text = u.original_text AND r.base_translation_text = u.translation_text)';

// Called inside the caller's write transaction, so a result never marks a newer human edit reviewed.
export function recordReview(snapshot, verdict, notes) {
	getDb().prepare(`INSERT INTO ai_reviews
		(unit_id, base_revision, base_original_text, base_translation_text, verdict, notes, reviewed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(unit_id) DO UPDATE SET base_revision = excluded.base_revision,
		base_original_text = excluded.base_original_text, base_translation_text = excluded.base_translation_text,
		verdict = excluded.verdict, notes = excluded.notes, reviewed_at = excluded.reviewed_at`)
		.run(snapshot.unit_id, snapshot.base_revision, snapshot.base_original_text, snapshot.base_translation_text, verdict, notes, new Date().toISOString());
}

export function completeUnchangedReview(body) {
	if (!body || typeof body.unit_id !== 'string' || !body.unit_id || body.unit_id.length > 2000
		|| !Number.isInteger(body.base_revision) || body.base_revision < 0
		|| typeof body.base_original_text !== 'string' || typeof body.base_translation_text !== 'string'
		|| typeof body.notes !== 'string' || !body.notes.trim() || body.notes.length > 20000) {
		throw Object.assign(new Error('항목·버전·원문·현재 번역 스냅샷과 검토 이유가 필요합니다.'), { status: 400 });
	}
	const db = getDb();
	db.exec('BEGIN IMMEDIATE');
	try {
		const unit = get('SELECT * FROM translation_units WHERE unit_id = $id', { $id: body.unit_id });
		if (!unit) throw Object.assign(new Error('unit not found'), { status: 404 });
		if (unit.revision !== body.base_revision || unit.original_text !== body.base_original_text || unit.translation_text !== body.base_translation_text) {
			throw Object.assign(new Error('항목이 변경되었습니다. 최신 내용을 다시 검토해 주세요.'), { status: 409 });
		}
		if (!unit.translation_text.trim()) throw Object.assign(new Error('미번역 항목은 수정 불필요로 완료할 수 없습니다. 번역안을 제출해 주세요.'), { status: 400 });
		const pending = get(`SELECT unit_id FROM ai_suggestions WHERE unit_id = $id AND accepted_at IS NULL
			AND base_revision = $revision AND base_original_text = $original AND base_translation_text = $translation`,
			{ $id: unit.unit_id, $revision: unit.revision, $original: unit.original_text, $translation: unit.translation_text });
		if (pending) throw Object.assign(new Error('이 버전에 대기 중인 제안이 있습니다. 해당 제안을 먼저 확인해 주세요.'), { status: 409 });
		recordReview(body, 'ok', body.notes);
		const review = get('SELECT * FROM ai_reviews WHERE unit_id = $id', { $id: body.unit_id });
		db.exec('COMMIT');
		return review;
	} catch (error) { db.exec('ROLLBACK'); throw error; }
}
