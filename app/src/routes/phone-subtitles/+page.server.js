import { redirect } from '@sveltejs/kit';

export function load({ url }) {
	const params = new URLSearchParams({ tab: 'telephones' });
	const telephone = url.searchParams.get('telephone');
	if (telephone) {
		params.set('type', 'telephone');
		params.set('id', telephone);
		params.set('part', 'phone_subtitles');
	}
	redirect(307, `/?${params}`);
}
