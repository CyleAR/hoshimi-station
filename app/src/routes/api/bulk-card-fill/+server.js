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
	// First get the character ID
	const linkRow = get(`SELECT from_id FROM links WHERE from_type = 'character' AND to_type = 'card' AND to_id = $cardId LIMIT 1`, { $cardId: cardId });
	if (!linkRow) return json({ error: '해당 카드와 연결된 캐릭터를 찾을 수 없습니다.' }, { status: 400 });

	const charId = linkRow.from_id;
	
	const characterNames = {
		'char-ai': '코미야마 아이', 'char-aoi': '이가와 아오이', 'char-cca': '호토 코코아',
		'char-chk': '타카미 치카', 'char-chn': '카후우 치노', 'char-chs': '시라이시 치사',
		'char-cinnamo': '시나모롤', 'char-gyo': '울먹이', 'char-haruhi': '스즈미야 하루히',
		'char-hrk': '사에키 하루코', 'char-itsuki': '코이즈미 이츠키', 'char-kitty': '헬로키티',
		'char-kkr': '아카자키 코코로', 'char-koh': '마키노 코헤이', 'char-konazusa': '나카노 아즈사',
		'char-konmio': '아키야마 미오', 'char-konmugi': '코토부키 츠무기', 'char-konritsu': '타이나카 리츠',
		'char-konyui': '히라사와 유이', 'char-ktn': '나가세 코토노', 'char-kuromi': '쿠로미',
		'char-kyon': '쿈', 'char-kyui': '코테가와 유이', 'char-lala': '라라 사타린 데빌룩',
		'char-mei': '하야사카 메이', 'char-melody': '마이멜로디', 'char-mikuru': '아사히나 미쿠루',
		'char-mku': '하츠네 미쿠', 'char-mna': '나가세 마나', 'char-mng': '나가세 마나',
		'char-momo': '모모 베리아 데빌룩', 'char-ngs': '이부키 나기사', 'char-rei': '이치노세 레이',
		'char-rik': '사쿠라우치 리코', 'char-rio': '칸자키 리오', 'char-rui': '텐도 루이',
		'char-ski': '시라이시 사키', 'char-skr': '카와사키 사쿠라', 'char-smr': '오쿠야마 스미레',
		'char-stm': '하시모토 사토미', 'char-stm1': '하시모토 사토미', 'char-stm2': '하시모토 사토미',
		'char-stm3': '하시모토 사토미', 'char-stm4': '하시모토 사토미', 'char-stm5': '하시모토 사토미',
		'char-suz': '나루미야 스즈', 'char-szk': '효도 시즈쿠', 'char-vns': 'VENUS 사무국',
		'char-yami': '금빛 어둠', 'char-ymk': '스노우 미쿠', 'char-yo': '와타나베 요우',
		'char-yu': '스즈무라 유우', 'char-yuki': '나가토 유키',
		'char-kan': 'kana', 'char-mhk': 'miho', 'char-kor': 'fran'
	};

	const chr = characterNames[charId];
	if (!chr) {
		return json({ error: '해당 캐릭터의 이름을 찾을 수 없습니다.' }, { status: 400 });
	}

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
