import { requireCodexToken } from '$lib/server/codex-auth.js';
import { GET as readGuidelines } from '../../guidelines/+server.js';

export function GET({ request }) {
	const denied = requireCodexToken(request);
	if (denied) return denied;
	const response = readGuidelines();
	response.headers.set('cache-control', 'no-store');
	return response;
}
