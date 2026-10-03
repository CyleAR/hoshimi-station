import { get, json, run } from '$lib/server/db.js';

export async function POST({ request }) {
	const body = await request.json();
	const unitId = String(body.unit_id ?? '').trim();
	const translationText = String(body.translation_text ?? '');
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();

	if (!unitId) return json({ error: 'unit_id is required' }, { status: 400 });
	if (!nickname) return json({ error: '닉네임을 입력해 주세요.' }, { status: 401 });
	if (!/^\d{6}$/.test(pin)) return json({ error: '6자리 숫자 비밀번호를 입력해 주세요.' }, { status: 401 });

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
	if (!user) return json({ error: '닉네임 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });
	const expectedRevision = body.expected_revision;
	if (expectedRevision !== undefined && !Number.isInteger(expectedRevision)) return json({ error: 'invalid revision' }, { status: 400 });

	const status = translationText.trim() ? 'translated' : 'new';
	const result = run(
		`
		UPDATE translation_units
		SET translation_text = $translationText,
		    status = $status,
		    translator_name = CASE WHEN trim($translationText) <> '' THEN $nickname ELSE '' END,
		    updated_at = datetime('now')
		WHERE unit_id = $unitId ${expectedRevision === undefined ? '' : 'AND revision = $revision'}
		`,
		{ $translationText: translationText, $status: status, $nickname: nickname, $unitId: unitId,
			...(expectedRevision === undefined ? {} : { $revision: expectedRevision }) }
	);

	if (result.changes === 0) {
		const exists = get('SELECT unit_id FROM translation_units WHERE unit_id = $id', { $id: unitId });
		return json({ error: exists ? '다른 작업자가 내용을 변경했습니다. 항목을 다시 열어 최신 내용을 확인해 주세요.' : 'unit not found' }, { status: exists ? 409 : 404 });
	}
	run("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = $nickname", { $nickname: nickname });
	return json({ ok: true, status, translator_name: translationText.trim() ? nickname : '', revision: get('SELECT revision FROM translation_units WHERE unit_id = $id', { $id: unitId }).revision });
}
