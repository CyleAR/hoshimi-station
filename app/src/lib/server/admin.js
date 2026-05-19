import { get } from '$lib/server/db.js';

function adminNames() {
	return new Set(
		String(process.env.ADMIN_NICKNAMES ?? '')
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean)
	);
}

export function isAdminNickname(nickname) {
	return adminNames().has(String(nickname ?? '').trim());
}

export function verifyAdmin(nickname, pin) {
	const cleanNickname = String(nickname ?? '').trim().slice(0, 24);
	const cleanPin = String(pin ?? '').trim();
	if (!cleanNickname || !/^\d{6}$/.test(cleanPin)) return false;
	if (!isAdminNickname(cleanNickname)) return false;
	return Boolean(
		get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', {
			$nickname: cleanNickname,
			$pin: cleanPin
		})
	);
}
