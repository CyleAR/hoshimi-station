import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { listPhoneSubtitles, normalizeSubtitleLines, readTelephoneSubtitle, validClipName } from './phone-subtitles.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 10000) => typeof value === 'string' && value.length <= max;
const time = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function subtitleSnapshot(subtitle) {
	return { clip_name: subtitle.clip_name, revision: subtitle.revision, exists: subtitle.exists, saved_link: subtitle.saved_link,
		lines: subtitle.lines.map(({ time, text }) => ({ time, text })) };
}

function sameSnapshot(left, right) {
	return JSON.stringify(subtitleSnapshot(left)) === JSON.stringify(subtitleSnapshot(right));
}

export function readPhoneSubtitleDraft(id, subtitle, db = getDb()) {
	const row = db.prepare('SELECT * FROM phone_subtitle_drafts WHERE telephone_id = ?').get(id);
	if (!row) return null;
	const payload = JSON.parse(row.payload_json);
	const phone = db.prepare("SELECT meta_json FROM entities WHERE entity_type = 'telephone' AND entity_id = ?").get(id);
	const audioClip = phone ? 'sud_vo_phone_' + (JSON.parse(phone.meta_json || '{}').assetId || id) : '';
	return { ...payload, draft_id: row.draft_id, created_at: row.created_at, accepted_at: row.accepted_at, accepted_by: row.accepted_by,
		stale: payload.audio_clip_name !== audioClip || !sameSnapshot(payload.base, subtitle) };
}

function phoneMetadata(id, db) {
	const row = db.prepare(`SELECT e.entity_id AS id, e.label, e.meta_json, coalesce(u.translation_text, '') AS translation_label
		FROM entities e LEFT JOIN translation_units u ON u.unit_id = 'masterdb:Telephone:' || e.entity_id || ':name'
		WHERE e.entity_type = 'telephone' AND e.entity_id = ?`).get(id);
	if (!row) return null;
	const meta = JSON.parse(row.meta_json || '{}');
	const character = db.prepare(`SELECT e.label, coalesce(u.translation_text, '') AS translation_label
		FROM entities e LEFT JOIN translation_units u ON u.unit_id = 'masterdb:Character:' || e.entity_id || ':name'
		WHERE e.entity_type = 'character' AND e.entity_id = ?`).get(meta.characterId || '');
	return { id: row.id, label: row.label, translation_label: row.translation_label, character_id: meta.characterId || '',
		character_name: character?.label || '', character_translation: character?.translation_label || '',
		audio_clip_name: 'sud_vo_phone_' + (meta.assetId || id) };
}

export function getPhoneSubtitleWork(id, db = getDb()) {
	if (!text(id, 200) || !id) fail(400, '전화 ID가 필요합니다.');
	const phone = phoneMetadata(id, db);
	if (!phone) fail(404, '전화 항목을 찾을 수 없습니다.');
	const current = readTelephoneSubtitle(id, db);
	return { phone, snapshot: subtitleSnapshot(current), draft: readPhoneSubtitleDraft(id, current, db),
		site_path: `/?tab=telephones&type=telephone&id=${encodeURIComponent(id)}&part=phone_subtitles` };
}

export function listPhoneSubtitleWork(params, db = getDb()) {
	const limitText = params.get('limit') ?? '50';
	const limit = Number(limitText);
	const status = params.get('draft_status') ?? 'all';
	const translation = params.get('translation_status') ?? 'all';
	const cursor = params.get('cursor') ?? '';
	const character = params.get('character_id');
	if (!/^\d+$/.test(limitText) || limit < 1 || limit > 200 || cursor.length > 200 ||
		!['all', 'missing', 'pending', 'stale', 'applied'].includes(status) ||
		!['all', 'empty', 'partial', 'complete'].includes(translation) || (character !== null && (!character || character.length > 200))) {
		fail(400, '전화 목록 필터가 올바르지 않습니다.');
	}
	const phones = listPhoneSubtitles(db).phones;
	const drafts = new Map(db.prepare('SELECT * FROM phone_subtitle_drafts').all().map((row) => [row.telephone_id, row]));
	const clips = new Map(db.prepare('SELECT clip_name, revision, lines_json FROM phone_subtitle_clips').all().map((row) => [row.clip_name, row]));
	const counts = { total: 0, missing: 0, pending: 0, stale: 0, applied: 0 };
	const selected = [];
	for (const phone of phones) {
		if (character !== null && phone.character_id !== character) continue;
		const translationStatus = phone.done === 0 ? 'empty' : phone.done === phone.total ? 'complete' : 'partial';
		if (translation !== 'all' && translation !== translationStatus) continue;
		const draft = drafts.get(phone.id);
		const clip = clips.get(phone.clip_name);
		const current = { clip_name: phone.clip_name, saved_link: phone.saved_link, revision: clip?.revision ?? 0, exists: !!clip, lines: clip ? JSON.parse(clip.lines_json) : [] };
		const payload = draft ? JSON.parse(draft.payload_json) : null;
		const draftStatus = !draft ? 'missing' : draft.accepted_at ? 'applied' :
			payload.audio_clip_name === phone.audio_clip_name && sameSnapshot(payload.base, current) ? 'pending' : 'stale';
		counts.total++; counts[draftStatus]++;
		if ((status === 'all' || draftStatus === status) && phone.id > cursor) {
			selected.push({ ...phone, translation_status: translationStatus, draft_status: draftStatus, draft_id: draft?.draft_id ?? null,
				site_path: `/?tab=telephones&type=telephone&id=${encodeURIComponent(phone.id)}&part=phone_subtitles` });
		}
	}
	const page = selected.slice(0, limit);
	return { phones: page, counts, next_cursor: selected.length > limit ? page.at(-1).id : null };
}

