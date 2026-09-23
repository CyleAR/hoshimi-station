import { all } from '$lib/server/db.js';

function previousTranslator(alias) {
	return `COALESCE(NULLIF(${alias}.previous_translator_name, ''),
		(SELECT prior.translator_name FROM translation_changes AS prior
		 WHERE prior.unit_id = ${alias}.unit_id AND prior.id < ${alias}.id
		   AND prior.translation_text = ${alias}.previous_text
		 ORDER BY prior.id DESC LIMIT 1), '')`;
}

export function readCursor(value) {
	if (!value) return null;
	try {
		const parts = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
		if (Array.isArray(parts) && parts.length === 2 && typeof parts[0] === 'string' &&
			(typeof parts[1] === 'string' || Number.isSafeInteger(parts[1]))) return parts;
	} catch { /* Invalid cursors are reported by the endpoint. */ }
	throw new Error('invalid cursor');
}

export function listRecentWork({ limit, translator = '', cursor = null, view = 'current' }) {
	const params = { $limit: limit + 1 };
	if (translator) params.$translator = translator;
	if (cursor) {
		params.$cursorTime = cursor[0];
		params.$cursorId = cursor[1];
	}
	let rows;
	if (view === 'changes') {
		if (cursor && !Number.isSafeInteger(cursor[1])) throw new Error('invalid cursor');
		rows = all(`
			SELECT change.id, change.unit_id, change.original_text, change.previous_text,
			       ${previousTranslator('change')} AS previous_translator_name,
			       change.translation_text, change.translator_name, change.changed_at,
			       unit.source_type, unit.category, unit.source_file, unit.record_id, unit.field_path,
			       unit.scope_type, unit.scope_id, unit.line_no, unit.speaker
			FROM translation_changes AS change
			LEFT JOIN translation_units AS unit
			  ON unit.unit_id = change.unit_id AND unit.original_text = change.original_text
			WHERE 1 = 1
			  ${translator ? 'AND change.translator_name = $translator' : ''}
			  ${cursor ? `AND (datetime(change.changed_at) < datetime($cursorTime)
			    OR (datetime(change.changed_at) = datetime($cursorTime) AND change.id < $cursorId))` : ''}
			ORDER BY datetime(change.changed_at) DESC, change.id DESC
			LIMIT $limit
		`, params);
	} else {
		if (cursor && typeof cursor[1] !== 'string') throw new Error('invalid cursor');
		rows = all(`
			SELECT unit.unit_id, unit.source_type, unit.category, unit.source_file, unit.record_id,
			       unit.field_path, unit.scope_type, unit.scope_id, unit.line_no, unit.speaker,
			       unit.original_text, unit.translation_text, unit.translator_name, unit.updated_at,
			       change.previous_text,
			       ${previousTranslator('change')} AS previous_translator_name,
			       change.translator_name AS change_translator_name, change.changed_at
			FROM translation_units AS unit
			LEFT JOIN translation_changes AS change ON change.id = (
			  SELECT latest.id FROM translation_changes AS latest
			  WHERE latest.unit_id = unit.unit_id ORDER BY latest.id DESC LIMIT 1
			) AND change.original_text = unit.original_text
			  AND change.translation_text = unit.translation_text
			WHERE unit.translation_text <> '' AND unit.translator_name <> ''
			  ${translator ? 'AND unit.translator_name = $translator' : ''}
			  ${cursor ? `AND (datetime(unit.updated_at) < datetime($cursorTime)
			    OR (datetime(unit.updated_at) = datetime($cursorTime) AND unit.unit_id < $cursorId))` : ''}
			ORDER BY datetime(unit.updated_at) DESC, unit.unit_id DESC
			LIMIT $limit
		`, params);
	}
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor = hasMore && last
		? Buffer.from(JSON.stringify(view === 'changes'
			? [last.changed_at, last.id] : [last.updated_at, last.unit_id])).toString('base64url')
		: null;
	return { items, nextCursor };
}
