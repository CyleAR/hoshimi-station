import { get, getDb } from '$lib/server/db.js';

export function attachSuggestions(units) {
	if (!units.length) return units;
	const suggestions = new Map();
	// Keep each query below SQLite's parameter limit, even for large sections.
	for (let offset = 0; offset < units.length; offset += 400) {
		const ids = units.slice(offset, offset + 400).map((unit) => unit.unit_id);
		for (const suggestion of getDb().prepare(`SELECT * FROM ai_suggestions WHERE unit_id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
			suggestions.set(suggestion.unit_id, suggestion);
		}
	}
	const referenceCache = new Map();
	return units.map((unit) => {
		const suggestion = suggestions.get(unit.unit_id);
		if (!suggestion) return { ...unit, ai_suggestion: null };
		const references = JSON.parse(suggestion.reference_unit_ids).map((id) => {
			if (!referenceCache.has(id)) {
				referenceCache.set(id, get(`SELECT u.unit_id, u.scope_type, u.scope_id, u.source_type,
					u.source_file, u.field_path, u.original_text, u.translation_text, COALESCE(e.label, u.scope_id) label
					FROM translation_units u LEFT JOIN entities e
					ON e.entity_type = u.scope_type AND e.entity_id = u.scope_id WHERE u.unit_id = $id`, { $id: id }));
			}
			return referenceCache.get(id);
		}).filter(Boolean);
		return { ...unit, ai_suggestion: {
			...suggestion, references,
			stale: unit.revision !== suggestion.base_revision || unit.original_text !== suggestion.base_original_text || unit.translation_text !== suggestion.base_translation_text
		} };
	});
}

export function acceptSuggestion(unitId, nickname, expectedCreatedAt) {
	const db = getDb();
	db.exec('BEGIN IMMEDIATE');
	try {
		const suggestion = get('SELECT * FROM ai_suggestions WHERE unit_id = $id', { $id: unitId });
		if (!suggestion || suggestion.accepted_at || suggestion.created_at !== expectedCreatedAt) {
			throw new Error('제안이 변경되었거나 이미 사용되었습니다. 항목을 다시 열어 주세요.');
		}
		const result = db.prepare(`UPDATE translation_units
			SET translation_text = ?, status = 'translated', translator_name = ?, updated_at = datetime('now')
			WHERE unit_id = ? AND revision = ? AND original_text = ? AND translation_text = ?`)
			.run(suggestion.translation_text, nickname, unitId, suggestion.base_revision, suggestion.base_original_text, suggestion.base_translation_text);
		if (!result.changes) throw new Error('제안 이후 원문이나 번역이 변경되었습니다. 최신 내용을 확인해 주세요.');
		db.prepare("UPDATE ai_suggestions SET accepted_at = datetime('now'), accepted_by = ? WHERE unit_id = ?").run(nickname, unitId);
		db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = ?").run(nickname);
		const unit = get('SELECT * FROM translation_units WHERE unit_id = $id', { $id: unitId });
		db.exec('COMMIT');
		return unit;
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}
