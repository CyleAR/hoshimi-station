<script>
	import { observeViewport } from './viewport-blocks.js';

	let { id, count, children } = $props();
	let nearby = $state(false);
	let focused = $state(false);
	let height = $state(0);
	const rendered = $derived(nearby || focused);

	function track(element) {
		const stop = observeViewport(element, visible => {
			// Measure before unmounting, including manually resized textareas.
			if (!visible && nearby) height = element.getBoundingClientRect().height;
			nearby = visible;
		});
		const focusIn = () => { focused = true; };
		const focusOut = () => {
			queueMicrotask(() => {
				if (!element.contains(document.activeElement)) {
					height = element.getBoundingClientRect().height;
					focused = false;
				}
			});
		};
		const reveal = () => {
			nearby = true;
		};
		element.addEventListener('focusin', focusIn);
		element.addEventListener('focusout', focusOut);
		element.addEventListener('reveal-unit', reveal);
		return { destroy() {
			stop();
			element.removeEventListener('focusin', focusIn);
			element.removeEventListener('focusout', focusOut);
			element.removeEventListener('reveal-unit', reveal);
		} };
	}
</script>

<div {id} use:track data-virtual-block data-rendered={rendered}
	style:height={rendered ? undefined : `${height || count * 320 + (count - 1) * 14}px`}>
	{#if rendered}
		{@render children()}
	{/if}
</div>

<style>
	div { display: grid; gap: 14px; min-width: 0; }
</style>
