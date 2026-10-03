import { timingSafeEqual } from 'node:crypto';
import { json } from '$lib/server/db.js';

export function requireCodexToken(request) {
	const secret = process.env.CODEX_API_TOKEN;
	if (!secret) return json({ error: 'Codex API가 설정되지 않았습니다.' }, { status: 503 });
	const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
	const supplied = Buffer.from(token);
	const expected = Buffer.from(secret);
	if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json({ error: 'unauthorized' }, { status: 401 });
	return null;
}
