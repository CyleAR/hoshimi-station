import { DatabaseSync } from 'node:sqlite';
import { dev } from '$app/environment';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), '..', 'data', 'hoshimi.sqlite3');

let db;

export function getDb() {
	if (!db) {
		db = new DatabaseSync(dbPath);
		db.exec('PRAGMA query_only = OFF');
		if (dev) {
			db.exec('PRAGMA busy_timeout = 3000');
		}
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
