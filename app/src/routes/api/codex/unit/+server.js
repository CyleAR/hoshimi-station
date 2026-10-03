import { json } from '$lib/server/db.js';
import { requireCodexToken } from '$lib/server/codex-auth.js';
import { getCodexUnit } from '$lib/server/codex-units.js';

export function GET({ request, url }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	try {
		const unit = getCodexUnit(url.searchParams.get('unit_id'));
		return unit ? json({ unit }, { headers: { 'cache-control': 'no-store' } }) : json({ error: 'unit not found' }, { status: 404 });
	} catch (error) { if (error.status === 400) return json({ error: error.message }, { status: 400 }); throw error; }
}
