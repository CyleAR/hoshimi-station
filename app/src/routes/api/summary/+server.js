import { all, get, json } from '$lib/server/db.js';

export function GET() {
	const summary = get(`
		SELECT COUNT(*) units,
		       SUM(CASE WHEN translation_text <> '' THEN 1 ELSE 0 END) done
		FROM translation_units
	`);
	const entities = all(`
		SELECT entity_type, COUNT(*) count
		FROM entities
		GROUP BY entity_type
		ORDER BY entity_type
	`);
	return json({ ...summary, entities });
}
