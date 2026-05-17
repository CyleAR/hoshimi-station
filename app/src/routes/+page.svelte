<script>
	import { onMount } from 'svelte';

	const tabs = [
		{ key: 'groups', label: '그룹' },
		{ key: 'characters', label: '캐릭터' },
		{ key: 'stories', label: '스토리/ADV' },
		{ key: 'messages', label: '문자' },
		{ key: 'telephones', label: '전화' },
		{ key: 'home', label: '홈 대사' },
		{ key: 'cards', label: '카드' },
		{ key: 'masterdb', label: 'MasterDB' }
	];

	const typeNames = {
		group: '그룹',
		character: '캐릭터',
		card: '카드',
		card_evolution_message: '개화 대사',
		costume: '의상',
		skill: '스킬',
		live_ability: '라이브 능력',
		activity_ability: '업무 능력',
		story_part: '스토리 파트',
		story_collection: '스토리 묶음',
		story: '스토리',
		love: '모시코이 스토리',
		message_group: '메시지 그룹',
		message: '문자',
		telephone: '전화',
		home_talk: '홈 대사',
		call_pattern: '접속 대사',
		adv_file: 'ADV 파일',
		search: '검색',
		category: '카테고리'
	};

	const relationNames = {
		member: '멤버',
		has_card: '카드',
		has_costume: '의상',
		has_message: '문자',
		has_telephone: '전화',
		has_home_talk: '홈 대사',
		has_adv: 'ADV',
		card_story: '카드 스토리',
		card_message: '카드 문자',
		card_telephone: '카드 전화',
		card_home_talk: '카드 홈 대사',
		evolution_message: '개화 대사',
		reward_costume: '보상 의상',
		skillId1: '스킬 1',
		skillId2: '스킬 2',
		skillId3: '스킬 3',
		skillId4: '스킬 4',
		liveAbilityId: '라이브 능력',
		activityAbilityId: '업무 능력',
		episode: '에피소드',
		episode_adv: '에피소드 ADV',
		chapter_episode: '챕터 에피소드',
		chapter_adv: '챕터 ADV',
		uses_adv: '사용 ADV',
		choice_adv: '선택지 ADV',
		message_group: '메시지 그룹',
		in_group: '소속 그룹'
	};

	const fieldNames = {
		name: '이름',
		description: '설명',
		obtainMessage: '획득 메시지',
		evolveMessage: '진화 메시지',
		title: '제목',
		text: '대사',
		choiceText: '선택지',
		managerText: '매니저 대사',
		displayConditionDescription: '표시 조건',
		branchFirstText: '분기 안내',
		branchCautionText: '분기 주의문',
		profile: '프로필',
		shortProfile: '짧은 프로필',
		catchphrase: '캐치프레이즈',
		favorite: '좋아하는 것',
		unfavorite: '싫어하는 것',
		hometown: '출신/학교',
		cv: '성우',
		age: '나이',
		birthday: '생일',
		zodiacSign: '별자리',
		firstName: '이름',
		groupName: '그룹명',
		idiom: '격언'
	};

	const categoryNames = {
		Card: '카드 정보',
		Costume: '의상',
		Skill: '스킬',
		LiveAbility: '라이브 능력',
		ActivityAbility: '업무 능력',
		Story: '스토리 정보',
		StoryPart: '스토리 파트',
		EventStory: '이벤트 스토리',
		ExtraStory: '엑스트라 스토리',
		Message: '문자',
		MessageGroup: '메시지 그룹',
		Telephone: '전화',
		HomeTalk: '홈 대사',
		HomeTalkCallPattern: '접속 대사',
		CardEvolutionMessage: '개화 대사',
		Character: '캐릭터 프로필',
		CharacterGroup: '그룹 정보'
	};

	let section = $state('groups');
	let query = $state('');
	let items = $state([]);
	let groups = $state([]);
	let summary = $state(null);
	let selected = $state(null);
	let detail = $state(null);
	let activeSection = $state(null);
	let units = $state([]);
	let loadingItems = $state(true);
	let loadingDetail = $state(false);
	let loadingUnits = $state(false);
	let error = $state('');
	let notice = $state('');
	let navStack = $state([]);
	let searchTimer;

	async function fetchJson(url, options = {}) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch(url, { ...options, signal: controller.signal });
			const data = await response.json();
			if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
			return data;
		} catch (err) {
			if (err.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다. 서버 상태를 확인해 주세요.');
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}

	async function loadSummary() {
		summary = await fetchJson('/api/summary');
	}

	async function loadItems({ keepSelection = false } = {}) {
		loadingItems = true;
		error = '';
		try {
			const params = new URLSearchParams({ section });
			if (query.trim()) params.set('q', query.trim());
			const data = await fetchJson(`/api/items?${params}`);
			items = data.items ?? [];
			groups = data.groups ?? [];
			if (!keepSelection || !selected || !items.some((item) => item.id === selected.id && item.type === selected.type)) {
				await selectItem(items[0] ?? null);
			}
		} catch (err) {
			error = err.message;
			items = [];
		} finally {
			loadingItems = false;
		}
	}

	async function selectItem(item, preferredKey = '') {
		selected = item;
		detail = null;
		activeSection = null;
		units = [];
		notice = '';
		if (!item) return;
		loadingDetail = true;
		error = '';
		try {
			detail = await fetchJson(`/api/detail?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`);
			activeSection = detail.sections?.find((part) => part.key === preferredKey) ?? detail.sections?.[0] ?? null;
			if (activeSection) await loadUnits(activeSection);
		} catch (err) {
			error = err.message;
		} finally {
			loadingDetail = false;
		}
	}

	async function selectRootItem(item) {
		navStack = [];
		await selectItem(item);
	}

	function currentNavEntry() {
		if (!selected) return null;
		return {
			item: {
				type: selected.type,
				id: selected.id,
				label: detail?.entity?.label ?? selected.label,
				subtitle: detail?.entity?.subtitle || selected.subtitle
			},
			sectionKey: activeSection?.key ?? ''
		};
	}

	async function navigateToItem(item, preferredKey = '') {
		const previous = currentNavEntry();
		if (previous && (previous.item.type !== item.type || previous.item.id !== item.id)) {
			navStack = [...navStack, previous].slice(-20);
		}
		await selectItem(item, preferredKey);
	}

	async function goBack() {
		const previous = navStack.at(-1);
		if (!previous) return;
		navStack = navStack.slice(0, -1);
		await selectItem(previous.item, previous.sectionKey);
	}

	async function openUnitEntity(group, preferredKey = '') {
		if (!group.scope_type || !group.scope_id || group.scope_type === 'category') return;
		await navigateToItem(
			{
				type: group.scope_type,
				id: group.scope_id,
				label: group.title,
				subtitle: group.subtitle
			},
			preferredKey
		);
	}

	async function loadUnits(part) {
		activeSection = part;
		loadingUnits = true;
		error = '';
		try {
			const params = new URLSearchParams({
				type: selected?.type ?? 'category',
				id: selected?.id ?? '',
				key: part.key
			});
			if (part.category) params.set('category', part.category);
			const data = await fetchJson(`/api/units?${params}`);
			units = (data.units ?? []).map((unit) => ({
				...unit,
				draft: unit.translation_text ?? '',
				dirty: false,
				saving: false,
				error: ''
			}));
		} catch (err) {
			error = err.message;
			units = [];
		} finally {
			loadingUnits = false;
		}
	}

	async function saveUnit(unit) {
		const missing = missingPlaceholders(unit.original_text, unit.draft);
		if (missing.length && unit.draft.trim()) {
			const ok = confirm(`원문에 있는 placeholder가 번역문에 없습니다: ${missing.join(', ')}\n그래도 저장할까요?`);
			if (!ok) {
				unit.error = `placeholder 누락: ${missing.join(', ')}`;
				return;
			}
		}
		unit.saving = true;
		unit.error = '';
		notice = '';
		try {
			const data = await fetchJson('/api/unit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ unit_id: unit.unit_id, translation_text: unit.draft })
			});
			unit.translation_text = unit.draft;
			unit.status = data.status;
			unit.dirty = false;
			notice = '저장되었습니다.';
			await loadSummary();
		} catch (err) {
			unit.error = err.message;
		} finally {
			unit.saving = false;
		}
	}

	function placeholders(text) {
		return [...new Set(String(text ?? '').match(/\{[A-Za-z0-9_]+\}/g) ?? [])];
	}

	function missingPlaceholders(original, draft) {
		const translated = String(draft ?? '');
		return placeholders(original).filter((placeholder) => !translated.includes(placeholder));
	}

	function progress(done, total) {
		return total ? Math.round((Number(done ?? 0) / Number(total)) * 100) : 0;
	}

	function changeSection(next) {
		section = next;
		navStack = [];
		loadItems();
	}

	function queueSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => loadItems(), 250);
	}

	function retry() {
		if (selected) selectItem(selected);
		else loadItems();
	}

	function handleKeydown(event) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			document.querySelector('#global-search')?.focus();
		}
	}

	function selectedTitle() {
		return detail?.entity?.label ?? selected?.label ?? '선택한 항목 없음';
	}

	function selectedSubtitle() {
		return detail?.entity?.subtitle || selected?.subtitle || selected?.id || '';
	}

	function metaLine(item) {
		const type = typeNames[item.type] ?? item.type;
		const total = Number(item.total ?? 0);
		return `${type} · ${item.subtitle || item.id} · ${total.toLocaleString()}개`;
	}

	function fieldLabel(path) {
		const clean = String(path ?? '').replace(/\[[^\]]+\]/g, '').split('.').pop();
		return fieldNames[clean] ?? clean ?? path;
	}

	function groupTitle(unit) {
		if (shouldGroupByOwner() && unit.scope_label) return unit.scope_label;
		if (unit.source_type === 'adv') return unit.source_file;
		return categoryNames[unit.category] ?? unit.category;
	}

	function groupSubtitle(unit) {
		if (shouldGroupByOwner()) {
			const type = typeNames[unit.scope_type] ?? unit.scope_type;
			return `${type} · ${unit.scope_subtitle || unit.scope_id}`;
		}
		if (unit.source_type === 'adv') return `${unit.category} · ${unit.record_id}`;
		return `${unit.source_file} · ${unit.record_id}`;
	}

	function unitTitle(unit) {
		if (unit.source_type === 'adv') {
			const speaker = unit.speaker && !unit.speaker.startsWith('__') ? `${unit.speaker} · ` : '';
			return `${speaker}${unit.field_path}${unit.line_no ? ` · line ${unit.line_no}` : ''}`;
		}
		return fieldLabel(unit.field_path);
	}

	function unitCode(unit) {
		if (unit.source_type === 'adv') return `${unit.source_file} · ${unit.field_path}`;
		return unit.field_path;
	}

	function isManagerUnit(unit) {
		return unit.speaker === '{user}' || String(unit.field_path ?? '').split('.').includes('managerText');
	}

	function untranslatedCount() {
		return units.filter((unit) => !String(unit.translation_text ?? '').trim()).length;
	}

	function scrollToNextUntranslated() {
		const target = document.querySelector('.unit-card.untranslated');
		target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function displayText(text) {
		return String(text ?? '').replace(/\r\n/g, '\\n').replace(/\n/g, '\\n');
	}

	function shouldGroupByOwner() {
		const ownerGroupedKeys = [
			'members',
			'cards',
			'common_messages',
			'common_home_talks',
			'common_telephones',
			'call_patterns',
			'stories',
			'card_messages',
			'card_home_talks',
			'card_telephones',
			'skills',
			'costumes',
			'evolution',
			'group_messages',
			'group_telephones',
			'adv_card',
			'adv_bond',
			'adv_hbd',
			'adv_love',
			'adv_userhbd',
			'adv_group'
		];
		return ownerGroupedKeys.includes(activeSection?.key) || (selected?.type === 'character' && activeSection?.key === 'adv');
	}

	function ownerGroupKey(unit) {
		if (!shouldGroupByOwner()) {
			return unit.source_type === 'adv' ? `${unit.source_type}:${unit.source_file}` : `${unit.category}:${unit.record_id}`;
		}
		if (unit.source_type === 'adv' && unit.scope_type === 'character') {
			return `adv-common:${unit.scope_id}`;
		}
		if (unit.owner_type && unit.owner_id) {
			return `${unit.owner_type}:${unit.owner_id}`;
		}
		if (unit.scope_type && unit.scope_id) {
			return `${unit.scope_type}:${unit.scope_id}`;
		}
		return unit.source_type === 'adv' ? `${unit.source_type}:${unit.source_file}` : `${unit.category}:${unit.record_id}`;
	}

	function ownerGroupTitle(unit) {
		if (shouldGroupByOwner() && unit.source_type === 'adv' && unit.scope_type === 'character') {
			return '캐릭터 공통 ADV';
		}
		if (shouldGroupByOwner() && unit.owner_label) return unit.owner_label;
		return groupTitle(unit);
	}

	function ownerGroupSubtitle(unit) {
		if (shouldGroupByOwner() && unit.source_type === 'adv' && unit.scope_type === 'character') {
			return `${unit.scope_label || selectedTitle()} · bond/hbd`;
		}
		if (shouldGroupByOwner() && unit.owner_type && unit.owner_id) {
			const type = typeNames[unit.owner_type] ?? unit.owner_type;
			return `${type} · ${unit.owner_subtitle || unit.owner_id}`;
		}
		return groupSubtitle(unit);
	}

	function unitGroups() {
		const map = new Map();
		for (const unit of units) {
			const key = ownerGroupKey(unit);
			if (!map.has(key)) {
				map.set(key, {
					key,
					title: ownerGroupTitle(unit),
					subtitle: ownerGroupSubtitle(unit),
					source_type: unit.source_type,
					category: unit.category,
					scope_type: unit.owner_type ?? unit.scope_type,
					scope_id: unit.owner_id ?? unit.scope_id,
					units: []
				});
			}
			map.get(key).units.push(unit);
		}
		return [...map.values()];
	}

	function canOpenEntity(group) {
		return group.scope_type && group.scope_id && !['category', 'adv_file'].includes(group.scope_type);
	}

	function canOpenAdv(group) {
		return ['story', 'story_collection', 'story_part', 'love', 'card'].includes(group.scope_type);
	}

	function entityButtonLabel(group) {
		const name = typeNames[group.scope_type] ?? '항목';
		return `${name} 열기`;
	}

	function linkGroups() {
		const map = new Map();
		for (const link of detail?.links ?? []) {
			const relation = relationNames[link.relation] ?? relationNames[link.type] ?? typeNames[link.type] ?? link.relation;
			const key = `${relation}:${link.type}`;
			if (!map.has(key)) {
				map.set(key, {
					key,
					title: relation,
					type: typeNames[link.type] ?? link.type,
					links: []
				});
			}
			map.get(key).links.push(link);
		}
		return [...map.values()];
	}

	onMount(() => {
		loadSummary().catch((err) => (error = err.message));
		loadItems();
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>HoshimiStation Translate</title>
</svelte:head>

<div class="shell">
	<header class="topbar">
		<div class="brand">
			<span class="brand-icon">★</span>
			<span>HoshimiStation</span>
		</div>
		<label class="search">
			<span>🔍</span>
			<input id="global-search" bind:value={query} oninput={queueSearch} placeholder="ID / 원문 / 번역 검색... (Ctrl+K)" />
		</label>
		<div class="top-actions">
			{#if summary}
				<span class="summary-pill">{summary.done ?? 0}/{summary.units ?? 0}</span>
			{/if}
		</div>
	</header>

	<div class="workspace">
		<aside class="nav-pane">
			<div class="pane-title">
				<span>{tabs.find((tab) => tab.key === section)?.label ?? '항목'} 목록</span>
				<span>{items.length}</span>
			</div>

			<nav class="tabs">
				{#each tabs as tab}
					<button class:active={section === tab.key} onclick={() => changeSection(tab.key)}>{tab.label}</button>
				{/each}
			</nav>

			{#if section === 'characters' || section === 'cards'}
				<div class="chips">
					{#each groups as group}
						<button onclick={() => selectRootItem(group)}>{group.label}</button>
					{/each}
				</div>
			{/if}

			<div class="scroll-list">
				{#if loadingItems}
					<div class="state-card">목록을 불러오는 중...</div>
				{:else if !items.length}
					<div class="state-card">표시할 항목이 없습니다.</div>
				{:else}
					{#each items as item}
						<button class="item-card" class:selected={selected?.id === item.id && selected?.type === item.type} onclick={() => selectRootItem(item)}>
							<span class="type-badge">{typeNames[item.type] ?? item.type}</span>
							<span class="item-main">
								<strong>{item.label}</strong>
								{#if item.translated_label}
									<small class="translated-name">{item.translated_label}</small>
								{/if}
								<small>{metaLine(item)}</small>
								<i><b style={`width:${progress(item.done, item.total)}%`}></b></i>
							</span>
						</button>
					{/each}
				{/if}
			</div>
		</aside>

		<aside class="related-pane">
			<div class="pane-title">
				<span>작업 묶음</span>
				<span>{detail?.sections?.length ?? 0}</span>
			</div>
			<div class="section-list">
				{#if loadingDetail}
					<div class="state-card">연결 구조를 읽는 중...</div>
				{:else if detail?.sections?.length}
					{#each detail.sections as part}
						<button class="section-row" class:active={activeSection?.key === part.key} onclick={() => loadUnits(part)}>
							<span>{part.icon}</span>
							<strong>{part.label}</strong>
							<em>{part.done}/{part.total}</em>
						</button>
					{/each}
				{:else}
					<div class="state-card">선택한 항목에 번역 단위가 없습니다.</div>
				{/if}
			</div>
			{#if detail?.links?.length}
				<div class="link-list">
					<div class="pane-title compact">연결 항목 <span>{detail.links.length}</span></div>
					{#each linkGroups() as group}
						<section class="link-group">
							<header>
								<strong>{group.title}</strong>
								<span>{group.type} · {group.links.length}</span>
							</header>
							{#each group.links.slice(0, 8) as link}
								<button class="mini-link" onclick={() => navigateToItem(link)}>
									<span>{typeNames[link.type] ?? link.type}</span>
									<strong>
										{link.label}
										{#if link.translated_label}
											<small>{link.translated_label}</small>
										{/if}
									</strong>
								</button>
							{/each}
							{#if group.links.length > 8}
								<div class="more-line">외 {group.links.length - 8}개</div>
							{/if}
						</section>
					{/each}
				</div>
			{/if}
		</aside>

		<main class="editor-pane">
			<div class="editor-head">
				<div>
					<h1>{activeSection?.icon ?? '✦'} {activeSection?.label ?? '번역'}</h1>
					<p>{selectedTitle()} <span>{selectedSubtitle()}</span></p>
				</div>
				<div class="editor-actions">
					{#if notice}<span class="notice">{notice}</span>{/if}
					{#if navStack.length}
						<button class="soft" onclick={goBack}>이전 항목</button>
					{/if}
					<button class="soft" onclick={retry}>새로고침</button>
					{#if untranslatedCount()}
						<button class="soft jump" onclick={scrollToNextUntranslated}>미번역 {untranslatedCount()}</button>
					{/if}
					<button class="save-all" onclick={() => Promise.all(units.filter((unit) => unit.dirty).map(saveUnit))}>일괄 저장</button>
				</div>
			</div>

			{#if error}
				<section class="error-box">
					<strong>오류가 발생했습니다.</strong>
					<p>{error}</p>
					<button onclick={retry}>다시 시도</button>
				</section>
			{:else if loadingUnits}
				<section class="state-card large">번역 단위를 불러오는 중...</section>
			{:else if !units.length}
				<section class="state-card large">이 묶음에는 번역 단위가 없습니다.</section>
			{:else}
				<div class="group-stack">
					{#each unitGroups() as group}
						<section class="unit-group">
							<header class="group-head">
								<div>
									<strong>{group.title}</strong>
									<code>{group.subtitle}</code>
								</div>
								<div class="group-actions">
									{#if canOpenEntity(group)}
										<button onclick={() => openUnitEntity(group)}>{entityButtonLabel(group)}</button>
									{/if}
									{#if canOpenAdv(group)}
										<button class="accent" onclick={() => openUnitEntity(group, 'adv')}>ADV 본문</button>
									{/if}
									<span>{group.units.length}</span>
								</div>
							</header>
							<div class="unit-stack">
								{#each group.units as unit}
									<article class="unit-card" class:manager={isManagerUnit(unit)} class:untranslated={!String(unit.translation_text ?? '').trim()}>
										<header>
											<strong>
												{#if isManagerUnit(unit)}
													<span class="speaker-chip">매니저</span>
												{/if}
												{unitTitle(unit)}
											</strong>
											<code>{unitCode(unit)}</code>
										</header>
										<div class="row">
											<div class="row-label">원문</div>
											<p class="original escaped">{displayText(unit.original_text)}</p>
										</div>
										<div class="row current">
											<div class="row-label">현재</div>
											<p class="escaped">{unit.translation_text ? displayText(unit.translation_text) : '(미번역)'}</p>
										</div>
										<div class="row">
											<div class="row-label">번역</div>
											<textarea
												bind:value={unit.draft}
												oninput={() => {
													unit.dirty = unit.draft !== unit.translation_text;
													unit.error = '';
												}}
												placeholder="번역을 입력하세요..."
											></textarea>
										</div>
										<footer>
											<span class:dirty={unit.dirty}>{unit.error || (unit.dirty ? '저장 필요' : unit.status)}</span>
											<button onclick={() => saveUnit(unit)} disabled={unit.saving}>{unit.saving ? '저장 중...' : '저장'}</button>
										</footer>
									</article>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		</main>
	</div>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		background: #070c15;
		color: #e8eefc;
		font-family:
			Inter, 'Noto Sans KR', 'Noto Sans JP', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		overflow: hidden;
	}
	button,
	input,
	textarea {
		font: inherit;
	}
	button {
		cursor: pointer;
	}
	.shell {
		height: 100vh;
		display: grid;
		grid-template-rows: 56px 1fr;
		background:
			linear-gradient(180deg, rgba(48, 111, 232, 0.18), transparent 90px),
			#070c15;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 0 16px;
		background: #101827;
		border-bottom: 1px solid #24334f;
		box-shadow: 0 0 28px rgba(45, 114, 255, 0.18);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 800;
		min-width: 150px;
	}
	.brand-icon {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		background: #2f6ee9;
		color: #ffd24a;
	}
	.search {
		width: min(430px, 36vw);
		height: 34px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		background: #0a111f;
		border: 1px solid #294166;
		border-radius: 7px;
		color: #6da2ff;
	}
	.search input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: #d9e7ff;
	}
	.top-actions,
	.editor-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.summary-pill,
	.notice {
		color: #8fb8ff;
		font-size: 12px;
	}
	.soft,
	.save-all {
		height: 30px;
		border: 1px solid #284065;
		border-radius: 8px;
		padding: 0 12px;
		background: #132039;
		color: #9dc0ff;
	}
	.save-all {
		background: #10b981;
		border-color: #10b981;
		color: #042016;
		font-weight: 800;
	}
	.jump {
		border-color: #7c5c24;
		background: #21180a;
		color: #ffd166;
	}
	.workspace {
		min-height: 0;
		display: grid;
		grid-template-columns: clamp(340px, 24vw, 420px) clamp(430px, 27vw, 520px) minmax(0, 1fr);
	}
	.nav-pane,
	.related-pane {
		min-height: 0;
		background: #101827;
		border-right: 1px solid #24334f;
		display: flex;
		flex-direction: column;
	}
	.related-pane {
		background: #182238;
	}
	.pane-title {
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 14px;
		color: #82b4ff;
		font-size: 12px;
		font-weight: 800;
	}
	.tabs,
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 6px 12px 10px;
		border-bottom: 1px solid #22314c;
	}
	.tabs button,
	.chips button {
		border: 1px solid #263b5d;
		border-radius: 999px;
		background: #0d1728;
		color: #78a4e8;
		padding: 4px 10px;
		font-size: 12px;
	}
	.tabs button.active,
	.chips button:hover {
		background: #2f70e7;
		color: white;
		border-color: #2f70e7;
	}
	.scroll-list {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		padding: 10px 8px 20px;
	}
	.section-list {
		flex: 0 0 48%;
		min-height: 280px;
		max-height: 54%;
		overflow: auto;
		padding: 10px 8px 20px;
		border-bottom: 1px solid #22314c;
	}
	.link-list {
		flex: 1 1 0;
		min-height: 120px;
		overflow: auto;
		padding: 0 10px 16px;
	}
	.pane-title.compact {
		min-height: 34px;
		padding: 0 4px;
	}
	.item-card {
		width: 100%;
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: 10px;
		align-items: center;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: #e8eefc;
		text-align: left;
		padding: 10px 12px;
	}
	.item-card:hover,
	.item-card.selected {
		background: #223554;
		border-color: #4773b8;
	}
	.type-badge {
		min-width: 0;
		border-radius: 6px;
		background: #162641;
		color: #8fb8ff;
		padding: 4px 6px;
		font-size: 11px;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.item-main {
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.item-main strong,
	.item-main small,
	.mini-link span,
	.mini-link strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-main strong {
		font-size: 14px;
	}
	.item-main small {
		color: #6f8bb7;
		font-size: 12px;
	}
	.item-main small.translated-name {
		color: #b8d4ff;
		font-weight: 700;
	}
	.item-main i {
		height: 3px;
		background: #0b1322;
		border-radius: 99px;
		overflow: hidden;
	}
	.item-main b {
		display: block;
		height: 100%;
		background: #2fe4a8;
	}
	.section-row {
		width: 100%;
		display: grid;
		grid-template-columns: 28px 1fr auto;
		align-items: center;
		gap: 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #b6c5dd;
		text-align: left;
		padding: 11px 12px;
	}
	.section-row:hover,
	.section-row.active {
		background: #263a5d;
		color: white;
	}
	.section-row em {
		font-style: normal;
		color: #7fa8e8;
		font-size: 12px;
	}
	.link-group {
		border-top: 1px solid #22314c;
		padding: 10px 0;
	}
	.link-group header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px 6px;
		color: #d8e6ff;
		font-size: 12px;
	}
	.link-group header span,
	.more-line {
		color: #6f8bb7;
		font-size: 11px;
	}
	.mini-link {
		width: 100%;
		display: grid;
		grid-template-columns: 82px 1fr;
		gap: 8px;
		align-items: center;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: #aebbd2;
		text-align: left;
		padding: 7px 8px;
	}
	.mini-link:hover {
		background: #223554;
	}
	.mini-link span {
		color: #7192c4;
		font-size: 11px;
	}
	.mini-link strong {
		min-width: 0;
		display: grid;
		gap: 3px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		user-select: text;
	}
	.mini-link small {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #b8d4ff;
		font-size: 11px;
		font-weight: 700;
		user-select: text;
	}
	.more-line {
		padding: 5px 8px 0;
	}
	.editor-pane {
		min-height: 0;
		overflow: auto;
		padding: 16px 22px;
		background: #080d16;
	}
	.editor-head {
		position: sticky;
		top: -16px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 0 16px;
		background: #080d16;
	}
	.editor-head h1 {
		margin: 0;
		font-size: 16px;
	}
	.editor-head p {
		margin: 5px 0 0;
		color: #8ea1c2;
		font-size: 12px;
	}
	.editor-head span {
		color: #5f7ba9;
	}
	.state-card,
	.error-box {
		border: 1px solid #24334f;
		border-radius: 8px;
		background: #111b2d;
		color: #98abc9;
		padding: 14px;
	}
	.state-card.large,
	.error-box {
		margin-top: 12px;
	}
	.error-box {
		border-color: #7f2d3a;
		background: #25121a;
		color: #ffc1ca;
	}
	.error-box button {
		height: 30px;
		border: 0;
		border-radius: 7px;
		background: #ef4462;
		color: white;
		padding: 0 12px;
	}
	.group-stack {
		display: grid;
		gap: 20px;
		padding-bottom: 48px;
	}
	.unit-group {
		border: 1px solid #24334f;
		border-radius: 8px;
		background: #101827;
		overflow: hidden;
	}
	.group-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 13px 16px;
		background: #182238;
		border-bottom: 1px solid #24334f;
	}
	.group-head div {
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.group-head strong {
		color: #dce8ff;
	}
	.group-head code {
		color: #6f86ad;
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.group-actions {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.group-actions button {
		height: 28px;
		border: 1px solid #2b4369;
		border-radius: 7px;
		background: #101a2d;
		color: #9dc0ff;
		padding: 0 10px;
		font-size: 12px;
	}
	.group-actions button.accent {
		background: #2f70e7;
		border-color: #2f70e7;
		color: white;
	}
	.group-actions span {
		border-radius: 999px;
		background: #111b2d;
		color: #8fb8ff;
		padding: 3px 9px;
		font-size: 12px;
	}
	.unit-stack {
		display: grid;
		gap: 14px;
		padding: 14px;
	}
	.unit-card {
		border: 1px solid #24334f;
		border-radius: 8px;
		background: #111a2c;
		overflow: hidden;
	}
	.unit-card.untranslated {
		border-color: #514168;
	}
	.unit-card.manager {
		border-color: #2f6f75;
		background: #0f2027;
	}
	.unit-card header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid #22314c;
		color: #9fbfff;
	}
	.unit-card.manager header {
		border-bottom-color: #274d59;
		color: #8ee6df;
	}
	.speaker-chip {
		display: inline-flex;
		align-items: center;
		height: 20px;
		margin-right: 8px;
		padding: 0 8px;
		border-radius: 999px;
		background: #164e63;
		color: #a7f3d0;
		font-size: 11px;
		font-weight: 900;
		vertical-align: middle;
	}
	.unit-card header code {
		color: #667fa8;
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row {
		display: grid;
		grid-template-columns: 82px 1fr;
		border-bottom: 1px solid #1e2b43;
	}
	.row-label {
		padding: 14px;
		color: #62e6b0;
		font-size: 12px;
		font-weight: 800;
		border-right: 1px solid #1e2b43;
	}
	.current .row-label {
		color: #f0a63b;
	}
	.manager .row-label {
		color: #8ee6df;
	}
	.manager .current .row-label {
		color: #f7c56b;
	}
	.row p {
		margin: 0;
		padding: 14px;
		white-space: pre-wrap;
		line-height: 1.6;
	}
	.row p.escaped {
		white-space: normal;
		word-break: break-word;
	}
	.current p {
		color: #8b98ad;
	}
	.original {
		color: #f4f7ff;
		font-weight: 700;
	}
	.manager .original {
		color: #d9fffb;
	}
	textarea {
		width: calc(100% - 24px);
		min-height: 70px;
		margin: 12px;
		resize: vertical;
		border: 1px solid #273b5b;
		border-radius: 7px;
		background: #080f1c;
		color: #e8eefc;
		padding: 12px;
		outline: none;
	}
	.manager textarea {
		border-color: #2f6f75;
		background: #09151d;
	}
	textarea:focus {
		border-color: #3f7ee8;
		box-shadow: 0 0 0 2px rgba(63, 126, 232, 0.18);
	}
	.unit-card footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px;
	}
	.unit-card footer span {
		color: #7488aa;
		font-size: 12px;
	}
	.unit-card footer span.dirty {
		color: #ffd166;
	}
	.unit-card footer button {
		height: 30px;
		border: 0;
		border-radius: 7px;
		background: #2f70e7;
		color: white;
		padding: 0 14px;
	}
	.unit-card footer button:disabled {
		opacity: 0.5;
	}
	@media (max-width: 1100px) {
		.workspace {
			grid-template-columns: 280px 1fr;
		}
		.related-pane {
			display: none;
		}
		.search {
			width: min(360px, 42vw);
		}
	}
</style>

