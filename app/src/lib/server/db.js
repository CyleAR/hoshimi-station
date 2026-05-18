import { DatabaseSync } from 'node:sqlite';
import { dev } from '$app/environment';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), '..', 'data', 'hoshimi.sqlite3');

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
		)
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
