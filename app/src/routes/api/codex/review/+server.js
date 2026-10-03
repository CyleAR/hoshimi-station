import { json } from '$lib/server/db.js';
import { requireCodexToken } from '$lib/server/codex-auth.js';
import { completeUnchangedReview } from '$lib/server/codex-reviews.js';

export async function POST({ request }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	let body;
	try { body = await request.json(); } catch { return json({ error: 'JSON 형식이 필요합니다.' }, { status: 400 }); }
	try { return json({ ok: true, review: completeUnchangedReview(body) }, { headers: { 'cache-control': 'no-store' } }); }
	catch (error) { if (error.status) return json({ error: error.message }, { status: error.status }); throw error; }
}
