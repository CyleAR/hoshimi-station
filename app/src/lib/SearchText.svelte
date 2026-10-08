<script>
	let { text = '', query = '' } = $props();
	const parts = $derived.by(() => {
		const value = String(text ?? '');
		if (!query) return [{ text: value, match: false }];
		const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(escaped, 'gi');
		const result = [];
		let start = 0;
		for (const match of value.matchAll(pattern)) {
			result.push({ text: value.slice(start, match.index), match: false });
			result.push({ text: match[0], match: true });
			start = match.index + match[0].length;
		}
		result.push({ text: value.slice(start), match: false });
		return result;
	});
</script>

{#each parts as part}
	{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
{/each}

<style>
	mark { background: color-mix(in srgb, var(--warning) 25%, var(--field)); color: var(--warning); border-radius: 2px; }
</style>
