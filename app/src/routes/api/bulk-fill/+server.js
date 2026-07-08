import { all, get, getDb, json, run } from '$lib/server/db.js';

function cleanText(value) {
	return String(value ?? '');
}

function hasFormatPlaceholder(value) {
	return /\{\d+\}/.test(value);
}

function placeholderSet(value) {
	return new Set([...String(value ?? '').matchAll(/\{(\d+)\}/g)].map((match) => match[1]));
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeLike(value) {
	return value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function compileFormatPattern(format) {
	const placeholders = [];
	let pattern = '^';
	let offset = 0;
	for (const match of format.matchAll(/\{(\d+)\}/g)) {
		pattern += escapeRegex(format.slice(offset, match.index));
		pattern += '(.+?)';
		placeholders.push(match[1]);
		offset = match.index + match[0].length;
	}
	pattern += escapeRegex(format.slice(offset));
	pattern += '$';
	return { regex: new RegExp(pattern, 'u'), placeholders };
}

function literalSearchFragment(format) {
	const fragments = format
		.split(/\{\d+\}/g)
		.map((part) => part.trim())
		.filter(Boolean)
		.sort((a, b) => b.length - a.length);
	return fragments[0] ?? '';
}

function formatTranslation(template, captures) {
	return template.replace(/\{(\d+)\}/g, (_, key) => captures.get(key) ?? '');
}

function formatMatches(rows, originalFormat, translationFormat, overwrite) {
	const { regex, placeholders } = compileFormatPattern(originalFormat);
	const matches = [];
	for (const row of rows) {
		const match = regex.exec(row.original_text);
		if (!match) continue;
		const captures = new Map();
		let valid = true;
		for (let index = 0; index < placeholders.length; index += 1) {
			const key = placeholders[index];
			const value = match[index + 1] ?? '';
			if (captures.has(key) && captures.get(key) !== value) {
				valid = false;
				break;
			}
			captures.set(key, value);
		}
		if (!valid) continue;
		matches.push({
			...row,
			proposed_translation: formatTranslation(translationFormat, captures)
		});
	}
	return matches.filter((row) => overwrite || !String(row.translation_text ?? '').trim());
}

export async function POST({ request }) {
	const body = await request.json();
	const originalText = cleanText(body.original_text);
	const translationText = cleanText(body.translation_text);
	const nickname = String(body.nickname ?? '').trim().slice(0, 24);
	const pin = String(body.pin ?? '').trim();
	const overwrite = Boolean(body.overwrite);
	const apply = Boolean(body.apply);

	if (!originalText) return json({ error: 'original_text is required' }, { status: 400 });
	if (!translationText.trim()) return json({ error: 'translation_text is required' }, { status: 400 });
	if (!nickname) return json({ error: 'nickname is required' }, { status: 401 });
	if (!/^\d{6}$/.test(pin)) return json({ error: 'pin must be 6 digits' }, { status: 401 });

	const user = get('SELECT nickname FROM users WHERE nickname = $nickname AND pin = $pin', { $nickname: nickname, $pin: pin });
	if (!user) return json({ error: 'nickname or pin is invalid' }, { status: 401 });

	const isFormat = hasFormatPlaceholder(originalText);
	if (isFormat) {
		const fragment = literalSearchFragment(originalText);
		if (!fragment) {
			return json({ error: 'format pattern must include literal text' }, { status: 400 });
		}
		const originalPlaceholders = placeholderSet(originalText);
		const unknownPlaceholders = [...placeholderSet(translationText)].filter((key) => !originalPlaceholders.has(key));
		if (unknownPlaceholders.length) {
			return json(
				{ error: `translation_text has unknown placeholder(s): ${unknownPlaceholders.map((key) => `{${key}}`).join(', ')}` },
				{ status: 400 }
			);
		}
		const rows = all(
			`
			SELECT unit_id, source_type, category, source_file, record_id, field_path, original_text, translation_text
			FROM translation_units
			WHERE original_text LIKE $like ESCAPE '!'
			ORDER BY source_type, category, source_file, record_id, line_no, field_path
			`,
			{ $like: `%${escapeLike(fragment)}%` }
		);
		const { regex, placeholders } = compileFormatPattern(originalText);
		const allMatches = rows.filter((row) => regex.test(row.original_text));
		const targets = formatMatches(rows, originalText, translationText, overwrite);
		const alreadyTranslated = allMatches.filter((row) => String(row.translation_text ?? '').trim()).length;
		if (!apply) {
			return json({
				ok: true,
				mode: 'format',
				total: allMatches.length,
				already_translated: alreadyTranslated,
				targets: targets.length,
				placeholders: [...new Set(placeholders)],
				samples: targets.slice(0, 20)
			});
		}

		const db = getDb();
		const update = db.prepare(
			`
			UPDATE translation_units
			SET translation_text = $translationText,
			    status = 'translated',
			    translator_name = $nickname,
			    updated_at = datetime('now')
			WHERE unit_id = $unitId
			`
		);
		db.exec('BEGIN');
		let updated = 0;
		try {
			for (const row of targets) {
				const result = update.run({
					$translationText: row.proposed_translation,
					$nickname: nickname,
					$unitId: row.unit_id
				});
				updated += result.changes ?? 0;
			}
			db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = $nickname").run({ $nickname: nickname });
			db.exec('COMMIT');
		} catch (err) {
			db.exec('ROLLBACK');
			throw err;
		}

		return json({ ok: true, mode: 'format', updated });
	}

	const params = { $originalText: originalText };
	const targetWhere = overwrite
		? 'original_text = $originalText'
		: "original_text = $originalText AND translation_text = ''";

	const summary =
		get(
			`
			SELECT COUNT(*) total,
			       SUM(CASE WHEN translation_text <> '' THEN 1 ELSE 0 END) already_translated,
			       SUM(CASE WHEN ${targetWhere} THEN 1 ELSE 0 END) targets
			FROM translation_units
			WHERE original_text = $originalText
			`,
			params
		) ?? {};

	const samples = all(
		`
		SELECT unit_id, source_type, category, source_file, record_id, field_path, translation_text
		FROM translation_units
		WHERE ${targetWhere}
		ORDER BY source_type, category, source_file, record_id, line_no, field_path
		LIMIT 20
		`,
		params
	);

	if (!apply) {
		return json({
			ok: true,
			total: summary.total ?? 0,
			already_translated: summary.already_translated ?? 0,
			targets: summary.targets ?? 0,
			samples
		});
	}

	const result = run(
		`
		UPDATE translation_units
		SET translation_text = $translationText,
		    status = 'translated',
		    translator_name = $nickname,
		    updated_at = datetime('now')
		WHERE ${targetWhere}
		`,
		{ ...params, $translationText: translationText, $nickname: nickname }
	);
	run("UPDATE users SET last_seen_at = datetime('now') WHERE nickname = $nickname", { $nickname: nickname });

	return json({ ok: true, updated: result.changes ?? 0 });
}
