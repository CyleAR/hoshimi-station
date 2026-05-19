import { all, json } from '$lib/server/db.js';
import { verifyAdmin } from '$lib/server/admin.js';

function cleanLimit(value) {
	const limit = Number(value ?? 100);
	if (!Number.isFinite(limit)) return 100;
	return Math.max(1, Math.min(Math.trunc(limit), 500));
}

export async function POST({ request }) {
	const body = await request.json();
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const filterTranslator = String(body.translator_name ?? '').trim().slice(0, 24);
	const limit = cleanLimit(body.limit);

	if (!verifyAdmin(nickname, pin)) {
		return json({ error: 'admin only' }, { status: 403 });
	}

	const params = { $limit: limit };
	let translatorWhere = '';
	if (filterTranslator) {
		params.$translator = filterTranslator;
		translatorWhere = 'AND translator_name = $translator';
	}

	const translators = all(`
		SELECT translator_name, COUNT(*) count, MAX(updated_at) last_updated_at
		FROM translation_units
		WHERE translation_text <> '' AND translator_name <> ''
		GROUP BY translator_name
		ORDER BY last_updated_at DESC, translator_name
	`);

	const items = all(
		`
		SELECT unit_id, source_type, category, source_file, record_id, field_path,
		       line_no, speaker, original_text, translation_text, translator_name, updated_at
		FROM translation_units
		WHERE translation_text <> ''
		  AND translator_name <> ''
		  ${translatorWhere}
		ORDER BY datetime(updated_at) DESC, unit_id DESC
		LIMIT $limit
		`,
		params
	);

	return json({ ok: true, items, translators });
}
