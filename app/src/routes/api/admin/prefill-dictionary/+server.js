import { get, getDatabasePath, json } from '$lib/server/db.js';
import { runDictionaryCommand } from '$lib/server/prefill-dictionary.js';

export async function POST({ request }) {
	const origin = request.headers.get('origin');
	if (origin) {
		try {
			const source = new URL(origin);
			// TLS can terminate at the reverse proxy before reaching the Node server.
			if (!['http:', 'https:'].includes(source.protocol) || source.host !== new URL(request.url).host) {
				return json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
			}
		} catch { return json({ error: '허용되지 않은 요청입니다.' }, { status: 403 }); }
	}
	if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, { status: 415 });
	let body;
	try {
		const text = await request.text();
		if (Buffer.byteLength(text) > 256 * 1024) return json({ error: '요청이 너무 큽니다.' }, { status: 413 });
		body = JSON.parse(text);
	} catch { return json({ error: '잘못된 JSON 요청입니다.' }, { status: 400 }); }
	if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '잘못된 요청입니다.' }, { status: 400 });
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	if (!nickname || !/^\d{6}$/.test(pin) || !get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', {
		$nickname: nickname, $pin: pin
	})) return json({ error: '로그인 정보를 확인해 주세요.' }, { status: 401 });
	if (!['preview', 'apply', 'download'].includes(body.action)) return json({ error: '지원하지 않는 사전 작업입니다.' }, { status: 400 });
	try {
		const result = await runDictionaryCommand({ action: body.action, groups: body.groups, ids: body.ids, dictionary_hash: body.dictionary_hash }, getDatabasePath());
		if (!result.ok) return json({ error: result.error }, { status: [400, 409, 422].includes(result.status) ? result.status : 500 });
		if (body.action === 'download') return new Response(result.content, { headers: {
			'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="prefill_dictionary.json"', 'cache-control': 'no-store'
		} });
		return json(result, { headers: { 'cache-control': 'no-store' } });
	} catch (error) { return json({ error: error.message }, { status: 500 }); }
}
