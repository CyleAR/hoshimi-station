import { get, json, run } from '$lib/server/db.js';

function cleanNickname(value) {
	return String(value ?? '').trim().slice(0, 24);
}

function cleanPin(value) {
	return String(value ?? '').trim();
}

export async function POST({ request }) {
	const body = await request.json();
	const nickname = cleanNickname(body.nickname);
	const pin = cleanPin(body.pin);

	if (!nickname) return json({ error: '닉네임을 입력해 주세요.' }, { status: 400 });
	if (!/^\d{6}$/.test(pin)) return json({ error: '비밀번호는 숫자 6자리로 입력해 주세요.' }, { status: 400 });

	const existing = get('SELECT nickname, pin FROM users WHERE nickname = $nickname', { $nickname: nickname });
	if (existing && existing.pin !== pin) {
		return json({ error: '이미 있는 닉네임입니다. 비밀번호를 확인해 주세요.' }, { status: 401 });
	}

	if (existing) {
		run('UPDATE users SET last_seen_at = datetime(\'now\') WHERE nickname = $nickname', { $nickname: nickname });
	} else {
		run(
			`
			INSERT INTO users(nickname, pin, created_at, last_seen_at)
			VALUES($nickname, $pin, datetime('now'), datetime('now'))
			`,
			{ $nickname: nickname, $pin: pin }
		);
	}

	return json({ ok: true, user: { nickname } });
}