function validatedPayload(body) {
	if (!object(body) || !text(body.telephone_id, 200) || !body.telephone_id ||
		!validClipName(body.audio_clip_name) || !text(body.audio_sha256, 64) || !/^[a-fA-F0-9]{64}$/.test(body.audio_sha256) ||
		!(body.expected_draft_id === null || (text(body.expected_draft_id, 100) && body.expected_draft_id)) || !text(body.notes ?? '', 20000)) {
		fail(400, '전화 ID, 음성 클립 이름·SHA-256, 이전 초안 ID가 필요합니다.');
	}
	const base = body.base;
	if (!object(base) || !validClipName(base.clip_name) || !Number.isSafeInteger(base.revision) || base.revision < 0 ||
		typeof base.exists !== 'boolean' || !(base.saved_link === '' || validClipName(base.saved_link)) ||
		!Array.isArray(base.lines) || base.lines.length > 1000 || base.lines.some((line, i) =>
			!object(line) || !time(line.time) || !text(line.text) || (i > 0 && line.time < base.lines[i - 1].time))) {
		fail(400, '현재 자막의 정확한 스냅샷이 필요합니다.');
	}
	const transcript = body.transcript;
	if (!object(transcript) || !text(transcript.model, 200) || !transcript.model.trim() ||
		!Array.isArray(transcript.segments) || !transcript.segments.length || transcript.segments.length > 2000 ||
		transcript.segments.some((segment, i) => !object(segment) || !time(segment.start) || !time(segment.end) ||
			segment.end < segment.start || !text(segment.text) || !segment.text.trim() || (i > 0 && segment.start < transcript.segments[i - 1].start))) {
		fail(400, '시작·종료 시각과 일본어 원문이 있는 인식 결과가 필요합니다.');
	}
	const fillExisting = base.lines.some((line) => line.text.trim());
	if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 1000 || body.lines.some((line, i) =>
		!object(line) || !Number.isInteger(line.line) || line.line < 1 || line.line > 1000 || !time(line.time) || !text(line.text) ||
		typeof line.needs_review !== 'boolean' || !text(line.note ?? '', 2000) ||
		(line.needs_review ? (line.text !== '' || !line.note?.trim()) : !line.text.trim()) ||
		!Array.isArray(line.source_segments) || line.source_segments.length > 2000 || (!line.needs_review && !line.source_segments.length) ||
		line.source_segments.some((index) => !Number.isInteger(index) || index < 1 || index > transcript.segments.length) ||
		new Set(line.source_segments).size !== line.source_segments.length ||
		(i > 0 && (line.line <= body.lines[i - 1].line || line.time < body.lines[i - 1].time)) ||
		(fillExisting ? (!base.lines[line.line - 1] || !!base.lines[line.line - 1].text.trim() || line.time !== base.lines[line.line - 1].time) : line.line !== i + 1))) {
		fail(400, '초안의 줄 번호·시각·인식 구간을 확인해 주세요. 기존 번역과 시각은 바꿀 수 없으며 검토 대상은 빈 번역과 사유가 필요합니다.');
	}
	return { telephone_id: body.telephone_id, audio_clip_name: body.audio_clip_name, audio_sha256: body.audio_sha256.toLowerCase(),
		base: subtitleSnapshot(base), transcript: { model: transcript.model, segments: transcript.segments.map(({ start, end, text }) => ({ start, end, text })) },
		lines: body.lines.map(({ line, time, text, source_segments, needs_review, note }) => ({ line, time, text, source_segments, needs_review, note: note ?? '' })), notes: body.notes ?? '' };
}

