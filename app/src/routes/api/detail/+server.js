import { all, get, json } from '$lib/server/db.js';

const sectionMeta = {
	excursion_places: ['EX', '외출 장소'],
	excursion_reactions: ['EX', '외출 반응'],
	direct: ['◈', '기본 프로필/정보'],
	members: ['👤', '소속 멤버'],
	cards: ['★', '소속 카드'],
	skills: ['⚡', '스킬'],
	skill_efficacies: ['⚙', '스킬 효과'],
	costumes: ['▣', '의상'],
	hair: ['◇', '헤어'],
	accessories: ['◌', '액세서리'],
	goods: ['▦', '굿즈'],
	home_actions: ['⌂', '홈 액션'],
	evolution: ['✦', '개화 대사'],
	stories: ['📖', '연결 스토리'],
	adv: ['▤', 'ADV 본문'],
	adv_places: ['⌖', 'ADV 장소'],
	common_messages: ['✉', '공통 문자'],
	common_home_talks: ['⌂', '공통 홈 대화'],
	common_telephones: ['☎', '공통 전화'],
	call_patterns: ['☀', '접속 대사'],
	card_messages: ['✉', '카드 문자'],
	card_home_talks: ['⌂', '카드 홈 대화'],
	card_telephones: ['☎', '카드 전화'],
	group_messages: ['☷', '그룹 문자'],
	group_telephones: ['☏', '그룹 통화'],
	linked_messages: ['💬', '연결 문자'],
	linked_telephones: ['☏', '연결 전화'],
	conditions: ['?', '조건 설명'],
	category: ['#', '카테고리']
};

const sectionOverrides = {
	excursion_places: ['EX', '외출 장소'],
	excursion_reactions: ['EX', '외출 반응'],
	direct: ['▣', '기본 정보'],
	members: ['👥', '소속 멤버'],
	cards: ['★', '소속 카드'],
	skills: ['⚡', '스킬'],
	skill_efficacies: ['⚙', '스킬 효과'],
	costumes: ['▣', '의상'],
	hair: ['◇', '헤어'],
	accessories: ['◌', '액세서리'],
	goods: ['▦', '굿즈'],
	home_actions: ['🏠', '홈 액션'],
	evolution: ['✦', '개화 대사'],
	stories: ['📖', '연결 스토리'],
	adv: ['📜', 'ADV 본문'],
	adv_places: ['⌖', 'ADV 장소'],
	adv_card: ['📜', '카드 ADV'],
	adv_bond: ['💬', 'Bond ADV'],
	adv_hbd: ['🎂', '생일 ADV'],
	adv_love: ['♡', '러브 ADV'],
	adv_userhbd: ['🎁', '유저 생일 ADV'],
	adv_group: ['📜', '그룹 ADV'],
	common_messages: ['💬', '공통 문자'],
	common_home_talks: ['🏠', '공통 홈 대사'],
	common_telephones: ['☎', '공통 전화'],
	call_patterns: ['📣', '접속 대사'],
	card_messages: ['💬', '카드 문자'],
	card_home_talks: ['🏠', '카드 홈 대사'],
	card_telephones: ['☎', '카드 전화'],
	group_messages: ['💬', '그룹 문자'],
	group_telephones: ['☎', '그룹 통화'],
	linked_messages: ['💬', '연결 문자'],
	linked_telephones: ['☏', '연결 전화'],
	conditions: ['?', '조건 설명'],
	search: ['🔍', '검색 결과'],
	category: ['#', '카테고리']
};

const MAX_SEARCH_LENGTH = 80;

function normalizeSearch(value) {
	return String(value ?? '')
		.replace(/\\r\\n/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\t/g, '\t')
		.trim()
		.slice(0, MAX_SEARCH_LENGTH);
}

