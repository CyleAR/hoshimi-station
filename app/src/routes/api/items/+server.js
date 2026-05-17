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

function like(value) {
	return `%${value.trim()}%`;
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
		where.push('(e.label LIKE $q OR e.subtitle LIKE $q OR e.entity_id LIKE $q)');
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
		where.push('(category LIKE $q OR source_file LIKE $q OR record_id LIKE $q OR original_text LIKE $q)');
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

export function GET({ url }) {
	const section = url.searchParams.get('section') || 'groups';
	const q = url.searchParams.get('q') || '';
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
