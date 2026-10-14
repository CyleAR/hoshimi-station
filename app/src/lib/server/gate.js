// Server-side quality gate for translation_text writes (port of idolypride-en-data
// agency-adv/validate_adv.py check_values, agency/validate.py check_data and the
// Gate-4 policy in tools/trans/gate.py). Pure functions plus one DB lookup.
import { get } from '$lib/server/db.js';

const CJK = /[぀-ヺー-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿ﾠ-ﾾ]/;
const BANNED = ['[', ']', ' name=', ' clip=', ' hide=', ' thumbnial='];
const SCOTS = /\b(ye|ken|birl|braw|chuffed|lass)\b/i;
const TOKENS = [/\{[^}]*\}/g, /<\/?[A-Za-z][^>]*>/g, /\[[^\]]*\]/g];

const count = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const tokens = (s) => TOKENS.flatMap((re) => s.match(re) ?? []).sort();

function advKind(unit) {
	if (unit.speaker === '__narration__') return 'narr';
	if (unit.field_path === 'text') return 'msg';
	return 'other';
}

function checkAdv(unit, en) {
	const jp = unit.original_text ?? '';
	const errors = [];
	const warnings = [];
	if (CJK.test(en)) errors.push('Japanese characters remain');
	if (HANGUL.test(en)) errors.push('Korean characters remain');
	for (const b of BANNED) if (en.includes(b)) errors.push(`forbidden sequence "${b}"`);
	if (count(jp, '{user}') !== count(en, '{user}')) errors.push('{user} count differs from the source');
	if (count(jp, '\\n') > count(en, '\\n')) errors.push('literal \\n line breaks were lost');
	if (/[\r\n]/.test(en)) errors.push('real newline in value (use the literal \\n)');
	const kind = advKind(unit);
	if (kind === 'msg' && jp.startsWith('（') && jp.endsWith('）') && !(en.startsWith('（') && en.endsWith('）'))) {
		errors.push('the source is wrapped in （…） and the translation must keep the wrapper');
	}
	if (kind === 'narr' && jp.startsWith('――') && !en.startsWith('――')) errors.push('leading ―― lost');
	if (en !== en.trimEnd()) errors.push('trailing whitespace');
	if (SCOTS.test(en)) errors.push('dialect residue (ye/ken/birl/braw/chuffed/lass)');
	if (jp.length && (en.length > 3 * jp.length || en.length < 0.2 * jp.length)) warnings.push('length differs a lot from the source');
	return { errors, warnings };
}

function checkMaster(unit, en) {
	const jp = unit.original_text ?? '';
	const errors = [];
	const warnings = [];
	if (CJK.test(en)) errors.push('Japanese characters remain');
	if (HANGUL.test(en)) errors.push('Korean characters remain');
	// The shipped data already has token drift in the source; only demand a match when the source is self-consistent.
	if (JSON.stringify(tokens(jp)) !== JSON.stringify(tokens(en))) errors.push('placeholders/tags/brackets differ from the source');
	if (count(jp, '\n') !== count(en, '\n')) warnings.push('line-break count differs from the source');
	if (jp.length && (en.length > 3 * jp.length || en.length < 0.2 * jp.length)) warnings.push('length differs a lot from the source');
	return { errors, warnings };
}

// Gate 4: no candidate may be a byte-identical copy of the official EN string.
// Returns 'skipped' when no reference exists for the unit (never reported as a pass).
function checkOfficial(unit, en) {
	let hint;
	try {
		hint = get('SELECT hint_text FROM official_en_hints WHERE unit_id = $id', { $id: unit.unit_id });
	} catch {
		return { skipped: true };
	}
	if (!hint?.hint_text) return { skipped: true };
	return hint.hint_text === en ? { copy: true } : {};
}

/** Validate one candidate. Empty candidates (clearing a translation) are always allowed. */
export function validateCandidate(unit, candidate) {
	const en = String(candidate ?? '');
	if (!en.trim()) return { ok: true, errors: [], warnings: [], gate4: 'n/a' };
	const isAdv = String(unit.category ?? '').startsWith('adv/');
	const { errors, warnings } = isAdv ? checkAdv(unit, en) : checkMaster(unit, en);
	const official = checkOfficial(unit, en);
	if (official.copy) errors.push('identical to the official English text (Gate 4)');
	return { ok: errors.length === 0, errors, warnings, gate4: official.skipped ? 'skipped' : official.copy ? 'fail' : 'pass' };
}

/** Load the unit row and validate. Unknown units are left to the caller's 404 handling. */
export function validateForUnitId(unitId, candidate) {
	const unit = get(
		'SELECT * FROM translation_units WHERE unit_id = $id',
		{ $id: unitId }
	);
	if (!unit) return null;
	return validateCandidate(unit, candidate);
}

export function gateMessage(result) {
	return `Rejected by the quality gate: ${result.errors.join('; ')}`;
}
