import { json } from '$lib/server/db.js';
import { requireCodexToken } from '$lib/server/codex-auth.js';
import { getCodexUnit, getCodexContext, integerParam } from '$lib/server/codex-units.js';

export function GET({ request, url }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	try {
		const radius = integerParam(url.searchParams, 'radius', 5, 0, 20);
		const unit = getCodexUnit(url.searchParams.get('unit_id'));
		if (!unit) return json({ error: 'unit not found' }, { status: 404 });
		return json({ target_unit_id: unit.unit_id, units: getCodexContext(unit, radius) }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) { if (error.status === 400) return json({ error: error.message }, { status: 400 }); throw error; }
}
