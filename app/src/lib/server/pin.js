import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { get, run } from '$lib/server/db.js';

const PREFIX = 'scrypt$';

export function hashPin(pin) {
	const salt = randomBytes(16);
	const hash = scryptSync(String(pin), salt, 32);
	return `${PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
}

function matches(stored, pin) {
	const value = String(stored ?? '');
	const candidate = String(pin ?? '');
	if (!value.startsWith(PREFIX)) {
		// Legacy plaintext row: compare in constant time, upgraded by verifyUser.
		const a = Buffer.from(value);
		const b = Buffer.from(candidate);
		return a.length === b.length && timingSafeEqual(a, b);
	}
	const [, saltHex, hashHex] = value.split('$');
	const expected = Buffer.from(hashHex, 'hex');
	const actual = scryptSync(candidate, Buffer.from(saltHex, 'hex'), expected.length);
	return timingSafeEqual(expected, actual);
}

/** Returns { nickname } for a valid nickname+PIN, otherwise null. Hashes legacy plaintext PINs on success. */
export function verifyUser(nickname, pin) {
	const cleanNickname = String(nickname ?? '').trim().slice(0, 24);
	const cleanPin = String(pin ?? '').trim();
	if (!cleanNickname || !/^\d{6}$/.test(cleanPin)) return null;
	const row = get('SELECT nickname, pin FROM users WHERE nickname = $nickname', { $nickname: cleanNickname });
	if (!row || !matches(row.pin, cleanPin)) return null;
	if (!String(row.pin).startsWith(PREFIX)) {
		run('UPDATE users SET pin = $pin WHERE nickname = $nickname', { $pin: hashPin(cleanPin), $nickname: row.nickname });
	}
	return { nickname: row.nickname };
}
