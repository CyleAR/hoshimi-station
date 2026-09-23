import { timingSafeEqual } from 'node:crypto';
import { json } from '$lib/server/db.js';
import { listRecentWork, readCursor } from '$lib/server/recent-work.js';

function authorized(request, secret) {
	const match = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '');
	if (!match) return false;
	const supplied = Buffer.from(match[1]);
	const expected = Buffer.from(secret);
	return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function GET({ request, url }) {
	const secret = process.env.RECENT_WORK_API_TOKEN;
	if (!secret) return json({ error: 'recent work API is not configured' }, { status: 503 });
	if (!authorized(request, secret)) return json({ error: 'unauthorized' }, { status: 401 });

	const view = url.searchParams.get('view') ?? 'current';
	if (view !== 'current' && view !== 'changes') {
		return json({ error: 'invalid view' }, { status: 400 });
	}
	const rawLimit = url.searchParams.get('limit');
	const limit = rawLimit === null ? 100 : Number(rawLimit);
	if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
		return json({ error: 'limit must be between 1 and 200' }, { status: 400 });
	}
	try {
		const cursor = readCursor(url.searchParams.get('cursor'));
		const translator = (url.searchParams.get('translator') ?? '').trim().slice(0, 24);
		const { items, nextCursor } = listRecentWork({ limit, translator, cursor, view });
		return json({ items, next_cursor: nextCursor }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (error.message === 'invalid cursor') return json({ error: 'invalid cursor' }, { status: 400 });
		throw error;
	}
}
