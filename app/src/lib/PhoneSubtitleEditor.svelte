<script>
	import { onMount } from 'svelte';

	let { telephoneId, currentUser, onstatechange, onprogress } = $props();
	let lines = $state([]);
	let clipName = $state('');
	let originalName = $state('');
	let loadedName = $state('');
	let expectedLink = '';
	let revision = 0;
	let exists = false;
	let snapshot = $state(null);
	let busy = $state(true);
	let message = $state('');
	let error = $state('');
	let lastEditor = $state('');
	let draft = $state(null);
	let draftInfo = $state({});
	let disposed = false;
	let nextId = 0;
	const dirty = $derived(clipName !== originalName || (snapshot !== null && serialize() !== snapshot));
	const canEdit = $derived(!busy && Boolean(loadedName));
	const canSave = $derived(canEdit && Boolean(currentUser) && clipName === loadedName);
	$effect(() => { onstatechange?.({ dirty, busy, canSave }); });

	function serialize() {
		return JSON.stringify(lines.map(({ time, text }) => ({ time, text })));
	}
	function makeLine(time = 0, text = '') {
		return { id: ++nextId, time, text };
	}
	function canDiscard() {
		return !dirty || confirm('저장하지 않은 자막 또는 클립 이름 변경 사항이 사라집니다. 계속할까요?');
	}
	async function request(url, options) {
		const response = await fetch(url, options);
		let data;
		try { data = await response.json(); }
		catch { throw new Error(`응답을 읽지 못했습니다. (${response.status})`); }
		if (!response.ok) throw new Error(data.error || '자막을 처리하지 못했습니다.');
		return data;
	}
	async function load(url, name = '') {
		const currentTelephone = !name;
		busy = true;
		error = ''; message = ''; loadedName = ''; snapshot = null; lines = []; lastEditor = ''; draft = null; draftInfo = {};
		try {
			const data = await request(url);
			if (disposed) return;
			if (!name) {
				name = data.clip_name;
				clipName = name; originalName = name; expectedLink = data.saved_link;
			}
			loadedName = name; revision = data.revision; exists = data.exists;
			lastEditor = data.updated_by;
			draft = data.draft ?? null;
			lines = data.lines.map((line) => makeLine(line.time, line.text.replace(/\\n/g, '\n')));
			if (!lines.length) lines = [makeLine()];
			snapshot = serialize();
			if (currentTelephone && draft && !draft.stale && !draft.accepted_at) {
				const hasTranslation = data.lines.some((line) => line.text.trim());
				if (!hasTranslation) lines = draft.lines.map((line) => makeLine(line.time));
				for (const proposal of draft.lines) {
					const line = lines[proposal.line - 1];
					if (!line || (hasTranslation && line.text.trim())) continue;
					if (!proposal.needs_review) line.text = proposal.text.replace(/\\n/g, '\n');
					draftInfo[line.id] = { source: proposal.source_segments.map((index) => draft.transcript.segments[index - 1].text).join(' '),
						needsReview: proposal.needs_review, note: proposal.note };
				}
			}
			if (currentTelephone && draft?.accepted_at) {
				for (const proposal of draft.lines) {
					const line = lines[proposal.line - 1];
					if (!line || line.time !== proposal.time) continue;
					draftInfo[line.id] = { source: proposal.source_segments.map((index) => draft.transcript.segments[index - 1].text).join(' '),
						needsReview: proposal.needs_review && !line.text.trim(), note: proposal.note };
				}
			}
			if (currentTelephone) onprogress?.({ total: Math.max(1, data.lines.length), done: data.lines.filter((line) => line.text.trim()).length });
		} catch (err) { if (!disposed) error = err.message; }
		finally { if (!disposed) busy = false; }
	}
	export async function reload() {
		if (busy || !canDiscard()) return;
		await load(`/api/phone-subtitles?telephone=${encodeURIComponent(telephoneId)}`);
	}
	async function loadClip() {
		if (busy || !canDiscard()) return;
		await load(`/api/phone-subtitles?clip=${encodeURIComponent(clipName)}`, clipName);
	}
	export async function save() {
		if (!canEdit || !currentUser || clipName !== loadedName) return;
		if (lines.some((line, i) => line.time == null || line.time === '' || !Number.isFinite(Number(line.time)) ||
			Number(line.time) < 0 || (i > 0 && Number(line.time) < Number(lines[i - 1].time)))) {
			error = '표시 시각은 0 이상이며 앞줄보다 빠를 수 없습니다.';
			return;
		}
		const payload = {
			telephone_id: telephoneId, expected_link: expectedLink, clip_name: loadedName,
			revision, exists, nickname: currentUser.nickname, pin: currentUser.pin,
			...(!draft?.stale && draft && !draft.accepted_at ? { draft_id: draft.draft_id } : {}),
			lines: lines.map(({ time, text }) => ({ time: Number(time), text }))
		};
		busy = true; error = ''; message = '';
		try {
			const data = await request('/api/phone-subtitles', {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
			});
			if (disposed) return;
			revision = data.revision; exists = true; expectedLink = loadedName; originalName = loadedName;
			snapshot = serialize(); lastEditor = currentUser.nickname;
			if (payload.draft_id) draft = { ...draft, accepted_at: new Date().toISOString(), accepted_by: currentUser.nickname };
			message = '저장했습니다.';
			onprogress?.({ total: Math.max(1, lines.length), done: lines.filter((line) => line.text.trim()).length });
		} catch (err) { if (!disposed) error = err.message; }
		finally { if (!disposed) busy = false; }
	}
	function addLine(index = lines.length - 1) {
		if (canEdit) lines.splice(index + 1, 0, makeLine(lines[index]?.time ?? 0));
	}
	onMount(() => {
		void load(`/api/phone-subtitles?telephone=${encodeURIComponent(telephoneId)}`);
		return () => { disposed = true; };
	});
