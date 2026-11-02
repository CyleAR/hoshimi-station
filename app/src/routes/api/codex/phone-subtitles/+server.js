import { json } from '$lib/server/db.js';
import { requireCodexToken } from '$lib/server/codex-auth.js';
import { getPhoneSubtitleWork, listPhoneSubtitleWork, submitPhoneSubtitleDraft } from '$lib/server/phone-subtitle-drafts.js';

const headers = { 'cache-control': 'no-store' };
function failure(error) {
	if (error.status) return json({ error: error.message }, { status: error.status, headers });
	console.error('[codex-phone-subtitles]', error);
	return json({ error: '전화 자막 초안을 처리하지 못했습니다. 서버 로그를 확인해 주세요.' }, { status: 500, headers });
}

export function GET({ request, url }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	try {
		const id = url.searchParams.get('telephone_id');
		return json(id !== null ? getPhoneSubtitleWork(id) : listPhoneSubtitleWork(url.searchParams), { headers });
	} catch (error) { return failure(error); }
}

export async function POST({ request }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, { status: 415, headers });
	let body;
	try {
		const raw = await request.text();
		if (Buffer.byteLength(raw) > 2 * 1024 * 1024) return json({ error: '요청이 너무 큽니다.' }, { status: 413, headers });
		body = JSON.parse(raw);
	} catch { return json({ error: '잘못된 JSON 요청입니다.' }, { status: 400, headers }); }
	try { return json(submitPhoneSubtitleDraft(body), { headers }); }
	catch (error) { return failure(error); }
}