function escapeLike(value) {
	return normalizeSearch(value).replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function like(value) {
	return `%${escapeLike(value)}%`;
}

function searchableUnitWhere(alias = 'translation_units') {
	return `(
		${alias}.unit_id LIKE $q ESCAPE '!'
		OR ${alias}.source_file LIKE $q ESCAPE '!'
		OR ${alias}.record_id LIKE $q ESCAPE '!'
		OR ${alias}.field_path LIKE $q ESCAPE '!'
		OR ${alias}.original_text LIKE $q ESCAPE '!'
		OR ${alias}.translation_text LIKE $q ESCAPE '!'
	)`;
}

function count(where, params) {
	return get(
		`SELECT COUNT(*) total,
		        COALESCE(SUM(CASE WHEN translation_text <> '' THEN 1 ELSE 0 END), 0) done
		 FROM translation_units
		 WHERE ${where}`,
		params
	);
}

function section(key, where, params = {}, extra = {}) {
	const [icon, label] = sectionOverrides[key] ?? sectionMeta[key] ?? sectionMeta.direct;
	const row = count(where, params);
	return { key, icon, label, total: row.total ?? 0, done: row.done ?? 0, ...extra };
}

function directSection(type, id) {
	const categoryByType = {
		character: ['Character'],
		group: ['CharacterGroup'],
		card: ['Card'],
		costume: ['Costume'],
		skill: ['Skill'],
		live_ability: ['LiveAbility'],
		activity_ability: ['ActivityAbility'],
		story: ['Story'],
		story_part: ['StoryPart', 'ExtraStoryPart'],
		story_collection: ['EventStory', 'ExtraStory'],
		message_group: ['MessageGroup'],
		message_thread: [],
		message: ['Message'],
		telephone: ['Telephone'],
		home_talk: ['HomeTalk'],
		call_pattern: ['HomeTalkCallPattern'],
		card_evolution_message: ['CardEvolutionMessage'],
		showcase_toy: ['ShowcaseToy'],
		showcase_toy_category: ['ShowcaseToyCategory'],
		hair: ['Hair'],
		accessory: ['Accessory'],
		home_action: ['HomeAction'],
		love_home_action: ['LoveHomeAction'],
		company_enjoy_home_action: ['CompanyEnjoyHomeAction'],
		condition_description: ['ConditionDescription']
	};
	const categories = categoryByType[type];
	const params = { $type: type, $id: id };
	let where = "source_type = 'masterdb' AND scope_type = $type AND scope_id = $id";
	if (categories?.length) {
		where += ` AND category IN (${placeholders(categories, params, 'cat')})`;
	}
	return section('direct', where, params);
}

function placeholders(values, params, prefix) {
	return values
		.map((value, index) => {
			params[`$${prefix}${index}`] = value;
			return `$${prefix}${index}`;
		})
		.join(',');
}

function linkedUnitSection(key, type, id, toTypes) {
	const params = { $type: type, $id: id };
	const toSql = placeholders(toTypes, params, 'to');
	return section(
		key,
		`EXISTS (
			SELECT 1
			FROM links l
			WHERE l.from_type = $type AND l.from_id = $id AND l.to_type IN (${toSql})
			  AND l.to_type = translation_units.scope_type AND l.to_id = translation_units.scope_id
		)`,
		params
	);
}

function storyUnitSection(type, id) {
	return section(
		'stories',
		`(
			EXISTS (
				SELECT 1
				FROM links l
				WHERE l.from_type = $type AND l.from_id = $id
				  AND l.to_type IN ('story', 'story_collection')
				  AND l.to_type = translation_units.scope_type
				  AND l.to_id = translation_units.scope_id
			)
			OR EXISTS (
				SELECT 1
				FROM links collection
				JOIN links story
				  ON story.from_type = collection.to_type
				 AND story.from_id = collection.to_id
				 AND story.to_type = 'story'
				WHERE collection.from_type = $type
				  AND collection.from_id = $id
				  AND collection.to_type = 'story_collection'
				  AND story.to_type = translation_units.scope_type
				  AND story.to_id = translation_units.scope_id
			)
		)`,
		{ $type: type, $id: id }
	);
}

function incomingLinkedUnitSection(key, type, id, fromTypes) {
	const params = { $type: type, $id: id };
	const fromSql = placeholders(fromTypes, params, 'from');
	return section(
		key,
		`EXISTS (
			SELECT 1
			FROM links l
			WHERE l.to_type = $type AND l.to_id = $id AND l.from_type IN (${fromSql})
			  AND l.from_type = translation_units.scope_type AND l.from_id = translation_units.scope_id
		)`,
		params
	);
}

function cardCostumeHomeActionSection(id) {
	return section(
		'home_actions',
		`EXISTS (
			SELECT 1
			FROM links costume
			JOIN links action
			  ON action.from_type = 'costume'
			 AND action.from_id = costume.to_id
			 AND action.to_type IN ('home_action', 'love_home_action', 'company_enjoy_home_action')
			WHERE costume.from_type = 'card'
			  AND costume.from_id = $id
			  AND costume.to_type = 'costume'
			  AND action.to_type = translation_units.scope_type
			  AND action.to_id = translation_units.scope_id
		)`,
		{ $id: id }
	);
}

function homeActionCardSection(type, id) {
	return section(
		'cards',
		`source_type = 'masterdb' AND category = 'Card' AND scope_type = 'card' AND scope_id IN (
			SELECT card.from_id
			FROM links action
			JOIN links card
			  ON card.to_type = 'costume'
			 AND card.to_id = action.from_id
			 AND card.from_type = 'card'
			WHERE action.from_type = 'costume'
			  AND action.to_type = $type
			  AND action.to_id = $id
		)`,
		{ $type: type, $id: id }
	);
}

function characterCommonSection(key, id, toTypes) {
	const params = { $id: id };
	const toSql = placeholders(toTypes, params, 'to');
	return section(
		key,
		`EXISTS (
			SELECT 1 FROM links l
			WHERE l.from_type = 'character' AND l.from_id = $id AND l.to_type IN (${toSql})
			  AND l.to_type = translation_units.scope_type AND l.to_id = translation_units.scope_id
		)
		AND NOT EXISTS (
			SELECT 1 FROM links c
			WHERE c.from_type = 'card'
			  AND c.to_type = translation_units.scope_type AND c.to_id = translation_units.scope_id
		)`,
		params
	);
}

function characterCardSection(id) {
	return section(
		'cards',
		`source_type = 'masterdb' AND category = 'Card' AND scope_type = 'card' AND scope_id IN (
			SELECT to_id FROM links WHERE from_type = 'character' AND from_id = $id AND to_type = 'card'
		)`,
		{ $id: id }
	);
}

function groupCardSection(id) {
	return section(
		'cards',
		`source_type = 'masterdb' AND category = 'Card' AND scope_type = 'card' AND scope_id IN (
			SELECT card.to_id
			FROM links member
			JOIN links card ON card.from_type = 'character' AND card.from_id = member.to_id AND card.to_type = 'card'
			WHERE member.from_type = 'group' AND member.from_id = $id AND member.to_type = 'character'
		)`,
		{ $id: id }
	);
}

function advSection(type, id, category = '', key = 'adv', fieldWhere = "field_path <> 'place'") {
	const params = { $type: type, $id: id };
	let categoryWhere = '';
	if (category) {
		params.$advCategory = category;
		categoryWhere = 'AND category = $advCategory';
	}
	return section(
		key,
		`source_type = 'adv' AND ${fieldWhere} ${categoryWhere} AND (
			(scope_type = $type AND scope_id = $id)
			OR source_file IN (
				SELECT to_id FROM links
				WHERE from_type = $type AND from_id = $id AND to_type = 'adv_file'
			)
			OR source_file IN (
				SELECT adv.to_id
				FROM links story
				JOIN links adv ON adv.from_type = 'story' AND adv.from_id = story.to_id AND adv.to_type = 'adv_file'
				WHERE story.from_type = $type AND story.from_id = $id AND story.to_type = 'story'
			)
			OR source_file IN (
				SELECT adv.to_id
				FROM links collection
				JOIN links story
				  ON story.from_type = collection.to_type
				 AND story.from_id = collection.to_id
				 AND story.to_type = 'story'
				JOIN links adv ON adv.from_type = 'story' AND adv.from_id = story.to_id AND adv.to_type = 'adv_file'
				WHERE collection.from_type = $type
				  AND collection.from_id = $id
				  AND collection.to_type = 'story_collection'
			)
			OR source_file IN (
				SELECT adv.to_id
				FROM links card
				JOIN links story ON story.from_type = 'card' AND story.from_id = card.to_id AND story.to_type = 'story'
				JOIN links adv ON adv.from_type = 'story' AND adv.from_id = story.to_id AND adv.to_type = 'adv_file'
				WHERE card.from_type = $type AND card.from_id = $id AND card.to_type = 'card'
			)
			OR (
				$type = 'character' AND category = 'adv/love' AND source_file IN (
					SELECT love.source_file
					FROM translation_units love
					WHERE love.category = 'adv/love'
					  AND love.speaker IN (
					  	SELECT names.original_text
					  	FROM translation_units names
					  	WHERE names.source_type = 'masterdb'
					  	  AND names.category = 'Character'
					  	  AND names.scope_type = 'character'
					  	  AND names.scope_id = $id
					  	  AND names.field_path IN ('name', 'firstName')
					)
				)
			)
			OR (
				$type = 'group' AND category = 'adv/group' AND source_file LIKE (
					SELECT 'adv_group_' || subtitle || '_%'
					FROM entities
					WHERE entity_type = 'group' AND entity_id = $id
				)
			)
		)`,
		params
	);
}

function linkSortExpr(alias = 'l') {
	return `COALESCE(
		json_extract(${alias}.meta_json, '$.order'),
		json_extract(${alias}.meta_json, '$.sortOrder'),
		json_extract(${alias}.meta_json, '$.number'),
		json_extract(${alias}.meta_json, '$.episodeNumber'),
		json_extract(${alias}.meta_json, '$.episodeNo'),
		json_extract(${alias}.meta_json, '$.assetId'),
		json_extract(${alias}.meta_json, '$.storyId'),
		${alias}.to_id,
		${alias}.from_id
	)`;
}

function linksFor(type, id) {
	return all(
		`
		SELECT l.relation, l.to_type type, l.to_id id, COALESCE(e.label, l.to_id) label, COALESCE(e.subtitle, '') subtitle,
		       ${linkSortExpr('l')} sort_order,
		       CASE
		       	WHEN l.to_type = 'adv_file' THEN (
		       		SELECT COALESCE(NULLIF(tu.translation_text, ''), tu.original_text)
		       		FROM translation_units tu
		       		WHERE tu.source_type = 'adv'
		       		  AND tu.source_file = l.to_id
		       		  AND tu.field_path = 'title'
		       		ORDER BY tu.line_no, tu.unit_id
		       		LIMIT 1
		       	)
		       	ELSE COALESCE(
		       		(
		       			SELECT tu.translation_text
		       			FROM translation_units tu
		       			WHERE tu.source_type = 'masterdb'
		       			  AND tu.scope_type = l.to_type
		       			  AND tu.scope_id = l.to_id
		       			  AND tu.translation_text <> ''
		       			  AND tu.field_path IN ('name', 'title', 'description', 'text', 'managerCallText', 'characterArrivalText')
		       			ORDER BY CASE
		       				WHEN tu.scope_type = 'story_collection' AND tu.category = 'EventStory' AND tu.field_path = 'description' THEN -1
		       				WHEN tu.field_path = 'name' THEN 0
		       				WHEN tu.field_path = 'title' THEN 1
		       				WHEN tu.field_path = 'description' THEN 2
		       				WHEN tu.field_path = 'text' THEN 3
		       				WHEN tu.field_path = 'managerCallText' THEN 4
		       				WHEN tu.field_path = 'characterArrivalText' THEN 5
		       				ELSE 9
		       			END
		       			LIMIT 1
		       		),
		       		(
		       			SELECT child.translation_text
		       			FROM links child_link
		       			JOIN translation_units child
		       			  ON child.scope_type = child_link.to_type
		       			 AND child.scope_id = child_link.to_id
		       			WHERE l.to_type = 'story_part'
		       			  AND child_link.from_type = l.to_type
		       			  AND child_link.from_id = l.to_id
		       			  AND child_link.to_type = 'story_collection'
		       			  AND child.source_type = 'masterdb'
		       			  AND child.translation_text <> ''
		       			  AND child.field_path IN ('name', 'title', 'description', 'text')
		       			ORDER BY CASE
		       				WHEN child.scope_type = 'story_collection' AND child.category = 'EventStory' AND child.field_path = 'description' THEN -1
		       				WHEN child.field_path = 'name' THEN 0
		       				WHEN child.field_path = 'title' THEN 1
		       				WHEN child.field_path = 'description' THEN 2
		       				WHEN child.field_path = 'text' THEN 3
		       				ELSE 9
		       			END
		       			LIMIT 1
		       		)
		       	)
		       END translated_label
		FROM links l
		LEFT JOIN entities e ON e.entity_type = l.to_type AND e.entity_id = l.to_id
		WHERE l.from_type = $type AND l.from_id = $id
		UNION ALL
		SELECT l.relation, l.from_type type, l.from_id id, COALESCE(e.label, l.from_id) label, COALESCE(e.subtitle, '') subtitle,
		       ${linkSortExpr('l')} sort_order,
		       CASE
		       	WHEN l.from_type = 'adv_file' THEN (
		       		SELECT COALESCE(NULLIF(tu.translation_text, ''), tu.original_text)
		       		FROM translation_units tu
		       		WHERE tu.source_type = 'adv'
		       		  AND tu.source_file = l.from_id
		       		  AND tu.field_path = 'title'
		       		ORDER BY tu.line_no, tu.unit_id
		       		LIMIT 1
		       	)
		       	ELSE COALESCE(
		       		(
		       			SELECT tu.translation_text
		       			FROM translation_units tu
		       			WHERE tu.source_type = 'masterdb'
		       			  AND tu.scope_type = l.from_type
		       			  AND tu.scope_id = l.from_id
		       			  AND tu.translation_text <> ''
		       			  AND tu.field_path IN ('name', 'title', 'description', 'text', 'managerCallText', 'characterArrivalText')
		       			ORDER BY CASE
		       				WHEN tu.scope_type = 'story_collection' AND tu.category = 'EventStory' AND tu.field_path = 'description' THEN -1
		       				WHEN tu.field_path = 'name' THEN 0
		       				WHEN tu.field_path = 'title' THEN 1
		       				WHEN tu.field_path = 'description' THEN 2
		       				WHEN tu.field_path = 'text' THEN 3
		       				WHEN tu.field_path = 'managerCallText' THEN 4
		       				WHEN tu.field_path = 'characterArrivalText' THEN 5
		       				ELSE 9
		       			END
		       			LIMIT 1
		       		),
		       		(
		       			SELECT child.translation_text
		       			FROM links child_link
		       			JOIN translation_units child
		       			  ON child.scope_type = child_link.to_type
		       			 AND child.scope_id = child_link.to_id
		       			WHERE l.from_type = 'story_part'
		       			  AND child_link.from_type = l.from_type
		       			  AND child_link.from_id = l.from_id
		       			  AND child_link.to_type = 'story_collection'
		       			  AND child.source_type = 'masterdb'
		       			  AND child.translation_text <> ''
		       			  AND child.field_path IN ('name', 'title', 'description', 'text')
		       			ORDER BY CASE
		       				WHEN child.scope_type = 'story_collection' AND child.category = 'EventStory' AND child.field_path = 'description' THEN -1
		       				WHEN child.field_path = 'name' THEN 0
		       				WHEN child.field_path = 'title' THEN 1
		       				WHEN child.field_path = 'description' THEN 2
		       				WHEN child.field_path = 'text' THEN 3
		       				ELSE 9
		       			END
		       			LIMIT 1
		       		)
		       	)
		       END translated_label
		FROM links l
		LEFT JOIN entities e ON e.entity_type = l.from_type AND e.entity_id = l.from_id
		WHERE l.to_type = $type AND l.to_id = $id
		ORDER BY relation, sort_order, label
		LIMIT 900
		`,
		{ $type: type, $id: id }
	);
}

function advPlaceSection(type, id) {
	return advSection(type, id, '', 'adv_places', "field_path = 'place'");
}

function nestedStoryPartLinks(type, id) {
	if (type !== 'story_part') return [];
	return all(
		`
		SELECT 'collection_episode' relation, story.to_type type, story.to_id id,
		       COALESCE(e.label, story.to_id) label, COALESCE(e.subtitle, '') subtitle,
		       ${linkSortExpr('story')} sort_order,
		       (
		       	SELECT tu.translation_text
		       	FROM translation_units tu
		       	WHERE tu.source_type = 'masterdb'
		       	  AND tu.scope_type = story.to_type
		       	  AND tu.scope_id = story.to_id
		       	  AND tu.translation_text <> ''
		       	  AND tu.field_path IN ('name', 'title', 'description', 'text')
		       	ORDER BY CASE
		       		WHEN tu.scope_type = 'story_collection' AND tu.category = 'EventStory' AND tu.field_path = 'description' THEN -1
		       		WHEN tu.field_path = 'name' THEN 0
		       		WHEN tu.field_path = 'title' THEN 1
		       		WHEN tu.field_path = 'description' THEN 2
		       		WHEN tu.field_path = 'text' THEN 3
		       		ELSE 9
		       	END
		       	LIMIT 1
		       ) translated_label
		FROM links collection
		JOIN links story
		  ON story.from_type = collection.to_type
		 AND story.from_id = collection.to_id
		 AND story.to_type = 'story'
		LEFT JOIN entities e ON e.entity_type = story.to_type AND e.entity_id = story.to_id
		WHERE collection.from_type = 'story_part'
		  AND collection.from_id = $id
		  AND collection.to_type = 'story_collection'
		UNION ALL
		SELECT 'collection_adv' relation, adv.to_type type, adv.to_id id,
		       COALESCE(e.label, adv.to_id) label, COALESCE(e.subtitle, '') subtitle,
		       ${linkSortExpr('story')} sort_order,
		       (
		       	SELECT COALESCE(NULLIF(tu.translation_text, ''), tu.original_text)
		       	FROM translation_units tu
		       	WHERE tu.source_type = 'adv'
		       	  AND tu.source_file = adv.to_id
		       	  AND tu.field_path = 'title'
		       	ORDER BY tu.line_no, tu.unit_id
		       	LIMIT 1
		       ) translated_label
		FROM links collection
		JOIN links story
		  ON story.from_type = collection.to_type
		 AND story.from_id = collection.to_id
		 AND story.to_type = 'story'
		JOIN links adv ON adv.from_type = 'story' AND adv.from_id = story.to_id AND adv.to_type = 'adv_file'
		LEFT JOIN entities e ON e.entity_type = adv.to_type AND e.entity_id = adv.to_id
		WHERE collection.from_type = 'story_part'
		  AND collection.from_id = $id
		  AND collection.to_type = 'story_collection'
		ORDER BY relation, sort_order, label
		LIMIT 900
		`,
		{ $id: id }
	);
}

function linkRank(link) {
	const relation = String(link.relation ?? '');
	if (relation === 'unlock_condition') return 0;
	if (relation.endsWith('_condition')) return 1;
	if (relation === 'card_home_talk') return 0;
	if (relation === 'card_telephone') return 0;
	if (relation === 'card_message') return 0;
	if (relation === 'condition') return 8;
	if (relation.startsWith('has_')) return 9;
	return 4;
}

function naturalParts(value) {
	return String(value ?? '')
		.split(/(\d+)/)
		.map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}

function naturalCompare(a, b) {
	const left = naturalParts(a);
	const right = naturalParts(b);
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		if (left[index] === undefined) return -1;
		if (right[index] === undefined) return 1;
		if (left[index] === right[index]) continue;
		if (typeof left[index] === 'number' && typeof right[index] === 'number') return left[index] - right[index];
		return String(left[index]).localeCompare(String(right[index]), 'ko');
	}
	return 0;
}

