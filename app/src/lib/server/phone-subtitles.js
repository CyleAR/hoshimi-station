import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';

const prefix = 'sud_vo_phone_';
export const validClipName = (name) => typeof name === 'string' && /^sud_vo_phone_[a-z0-9_-]{1,180}$/.test(name);

function validLines(lines) {
	return Array.isArray(lines) && lines.length <= 1000 && lines.every((line, index) =>
		line && typeof line.text === 'string' && line.text.length <= 10000 &&
		typeof line.time === 'number' && Number.isFinite(line.time) && line.time >= 0 &&
		(index === 0 || line.time >= lines[index - 1].time));
}

function sourcePath() {
	if (process.env.PHONE_SUBTITLES_PATH) return path.resolve(process.env.PHONE_SUBTITLES_PATH);
	const cwd = process.cwd();
	const root = process.env.PROJECT_ROOT || (existsSync(path.join(cwd, 'output')) ? cwd : path.resolve(cwd, '..'));
	return path.resolve(root, 'output', 'local-files', 'phoneSubtitles.json');
}

// Import once, transactionally. The database is authoritative after this point.
export function ensurePhoneSubtitles(db = getDb()) {
	if (db.prepare("SELECT value FROM phone_subtitle_settings WHERE key = 'imported'").get()) return;
	const source = sourcePath();
	if (!existsSync(source)) {
		if (process.env.PHONE_SUBTITLES_PATH) throw new Error(`기존 자막 파일을 찾을 수 없습니다: ${source}`);
		// Browsing an empty installation must not authorize replacing an existing export.
		return;
	}
	const data = JSON.parse(readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
	if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('기존 자막 JSON의 형식이 올바르지 않습니다.');
	const entries = Object.entries(data);
	if (entries.some(([name, lines]) => !validClipName(name) || !validLines(lines))) {
		throw new Error('기존 자막 JSON에 올바르지 않은 항목이 있습니다.');
	}
	db.exec('BEGIN IMMEDIATE');
	try {
		if (!db.prepare("SELECT value FROM phone_subtitle_settings WHERE key = 'imported'").get()) {
			const insert = db.prepare('INSERT OR IGNORE INTO phone_subtitle_clips (clip_name, lines_json) VALUES (?, ?)');
			for (const [name, lines] of entries) insert.run(name, JSON.stringify(lines));
			db.prepare("INSERT INTO phone_subtitle_settings (key, value) VALUES ('imported', ?)").run(source);
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

export function listPhoneSubtitles(db = getDb()) {
	ensurePhoneSubtitles(db);
	const clips = db.prepare('SELECT clip_name, lines_json, revision, updated_by FROM phone_subtitle_clips ORDER BY clip_name').all();
	const byName = new Map(clips.map((clip) => [clip.clip_name, clip]));
	const links = new Map(db.prepare('SELECT telephone_id, clip_name FROM phone_subtitle_links').all().map((row) => [row.telephone_id, row.clip_name]));
	const used = new Set();
	const phones = db.prepare(`SELECT e.entity_id, e.label, e.meta_json, coalesce(u.translation_text, '') AS translation_label
		FROM entities e LEFT JOIN translation_units u ON u.unit_id = 'masterdb:Telephone:' || e.entity_id || ':name'
		WHERE e.entity_type = 'telephone' ORDER BY e.entity_id`).all().map((row) => {
		let meta = {};
		try { meta = JSON.parse(row.meta_json || '{}'); } catch { /* no metadata */ }
		const idName = prefix + row.entity_id;
		const assetName = prefix + (meta.assetId || row.entity_id);
		const clipName = links.get(row.entity_id) || (byName.has(idName) ? idName : assetName);
		if (byName.has(clipName)) used.add(clipName);
		const clip = byName.get(clipName);
		return { id: row.entity_id, label: row.label, translation_label: row.translation_label, clip_name: clipName, saved_link: links.get(row.entity_id) || '', matched: !!clip, translated: !!clip && JSON.parse(clip.lines_json).some((line) => line.text.trim()) };
	});
	const unlinked = clips.filter((clip) => !used.has(clip.clip_name)).map((clip) => ({ id: '', label: clip.clip_name, clip_name: clip.clip_name, matched: true, translated: JSON.parse(clip.lines_json).some((line) => line.text.trim()) }));
	return { phones, unlinked };
}

export function readPhoneSubtitle(name, db = getDb()) {
	if (!validClipName(name)) throw new Error('클립 이름이 올바르지 않습니다.');
	ensurePhoneSubtitles(db);
	const row = db.prepare('SELECT lines_json, revision, updated_by, updated_at FROM phone_subtitle_clips WHERE clip_name = ?').get(name);
	return row ? { lines: JSON.parse(row.lines_json), revision: row.revision, updated_by: row.updated_by, updated_at: row.updated_at, exists: true } : { lines: [], revision: 0, updated_by: '', updated_at: '', exists: false };
}

export function readTelephoneSubtitle(id, db = getDb()) {
	const phone = db.prepare("SELECT entity_id, meta_json FROM entities WHERE entity_type = 'telephone' AND entity_id = ?").get(id);
	if (!phone) return null;
	ensurePhoneSubtitles(db);
	const savedLink = db.prepare('SELECT clip_name FROM phone_subtitle_links WHERE telephone_id = ?').get(id)?.clip_name || '';
	const idName = prefix + id;
	const meta = JSON.parse(phone.meta_json || '{}');
	const name = savedLink || (db.prepare('SELECT 1 FROM phone_subtitle_clips WHERE clip_name = ?').get(idName) ? idName : prefix + (meta?.assetId || id));
	return { ...readPhoneSubtitle(name, db), clip_name: name, saved_link: savedLink };
}

export function savePhoneSubtitle(body, db = getDb()) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, error: '입력한 자막 정보가 올바르지 않습니다.' };
	const name = String(body.clip_name || '');
	const nickname = String(body.nickname || '').trim().slice(0, 24);
	const pin = String(body.pin || '').trim();
	if (!nickname || !/^\d{6}$/.test(pin) || !db.prepare('SELECT 1 FROM users WHERE nickname = ? AND pin = ?').get(nickname, pin)) return { status: 401, error: '로그인 정보를 확인해 주세요.' };
	if (!validClipName(name) || !Number.isInteger(body.revision) || body.revision < 0 || typeof body.exists !== 'boolean' || !Array.isArray(body.lines) || body.lines.length > 1000) return { status: 400, error: '입력한 자막 정보가 올바르지 않습니다.' };
	if (!validLines(body.lines)) return { status: 400, error: '자막과 표시 시각을 확인해 주세요. 시간은 0 이상이며 앞줄보다 빠를 수 없습니다.' };
	ensurePhoneSubtitles(db);
	const lines = body.lines.map((line, index) => ({ line: index + 1, time: line.time, text: line.text.replace(/\r\n?/g, '\n').replace(/\n/g, '\\n') }));
	const serialized = JSON.stringify(lines);
	const telephoneId = String(body.telephone_id || '');
	if (telephoneId && !db.prepare("SELECT 1 FROM entities WHERE entity_type = 'telephone' AND entity_id = ?").get(telephoneId)) return { status: 400, error: '전화 항목을 찾을 수 없습니다.' };
	db.exec('BEGIN IMMEDIATE');
	try {
		if (telephoneId) {
			const currentLink = db.prepare('SELECT clip_name FROM phone_subtitle_links WHERE telephone_id = ?').get(telephoneId)?.clip_name || '';
			if (typeof body.expected_link !== 'string' || currentLink !== body.expected_link) {
				db.exec('ROLLBACK');
				return { status: 409, error: '다른 작업자가 전화 연결을 변경했습니다. 목록을 다시 불러와 확인해 주세요.' };
			}
		}
		let result;
		if (body.exists) {
			result = db.prepare("UPDATE phone_subtitle_clips SET lines_json = ?, revision = revision + 1, updated_by = ?, updated_at = datetime('now') WHERE clip_name = ? AND revision = ?").run(serialized, nickname, name, body.revision);
		} else {
			result = db.prepare("INSERT OR IGNORE INTO phone_subtitle_clips (clip_name, lines_json, revision, updated_by, updated_at) VALUES (?, ?, 1, ?, datetime('now'))").run(name, serialized, nickname);
		}
		if (!result.changes) {
			db.exec('ROLLBACK');
			return { status: 409, error: '다른 작업자가 변경했습니다. 다시 불러와 확인해 주세요.' };
		}
		if (telephoneId) db.prepare('INSERT INTO phone_subtitle_links (telephone_id, clip_name) VALUES (?, ?) ON CONFLICT(telephone_id) DO UPDATE SET clip_name = excluded.clip_name').run(telephoneId, name);
		db.prepare("INSERT OR IGNORE INTO phone_subtitle_settings (key, value) VALUES ('imported', 'created in editor')").run();
		db.exec('COMMIT');
	} catch (error) { db.exec('ROLLBACK'); throw error; }
	return { ok: true, status: 200, revision: body.exists ? body.revision + 1 : 1 };
}

export function exportPhoneSubtitles(db = getDb()) {
	ensurePhoneSubtitles(db);
	return Object.fromEntries(db.prepare('SELECT clip_name, lines_json FROM phone_subtitle_clips ORDER BY clip_name').all().map((row) => [row.clip_name, JSON.parse(row.lines_json)]));
}
