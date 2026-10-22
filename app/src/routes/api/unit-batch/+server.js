import { get, getDb, json, run } from '$lib/server/db.js';

const normalize = (text) => String(text ?? '').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');

export async function POST({ request }) {
	let body;
	try { body = await request.json(); } catch { return json({ error: '잘못된 JSON 요청입니다.' }, { status: 400 }); }
	if (!body || typeof body !== 'object') return json({ error: '잘못된 요청입니다.' }, { status: 400 });
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	if (!nickname || !/^\d{6}$/.test(pin) || !get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin })) {
		return json({ error: '로그인 정보를 확인해 주세요.' }, { status: 401 });
	}
	const units = body.units;
	if (!Array.isArray(units) || !units.length || units.length > 4096 ||
		units.some(unit => !unit || typeof unit.unit_id !== 'string' || !unit.unit_id || !Number.isInteger(unit.revision)) ||
		new Set(units.map(unit => unit.unit_id)).size !== units.length || typeof body.translation_text !== 'string') {
		return json({ error: '저장할 항목을 확인해 주세요.' }, { status: 400 });
	}
	const db = getDb();
	db.exec('BEGIN IMMEDIATE');
	try {
		const rows = units.map(unit => get('SELECT * FROM translation_units WHERE unit_id = $id', { $id: unit.unit_id }));
		if (rows.some((row, index) => !row || row.revision !== units[index].revision)) {
			db.exec('ROLLBACK');
			return json({ error: '변경되거나 삭제된 항목이 있습니다. 다시 조회한 뒤 저장해 주세요.' }, { status: 409 });
		}
		const first = rows[0];
		if (rows.some(row => row.source_type !== 'masterdb' || row.field_path !== 'name' ||
			row.category !== first.category || normalize(row.original_text) !== normalize(first.original_text))) {
			db.exec('ROLLBACK');
			return json({ error: '같은 분류와 원문의 이름 항목만 함께 저장할 수 있습니다.' }, { status: 400 });
		}
		const text = body.translation_text;
		let count = 0;
		for (const row of rows) {
			if (row.translation_text === text) continue;
			run(`UPDATE translation_units SET translation_text = $text, status = $status,
				translator_name = $nickname, updated_at = datetime('now') WHERE unit_id = $id`, {
				$text: text, $status: text.trim() ? 'translated' : 'new', $nickname: text.trim() ? nickname : '', $id: row.unit_id
			});
			count++;
		}
		run("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = $nickname", { $nickname: nickname });
		db.exec('COMMIT');
		return json({ ok: true, count });
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}
