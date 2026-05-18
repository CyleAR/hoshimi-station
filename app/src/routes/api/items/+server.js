import { all, json } from '$lib/server/db.js';

const entitySections = {
	characters: ['character'],
	groups: ['group'],
	cards: ['card'],
	stories: ['story_part', 'story_collection', 'story', 'love'],
	messages: ['message_group', 'message'],
	telephones: ['telephone'],
	home: ['home_talk']
};

const directCategories = {
	character: ['Character'],
	group: ['CharacterGroup'],
	card: ['Card'],
	story_part: ['StoryPart', 'ExtraStoryPart'],
	story_collection: ['EventStory', 'ExtraStory'],
	story: ['Story'],
	love: ['LoveStoryEpisode'],
	message_group: ['MessageGroup'],
	message: ['Message'],
	telephone: ['Telephone'],
	home_talk: ['HomeTalk']
};

const MAX_SEARCH_LENGTH = 80;

function normalizeSearch(value) {
	return String(value ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
}

function escapeLike(value) {
	return normalizeSearch(value).replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function like(value) {
	return `%${escapeLike(value)}%`;
}

function searchableUnitWhere(alias = 'tu') {
	return `(
		${alias}.unit_id LIKE $q ESCAPE '!'
		OR ${alias}.source_file LIKE $q ESCAPE '!'
		OR ${alias}.record_id LIKE $q ESCAPE '!'
		OR ${alias}.field_path LIKE $q ESCAPE '!'
		OR ${alias}.original_text LIKE $q ESCAPE '!'
		OR ${alias}.translation_text LIKE $q ESCAPE '!'
	)`;
}

function entitySearchWhere() {
	const unitMatch = searchableUnitWhere('tu');
	return `(
		e.label LIKE $q ESCAPE '!'
		OR e.subtitle LIKE $q ESCAPE '!'
		OR e.entity_id LIKE $q ESCAPE '!'
		OR EXISTS (
			SELECT 1
			FROM translation_units tu
			WHERE ${unitMatch}
			  AND (
			  	(tu.scope_type = e.entity_type AND tu.scope_id = e.entity_id)
			  	OR EXISTS (
			  		SELECT 1
			  		FROM links l
			  		WHERE l.from_type = e.entity_type AND l.from_id = e.entity_id
			  		  AND (
			  		  	(l.to_type = tu.scope_type AND l.to_id = tu.scope_id)
			  		  	OR (l.to_type = 'adv_file' AND l.to_id = tu.source_file)
			  		  )
			  	)
			  	OR EXISTS (
			  		SELECT 1
			  		FROM links l
			  		WHERE l.to_type = e.entity_type AND l.to_id = e.entity_id
			  		  AND l.from_type = tu.scope_type AND l.from_id = tu.scope_id
			  	)
			  	OR EXISTS (
			  		SELECT 1
			  		FROM links l1
			  		JOIN links l2 ON l2.from_type = l1.to_type AND l2.from_id = l1.to_id
			  		WHERE l1.from_type = e.entity_type AND l1.from_id = e.entity_id
			  		  AND (
			  		  	(l2.to_type = tu.scope_type AND l2.to_id = tu.scope_id)
			  		  	OR (l2.to_type = 'adv_file' AND l2.to_id = tu.source_file)
			  		  )
			  	)
			  )
		)
	)`;
}

function entityItems(entityTypes, q, limit = 900) {
	const params = {};
	const typeSql = entityTypes.map((_, index) => `$type${index}`).join(',');
	for (const [index, value] of entityTypes.entries()) params[`$type${index}`] = value;
	const categoryPairs = [];
	for (const entityType of entityTypes) {
		for (const category of directCategories[entityType] ?? []) {
			const index = categoryPairs.length;
			params[`$pairType${index}`] = entityType;
			params[`$pairCat${index}`] = category;
			categoryPairs.push(`(u.scope_type = $pairType${index} AND u.category = $pairCat${index})`);
		}
	}
	const where = [`e.entity_type IN (${typeSql})`];
	if (q) {
		where.push(entitySearchWhere());
		params.$q = like(q);
	}
	return all(
		`
		SELECT e.entity_type type, e.entity_id id, e.label, e.subtitle,
		       COALESCE(json_extract(e.meta_json, '$.initialRarity'), 0) rarity,
		       (
		       	SELECT tu.translation_text
		       	FROM translation_units tu
		       	WHERE tu.source_type = 'masterdb'
		       	  AND tu.scope_type = e.entity_type
		       	  AND tu.scope_id = e.entity_id
		       	  AND tu.translation_text <> ''
		       	  AND (tu.field_path = 'name' OR tu.field_path = 'title')
		       	ORDER BY CASE tu.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 2 END
		       	LIMIT 1
		       ) translated_label,
		       COUNT(u.unit_id) total,
		       COALESCE(SUM(CASE WHEN u.translation_text <> '' THEN 1 ELSE 0 END), 0) done
		FROM entities e
		LEFT JOIN translation_units u ON u.source_type = 'masterdb'
			AND u.scope_type = e.entity_type
			AND u.scope_id = e.entity_id
			AND (${categoryPairs.length ? categoryPairs.join(' OR ') : '1 = 0'})
		WHERE ${where.join(' AND ')}
		GROUP BY e.entity_type, e.entity_id
		ORDER BY
			CASE e.entity_type
				WHEN 'group' THEN 0
				WHEN 'character' THEN 1
				WHEN 'story_part' THEN 2
				WHEN 'story_collection' THEN 3
				WHEN 'message_group' THEN 4
				WHEN 'message' THEN 5
				WHEN 'telephone' THEN 6
				WHEN 'home_talk' THEN 7
				WHEN 'card' THEN 8
				ELSE 9
			END,
			COALESCE(json_extract(e.meta_json, '$.order'), 999999),
			rarity DESC,
			e.label
		LIMIT $limit
		`,
		{ ...params, $limit: limit }
	);
}

function categoryItems(kind, q) {
	const params = {};
	const where = [];
	if (kind === 'adv') where.push("category LIKE 'adv/%'");
	else if (kind === 'masterdb') where.push("source_type = 'masterdb'");
	else where.push('1 = 1');
	if (q) {
		where.push(`(category LIKE $q ESCAPE '!' OR ${searchableUnitWhere('translation_units')})`);
		params.$q = like(q);
	}
	return all(
		`
		SELECT 'category' type, category id, category label, source_type subtitle, 0 rarity,
		       COUNT(*) total,
		       COALESCE(SUM(CASE WHEN translation_text <> '' THEN 1 ELSE 0 END), 0) done
		FROM translation_units
		WHERE ${where.join(' AND ')}
		GROUP BY category, source_type
		ORDER BY source_type, category
		LIMIT 400
		`,
		params
	);
}

function searchItem(q) {
	const params = { $q: like(q) };
	const row = all(
		`
		SELECT COUNT(*) total,
		       COALESCE(SUM(CASE WHEN translation_text <> '' THEN 1 ELSE 0 END), 0) done
		FROM translation_units
		WHERE ${searchableUnitWhere('translation_units')}
		`,
		params
	)[0] ?? { total: 0, done: 0 };
	return {
		type: 'search',
		id: q.trim(),
		label: `검색 결과: ${q.trim()}`,
		subtitle: 'ID / 원문 / 번역 / 파일 / 필드',
		total: row.total ?? 0,
		done: row.done ?? 0
	};
}

export function GET({ url }) {
	const section = url.searchParams.get('section') || 'groups';
	const q = normalizeSearch(url.searchParams.get('q') || '');
	if (q.trim()) {
		const groups = entityItems(['group'], '', 50);
		return json({ items: [searchItem(q)], groups });
	}
	if (section === 'stories') {
		const storyEntities = entityItems(entitySections.stories, q);
		const advCategories = categoryItems('adv', q).map((item) => ({
			...item,
			label: `ADV ${item.id.replace('adv/', '')}`,
			subtitle: 'ADV 본문 카테고리'
		}));
		const groups = entityItems(['group'], '', 50);
		return json({ items: [...storyEntities, ...advCategories], groups });
	}
	const entityTypes = entitySections[section];
	const items = entityTypes ? entityItems(entityTypes, q) : categoryItems(section, q);
	const groups = entityItems(['group'], '', 50);
	return json({ items, groups });
}
