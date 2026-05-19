import { all, get, json, run } from '$lib/server/db.js';

function cleanText(value) {
	return String(value ?? '');
}

export async function POST({ request }) {
	const body = await request.json();
	const originalText = cleanText(body.original_text);
	const translationText = cleanText(body.translation_text);
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const overwrite = Boolean(body.overwrite);
	const apply = Boolean(body.apply);

	if (!originalText) return json({ error: 'original_text is required' }, { status: 400 });
	if (!translationText.trim()) return json({ error: 'translation_text is required' }, { status: 400 });
	if (!nickname) return json({ error: 'nickname is required' }, { status: 401 });
	if (!/^\d{6}$/.test(pin)) return json({ error: 'pin must be 6 digits' }, { status: 401 });

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
	if (!user) return json({ error: 'nickname or pin is invalid' }, { status: 401 });

	const params = { $originalText: originalText };
	const targetWhere = overwrite
		? 'original_text = $originalText'
		: "original_text = $originalText AND translation_text = ''";

	const summary =
		get(
			`
			SELECT COUNT(*) total,
			       SUM(CASE WHEN translation_text <> '' THEN 1 ELSE 0 END) already_translated,
			       SUM(CASE WHEN ${targetWhere} THEN 1 ELSE 0 END) targets
			FROM translation_units
			WHERE original_text = $originalText
			`,
			params
		) ?? {};

	const samples = all(
		`
		SELECT unit_id, source_type, category, source_file, record_id, field_path, translation_text
		FROM translation_units
		WHERE ${targetWhere}
		ORDER BY source_type, category, source_file, record_id, line_no, field_path
		LIMIT 20
		`,
		params
	);

	if (!apply) {
		return json({
			ok: true,
			total: summary.total ?? 0,
			already_translated: summary.already_translated ?? 0,
			targets: summary.targets ?? 0,
			samples
		});
	}

	const result = run(
		`
		UPDATE translation_units
		SET translation_text = $translationText,
		    status = 'translated',
		    translator_name = $nickname,
		    updated_at = datetime('now')
		WHERE ${targetWhere}
		`,
		{ ...params, $translationText: translationText, $nickname: nickname }
	);
	run("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = $nickname", { $nickname: nickname });

	return json({ ok: true, updated: result.changes ?? 0 });
}
