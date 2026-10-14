import { get, json } from '$lib/server/db.js';

import { verifyUser } from '$lib/server/pin.js';import { isAdminNickname } from '$lib/server/admin.js';
import { acceptSuggestion } from '$lib/server/ai-suggestions.js';

export async function POST({ request }) {
	let body;
	try { body = await request.json(); } catch { return json({ error: 'JSON body required.' }, { status: 400 }); }
	if (!body || typeof body.unit_id !== 'string' || typeof body.created_at !== 'string') return json({ error: 'Suggestion unit and identifier required.' }, { status: 400 });
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	if (!nickname || !/^\d{6}$/.test(pin) || !verifyUser(nickname, pin)) {
		return json({ error: 'Nickname or PIN is incorrect.' }, { status: 401 });
	}
	if (!isAdminNickname(nickname)) return json({ error: 'AI suggestions are only available to the admin account.' }, { status: 403 });
	try {
		return json({ ok: true, unit: acceptSuggestion(body.unit_id, nickname, body.created_at) });
	} catch (error) {
		if (error.message.startsWith('The suggestion')) return json({ error: error.message }, { status: 409 });
		throw error;
	}
}
