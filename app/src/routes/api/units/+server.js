import { all, json } from '$lib/server/db.js';

const fieldPriority = new Map(
	[
		'id',
		'name',
		'title',
		'enName',
		'firstName',
		'groupName',
		'cv',
		'age',
		'birthday',
		'zodiacSign',
		'hometown',
		'favorite',
		'unfavorite',
		'catchphrase',
		'profile',
		'shortProfile',
		'description',
		'shortDescription',
		'obtainMessage',
		'evolveMessage',
		'branchFirstText',
		'branchCautionText',
		'choiceText',
		'managerText',
		'text',
		'word'
	].map((field, index) => [field, index])
);

function placeholders(values, params, prefix) {
	return values
		.map((value, index) => {
			params[`$${prefix}${index}`] = value;
			return `$${prefix}${index}`;
		})
		.join(',');
}

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

function linkedWhere(type, id, toTypes) {
	const params = { $type: type, $id: id };
	const toSql = placeholders(toTypes, params, 'to');
	return [
		`EXISTS (
			SELECT 1
			FROM links l
			WHERE l.from_type = $type AND l.from_id = $id AND l.to_type IN (${toSql})
			  AND l.to_type = translation_units.scope_type AND l.to_id = translation_units.scope_id
		)`,
		params
	];
}

function storyWhere(type, id) {
	return [
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
	];
}

function incomingLinkedWhere(type, id, fromTypes) {
	const params = { $type: type, $id: id };
	const fromSql = placeholders(fromTypes, params, 'from');
	return [
		`EXISTS (
			SELECT 1
			FROM links l
			WHERE l.to_type = $type AND l.to_id = $id AND l.from_type IN (${fromSql})
			  AND l.from_type = translation_units.scope_type AND l.from_id = translation_units.scope_id
		)`,
		params
	];
}

function cardCostumeHomeActionWhere(id) {
	return [
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
	];
}

function homeActionCardWhere(type, id) {
	return [
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
	];
}

function directWhere(type, id) {
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
	const params = { $type: type, $id: id };
	let where = "source_type = 'masterdb' AND scope_type = $type AND scope_id = $id";
	const categories = categoryByType[type];
	if (categories?.length) {
		where += ` AND category IN (${placeholders(categories, params, 'cat')})`;
	}
	return [where, params];
}

function characterCommonWhere(id, toTypes) {
	const params = { $id: id };
	const toSql = placeholders(toTypes, params, 'to');
	return [
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
	];
}

function advWhere(type, id, category = '') {
	const params = { $type: type, $id: id };
	let categoryWhere = '';
	if (category) {
		params.$advCategory = category;
		categoryWhere = 'AND category = $advCategory';
	}
	return [
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
	];
}

