import { get, getDb, json } from '$lib/server/db.js';

export async function POST({ request }) {
	const body = await request.json();
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const cardId = String(body.card_id ?? '').trim();
	const rawTitle = String(body.raw_title ?? '').trim(); // e.g. "On the Shining Stage Nagase Mana"

	if (!nickname) return json({ error: 'nickname is required' }, { status: 401 });
	if (!/^\d{6}$/.test(pin)) return json({ error: 'pin must be 6 digits' }, { status: 401 });
	if (!cardId) return json({ error: 'card_id is required' }, { status: 400 });
	if (!rawTitle) return json({ error: 'raw_title is required' }, { status: 400 });

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
	if (!user) return json({ error: 'nickname or pin is invalid' }, { status: 401 });

	// 1. Get Character Name linked to this card
	// First get the character ID
	const linkRow = get(`SELECT from_id FROM links WHERE from_type = 'character' AND to_type = 'card' AND to_id = $cardId LIMIT 1`, { $cardId: cardId });
	if (!linkRow) return json({ error: 'No character linked to this card was found.' }, { status: 400 });

	const charId = linkRow.from_id;
	
	const characterNames = {
		'char-ai': 'Komiyama Ai',
		'char-aoi': 'Igawa Aoi',
		'char-cca': 'Hoto Cocoa',
		'char-chk': 'Takami Chika',
		'char-chn': 'Kafuu Chino',
		'char-chs': 'Shiraishi Chisa',
		'char-cinnamo': 'Cinnamoroll',
		'char-gyo': 'Gyo',
		'char-haruhi': 'Suzumiya Haruhi',
		'char-hrk': 'Saeki Haruko',
		'char-itsuki': 'Koizumi Itsuki',
		'char-kitty': 'Hello Kitty',
		'char-kkr': 'Akazaki Kokoro',
		'char-koh': 'Makino Kohei',
		'char-konazusa': 'Nakano Azusa',
		'char-konmio': 'Akiyama Mio',
		'char-konmugi': 'Kotobuki Tsumugi',
		'char-konritsu': 'Tainaka Ritsu',
		'char-konyui': 'Hirasawa Yui',
		'char-ktn': 'Nagase Kotono',
		'char-kuromi': 'Kuromi',
		'char-kyon': 'Kyon',
		'char-kyui': 'Kotegawa Yui',
		'char-lala': 'Lala Satalin Deviluke',
		'char-mei': 'Hayasaka Mei',
		'char-melody': 'My Melody',
		'char-mikuru': 'Asahina Mikuru',
		'char-mku': 'Hatsune Miku',
		'char-mna': 'Nagase Mana',
		'char-mng': 'Nagase Mana',
		'char-momo': 'Momo Velia Deviluke',
		'char-ngs': 'Ibuki Nagisa',
		'char-rei': 'Ichinose Rei',
		'char-rik': 'Sakurauchi Riko',
		'char-rio': 'Kanzaki Rio',
		'char-rui': 'Tendo Rui',
		'char-ski': 'Shiraishi Saki',
		'char-skr': 'Kawasaki Sakura',
		'char-smr': 'Okuyama Sumire',
		'char-stm': 'Hashimoto Satomi',
		'char-stm1': 'Hashimoto Satomi',
		'char-stm2': 'Hashimoto Satomi',
		'char-stm3': 'Hashimoto Satomi',
		'char-stm4': 'Hashimoto Satomi',
		'char-stm5': 'Hashimoto Satomi',
		'char-suz': 'Narumiya Suzu',
		'char-szk': 'Hyodo Shizuku',
		'char-vns': 'VENUS Office',
		'char-yami': 'Golden Darkness',
		'char-ymk': 'Snow Miku',
		'char-yo': 'Watanabe You',
		'char-yu': 'Suzumura Yu',
		'char-yuki': 'Nagato Yuki',
		'char-kan': 'kana',
		'char-mhk': 'miho',
		'char-kor': 'fran'
	};

	const chr = characterNames[charId];
	if (!chr) {
		return json({ error: 'Character name not found.' }, { status: 400 });
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
		return json({ error: 'Could not extract the card title.' }, { status: 400 });
	}

	// 3. Prepare the generated texts
	const homeTalkCondition = `${title} ${chr}\nWatch Story Episode 3`;
	const messageName = `'${title}'`;
	const goods1 = `Can Badge ${chr} '${title}'`;
	const goods2 = `Card Stand ${chr} '${title}'`;
	const goods3 = `Mini Character Stand ${chr} '${title}'`;

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
		// (A) Home talk title & display condition
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

		// (B) Message name & phone name
		const messagesAndPhones = db.prepare(`
			SELECT tu.unit_id, tu.scope_type, tu.field_path
			FROM links l
			JOIN translation_units tu ON tu.scope_type = l.to_type AND tu.scope_id = l.to_id
			WHERE l.from_type = 'card' AND l.from_id = $cardId
			  AND l.to_type IN ('message', 'telephone', 'message_thread', 'message_group')
		`).all({ $cardId: cardId });

		// We need to match what the game actually uses. Usually the message name is the title of message or message_thread.
		// We'll update 'title' or 'name' fields for these.
		for (const mp of messagesAndPhones) {
			if (['title', 'name'].includes(mp.field_path)) {
				// The user requested '{title}' for both message and telephone
				updatedCount += updateQuery.run({ $text: messageName, $nickname: nickname, $unitId: mp.unit_id }).changes;
			}
		}

		// (C) Three goods names
		// Showcase toys linked to the card. Wait, how do we distinguish can badge, card stand, mini character stand?
		// We can look at the original_text.
		const goods = db.prepare(`
			SELECT tu.unit_id, tu.original_text
			FROM links l
			JOIN translation_units tu ON tu.scope_type = 'showcase_toy' AND tu.scope_id = l.to_id AND tu.field_path = 'name'
			WHERE l.from_type = 'card' AND l.from_id = $cardId AND l.to_type = 'showcase_toy'
		`).all({ $cardId: cardId });

		for (const g of goods) {
			if (g.original_text.includes('缶バッジ')) {
				updatedCount += updateQuery.run({ $text: goods1, $nickname: nickname, $unitId: g.unit_id }).changes;
			} else if (g.original_text.includes('カードスタンド')) {
				updatedCount += updateQuery.run({ $text: goods2, $nickname: nickname, $unitId: g.unit_id }).changes;
			} else if (g.original_text.includes('ミニキャラスタンド')) {
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
