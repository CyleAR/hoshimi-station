import { json } from '$lib/server/db.js';
import { requireCodexToken } from '$lib/server/codex-auth.js';
import { listCodexUnits } from '$lib/server/codex-units.js';

export function GET({ request, url }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	try { return json(listCodexUnits(url.searchParams), { headers: { 'cache-control': 'no-store' } }); }
	catch (error) { if (error.status === 400) return json({ error: error.message }, { status: 400 }); throw error; }
}
