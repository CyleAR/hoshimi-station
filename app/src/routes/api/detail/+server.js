import { all, get, json } from '$lib/server/db.js';

const sectionMeta = {
	direct: ['◈', '기본 프로필/정보'],
	members: ['👤', '소속 멤버'],
	cards: ['★', '소속 카드'],
	skills: ['⚡', '스킬'],
	costumes: ['▣', '의상'],
	hair: ['◇', '헤어'],
	accessories: ['◌', '액세서리'],
	goods: ['▦', '굿즈'],
	home_actions: ['⌂', '홈 액션'],
	evolution: ['✦', '개화 대사'],
	stories: ['📖', '연결 스토리'],
	adv: ['▤', 'ADV 본문'],
	common_messages: ['✉', '공통 문자'],
	common_home_talks: ['⌂', '공통 홈 대화'],
	common_telephones: ['☎', '공통 전화'],
	call_patterns: ['☀', '접속 대사'],
	card_messages: ['✉', '카드 문자'],
	card_home_talks: ['⌂', '카드 홈 대화'],
	card_telephones: ['☎', '카드 전화'],
	group_messages: ['☷', '그룹 문자'],
	group_telephones: ['☏', '그룹 통화'],
	category: ['#', '카테고리']
};

const sectionOverrides = {
	direct: ['▣', '기본 정보'],
	members: ['👥', '소속 멤버'],
	cards: ['★', '소속 카드'],
	skills: ['⚡', '스킬'],
	costumes: ['▣', '의상'],
	hair: ['◇', '헤어'],
	accessories: ['◌', '액세서리'],
	goods: ['▦', '굿즈'],
	home_actions: ['🏠', '홈 액션'],
	evolution: ['✦', '개화 대사'],
	stories: ['📖', '연결 스토리'],
	adv: ['📜', 'ADV 본문'],
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
	search: ['🔍', '검색 결과'],
	category: ['#', '카테고리']
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
		company_enjoy_home_action: ['CompanyEnjoyHomeAction']
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

function advSection(type, id, category = '', key = 'adv') {
	const params = { $type: type, $id: id };
	let categoryWhere = '';
	if (category) {
		params.$advCategory = category;
		categoryWhere = 'AND category = $advCategory';
	}
	return section(
		key,
		`source_type = 'adv' ${categoryWhere} AND (
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

function linksFor(type, id) {
	return all(
		`
		SELECT l.relation, l.to_type type, l.to_id id, COALESCE(e.label, l.to_id) label, COALESCE(e.subtitle, '') subtitle,
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
		       			  AND (tu.field_path = 'name' OR tu.field_path = 'title')
		       			ORDER BY CASE tu.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 2 END
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
		       			  AND (child.field_path = 'name' OR child.field_path = 'title')
		       			ORDER BY CASE child.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 2 END
		       			LIMIT 1
		       		)
		       	)
		       END translated_label
		FROM links l
		LEFT JOIN entities e ON e.entity_type = l.to_type AND e.entity_id = l.to_id
		WHERE l.from_type = $type AND l.from_id = $id
		UNION ALL
		SELECT l.relation, l.from_type type, l.from_id id, COALESCE(e.label, l.from_id) label, COALESCE(e.subtitle, '') subtitle,
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
		       			  AND (tu.field_path = 'name' OR tu.field_path = 'title')
		       			ORDER BY CASE tu.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 2 END
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
		       			  AND (child.field_path = 'name' OR child.field_path = 'title')
		       			ORDER BY CASE child.field_path WHEN 'name' THEN 0 WHEN 'title' THEN 1 ELSE 2 END
		       			LIMIT 1
		       		)
		       	)
		       END translated_label
		FROM links l
		LEFT JOIN entities e ON e.entity_type = l.from_type AND e.entity_id = l.from_id
		WHERE l.to_type = $type AND l.to_id = $id
		ORDER BY relation, label
		LIMIT 900
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
			sections: [section('adv', "source_type = 'adv' AND source_file = $id", { $id: id })].filter((item) => item.total > 0),
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
		sections.push(advSection(type, id, 'adv/group', 'adv_group'));
	}

	if (type === 'character') {
		sections.push(characterCardSection(id));
		sections.push(linkedUnitSection('costumes', type, id, ['costume']));
		sections.push(linkedUnitSection('hair', type, id, ['hair']));
		sections.push(linkedUnitSection('accessories', type, id, ['accessory']));
		sections.push(linkedUnitSection('home_actions', type, id, ['home_action', 'love_home_action', 'company_enjoy_home_action']));
		sections.push(characterCommonSection('common_home_talks', id, ['home_talk']));
		sections.push(characterCommonSection('common_messages', id, ['message', 'message_group']));
		sections.push(characterCommonSection('common_telephones', id, ['telephone']));
		sections.push(linkedUnitSection('call_patterns', type, id, ['call_pattern']));
		sections.push(advSection(type, id, 'adv/card', 'adv_card'));
		sections.push(advSection(type, id, 'adv/bond', 'adv_bond'));
		sections.push(advSection(type, id, 'adv/hbd', 'adv_hbd'));
		sections.push(advSection(type, id, 'adv/love', 'adv_love'));
		sections.push(advSection(type, id, 'adv/userhbd', 'adv_userhbd'));
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
		sections.push(advSection(type, id, 'adv/card', 'adv_card'));
	}

	if (['story_part', 'story_collection', 'story', 'love'].includes(type)) {
		sections.push(linkedUnitSection('stories', type, id, ['story', 'story_collection']));
		sections.push(advSection(type, id));
	}

	if (type === 'message_group') {
		sections.push(linkedUnitSection('group_messages', type, id, ['message']));
		sections.push(linkedUnitSection('group_telephones', type, id, ['telephone']));
	}

	const links = linksFor(type, id);
	return json({ entity, sections: sections.filter((item) => item.total > 0), links });
}
