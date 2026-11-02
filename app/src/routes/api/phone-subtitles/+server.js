import { json } from '$lib/server/db.js';
import { exportPhoneSubtitles, listPhoneSubtitles, readPhoneSubtitle, readTelephoneSubtitle, savePhoneSubtitle, validClipName } from '$lib/server/phone-subtitles.js';
import { applyPhoneSubtitleDraft, readPhoneSubtitleDraft } from '$lib/server/phone-subtitle-drafts.js';

const noStore = { 'cache-control': 'no-store' };

function failure(error) {
	if (error.status) return json({ error: error.message }, { status: error.status, headers: noStore });
	console.error('[phone-subtitles]', error);
	return json({ error: '전화 자막을 처리하지 못했습니다. 서버 로그를 확인해 주세요.' }, { status: 500, headers: noStore });
}

export function GET({ url }) {
	try {
		if (url.searchParams.has('export')) return new Response(JSON.stringify(exportPhoneSubtitles(), null, 4) + '\n', { headers: { ...noStore, 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="phoneSubtitles.json"' } });
		if (url.searchParams.has('telephone')) {
			const subtitle = readTelephoneSubtitle(url.searchParams.get('telephone'));
			return subtitle ? json({ ...subtitle, draft: readPhoneSubtitleDraft(url.searchParams.get('telephone'), subtitle) }, { headers: noStore }) : json({ error: '전화 항목을 찾을 수 없습니다.' }, { status: 404, headers: noStore });
		}
		const clip = url.searchParams.get('clip');
		if (clip !== null && !validClipName(clip)) return json({ error: '클립 이름이 올바르지 않습니다.' }, { status: 400, headers: noStore });
		return json(clip !== null ? readPhoneSubtitle(clip) : listPhoneSubtitles(), { headers: noStore });
	} catch (error) { return failure(error); }
}

export async function POST({ request }) {
	const origin = request.headers.get('origin');
	if (origin) {
		try {
			const source = new URL(origin);
			if (!['http:', 'https:'].includes(source.protocol) || source.host !== new URL(request.url).host) {
				return json({ error: '허용되지 않은 요청입니다.' }, { status: 403, headers: noStore });
			}
		} catch { return json({ error: '허용되지 않은 요청입니다.' }, { status: 403, headers: noStore }); }
	}
	if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, { status: 415, headers: noStore });
	let body;
	try {
		const text = await request.text();
		if (Buffer.byteLength(text) > 2 * 1024 * 1024) return json({ error: '요청이 너무 큽니다.' }, { status: 413, headers: noStore });
		body = JSON.parse(text);
	} catch { return json({ error: '잘못된 JSON 요청입니다.' }, { status: 400, headers: noStore }); }
	try {
		if (body?.action === 'apply_draft') return json(applyPhoneSubtitleDraft(body), { headers: noStore });
		const result = savePhoneSubtitle(body);
		return json(result, { status: result.status, headers: noStore });
	} catch (error) { return failure(error); }
}
