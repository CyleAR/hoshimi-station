import { get, json } from '$lib/server/db.js';
import { acceptSuggestion } from '$lib/server/ai-suggestions.js';

export async function POST({ request }) {
	let body;
	try { body = await request.json(); } catch { return json({ error: 'JSON 형식이 필요합니다.' }, { status: 400 }); }
	if (!body || typeof body.unit_id !== 'string' || typeof body.created_at !== 'string') return json({ error: '제안 항목과 식별자가 필요합니다.' }, { status: 400 });
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	if (!nickname || !/^\d{6}$/.test(pin) || !get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin })) {
		return json({ error: '닉네임 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });
	}
	try {
		return json({ ok: true, unit: acceptSuggestion(body.unit_id, nickname, body.created_at) });
	} catch (error) {
		if (error.message.startsWith('제안')) return json({ error: error.message }, { status: 409 });
		throw error;
	}
}
