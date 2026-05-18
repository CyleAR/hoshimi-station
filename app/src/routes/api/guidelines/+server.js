import { json } from '$lib/server/db.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const guidelinesPath = path.resolve(process.cwd(), '..', 'docs', 'translation-guidelines.md');

export function GET() {
	const markdown = readFileSync(guidelinesPath, 'utf-8');
	return json({ markdown });
}