</script>

<section class="phone-editor" aria-label="전화 자막 편집">
	{#if error}<div class="error-box" role="alert">{error}<button onclick={reload} disabled={busy}>다시 불러오기</button></div>{/if}
	{#if message}<p class="notice phone-notice" role="status">{message}</p>{/if}
	<header class="group-head phone-group-head">
		<div><strong>phoneSubtitles.json</strong><code title={loadedName || clipName}>{loadedName || clipName || telephoneId}</code></div>
		<div class="group-actions phone-group-actions"><span>{loadedName ? lines.length : 0}</span><button onclick={() => addLine()} disabled={!canEdit}>줄 추가</button></div>
	</header>
	<details class="phone-settings">
		<summary>클립 연결 <span>{loadedName && clipName !== loadedName ? '변경 중' : ''}</span></summary>
		<div class="row">
			<label class="row-label" for="phone-clip-name">음성 클립</label>
			<div class="phone-clip-controls"><input id="phone-clip-name" bind:value={clipName} disabled={busy} spellcheck="false" autocapitalize="none" autocomplete="off" /><button class="soft" onclick={loadClip} disabled={busy || !clipName.trim()}>불러오기</button></div>
		</div>
		{#if loadedName && clipName !== loadedName}<p class="phone-pending">클립 이름 변경 · 불러오기 필요</p>{/if}
	</details>
	{#if draft && !draft.accepted_at && draft.stale}<p class="phone-pending">자막 또는 연결이 변경되어 초안을 불러오지 않았습니다.</p>{/if}
	{#if busy && !loadedName}<div class="state-card large" role="status">자막 불러오는 중…</div>{/if}
	<div class="unit-stack phone-units">
		{#each lines as line, i (line.id)}
			<article class="unit-card" class:untranslated={!line.text.trim()}>
				<header>
					<strong>자막 {i + 1}</strong>
					<div class="phone-row-actions">
						<code>line: {i + 1}</code>
						<button class="soft phone-icon" title={`${i + 1}번 아래에 줄 추가`} aria-label={`${i + 1}번 아래에 줄 추가`} onclick={() => addLine(i)} disabled={!canEdit}>+</button>
						<button class="soft phone-icon" title={`${i + 1}번 줄 삭제`} aria-label={`${i + 1}번 줄 삭제`} onclick={() => { if (canEdit) lines = lines.filter((item) => item.id !== line.id); }} disabled={!canEdit}>×</button>
					</div>
				</header>
				{#if draftInfo[line.id]}
					<p class="phone-draft-source" lang="ja">{draftInfo[line.id].source}</p>
					{#if draftInfo[line.id].needsReview}<p class="phone-pending">검토 필요: {draftInfo[line.id].note}</p>{/if}
				{/if}
				<div class="row">
					<label class="row-label" for={`phone-time-${line.id}`}>시각</label>
					<div class="phone-time-field"><input id={`phone-time-${line.id}`} type="number" min="0" step="0.01" bind:value={line.time} disabled={!canEdit} /><span>초</span></div>
				</div>
				<div class="row">
					<label class="row-label" for={`phone-text-${line.id}`}>자막</label>
					<textarea id={`phone-text-${line.id}`} rows="2" placeholder="자막을 입력하세요..." bind:value={line.text} disabled={!canEdit}></textarea>
				</div>
			</article>
		{/each}
	</div>
	{#if lastEditor}<p class="phone-author">최근 작업: {lastEditor}</p>{/if}
</section>

<style>
	.phone-editor { min-width: 0; padding-bottom: 48px; }
	.phone-editor .row { grid-template-columns: 82px minmax(0, 1fr); }
	.phone-editor input { width: 100%; min-width: 0; border: 1px solid var(--border-strong); border-radius: 7px; background: var(--field); color: var(--text); padding: 8px 10px; font: inherit; }
	.phone-editor :is(input, textarea, button):disabled { opacity: .5; }
	.phone-editor :is(input, button, summary):focus-visible { outline: 2px solid var(--accent-soft); outline-offset: 2px; }
	.phone-group-head { border-radius: 8px 8px 0 0; }
	.phone-group-actions { display: flex; }
	.phone-row-actions { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.phone-row-actions code { margin-right: 4px; }
	.phone-icon { width: 28px; height: 28px; padding: 0; font-size: 17px; }
	.phone-time-field { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px; }
	.phone-time-field input { width: 110px; font-variant-numeric: tabular-nums; }
	.phone-time-field span { color: var(--muted); font-size: 12px; }
	.phone-settings { background: var(--panel); border-bottom: 1px solid var(--border); }
	.phone-settings summary { padding: 9px 16px; color: var(--muted); font-size: 12px; cursor: pointer; }
	.phone-settings summary span { margin-left: 8px; color: var(--warning); }
	.phone-draft-source { padding: 10px 14px; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; color: var(--muted); }
	.phone-clip-controls { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 12px; }
	.phone-clip-controls input { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
	.phone-units { padding: 14px 0; }
	.phone-notice, .phone-author { margin: 0 0 12px; font-size: 12px; overflow-wrap: anywhere; }
	.phone-author { color: var(--muted); }
	.phone-pending { padding: 0 12px 12px; margin: 0; font-size: 12px; color: var(--warning); }
	.phone-editor .error-box { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0 0 12px; overflow-wrap: anywhere; }
	@media (max-width: 700px) {
		.phone-editor input, .phone-clip-controls input { font-size: 16px; }
		.phone-editor .row { grid-template-columns: 58px minmax(0, 1fr); }
		.phone-editor .row-label { padding: 12px 8px; }
		.phone-row-actions code { display: none; }
		.phone-icon { width: 36px; height: 36px; }
		.phone-clip-controls { flex-wrap: wrap; padding: 10px; }
		.phone-clip-controls input { flex-basis: 100%; }
		.phone-time-field { padding: 10px; }
	}
</style>