function whereFor(type, id, key, category) {
	if (type === 'search' || key === 'search') return [searchableUnitWhere('translation_units'), { $q: like(id) }];
	if (type === 'category' || key === 'category') return ['category = $category', { $category: category || id }];
	if (type === 'adv_file') return ["source_type = 'adv' AND source_file = $id", { $id: id }];
	if (key === 'direct') return directWhere(type, id);
	if (key === 'adv') return advWhere(type, id);
	if (key === 'adv_card') return advWhere(type, id, 'adv/card');
	if (key === 'adv_bond') return advWhere(type, id, 'adv/bond');
	if (key === 'adv_hbd') return advWhere(type, id, 'adv/hbd');
	if (key === 'adv_love') return advWhere(type, id, 'adv/love');
	if (key === 'adv_userhbd') return advWhere(type, id, 'adv/userhbd');
	if (key === 'adv_group') return advWhere(type, id, 'adv/group');

	if (type === 'group') {
		if (key === 'members') {
			return [
				`source_type = 'masterdb' AND category = 'Character' AND scope_type = 'character' AND scope_id IN (
					SELECT to_id FROM links WHERE from_type = 'group' AND from_id = $id AND to_type = 'character'
				)`,
				{ $id: id }
			];
		}
		if (key === 'cards') {
			return [
				`source_type = 'masterdb' AND category = 'Card' AND scope_type = 'card' AND scope_id IN (
					SELECT card.to_id
					FROM links member
					JOIN links card ON card.from_type = 'character' AND card.from_id = member.to_id AND card.to_type = 'card'
					WHERE member.from_type = 'group' AND member.from_id = $id AND member.to_type = 'character'
				)`,
				{ $id: id }
			];
		}
		if (key === 'accessories') return linkedWhere(type, id, ['accessory']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'character') {
		if (key === 'cards') {
			return [
				`source_type = 'masterdb' AND category = 'Card' AND scope_type = 'card' AND scope_id IN (
					SELECT to_id FROM links WHERE from_type = 'character' AND from_id = $id AND to_type = 'card'
				)`,
				{ $id: id }
			];
		}
		if (key === 'common_home_talks') return characterCommonWhere(id, ['home_talk']);
		if (key === 'common_messages') return characterCommonWhere(id, ['message', 'message_group']);
		if (key === 'common_telephones') return characterCommonWhere(id, ['telephone']);
		if (key === 'call_patterns') return linkedWhere(type, id, ['call_pattern']);
		if (key === 'costumes') return linkedWhere(type, id, ['costume']);
		if (key === 'hair') return linkedWhere(type, id, ['hair']);
		if (key === 'accessories') return linkedWhere(type, id, ['accessory']);
		if (key === 'goods') return linkedWhere(type, id, ['showcase_toy']);
		if (key === 'stories') return linkedWhere(type, id, ['story']);
		if (key === 'home_actions') return linkedWhere(type, id, ['home_action', 'love_home_action', 'company_enjoy_home_action']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'card') {
		if (key === 'evolution') return linkedWhere(type, id, ['card_evolution_message']);
		if (key === 'skills') return linkedWhere(type, id, ['skill', 'skill_efficacy', 'live_ability', 'activity_ability']);
		if (key === 'costumes') return linkedWhere(type, id, ['costume']);
		if (key === 'hair') return linkedWhere(type, id, ['hair']);
		if (key === 'goods') return linkedWhere(type, id, ['showcase_toy']);
		if (key === 'stories') return linkedWhere(type, id, ['story']);
		if (key === 'card_messages') return linkedWhere(type, id, ['message']);
		if (key === 'card_home_talks') return linkedWhere(type, id, ['home_talk']);
		if (key === 'card_telephones') return linkedWhere(type, id, ['telephone']);
		if (key === 'call_patterns') return linkedWhere(type, id, ['call_pattern']);
		if (key === 'home_actions') return cardCostumeHomeActionWhere(id);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (['story_part', 'story_collection', 'story', 'love'].includes(type) && key === 'stories') {
		return storyWhere(type, id);
	}
	if (['story_part', 'story_collection', 'story', 'love'].includes(type) && key === 'conditions') {
		return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'costume') {
		if (key === 'hair') return linkedWhere(type, id, ['hair']);
		if (key === 'home_actions') return linkedWhere(type, id, ['home_action', 'love_home_action', 'company_enjoy_home_action']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'hair') {
		if (key === 'costumes') return linkedWhere(type, id, ['costume']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'home_talk') {
		if (key === 'call_patterns') return linkedWhere(type, id, ['call_pattern']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'call_pattern') {
		if (key === 'cards') return incomingLinkedWhere(type, id, ['card']);
		if (key === 'card_home_talks') return incomingLinkedWhere(type, id, ['home_talk']);
	}

	if (['home_action', 'love_home_action', 'company_enjoy_home_action'].includes(type)) {
		if (key === 'cards') return homeActionCardWhere(type, id);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'showcase_toy_category' && key === 'goods') {
		return linkedWhere(type, id, ['showcase_toy']);
	}

	if (type === 'skill' && key === 'skill_efficacies') {
		return linkedWhere(type, id, ['skill_efficacy']);
	}

	if (['live_ability', 'activity_ability'].includes(type) && key === 'skills') {
		return linkedWhere(type, id, ['skill']);
	}

	if (type === 'message_group') {
		if (key === 'message_threads') return linkedWhere(type, id, ['message_thread']);
		if (key === 'group_messages') return linkedWhere(type, id, ['message']);
		if (key === 'group_telephones') return linkedWhere(type, id, ['telephone']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'message_thread') {
		if (key === 'group_messages') return linkedWhere(type, id, ['message']);
		if (key === 'linked_telephones') return linkedWhere(type, id, ['telephone']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'message') {
		if (key === 'message_threads') return linkedWhere(type, id, ['message_thread']);
		if (key === 'linked_telephones') return linkedWhere(type, id, ['telephone']);
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	if (type === 'telephone') {
		if (key === 'linked_messages') {
			return [
				`EXISTS (
					SELECT 1
					FROM links l
					WHERE l.from_type = 'message'
					  AND l.to_type = 'telephone'
					  AND l.to_id = $id
					  AND l.from_type = translation_units.scope_type
					  AND l.from_id = translation_units.scope_id
				)`,
				{ $id: id }
			];
		}
		if (key === 'conditions') return linkedWhere(type, id, ['condition_description']);
	}

	return ['1 = 0', {}];
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
		return String(left[index]).localeCompare(String(right[index]));
	}
	return 0;
}

function leafField(path) {
	return String(path ?? '')
		.replace(/\[[^\]]+\]/g, '')
		.split('.')
		.filter(Boolean)
		.at(-1);
}

function headField(path) {
	return String(path ?? '').split(/[.[\]]/).find(Boolean) ?? '';
}

function priority(path) {
	const leaf = leafField(path);
	const head = headField(path);
	return fieldPriority.get(leaf) ?? fieldPriority.get(head) ?? 999;
}

function compareFieldPath(a, b) {
	const aHead = headField(a);
	const bHead = headField(b);
	if (aHead !== bHead) return priority(a) - priority(b) || naturalCompare(a, b);
	return naturalCompare(a, b) || priority(a) - priority(b);
}

function compareUnit(a, b) {
	return (
		naturalCompare(a.source_type, b.source_type) ||
		naturalCompare(a.category, b.category) ||
		naturalCompare(a.source_file, b.source_file) ||
		naturalCompare(a.record_id, b.record_id) ||
		Number(a.line_no ?? 0) - Number(b.line_no ?? 0) ||
		compareFieldPath(a.field_path, b.field_path)
	);
}

function attachAdvOwners(units) {
	const files = [...new Set(units.filter((unit) => unit.source_type === 'adv' && unit.scope_type === 'adv_file').map((unit) => unit.source_file))];
	if (!files.length) return units;

	const params = {};
	const fileSql = placeholders(files, params, 'file');
	const owners = all(
		`
		SELECT *
		FROM (
			SELECT adv.to_id source_file,
			       owner.from_type owner_type,
			       owner.from_id owner_id,
			       COALESCE(e.label, owner.from_id) owner_label,
			       COALESCE(e.subtitle, '') owner_subtitle,
			       CASE owner.from_type
			       	 WHEN 'card' THEN 1
			       	 WHEN 'story_collection' THEN 2
			       	 WHEN 'story_part' THEN 3
			       	 WHEN 'love' THEN 4
			       	 WHEN 'story' THEN 5
			       	 ELSE 9
			       END priority
			FROM links adv
			JOIN links owner
			  ON owner.to_type = 'story'
			 AND owner.to_id = adv.from_id
			 AND owner.from_type IN ('card', 'story_collection', 'story_part', 'love')
			LEFT JOIN entities e ON e.entity_type = owner.from_type AND e.entity_id = owner.from_id
			WHERE adv.to_type = 'adv_file' AND adv.to_id IN (${fileSql})
			UNION ALL
			SELECT direct.to_id source_file,
			       direct.from_type owner_type,
			       direct.from_id owner_id,
			       COALESCE(e.label, direct.from_id) owner_label,
			       COALESCE(e.subtitle, '') owner_subtitle,
			       CASE direct.from_type
			       	 WHEN 'card' THEN 1
			       	 WHEN 'story_collection' THEN 2
			       	 WHEN 'story_part' THEN 3
			       	 WHEN 'love' THEN 4
			       	 WHEN 'story' THEN 5
			       	 ELSE 9
			       END priority
			FROM links direct
			LEFT JOIN entities e ON e.entity_type = direct.from_type AND e.entity_id = direct.from_id
			WHERE direct.to_type = 'adv_file'
			  AND direct.from_type IN ('card', 'story_collection', 'story_part', 'love', 'story')
			  AND direct.to_id IN (${fileSql})
		)
		ORDER BY source_file, priority
		`,
		params
	);
	const ownerMap = new Map();
	for (const owner of owners) {
		if (!ownerMap.has(owner.source_file)) ownerMap.set(owner.source_file, owner);
	}

	return units.map((unit) => {
		const owner = ownerMap.get(unit.source_file);
		if (!owner) return unit;
		return {
			...unit,
			owner_type: owner.owner_type,
			owner_id: owner.owner_id,
			owner_label: owner.owner_label,
			owner_subtitle: owner.owner_subtitle
		};
	});
}

function attachMessageThreadOwners(units) {
	const messageIds = [...new Set(units.filter((unit) => unit.scope_type === 'message').map((unit) => unit.scope_id))];
	if (!messageIds.length) return units;

	const params = {};
	const messageSql = placeholders(messageIds, params, 'message');
	const owners = all(
		`
		SELECT l.to_id message_id,
		       thread.from_id owner_id,
		       COALESCE(e.label, thread.from_id) owner_label,
		       COALESCE(e.subtitle, '') owner_subtitle
		FROM links l
		JOIN links thread
		  ON thread.from_type = 'message_thread'
		 AND thread.to_type = 'message'
		 AND thread.to_id = l.to_id
		LEFT JOIN entities e ON e.entity_type = 'message_thread' AND e.entity_id = thread.from_id
		WHERE l.to_type = 'message'
		  AND l.to_id IN (${messageSql})
		ORDER BY l.to_id, thread.from_id
		`,
		params
	);
	const ownerMap = new Map();
	for (const owner of owners) {
		if (!ownerMap.has(owner.message_id)) ownerMap.set(owner.message_id, owner);
	}

	return units.map((unit) => {
		const owner = ownerMap.get(unit.scope_id);
		if (!owner) return unit;
		return {
			...unit,
			owner_type: 'message_thread',
			owner_id: owner.owner_id,
			owner_label: owner.owner_label,
			owner_subtitle: owner.owner_subtitle
		};
	});
}

export function GET({ url }) {
	const type = url.searchParams.get('type') || 'character';
	const id = url.searchParams.get('id') || '';
	const key = url.searchParams.get('key') || 'direct';
	const category = url.searchParams.get('category') || '';
	const limit = Math.min(Number(url.searchParams.get('limit') || 5000), 10000);
	const [where, params] = whereFor(type, id, key, category);

	const units = all(
		`
		SELECT translation_units.*,
		       COALESCE(e.label, translation_units.scope_id) scope_label,
		       COALESCE(e.subtitle, '') scope_subtitle
		FROM translation_units
		LEFT JOIN entities e
		  ON e.entity_type = translation_units.scope_type
		 AND e.entity_id = translation_units.scope_id
		WHERE ${where}
		ORDER BY source_type, category, source_file, record_id, line_no, field_path
		LIMIT $limit
		`,
		{ ...params, $limit: limit }
	).sort(compareUnit);
	return json({ units: attachMessageThreadOwners(attachAdvOwners(units)) });
}