export function submitPhoneSubtitleDraft(body, db = getDb()) {
	const payload = validatedPayload(body);
	// Initialize the existing subtitle source before opening our own transaction.
	getPhoneSubtitleWork(payload.telephone_id, db);
	const serialized = JSON.stringify(payload);
	const hash = createHash('sha256').update(serialized).digest('hex');
	db.exec('BEGIN IMMEDIATE');
	try {
		const work = getPhoneSubtitleWork(payload.telephone_id, db);
		if (work.phone.audio_clip_name !== payload.audio_clip_name) fail(409, '음성이 현재 전화의 assetId와 일치하지 않습니다. 다시 확인해 주세요.');
		if (!sameSnapshot(payload.base, work.snapshot)) fail(409, '자막 또는 전화 연결이 변경되었습니다. 다시 읽고 초안을 검토해 주세요.');
		const previous = db.prepare('SELECT * FROM phone_subtitle_drafts WHERE telephone_id = ?').get(payload.telephone_id);
		if (previous?.payload_hash === hash) {
			db.exec('COMMIT');
			return { ok: true, draft_id: previous.draft_id, duplicate: true, accepted_at: previous.accepted_at };
		}
		if ((previous?.draft_id ?? null) !== body.expected_draft_id) fail(409, '다른 초안이 저장되었습니다. 최신 초안을 읽고 확인해 주세요.');
		const id = randomUUID();
		db.prepare(`INSERT INTO phone_subtitle_drafts (telephone_id, draft_id, payload_json, payload_hash, created_at)
			VALUES (?, ?, ?, ?, ?) ON CONFLICT(telephone_id) DO UPDATE SET draft_id = excluded.draft_id,
			payload_json = excluded.payload_json, payload_hash = excluded.payload_hash, created_at = excluded.created_at,
			accepted_at = NULL, accepted_by = NULL`).run(payload.telephone_id, id, serialized, hash, new Date().toISOString());
		db.exec('COMMIT');
		return { ok: true, draft_id: id, duplicate: false };
	} catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function applyPhoneSubtitleDraft(body, db = getDb()) {
	if (!object(body)) fail(400, '입력한 초안 정보가 올바르지 않습니다.');
	const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 24) : '';
	if (!nickname || typeof body.pin !== 'string' || !/^\d{6}$/.test(body.pin) || !db.prepare('SELECT 1 FROM users WHERE nickname = ? AND pin = ?').get(nickname, body.pin)) fail(401, '로그인 정보를 확인해 주세요.');
	if (!text(body.draft_id, 100) || !body.draft_id) fail(400, '초안 ID가 필요합니다.');
	getPhoneSubtitleWork(body.telephone_id, db);
	db.exec('BEGIN IMMEDIATE');
	try {
		const work = getPhoneSubtitleWork(body.telephone_id, db);
		const draft = work.draft;
		if (!draft || draft.draft_id !== body.draft_id || draft.accepted_at || draft.stale || draft.audio_clip_name !== work.phone.audio_clip_name) {
			fail(409, '초안 또는 자막이 변경되었거나 이미 적용되었습니다. 다시 불러와 주세요.');
		}
		if (!draft.lines.some((line) => !line.needs_review)) fail(400, '적용할 수 있는 번역이 없습니다. 모든 줄이 검토 대상입니다.');
		const fillExisting = draft.base.lines.some((line) => line.text.trim());
		const merged = fillExisting ? draft.base.lines.map((line) => ({ ...line })) : draft.lines.map(({ time }) => ({ time, text: '' }));
		for (const line of draft.lines) if (!line.needs_review) merged[line.line - 1].text = line.text;
		const linesJson = JSON.stringify(normalizeSubtitleLines(merged));
		const current = work.snapshot;
		if (current.exists) {
			db.prepare("UPDATE phone_subtitle_clips SET lines_json = ?, revision = revision + 1, updated_by = ?, updated_at = datetime('now') WHERE clip_name = ?").run(linesJson, nickname, current.clip_name);
		} else {
			db.prepare("INSERT INTO phone_subtitle_clips (clip_name, lines_json, revision, updated_by, updated_at) VALUES (?, ?, 1, ?, datetime('now'))").run(current.clip_name, linesJson, nickname);
		}
		db.prepare('INSERT INTO phone_subtitle_links (telephone_id, clip_name) VALUES (?, ?) ON CONFLICT(telephone_id) DO UPDATE SET clip_name = excluded.clip_name').run(body.telephone_id, current.clip_name);
		db.prepare("INSERT OR IGNORE INTO phone_subtitle_settings (key, value) VALUES ('imported', 'created in editor')").run();
		db.prepare("UPDATE phone_subtitle_drafts SET accepted_at = ?, accepted_by = ? WHERE telephone_id = ?").run(new Date().toISOString(), nickname, body.telephone_id);
		db.exec('COMMIT');
		return { ok: true, revision: current.revision + 1 };
	} catch (error) { db.exec('ROLLBACK'); throw error; }
}
