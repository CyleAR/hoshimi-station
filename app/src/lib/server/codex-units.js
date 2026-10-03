import { all, get } from '$lib/server/db.js';
import { attachSuggestions } from '$lib/server/ai-suggestions.js';
import { currentReviewSql } from '$lib/server/codex-reviews.js';

export function badInput(message) {
	const error = new Error(message);
	error.status = 400;
	throw error;
}

export function integerParam(params, name, fallback, min, max) {
	const raw = params.get(name);
	const value = raw === null ? fallback : Number(raw);
	if (raw === '' || !Number.isInteger(value) || value < min || value > max) badInput(`${name} must be between ${min} and ${max}`);
	return value;
}

function unitLinks(units) {
	return attachSuggestions(units).map((unit) => {
		const params = new URLSearchParams({ type: unit.scope_type, id: unit.scope_id });
		if (unit.source_type === 'adv') {
			params.set('type', 'adv_file');
			params.set('id', unit.source_file);
			params.set('part', unit.field_path === 'place' ? 'adv_places' : 'adv');
		}
		const review = get('SELECT * FROM ai_reviews WHERE unit_id = $id', { $id: unit.unit_id });
		const current = review && review.base_revision === unit.revision && review.base_original_text === unit.original_text && review.base_translation_text === unit.translation_text;
		return { ...unit, ai_review: review ? { ...review, stale: !current } : null,
			review_status: current ? 'reviewed' : review ? 'changed' : 'unreviewed',
			site_path: `/?${params}#${encodeURIComponent(`unit-${unit.unit_id}`)}` };
	});
}

function unitFilter(params) {
	const status = params.get('status') ?? 'all';
	const suggestion = params.get('suggestion') ?? 'all';
	const match = params.get('match') ?? 'contains';
	if (!['all', 'translated', 'untranslated'].includes(status)) badInput('invalid status');
	if (!['all', 'missing', 'fresh', 'stale'].includes(suggestion)) badInput('invalid suggestion');
	if (!['contains', 'exact'].includes(match)) badInput('invalid match');
	const where = [];
	const bindings = {};
	const filters = ['source_type', 'category', 'speaker', 'scope_type', 'scope_id', 'source_file'];
	for (const key of filters) {
		const value = params.get(key);
		if (value !== null) { if (value.length > 2000) badInput(`${key} is too long`); where.push(`u.${key} = $${key}`); bindings[`$${key}`] = value; }
	}
	const q = params.get('q');
	if (q !== null) {
		if (!q.trim() || q.length > 2000) badInput('q must be non-empty and at most 2000 characters');
		if (match === 'exact') {
			where.push('(u.original_text = $q OR u.translation_text = $q)'); bindings.$q = q;
		} else {
			where.push("(u.original_text LIKE $q ESCAPE '!' OR u.translation_text LIKE $q ESCAPE '!')");
			bindings.$q = `%${q.replace(/[!%_]/g, (char) => `!${char}`)}%`;
		}
	}
	if (status === 'translated') where.push("trim(u.translation_text) <> ''");
	if (status === 'untranslated') where.push("trim(u.translation_text) = ''");
	const fresh = '(s.base_revision = u.revision AND s.base_original_text = u.original_text AND s.base_translation_text = u.translation_text)';
	if (suggestion === 'missing') where.push(`(s.unit_id IS NULL OR s.accepted_at IS NOT NULL OR NOT ${fresh})`);
	if (suggestion === 'fresh') where.push(`s.accepted_at IS NULL AND ${fresh}`);
	if (suggestion === 'stale') where.push(`s.accepted_at IS NULL AND NOT ${fresh}`);
	const review = params.get('review') ?? 'all';
	if (!['all', 'pending', 'reviewed', 'changed', 'unreviewed'].includes(review)) badInput('invalid review');
	if (review === 'pending') where.push(`(r.unit_id IS NULL OR NOT ${currentReviewSql})`);
	if (review === 'reviewed') where.push(currentReviewSql);
	if (review === 'changed') where.push(`r.unit_id IS NOT NULL AND NOT ${currentReviewSql}`);
	if (review === 'unreviewed') where.push('r.unit_id IS NULL');
	return { where, bindings };
}

