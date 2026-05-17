import { json, run } from '$lib/server/db.js';

export async function POST({ request }) {
	const body = await request.json();
	const unitId = body.unit_id;
	const translationText = body.translation_text ?? '';
	if (!unitId) return json({ error: 'unit_id is required' }, { status: 400 });

	const status = translationText.trim() ? 'translated' : 'new';
	const result = run(
		`
		UPDATE translation_units
		SET translation_text = $translationText,
		    status = $status,
		    updated_at = datetime('now')
		WHERE unit_id = $unitId
		`,
		{ $translationText: translationText, $status: status, $unitId: unitId }
	);

	if (result.changes === 0) return json({ error: 'unit not found' }, { status: 404 });
	return json({ ok: true, status });
}