function dedupeLinks(links) {
	const byTarget = new Map();
	for (const link of links) {
		const key = `${link.type}:${link.id}`;
		const previous = byTarget.get(key);
		if (!previous || linkRank(link) < linkRank(previous)) byTarget.set(key, link);
	}
	return [...byTarget.values()].sort((a, b) => {
		const relation = String(a.relation ?? '').localeCompare(String(b.relation ?? ''), 'ko');
		if (relation) return relation;
		const sort = naturalCompare(a.sort_order ?? '', b.sort_order ?? '');
		if (sort) return sort;
		const type = String(a.type ?? '').localeCompare(String(b.type ?? ''), 'ko');
		if (type) return type;
		return String(a.label ?? '').localeCompare(String(b.label ?? ''), 'ko');
	});
}

function cardIdFromHomeTalkId(id) {
	const match = String(id ?? '').match(/^home-talk-(card-.+)-talk-\d+$/);
	return match ? match[1] : '';
}

function inferredHomeTalkCardLink(type, id) {
	if (type !== 'home_talk') return null;
	const cardId = cardIdFromHomeTalkId(id);
	if (!cardId) return null;
	return get(
		`
		SELECT 'has_home_talk' relation, e.entity_type type, e.entity_id id,
		       COALESCE(e.label, e.entity_id) label, COALESCE(e.subtitle, '') subtitle,
		       (
		       	SELECT tu.translation_text
		       	FROM translation_units tu
		       	WHERE tu.source_type = 'masterdb'
		       	  AND tu.scope_type = e.entity_type
		       	  AND tu.scope_id = e.entity_id
		       	  AND tu.translation_text <> ''
		       	  AND tu.field_path IN ('name', 'title')
		       	ORDER BY CASE tu.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 9 END
		       	LIMIT 1
		       ) translated_label
		FROM entities e
		WHERE e.entity_type = 'card' AND e.entity_id = $cardId
		`,
		{ $cardId: cardId }
	);
}