export function listCodexUnits(params) {
	const limit = integerParam(params, 'limit', 50, 1, 200);
	const { where, bindings } = unitFilter(params);
	bindings.$limit = limit + 1;
	const cursor = params.get('cursor');
	if (cursor !== null) {
		try {
			if (cursor.length > 8000) badInput('invalid cursor');
			const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
			if (typeof decoded !== 'string' || !decoded.length || decoded.length > 2000) badInput('invalid cursor');
			where.push('u.unit_id > $cursor'); bindings.$cursor = decoded;
		} catch { badInput('invalid cursor'); }
	}
	const rows = all(`SELECT u.* FROM translation_units u LEFT JOIN ai_suggestions s ON s.unit_id = u.unit_id
		LEFT JOIN ai_reviews r ON r.unit_id = u.unit_id
		${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.unit_id LIMIT $limit`, bindings);
	const hasMore = rows.length > limit;
	const units = unitLinks(rows.slice(0, limit));
	return { units, next_cursor: hasMore ? Buffer.from(JSON.stringify(units.at(-1).unit_id)).toString('base64url') : null };
}

export function getReviewProgress(params) {
	// Progress describes the chosen corpus, independently of pending/reviewed and pagination filters.
	const scope = new URLSearchParams(params);
	scope.delete('review');
	scope.delete('suggestion');
	const { where, bindings } = unitFilter(scope);
	const counts = get(`SELECT COUNT(*) AS total,
		COALESCE(SUM(CASE WHEN ${currentReviewSql} THEN 1 ELSE 0 END), 0) AS reviewed,
		COALESCE(SUM(CASE WHEN ${currentReviewSql} AND r.verdict = 'ok' THEN 1 ELSE 0 END), 0) AS unchanged,
		COALESCE(SUM(CASE WHEN ${currentReviewSql} AND r.verdict = 'suggested' THEN 1 ELSE 0 END), 0) AS suggested,
		COALESCE(SUM(CASE WHEN r.unit_id IS NOT NULL AND NOT ${currentReviewSql} THEN 1 ELSE 0 END), 0) AS changed,
		COALESCE(SUM(CASE WHEN r.unit_id IS NULL THEN 1 ELSE 0 END), 0) AS unreviewed
		FROM translation_units u LEFT JOIN ai_reviews r ON r.unit_id = u.unit_id
		LEFT JOIN ai_suggestions s ON s.unit_id = u.unit_id
		${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, bindings);
	return { ...counts, pending: counts.total - counts.reviewed,
		percent: counts.total ? Math.round(counts.reviewed / counts.total * 10000) / 100 : 100 };
}

export function getCodexUnit(id) {
	if (!id || id.length > 2000) badInput('unit_id is required');
	const unit = get('SELECT * FROM translation_units WHERE unit_id = $id', { $id: id });
	return unit ? unitLinks([unit])[0] : null;
}

export function getCodexContext(unit, radius) {
	// ADV context follows the file's line order. MasterDB context stays in the same entity.
	const where = unit.source_type === 'adv' ? 'source_type = $source AND source_file = $file'
		: 'source_type = $source AND scope_type = $scopeType AND scope_id = $scopeId';
	const bindings = { $source: unit.source_type, $id: unit.unit_id, $radius: radius,
		...(unit.source_type === 'adv' ? { $file: unit.source_file } : { $scopeType: unit.scope_type, $scopeId: unit.scope_id }) };
	return unitLinks(all(`WITH ordered AS (
		SELECT *, ROW_NUMBER() OVER (ORDER BY COALESCE(line_no, 0), record_id, field_path, unit_id) AS context_position
		FROM translation_units WHERE ${where}
	) SELECT context.* FROM ordered context JOIN ordered target ON target.unit_id = $id
		WHERE context.context_position BETWEEN target.context_position - $radius AND target.context_position + $radius
		ORDER BY context.context_position`, bindings));
}
