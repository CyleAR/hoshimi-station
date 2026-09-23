import { all, get, json } from '$lib/server/db.js';
import { listRecentWork } from '$lib/server/recent-work.js';

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

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', {
		$nickname: nickname,
		$pin: pin
	});
	if (!user) {
		return json({ error: 'nickname or pin is invalid' }, { status: 401 });
	}

	const translators = all(`
		SELECT translator_name, COUNT(*) count, MAX(updated_at) last_updated_at
		FROM translation_units
		WHERE translation_text <> '' AND translator_name <> ''
		GROUP BY translator_name
		ORDER BY last_updated_at DESC, translator_name
	`);

	const { items } = listRecentWork({ limit, translator: filterTranslator });

	return json({ ok: true, items, translators });
}