function homeActionCardLinks(type, id) {
	if (!['home_action', 'love_home_action', 'company_enjoy_home_action'].includes(type)) return [];
	return all(
		`
		SELECT 'costume_card' relation, e.entity_type type, e.entity_id id,
		       COALESCE(e.label, e.entity_id) label, COALESCE(e.subtitle, '') subtitle,
		       (
		       	SELECT tu.translation_text
		       	FROM translation_units tu
		       	WHERE tu.source_type = 'masterdb'
		       	  AND tu.scope_type = e.entity_type
		       	  AND tu.scope_id = e.entity_id
		       	  AND tu.translation_text <> ''
		       	  AND tu.field_path IN ('name', 'title')
		       	ORDER BY CASE tu.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 9 END
		       	LIMIT 1
		       ) translated_label
		FROM links action
		JOIN links card
		  ON card.to_type = 'costume'
		 AND card.to_id = action.from_id
		 AND card.from_type = 'card'
		JOIN entities e ON e.entity_type = card.from_type AND e.entity_id = card.from_id
		WHERE action.from_type = 'costume'
		  AND action.to_type = $type
		  AND action.to_id = $id
		ORDER BY label
		LIMIT 300
		`,
		{ $type: type, $id: id }
	);
}

export function GET({ url }) {
	const type = url.searchParams.get('type') || 'character';
	const id = url.searchParams.get('id') || '';
	if (!id) return json({ error: 'id is required' }, { status: 400 });

	if (type === 'search') {
		const searchId = normalizeSearch(id);
		return json({
			entity: { type, id: searchId, label: `검색 결과: ${searchId}`, subtitle: 'ID / 원문 / 번역 / 파일 / 필드' },
			sections: [section('search', searchableUnitWhere('translation_units'), { $q: like(searchId) })],
			links: []
		});
	}

	if (type === 'category') {
		return json({
			entity: { type, id, label: id, subtitle: '' },
			sections: [section('category', 'category = $id', { $id: id }, { category: id })],
			links: []
		});
	}

	if (type === 'adv_file') {
		const entity =
			get(
				`SELECT entity_type type, entity_id id, label, subtitle
				 FROM entities WHERE entity_type = $type AND entity_id = $id`,
				{ $type: type, $id: id }
			) ?? { type, id, label: id, subtitle: 'ADV' };
		return json({
			entity,
			sections: [
				section('adv', "source_type = 'adv' AND source_file = $id AND field_path <> 'place'", { $id: id }),
				section('adv_places', "source_type = 'adv' AND source_file = $id AND field_path = 'place'", { $id: id })
			].filter((item) => item.total > 0),
			links: linksFor(type, id)
		});
	}

	const entity =
		get(
			`SELECT entity_type type, entity_id id, label, subtitle
			 FROM entities WHERE entity_type = $type AND entity_id = $id`,
			{ $type: type, $id: id }
		) ?? { type, id, label: id, subtitle: '' };

	const sections = [directSection(type, id)];

	if (type === 'group') {
		sections.push(
			section(
				'members',
				`source_type = 'masterdb' AND category = 'Character' AND scope_type = 'character' AND scope_id IN (
					SELECT to_id FROM links WHERE from_type = 'group' AND from_id = $id AND to_type = 'character'
				)`,
				{ $id: id }
			)
		);
		sections.push(groupCardSection(id));
		sections.push(linkedUnitSection('accessories', type, id, ['accessory']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
		sections.push(advSection(type, id, 'adv/group', 'adv_group'));
		sections.push(advPlaceSection(type, id));
	}

	if (type === 'character') {
		sections.push(characterCardSection(id));
		sections.push(linkedUnitSection('costumes', type, id, ['costume']));
		sections.push(linkedUnitSection('hair', type, id, ['hair']));
		sections.push(linkedUnitSection('accessories', type, id, ['accessory']));
		sections.push(linkedUnitSection('goods', type, id, ['showcase_toy']));
		sections.push(linkedUnitSection('stories', type, id, ['story']));
		sections.push(linkedUnitSection('home_actions', type, id, ['home_action', 'love_home_action', 'company_enjoy_home_action']));
		sections.push(linkedUnitSection('excursion_places', type, id, ['excursion_place']));
		sections.push(section('excursion_reactions', "source_type = 'masterdb' AND category = 'ExcursionGazeReaction' AND scope_type = 'character' AND scope_id = $id", { $id: id }));
		sections.push(characterCommonSection('common_home_talks', id, ['home_talk']));
		sections.push(characterCommonSection('common_messages', id, ['message', 'message_group']));
		sections.push(characterCommonSection('common_telephones', id, ['telephone']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
		sections.push(linkedUnitSection('call_patterns', type, id, ['call_pattern']));
		sections.push(advSection(type, id, 'adv/card', 'adv_card'));
		sections.push(advSection(type, id, 'adv/bond', 'adv_bond'));
		sections.push(advSection(type, id, 'adv/hbd', 'adv_hbd'));
		sections.push(advSection(type, id, 'adv/love', 'adv_love'));
		sections.push(advSection(type, id, 'adv/userhbd', 'adv_userhbd'));
		sections.push(advPlaceSection(type, id));
	}

	if (type === 'card') {
		sections.push(linkedUnitSection('evolution', type, id, ['card_evolution_message']));
		sections.push(linkedUnitSection('skills', type, id, ['skill', 'skill_efficacy', 'live_ability', 'activity_ability']));
		sections.push(linkedUnitSection('costumes', type, id, ['costume']));
		sections.push(linkedUnitSection('hair', type, id, ['hair']));
		sections.push(linkedUnitSection('goods', type, id, ['showcase_toy']));
		sections.push(linkedUnitSection('stories', type, id, ['story']));
		sections.push(linkedUnitSection('card_messages', type, id, ['message']));
		sections.push(linkedUnitSection('card_home_talks', type, id, ['home_talk']));
		sections.push(linkedUnitSection('card_telephones', type, id, ['telephone']));
		sections.push(linkedUnitSection('call_patterns', type, id, ['call_pattern']));
		sections.push(cardCostumeHomeActionSection(id));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
		sections.push(advSection(type, id, 'adv/card', 'adv_card'));
		sections.push(advPlaceSection(type, id));
	}

	if (['story_part', 'story_collection', 'story', 'love'].includes(type)) {
		sections.push(storyUnitSection(type, id));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
		sections.push(advSection(type, id));
		sections.push(advPlaceSection(type, id));
	}

	if (type === 'costume') {
		sections.push(linkedUnitSection('hair', type, id, ['hair']));
		sections.push(linkedUnitSection('home_actions', type, id, ['home_action', 'love_home_action', 'company_enjoy_home_action']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'hair') {
		sections.push(linkedUnitSection('costumes', type, id, ['costume']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'home_talk') {
		sections.push(linkedUnitSection('call_patterns', type, id, ['call_pattern']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'call_pattern') {
		sections.push(incomingLinkedUnitSection('cards', type, id, ['card']));
		sections.push(incomingLinkedUnitSection('card_home_talks', type, id, ['home_talk']));
	}

	if (['home_action', 'love_home_action', 'company_enjoy_home_action'].includes(type)) {
		sections.push(homeActionCardSection(type, id));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'showcase_toy_category') {
		sections.push(linkedUnitSection('goods', type, id, ['showcase_toy']));
	}

	if (type === 'skill') {
		sections.push(linkedUnitSection('skill_efficacies', type, id, ['skill_efficacy']));
	}

	if (['live_ability', 'activity_ability'].includes(type)) {
		sections.push(linkedUnitSection('skills', type, id, ['skill']));
	}

	if (type === 'message_group') {
		sections.push(linkedUnitSection('message_threads', type, id, ['message_thread']));
		sections.push(linkedUnitSection('group_messages', type, id, ['message']));
		sections.push(linkedUnitSection('group_telephones', type, id, ['telephone']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'message_thread') {
		sections.push(linkedUnitSection('group_messages', type, id, ['message']));
		sections.push(linkedUnitSection('linked_telephones', type, id, ['telephone']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'message') {
		sections.push(linkedUnitSection('message_threads', type, id, ['message_thread']));
		sections.push(linkedUnitSection('linked_telephones', type, id, ['telephone']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	if (type === 'telephone') {
		sections.push(linkedUnitSection('linked_messages', type, id, ['message']));
		sections.push(linkedUnitSection('conditions', type, id, ['condition_description']));
	}

	const links = dedupeLinks([inferredHomeTalkCardLink(type, id), ...linksFor(type, id), ...nestedStoryPartLinks(type, id), ...homeActionCardLinks(type, id)].filter(Boolean));
	return json({ entity, sections: sections.filter((item) => item.total > 0), links });
}
