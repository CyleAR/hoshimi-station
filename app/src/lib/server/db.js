import { DatabaseSync } from 'node:sqlite';
import { dev } from '$app/environment';
import { existsSync } from 'node:fs';
import path from 'node:path';

function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	const cwd = process.cwd();
	if (existsSync(path.resolve(cwd, 'data', 'hoshimi.sqlite3'))) return cwd;
	return path.resolve(cwd, '..');
}

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(projectRoot(), 'data', 'hoshimi.sqlite3');

let db;

function hasColumn(database, table, column) {
	return database.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function migrate(database) {
	database.exec(`
		CREATE TABLE IF NOT EXISTS users (
			nickname TEXT PRIMARY KEY,
			pin TEXT NOT NULL,
			created_at TEXT NOT NULL,
			last_seen_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS ai_daily_usage (
			nickname TEXT NOT NULL,
			usage_date TEXT NOT NULL,
			request_count INTEGER NOT NULL DEFAULT 0,
			updated_at TEXT NOT NULL,
			PRIMARY KEY(nickname, usage_date)
		);
		CREATE TABLE IF NOT EXISTS new_import_units (
			unit_id TEXT NOT NULL,
			original_text TEXT NOT NULL,
			imported_at TEXT NOT NULL,
			PRIMARY KEY(unit_id, original_text)
		);
		CREATE INDEX IF NOT EXISTS idx_new_import_units_time ON new_import_units(imported_at)
	`);
	if (!hasColumn(database, 'translation_units', 'translator_name')) {
		database.exec("ALTER TABLE translation_units ADD COLUMN translator_name TEXT NOT NULL DEFAULT ''");
	}
}

export function getDb() {
	if (!db) {
		db = new DatabaseSync(dbPath);
		db.exec('PRAGMA query_only = OFF');
		if (dev) {
			db.exec('PRAGMA busy_timeout = 3000');
		}
		migrate(db);
	}
	return db;
}

export function all(sql, params = {}) {
	return getDb().prepare(sql).all(params);
}

export function get(sql, params = {}) {
	return getDb().prepare(sql).get(params);
}

export function run(sql, params = {}) {
	return getDb().prepare(sql).run(params);
}

export function json(data, init = {}) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			...(init.headers ?? {})
		}
	});
}
