import { get, getDb, json } from '$lib/server/db.js';

export async function POST({ request }) {
	const body = await request.json();
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const cardId = String(body.card_id ?? '').trim();
	const rawTitle = String(body.raw_title ?? '').trim(); // e.g. "빛나는 무대 위에서 나가세 마나"

	if (!nickname) return json({ error: 'nickname is required' }, { status: 401 });
	if (!/^\d{6}$/.test(pin)) return json({ error: 'pin must be 6 digits' }, { status: 401 });
	if (!cardId) return json({ error: 'card_id is required' }, { status: 400 });
	if (!rawTitle) return json({ error: 'raw_title is required' }, { status: 400 });

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
	if (!user) return json({ error: 'nickname or pin is invalid' }, { status: 401 });

	// 1. Get Character Name linked to this card
	const charRow = get(`
		SELECT tu.translation_text, tu.original_text
		FROM links l
		JOIN translation_units tu ON tu.scope_type = 'character' AND tu.scope_id = l.from_id AND tu.field_path = 'name'
		WHERE l.from_type = 'character' AND l.to_type = 'card' AND l.to_id = $cardId
		LIMIT 1
	`, { $cardId: cardId });

	if (!charRow) {
		return json({ error: '해당 카드와 연결된 캐릭터를 찾을 수 없습니다.' }, { status: 400 });
	}

	const chr = charRow.translation_text || charRow.original_text;

	// 2. Extract Title by removing Character Name from the end
	let title = rawTitle;
	if (title.endsWith(chr)) {
		title = title.slice(0, -chr.length).trim();
	} else {
		// If character name has spaces, try removing it ignoring spaces, or just ask user to make sure.
		// For safety, let's just do simple replace from the end
		const chrNoSpace = chr.replace(/\s+/g, '');
		const titleNoSpace = title.replace(/\s+/g, '');
		if (titleNoSpace.endsWith(chrNoSpace)) {
			// Find the actual split point in the original string
			let matchLen = 0;
			let idx = title.length - 1;
			while (idx >= 0 && matchLen < chrNoSpace.length) {
				if (title[idx] !== ' ') matchLen++;
				idx--;
			}
			title = title.slice(0, idx + 1).trim();
		}
	}

	if (!title) {
		return json({ error: '카드 제목을 추출할 수 없습니다.' }, { status: 400 });
	}

	// 3. Prepare the generated texts
	const homeTalkCondition = `${title} ${chr}\n스토리 3화 시청`;
	const messageName = `'${title}'`;
	const goods1 = `캔뱃지 ${chr} '${title}'`;
	const goods2 = `카드 스탠드 ${chr} '${title}'`;
	const goods3 = `미니 캐릭터 스탠드 ${chr} '${title}'`;

	// 4. Update the DB
	const db = getDb();
	const updateQuery = db.prepare(`
		UPDATE translation_units
		SET translation_text = $text,
		    status = 'translated',
		    translator_name = $nickname,
		    updated_at = datetime('now')
		WHERE unit_id = $unitId
		  AND (translation_text IS NULL OR translation_text != $text)
	`);

	let updatedCount = 0;

	db.exec('BEGIN');
	try {
		// (A) 홈 대사 제목 & 표시 조건
		// Find units in HomeTalk for this card
		const homeTalks = db.prepare(`
			SELECT tu.unit_id, tu.field_path
			FROM links l
			JOIN translation_units tu ON tu.scope_type = 'home_talk' AND tu.scope_id = l.to_id
			WHERE l.from_type = 'card' AND l.from_id = $cardId AND l.to_type = 'home_talk'
		`).all({ $cardId: cardId });

		for (const ht of homeTalks) {
			if (ht.field_path === 'title') {
				updatedCount += updateQuery.run({ $text: title, $nickname: nickname, $unitId: ht.unit_id }).changes;
			} else if (ht.field_path === 'displayConditionDescription') {
				updatedCount += updateQuery.run({ $text: homeTalkCondition, $nickname: nickname, $unitId: ht.unit_id }).changes;
			}
		}

		// (B) 문자 이름 & 전화 이름
		const messagesAndPhones = db.prepare(`
			SELECT tu.unit_id, tu.scope_type, tu.field_path
			FROM links l
			JOIN translation_units tu ON tu.scope_type = l.to_type AND tu.scope_id = l.to_id
			WHERE l.from_type = 'card' AND l.from_id = $cardId
			  AND l.to_type IN ('message', 'telephone', 'message_thread', 'message_group')
		`).all({ $cardId: cardId });

		// We need to match what the game actually uses. Usually "문자 이름" is the title of message or message_thread.
		// We'll update 'title' or 'name' fields for these.
		for (const mp of messagesAndPhones) {
			if (['title', 'name'].includes(mp.field_path)) {
				// The user requested '{title}' for both message and telephone
				updatedCount += updateQuery.run({ $text: messageName, $nickname: nickname, $unitId: mp.unit_id }).changes;
			}
		}

		// (C) 굿즈 이름 3개
		// Showcase toys linked to the card. Wait, how do we distinguish 캔뱃지, 카드 스탠드, 미니 캐릭터 스탠드?
		// We can look at the original_text.
		const goods = db.prepare(`
			SELECT tu.unit_id, tu.original_text
			FROM links l
			JOIN translation_units tu ON tu.scope_type = 'showcase_toy' AND tu.scope_id = l.to_id AND tu.field_path = 'name'
			WHERE l.from_type = 'card' AND l.from_id = $cardId AND l.to_type = 'showcase_toy'
		`).all({ $cardId: cardId });

		for (const g of goods) {
			if (g.original_text.includes('缶バッジ') || g.original_text.includes('캔뱃지')) {
				updatedCount += updateQuery.run({ $text: goods1, $nickname: nickname, $unitId: g.unit_id }).changes;
			} else if (g.original_text.includes('カードスタンド') || g.original_text.includes('카드 스탠드')) {
				updatedCount += updateQuery.run({ $text: goods2, $nickname: nickname, $unitId: g.unit_id }).changes;
			} else if (g.original_text.includes('ミニキャラスタンド') || g.original_text.includes('미니 캐릭터 스탠드')) {
				updatedCount += updateQuery.run({ $text: goods3, $nickname: nickname, $unitId: g.unit_id }).changes;
			}
		}

		db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = $nickname").run({ $nickname: nickname });
		db.exec('COMMIT');
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	}

	return json({ ok: true, updated: updatedCount, title, chr });
}
