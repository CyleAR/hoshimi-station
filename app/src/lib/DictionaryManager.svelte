<script>
	import { onMount } from 'svelte';
	import { translationDiff } from '$lib/translation-diff.js';

	let { user, onclose, unitHref, onopenunit } = $props();
	const groups = [
		{ key: 'card', label: '카드명' }, { key: 'gacha', label: '가차명' },
		{ key: 'music', label: '노래' }, { key: 'costume', label: '의상' },
		{ key: 'hair', label: '헤어' }, { key: 'item', label: '아이템' },
		{ key: 'accessory', label: '액세서리' }, { key: 'pose', label: '포즈' }
	];
	const states = [
		{ key: 'new', label: '추가 가능' }, { key: 'changed', label: '기존 값과 다름' },
		{ key: 'conflict', label: '번역 충돌' }, { key: 'review', label: '검토 필요' },
		{ key: 'unchanged', label: '동일' }, { key: 'missing', label: '미번역' }
	];
	const pageSize = 40;
	let dialog;
	let items = $state([]);
	let dictionaryHash = $state('');
	let selectedGroups = $state(groups.map((group) => group.key));
	let selectedIds = $state(new Set());
	let state = $state('new');
	let search = $state('');
	let page = $state(0);
	let working = $state('');
	let error = $state('');
	let needsRefresh = $state(false);
	let loaded = $state(false);
	let result = $state(null);
	let editing = $state(null);
	let editAll = $state(true);
	let editError = $state('');
	let savedNotice = $state('');
	let controller;
	const inGroups = $derived(items.filter((item) => selectedGroups.includes(item.group)));
	const counts = $derived(Object.fromEntries(states.map((entry) => [entry.key, inGroups.filter((item) => item.state === entry.key).length])));
	const visible = $derived(inGroups.filter((item) => item.state === state && (!search ||
		[item.original, item.existing ?? '', ...item.variants.map((variant) => variant.text)].join('\n').toLowerCase().includes(search.toLowerCase()))));
	const pages = $derived(Math.max(1, Math.ceil(visible.length / pageSize)));
	const pageItems = $derived(visible.slice(page * pageSize, (page + 1) * pageSize));
	const canApply = (item) => item.state === 'new' || (item.state === 'changed' && !item.has_japanese && (!item.gacha_reuse || item.gacha_reuse.exact));
	const eligible = $derived(inGroups.filter((item) => canApply(item) && selectedIds.has(item.id)));
	const allVisibleSelected = $derived(visible.some(canApply) && visible.filter(canApply).every((item) => selectedIds.has(item.id)));

	async function request(action, extra = {}) {
		const response = await fetch('/api/admin/prefill-dictionary', {
			method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
			body: JSON.stringify({ action, nickname: user.nickname, pin: user.pin, ...extra })
		});
		if (!response.ok) {
			const data = await response.json().catch(() => ({}));
			const failure = new Error(data.error || `HTTP ${response.status}`);
			failure.status = response.status;
			throw failure;
		}
		return response;
	}

	async function loadPreview() {
		working = 'loading';
		error = '';
		try {
			const data = await (await request('preview', { groups: groups.map((group) => group.key) })).json();
			items = data.items.map((item) => ({ ...item,
				diff: item.state === 'changed' ? translationDiff(item.existing, item.translation) : null }));
			dictionaryHash = data.dictionary_hash;
			selectedIds = new Set();
			needsRefresh = false;
			loaded = true;
			page = 0;
		} catch (failure) {
			if (failure.name !== 'AbortError') error = failure.message;
			needsRefresh = true;
		} finally { working = ''; }
	}

	function editUnit(item, unit = item.units[0], keepMode = false) {
		if (working || !unit) return;
		if (editing && editing.draft !== editing.original && !confirm('수정 중인 내용을 취소할까요?')) return;
		editing = { itemId: item.id, unitId: unit.unit_id, revision: unit.revision,
			original: unit.translation_text, draft: unit.translation_text };
		if (!keepMode) editAll = true;
		editError = '';
		savedNotice = '';
	}

	async function saveTranslation() {
		if (!editing || working) return;
		const item = items.find(item => item.id === editing.itemId);
		const batch = editAll && item.units.length > 1;
		if (batch && !confirm(`같은 원문 ${item.units.length}건을 이 번역으로 통일할까요? 기존 번역도 덮어씁니다.`)) return;
		working = 'translation';
		editError = '';
		try {
			const response = await fetch(batch ? '/api/unit-batch' : '/api/unit', {
				method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
				body: JSON.stringify({ ...(batch ? { units: item.units.map(unit => ({ unit_id: unit.unit_id, revision: unit.revision })) } : { unit_id: editing.unitId, expected_revision: editing.revision }),
					translation_text: editing.draft, nickname: user.nickname, pin: user.pin })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
			editing = null;
			savedNotice = batch ? `DB 번역 ${data.count}건이 변경되었습니다.` : 'DB 번역이 저장되었습니다.';
			await loadPreview();
		} catch (failure) {
			if (failure.name !== 'AbortError') editError = failure.message;
		} finally { working = ''; }
	}

	function select(id, checked) {
		const next = new Set(selectedIds);
		if (checked) next.add(id); else next.delete(id);
		selectedIds = next;
	}

	function selectVisible(checked) {
		const next = new Set(selectedIds);
		for (const item of visible.filter(canApply)) { if (checked) next.add(item.id); else next.delete(item.id); }
		selectedIds = next;
	}

	async function save() {
		if (working || needsRefresh || !eligible.length) return;
		const updates = eligible.filter(item => item.state === 'changed').length;
		if (updates && !confirm(`선택한 기존 사전 ${updates}건을 DB 번역으로 갱신할까요? 저장 전 백업을 남깁니다.`)) return;
		working = 'saving';
		error = '';
		try {
			result = await (await request('apply', { groups: selectedGroups, ids: eligible.map((item) => item.id), dictionary_hash: dictionaryHash, allow_updates: updates > 0 })).json();
			await loadPreview();
		} catch (failure) {
			if (failure.name !== 'AbortError') error = failure.message;
			needsRefresh = true;
		} finally { working = ''; }
	}

	async function download() {
		working = 'downloading';
		error = '';
		try {
			const blob = await (await request('download')).blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'prefill_dictionary.json';
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 30_000);
		} catch (failure) { if (failure.name !== 'AbortError') error = failure.message; }
		finally { working = ''; }
	}

	function closeDialog() {
		if (working === 'saving' || working === 'translation') return;
		if (editing && editing.draft !== editing.original && !confirm('수정 중인 내용을 취소하고 닫을까요?')) return;
		dialog.close();
	}

	function backdropClick(event) {
		if (event.target !== dialog) return;
		const bounds = dialog.getBoundingClientRect();
		if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
	}

	onMount(() => {
		controller = new AbortController();
		dialog.showModal();
		void loadPreview();
		return () => controller.abort();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} class="dictionary-dialog" aria-labelledby="dictionary-title" onclose={onclose}
	onclick={backdropClick} oncancel={(event) => { event.preventDefault(); closeDialog(); }}>
	<div class="dictionary-layout">
		<header>
			<div class="dictionary-heading"><h2 id="dictionary-title">사전 관리</h2><code>prefill_dictionary.json</code></div>
			<div class="dictionary-actions">
				<button class="soft" disabled={Boolean(working)} onclick={() => {
					if (editing && editing.draft !== editing.original && !confirm('수정 중인 내용을 취소하고 다시 조회할까요?')) return;
					editing = null; void loadPreview();
				}}>{working === 'loading' ? '조회 중...' : '다시 조회'}</button>
				<button class="soft" disabled={Boolean(working)} onclick={download}>{working === 'downloading' ? '다운로드 중...' : 'JSON 다운로드'}</button>
				<button class="soft" disabled={working === 'saving' || working === 'translation'} onclick={closeDialog}>닫기</button>
			</div>
		</header>
		<div class="dictionary-controls">
			<fieldset disabled={Boolean(working)}>
				<legend>분류</legend>
				{#each groups as group}
					<label><input type="checkbox" value={group.key} bind:group={selectedGroups} onchange={() => page = 0} />{group.label}<code>{group.key}</code></label>
				{/each}
			</fieldset>
			<div class="dictionary-filters" role="tablist" aria-label="사전 비교 결과">
				{#each states as entry}
					<button type="button" role="tab" aria-selected={state === entry.key} class:active={state === entry.key}
						onclick={() => { state = entry.key; page = 0; }}>{entry.label}<span>{counts[entry.key]}</span></button>
				{/each}
			</div>
			<div class="dictionary-search">
				<input type="search" aria-label="사전 항목 검색" placeholder="원문 · 번역 검색" bind:value={search} oninput={() => page = 0} />
				{#if state === 'new' || state === 'changed'}
					<label><input type="checkbox" checked={allVisibleSelected} disabled={Boolean(working) || needsRefresh || !visible.length}
						onchange={(event) => selectVisible(event.currentTarget.checked)} />검색 결과 전체 선택</label>
				{/if}
				<span class="dictionary-total">{visible.length}개</span>
			</div>
		</div>
		{#if error}<div class="dictionary-error" role="alert">{error}</div>{/if}
		{#if savedNotice}<div class="dictionary-result" role="status">{savedNotice}</div>{/if}
		{#if result}
			<div class="dictionary-result" role="status">
				<strong>사전 {result.added}개 추가 · {result.updated ?? 0}개 갱신됨</strong>
				{#if result.skipped}<span>DB 변경 등으로 {result.skipped}개 제외됨</span>{/if}
				<small>백업: {result.backup}</small>
				<details><summary>추가 내역</summary>
					{#each result.added_items as item}<div><code>{item.group}</code><span>{item.original}</span><strong>{item.translation}</strong></div>{/each}
				</details>
			</div>
		{/if}
		<div class="dictionary-list" aria-busy={working === 'loading'}>
			{#if working === 'loading'}<p class="dictionary-empty">최신 DB와 사전을 비교하는 중...</p>
			{:else if !loaded}<p class="dictionary-empty">사전 비교 결과를 불러오지 못했습니다.</p>
			{:else if !pageItems.length}<p class="dictionary-empty">해당 항목이 없습니다.</p>
			{:else}
				<div class="dictionary-columns" aria-hidden="true"><span>원문</span><span>현재 사전</span><span>DB 번역</span></div>
				{#each pageItems as item (item.id)}
					<article class="dictionary-entry" class:entry-selected={selectedIds.has(item.id) && canApply(item)}>
						<div class="dictionary-original">
							<div class="dictionary-source">
								{#if canApply(item)}<input type="checkbox" aria-label={`${item.original} 사전 반영 선택`} checked={selectedIds.has(item.id)}
									disabled={Boolean(working) || needsRefresh} onchange={(event) => select(item.id, event.currentTarget.checked)} />{/if}
								<code>{item.group}</code><small title={item.records.join(', ')}>DB {item.source_count}건</small>
							</div>
							<p>{item.original}</p>
							{#if item.gacha_reuse}
								<small>아이템 {item.gacha_reuse.count}건에서 재사용</small>
								{#if !item.gacha_reuse.exact}<small class="dictionary-caution">공백·개행 차이 확인 필요</small>{/if}
							{/if}
							{#if item.blank_count}<small>미번역 {item.blank_count}건 포함</small>{/if}
							<details class="dictionary-unit-links"><summary>번역 바로가기 {item.units?.length ?? 0}건</summary>
							{#each item.units ?? [] as unit (unit.unit_id)}
								<a class="dictionary-unit-link" href={unitHref(unit)} onclick={(event) => onopenunit(event, unit)}
									title={`${unit.record_id} 번역하기`}>번역하기 · {unit.record_id}</a>
							{/each}
							</details>
						</div>
						<div class="dictionary-current"><span class="mobile-column-label">현재 사전</span>
							{#if item.diff}<p>{#each item.diff.oldSegments as segment}{#if segment.changed}<mark class="removed">{segment.text}</mark>{:else}{segment.text}{/if}{/each}</p>
							{:else if item.existing !== null}<p>{item.existing}</p>{:else}<span class="dictionary-muted">미등록</span>{/if}
						</div>
						<div class="dictionary-proposed"><span class="mobile-column-label">DB 번역</span>
							{#if editing?.itemId === item.id}
								<div class="dictionary-editor">
									{#if item.units.length > 1}
										<label><input type="checkbox" bind:checked={editAll} disabled={Boolean(working)} />같은 원문 {item.units.length}건에 적용</label>
										{#if !editAll}
										<select aria-label="수정할 DB 항목" value={editing.unitId} disabled={Boolean(working)}
											onchange={(event) => editUnit(item, item.units.find(unit => unit.unit_id === event.currentTarget.value), true)}>
											{#each item.units as unit}<option value={unit.unit_id}>{unit.record_id}</option>{/each}
										</select>
										{/if}
									{/if}
									<textarea aria-label={`${item.original} DB 번역 수정`} rows="3" bind:value={editing.draft} disabled={Boolean(working)}></textarea>
									{#if editError}<small class="dictionary-edit-error" role="alert">{editError}</small>{/if}
									<div class="dictionary-actions">
										<button class="save-all" disabled={Boolean(working) || (editAll ? item.units.every(unit => unit.translation_text === editing.draft) : editing.draft === editing.original)} onclick={saveTranslation}>{working === 'translation' ? '저장 중...' : editAll && item.units.length > 1 ? `${item.units.length}건 번역 저장` : '번역 저장'}</button>
										<button class="soft" disabled={Boolean(working)} onclick={() => editing = null}>취소</button>
									</div>
								</div>
							{:else}
							<button class="dictionary-edit-trigger" title="DB 번역 수정" aria-label={`${item.original} DB 번역 수정`} disabled={Boolean(working)} onclick={() => editUnit(item)}>
							{#if item.diff}<p>{#each item.diff.newSegments as segment}{#if segment.changed}<mark class="added">{segment.text}</mark>{:else}{segment.text}{/if}{/each}</p>
							{:else if !item.variants.length}<span class="dictionary-muted">미번역</span>
							{:else}{#each item.variants as variant}<div class="dictionary-variant"><p>{variant.text}</p>
								{#if item.variants.length > 1}<small>{variant.count}건{variant.authors.length ? ` · ${variant.authors.join(', ')}` : ''}</small>{/if}
							</div>{/each}{/if}
							</button>
							{/if}
							{#if item.has_japanese && item.state !== 'unchanged'}<small class="dictionary-caution">일본어 문자 포함</small>{/if}
							{#each item.shared_differences as shared}<small class="dictionary-caution">다른 사전 {shared.group}: {shared.translation}</small>{/each}
						</div>
					</article>
				{/each}
			{/if}
		</div>
		<footer>
			<div class="dictionary-pagination">
				<button class="soft" aria-label="이전 페이지" disabled={page === 0 || Boolean(working)} onclick={() => page--}>이전</button>
				<span>{Math.min(page + 1, pages)} / {pages}</span>
				<button class="soft" aria-label="다음 페이지" disabled={page + 1 >= pages || Boolean(working)} onclick={() => page++}>다음</button>
			</div>
			<div class="dictionary-save">
				<small>사전 반영: 사전 파일만 변경 · 다음 임포트부터 반영</small>
				<button class="soft" disabled={!selectedIds.size || Boolean(working)} onclick={() => selectedIds = new Set()}>선택 해제</button>
				<button class="save-all" disabled={!eligible.length || needsRefresh || Boolean(working)} onclick={save}>
					{working === 'saving' ? '저장 중...' : `선택 ${eligible.length}개 사전 반영`}
				</button>
			</div>
		</footer>
	</div>
</dialog>

<style>
	.dictionary-dialog { width: min(1180px, calc(100vw - 40px)); height: min(820px, calc(100dvh - 48px)); max-width: none; max-height: none; padding: 0; border: 1px solid var(--border-strong); border-radius: 8px; color: var(--text); background: var(--panel); }
	.dictionary-dialog::backdrop { background: #0009; }
	.dictionary-layout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
	header, footer { display: flex; flex: none; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 16px 20px; }
	header { border-bottom: 1px solid var(--border); }
	h2 { margin: 0; color: var(--text-strong); font-size: 18px; }
	.dictionary-heading, .dictionary-actions, .dictionary-pagination, .dictionary-save { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
	.dictionary-heading { gap: 14px; }
	code { font-size: 11px; color: var(--accent-text); overflow-wrap: anywhere; }
	.dictionary-controls { flex: none; padding: 14px 20px 0; }
	fieldset { display: flex; flex-wrap: wrap; gap: 10px 20px; border: 0; padding: 0; margin: 0 0 14px; min-width: 0; }
	legend { float: left; margin-right: 20px; font-size: 12px; color: var(--muted); }
	label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-soft); }
	input[type="checkbox"] { width: 16px; height: 16px; flex: none; accent-color: var(--success); margin: 0; }
	.dictionary-filters { display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid var(--border); }
	.dictionary-filters button { border: 0; border-bottom: 2px solid transparent; padding: 10px; background: transparent; color: var(--muted); font-size: 12px; white-space: nowrap; }
	.dictionary-filters button.active { border-bottom-color: var(--success); color: var(--text-strong); }
	.dictionary-filters button span { display: inline-block; margin-left: 7px; font-variant-numeric: tabular-nums; color: var(--text-soft); }
	.dictionary-search { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 12px 0; }
	.dictionary-search input[type="search"] { flex: 1; width: 100%; min-width: 140px; max-width: 380px; height: 32px; border: 1px solid var(--border); border-radius: 5px; background: var(--field); color: var(--text); padding: 6px 10px; font-size: 12px; }
	.dictionary-total { margin-left: auto; color: var(--muted); font-size: 12px; }
	.dictionary-list { flex: 1; min-height: 80px; overflow: auto; overscroll-behavior: contain; padding: 0 20px; }
	.dictionary-columns, .dictionary-entry { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.3fr); gap: 20px; }
	.dictionary-columns { position: sticky; top: 0; z-index: 1; padding: 10px 12px; background: var(--panel-2); color: var(--muted); font-size: 11px; }
	.dictionary-entry { padding: 14px 12px; border-bottom: 1px solid var(--border-soft); font-size: 13px; }
	.dictionary-entry > div { min-width: 0; }
	.dictionary-entry p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; line-height: 1.65; }
	.dictionary-entry.entry-selected { background: color-mix(in srgb, var(--success) 5%, transparent); }
	.dictionary-source { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 5px; }
	.dictionary-original > p { color: var(--text-soft); }
	.dictionary-unit-link { display: block; width: fit-content; max-width: 100%; margin-top: 6px; color: var(--accent-text); font-size: 12px; overflow-wrap: anywhere; }
	.dictionary-unit-link:focus-visible { outline: 2px solid var(--accent-soft); outline-offset: 2px; }
	.dictionary-unit-links { margin-top: 6px; color: var(--muted); font-size: 11px; }
	.dictionary-unit-links summary { cursor: pointer; }
	.dictionary-unit-links[open] { max-height: 180px; overflow: auto; }
	.dictionary-current { color: var(--text-soft); }
	.dictionary-proposed { color: var(--text-strong); }
	.dictionary-edit-trigger { display: block; width: 100%; padding: 6px; margin: -6px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: text; }
	.dictionary-edit-trigger:hover { background: var(--panel-2); border-color: var(--border); }
	.dictionary-editor { display: grid; gap: 8px; }
	.dictionary-editor textarea, .dictionary-editor select { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 4px; padding: 8px; background: var(--field); color: var(--text); font: inherit; }
	.dictionary-editor textarea { resize: vertical; line-height: 1.65; }
	.dictionary-edit-error { color: var(--danger-text); }
	small { display: block; color: var(--muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
	.dictionary-variant + .dictionary-variant { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
	.dictionary-muted { color: var(--muted); font-size: 12px; }
	.dictionary-caution { color: var(--warning); margin-top: 6px; }
	mark { color: inherit; white-space: pre-wrap; }
	mark.added { background: color-mix(in srgb, var(--success) 25%, transparent); }
	mark.removed { background: color-mix(in srgb, #ed9b4c 30%, transparent); }
	.dictionary-error { padding: 10px 20px; background: var(--danger-bg); color: var(--danger-text); font-size: 12px; overflow-wrap: anywhere; }
	.dictionary-result { flex: none; max-height: 25dvh; overflow: auto; padding: 10px 20px; border-bottom: 1px solid var(--border); color: var(--success); font-size: 12px; }
	.dictionary-result > span { margin-left: 10px; color: var(--warning); }
	.dictionary-result summary { cursor: pointer; padding-top: 4px; color: var(--text-soft); }
	.dictionary-result details div { display: grid; grid-template-columns: 70px 1fr 1fr; gap: 12px; padding: 5px 0; color: var(--text-soft); overflow-wrap: anywhere; white-space: pre-wrap; }
	.dictionary-empty { padding: 50px 10px; text-align: center; color: var(--muted); font-size: 13px; }
	footer { border-top: 1px solid var(--border); padding-top: 12px; padding-bottom: 12px; }
	.dictionary-pagination { flex-wrap: nowrap; font-size: 12px; color: var(--text-soft); }
	.dictionary-pagination span { width: 62px; text-align: center; font-variant-numeric: tabular-nums; }
	.dictionary-save { justify-content: flex-end; }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-soft); outline-offset: 2px; }
	.mobile-column-label { display: none; }
	@media (max-width: 700px) {
		.dictionary-dialog { width: 100%; height: 100dvh; margin: 0; border: 0; border-radius: 0; }
		header, footer { padding: 12px; gap: 10px; }
		.dictionary-heading { width: 100%; }
		.dictionary-actions { width: 100%; justify-content: flex-end; }
		.dictionary-controls { padding: 12px 12px 0; }
		fieldset { gap: 12px; }
		fieldset code { display: none; }
		.dictionary-list { padding: 0 12px; }
		.dictionary-columns { display: none; }
		.dictionary-entry { grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 16px 4px; }
		.dictionary-current, .dictionary-proposed { padding-left: 12px; border-left: 2px solid var(--border); }
		.mobile-column-label { display: block; color: var(--muted); font-size: 11px; margin-bottom: 3px; }
		.dictionary-save { width: 100%; }
		.dictionary-save small { width: 100%; }
		.dictionary-result details div { grid-template-columns: minmax(0, 1fr); gap: 3px; }
	}
</style>
