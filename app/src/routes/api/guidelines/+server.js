import { json } from '$lib/server/db.js';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	const cwd = process.cwd();
	if (existsSync(path.resolve(cwd, 'docs', 'translation-guidelines.md'))) return cwd;
	return path.resolve(cwd, '..');
}

const guidelinesPath = process.env.GUIDELINES_PATH
	? path.resolve(process.env.GUIDELINES_PATH)
	: path.resolve(projectRoot(), 'docs', 'translation-guidelines.md');

export function GET() {
	const markdown = readFileSync(guidelinesPath, 'utf-8');
	return json({ markdown });
}
