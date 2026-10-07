// Share one observer per scroll pane, even when a section has thousands of groups.
const panes = new WeakMap();
export const UNIT_BATCH_SIZE = 10;

export function observeViewport(node, callback) {
	if (typeof IntersectionObserver === 'undefined') {
		callback(true);
		return () => {};
	}
	const root = node.closest('.editor-pane');
	const key = root ?? document;
	let pane = panes.get(key);
	if (!pane) {
		const callbacks = new Map();
		const observer = new IntersectionObserver(entries => {
			for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
		}, { root, rootMargin: '1000px 0px' });
		pane = { callbacks, observer };
		panes.set(key, pane);
	}
	pane.callbacks.set(node, callback);
	pane.observer.observe(node);
	return () => {
		pane.observer.unobserve(node);
		pane.callbacks.delete(node);
		if (!pane.callbacks.size) {
			pane.observer.disconnect();
			panes.delete(key);
		}
	};
}

export function unitBatches(units, size = UNIT_BATCH_SIZE) {
	const batches = [];
	for (let index = 0; index < units.length; index += size) batches.push(units.slice(index, index + size));
	return batches;
}
