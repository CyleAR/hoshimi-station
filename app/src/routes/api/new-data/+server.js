import { all, get, json } from '$lib/server/db.js';

export async function POST({ request }) {
	const body = await request.json();
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const requestedLimit = Number(body.limit ?? 300);
	const limit = Number.isFinite(requestedLimit)
		? Math.max(1, Math.min(Math.trunc(requestedLimit), 500))
		: 300;

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', {
		$nickname: nickname,
		$pin: pin
	});
	if (!user) return json({ error: 'nickname or pin is invalid' }, { status: 401 });

	const count = get(`
		SELECT COUNT(*) count
		FROM new_import_units fresh
		JOIN translation_units unit
		  ON unit.unit_id = fresh.unit_id
		 AND unit.original_text = fresh.original_text
		WHERE unit.translation_text = ''
	`)?.count ?? 0;

	const items = all(
		`
		SELECT unit.unit_id, unit.source_type, unit.category, unit.source_file,
		       unit.record_id, unit.field_path, unit.scope_type, unit.scope_id,
		       unit.line_no, unit.speaker, unit.original_text, fresh.imported_at
		FROM new_import_units fresh
		JOIN translation_units unit
		  ON unit.unit_id = fresh.unit_id
		 AND unit.original_text = fresh.original_text
		WHERE unit.translation_text = ''
		ORDER BY datetime(fresh.imported_at) DESC, unit.category, unit.source_file,
		         unit.record_id, unit.line_no, unit.field_path
		LIMIT $limit
		`,
		{ $limit: limit }
	);

	return json({ ok: true, count, items });
}
