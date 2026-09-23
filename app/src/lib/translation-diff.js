function append(segments, text, changed) {
	if (!text) return;
	const last = segments.at(-1);
	if (last?.changed === changed) last.text += text;
	else segments.push({ text, changed });
}

function contiguousDiff(before, after) {
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let end = 0;
	while (end < before.length - start && end < after.length - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
	const oldSegments = [];
	const newSegments = [];
	append(oldSegments, before.slice(0, start).join(""), false);
	append(newSegments, after.slice(0, start).join(""), false);
	append(oldSegments, before.slice(start, before.length - end).join(""), true);
	append(newSegments, after.slice(start, after.length - end).join(""), true);
	append(oldSegments, before.slice(before.length - end).join(""), false);
	append(newSegments, after.slice(after.length - end).join(""), false);
	return { oldSegments, newSegments };
}

export function translationDiff(previous, current) {
	const before = Array.from(String(previous ?? ''));
	const after = Array.from(String(current ?? ''));
	if (before.length * after.length > 160000) return contiguousDiff(before, after);

	const width = after.length + 1;
	const lengths = new Uint32Array((before.length + 1) * width);
	for (let i = before.length - 1; i >= 0; i--) {
		for (let j = after.length - 1; j >= 0; j--) {
			const position = i * width + j;
			lengths[position] = before[i] === after[j]
				? lengths[position + width + 1] + 1
				: Math.max(lengths[position + width], lengths[position + 1]);
		}
	}

	const oldSegments = [];
	const newSegments = [];
	let i = 0;
	let j = 0;
	while (i < before.length || j < after.length) {
		if (i < before.length && j < after.length && before[i] === after[j]) {
			append(oldSegments, before[i], false);
			append(newSegments, after[j], false);
			i++;
			j++;
		} else if (i < before.length && (j === after.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
			append(oldSegments, before[i++], true);
		} else {
			append(newSegments, after[j++], true);
		}
	}
	return { oldSegments, newSegments };
}
