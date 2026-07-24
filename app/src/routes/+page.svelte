<script>
	import { onMount } from "svelte";
	import "./page.css";

	const tabs = [
		{ key: "groups", label: "그룹" },
		{ key: "characters", label: "캐릭터" },
		{ key: "stories", label: "스토리/ADV" },
		{ key: "messages", label: "문자" },
		{ key: "telephones", label: "전화" },
		{ key: "home", label: "홈 대사" },
		{ key: "cards", label: "카드" },
		{ key: "masterdb", label: "MasterDB" },
	];

	const typeNames = {
		group: "그룹",
		character: "캐릭터",
		card: "카드",
		card_evolution_message: "개화 대사",
		costume: "의상",
		hair: "헤어",
		accessory: "액세서리",
		home_action: "홈 액션",
		love_home_action: "러브 홈 액션",
		company_enjoy_home_action: "회사 홈 액션",
		showcase_toy: "굿즈",
		showcase_toy_category: "굿즈 분류",
		skill: "스킬",
		skill_efficacy: "스킬 효과",
		live_ability: "라이브 능력",
		activity_ability: "업무 능력",
		story_part: "스토리 파트",
		story_collection: "스토리 묶음",
		story: "스토리",
		love: "모시코이 스토리",
		message_group: "메시지 그룹",
		message_thread: "문자 시리즈",
		message: "문자",
		telephone: "전화",
		condition_description: "조건 설명",
		excursion_place: "외출 장소",
		home_talk: "홈 대사",
		call_pattern: "접속 대사",
		adv_file: "ADV 파일",
		search: "검색",
		category: "카테고리",
	};

	const relationNames = {
		member: "멤버",
		has_card: "카드",
		has_costume: "의상",
		has_hair: "헤어",
		has_accessory: "액세서리",
		home_action: "홈 액션",
		love_home_action: "러브 홈 액션",
		company_enjoy_home_action: "회사 홈 액션",
		excursion_place: "외출 장소",
		costume_home_action: "의상 홈 액션",
		condition_costume_home_action: "의상 홈 액션",
		card_call_pattern: "카드 접속 대사",
		call_pattern: "접속 대사",
		costume_card: "의상 카드",
		fitting_hair: "피팅 헤어",
		has_showcase_toy: "굿즈",
		card_goods: "카드 굿즈",
		character_goods: "캐릭터 굿즈",
		has_message: "문자",
		has_telephone: "전화",
		has_home_talk: "홈 대사",
		has_adv: "ADV",
		card_story: "카드 스토리",
		card_message: "카드 문자",
		card_telephone: "카드 전화",
		card_home_talk: "카드 홈 대사",
		evolution_message: "개화 대사",
		reward_costume: "보상 의상",
		reward_hair: "보상 헤어",
		default_hair: "기본 헤어",
		wearable_costume: "착용 가능 의상",
		not_wearable_costume: "착용 불가 의상",
		skillId1: "스킬 1",
		skillId2: "스킬 2",
		skillId3: "스킬 3",
		skillId4: "스킬 4",
		skill_efficacy: "스킬 효과",
		skillId1_efficacy: "스킬 1 효과",
		skillId2_efficacy: "스킬 2 효과",
		skillId3_efficacy: "스킬 3 효과",
		skillId4_efficacy: "스킬 4 효과",
		liveAbilitySkill: "라이브 능력 스킬",
		liveAbilitySkill_efficacy: "라이브 능력 스킬 효과",
		level_skill: "레벨 스킬",
		liveAbilityId: "라이브 능력",
		activityAbilityId: "업무 능력",
		episode: "에피소드",
		episode_adv: "에피소드 ADV",
		chapter_episode: "챕터 에피소드",
		chapter_adv: "챕터 ADV",
		uses_adv: "사용 ADV",
		choice_adv: "선택지 ADV",
		message_group: "메시지 그룹",
		message_thread: "문자 시리즈",
		thread_message: "시리즈 문자",
		in_thread: "소속 시리즈",
		in_group: "소속 그룹",
		company_enjoy_story: "회사 스토리",
		company_enjoy_adv: "회사 ADV",
		message_telephone: "연결 전화",
		unlock_condition: "해금 조건",
		condition: "조건 설명",
		message_condition: "문자 조건",
		telephone_condition: "전화 조건",
		home_talk_condition: "홈 대사 조건",
	};

	const fieldNames = {
		value: "문구",
		name: "이름",
		place: "장소",
		description: "설명",
		obtainMessage: "획득 메시지",
		evolveMessage: "진화 메시지",
		title: "제목",
		text: "대사",
		excursionFirstText: "외출 첫 안내",
		choiceText: "선택지",
		managerText: "매니저 대사",
		displayConditionDescription: "표시 조건",
		branchFirstText: "분기 안내",
		branchCautionText: "분기 주의문",
		profile: "프로필",
		shortProfile: "짧은 프로필",
		catchphrase: "캐치프레이즈",
		favorite: "좋아하는 것",
		unfavorite: "싫어하는 것",
		hometown: "출신/학교",
		cv: "성우",
		age: "나이",
		birthday: "생일",
		zodiacSign: "별자리",
		firstName: "이름",
		groupName: "그룹명",
		idiom: "격언",
	};

	const categoryNames = {
		Localization: "Localization",
		Card: "카드 정보",
		Costume: "의상",
		Hair: "헤어",
		Accessory: "액세서리",
		HomeAction: "홈 액션",
		LoveHomeAction: "러브 홈 액션",
		CompanyEnjoyHomeAction: "회사 홈 액션",
		ShowcaseToy: "굿즈",
		ShowcaseToyCategory: "굿즈 분류",
		Skill: "스킬",
		LiveAbility: "라이브 능력",
		ActivityAbility: "업무 능력",
		Story: "스토리 정보",
		StoryPart: "스토리 파트",
		EventStory: "이벤트 스토리",
		ExtraStory: "엑스트라 스토리",
		Message: "문자",
		MessageGroup: "메시지 그룹",
		ConditionDescription: "조건 설명",
		ExcursionGazeReaction: "외출 반응",
		ExcursionPlace: "외출 장소",
		Telephone: "전화",
		HomeTalk: "홈 대사",
		HomeTalkCallPattern: "접속 대사",
		CardEvolutionMessage: "개화 대사",
		Character: "캐릭터 프로필",
		CharacterGroup: "그룹 정보",
	};

	let section = $state("groups");
	let query = $state("");
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
	let error = $state("");
	let notice = $state("");
	let navStack = $state([]);
	let historyReady = false;
	let restoringHistory = false;
	let expandedLinkGroups = $state({});
	let currentUser = $state(null);
	let loginNickname = $state("");
	let loginPin = $state("");
	let loginError = $state("");
	let loggingIn = $state(false);
	let guidelines = $state("");
	let guidelinesOpen = $state(false);
	let bulkOpen = $state(false);
	let bulkOriginal = $state("");
	let bulkTranslation = $state("");
	let bulkOverwrite = $state(false);
	let bulkPreview = $state(null);
	let bulkError = $state("");
	let bulkWorking = $state(false);
	let newDataOpen = $state(false);
	let newDataItems = $state([]);
	let newDataCount = $state(0);
	let newDataError = $state("");
	let newDataLoading = $state(false);
	let recentOpen = $state(false);
	let recentItems = $state([]);
	let recentTranslators = $state([]);
	let recentTranslator = $state("");
	let recentError = $state("");
	let recentLoading = $state(false);
	let showOnlyUntranslated = $state(false);
	let aiDrafting = $state(false);
	let aiPromptCopying = $state(false);
	let aiDraftError = $state("");
	let searchTimer;

	async function fetchJson(url, options = {}, timeoutMs = 15000) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});
			const text = await response.text();
			let data = {};
			try {
				data = text ? JSON.parse(text) : {};
			} catch {
				if ([502, 503, 504].includes(response.status)) {
					throw new Error(
						`서버 연결이 일시적으로 끊겼습니다. 잠시 후 다시 시도해 주세요. (HTTP ${response.status})`,
					);
				}
				const snippet = text.replace(/\s+/g, " ").slice(0, 240);
				throw new Error(
					`JSON이 아닌 응답입니다: ${response.status} ${response.url} ${snippet}`,
				);
			}
			if (!response.ok || data.error)
				throw new Error(data.error || `HTTP ${response.status}`);
			return data;
		} catch (err) {
			if (err.name === "AbortError")
				throw new Error(
					"요청 시간이 초과되었습니다. 서버 상태를 확인해 주세요.",
				);
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}

	async function loadSummary() {
		summary = await fetchJson("/api/summary");
	}

	async function loadItems({
		keepSelection = false,
		preserveSelection = false,
	} = {}) {
		loadingItems = true;
		error = "";
		try {
			const params = new URLSearchParams({ section });
			if (query.trim()) params.set("q", query.trim());
			const data = await fetchJson(`/api/items?${params}`);
			items = data.items ?? [];
			groups = data.groups ?? [];
			if (preserveSelection && selected) return;
			if (
				!keepSelection ||
				!selected ||
				!items.some(
					(item) =>
						item.id === selected.id && item.type === selected.type,
				)
			) {
				await selectItem(items[0] ?? null);
			}
		} catch (err) {
			error = err.message;
			items = [];
		} finally {
			loadingItems = false;
		}
	}

	function sectionProgress(sections = []) {
		return sections.reduce(
			(total, part) => ({
				done: total.done + Number(part.done ?? 0),
				total: total.total + Number(part.total ?? 0),
			}),
			{ done: 0, total: 0 },
		);
	}

	function applyDetailProgress(item, nextDetail = detail) {
		if (!item || !nextDetail?.sections?.length) return;
		const totals = sectionProgress(nextDetail.sections);
		const patch = { done: totals.done, total: totals.total };
		selected =
			selected?.type === item.type && selected?.id === item.id
				? { ...selected, ...patch }
				: selected;
		items = items.map((entry) =>
			entry.type === item.type && entry.id === item.id
				? { ...entry, ...patch }
				: entry,
		);
	}

	function preferredSection(sections = [], preferredKey = "") {
		if (!sections.length) return null;
		if (!preferredKey) return sections[0];
		return (
			sections.find((part) => part.key === preferredKey) ??
			(preferredKey.startsWith("adv")
				? sections.find((part) => part.key.startsWith("adv"))
				: null) ??
			sections[0]
		);
	}

	function refreshActiveSectionProgress() {
		if (!detail || !activeSection) return;
		const nextSection = {
			...activeSection,
			total: units.length,
			done: units.filter((unit) =>
				String(unit.translation_text ?? "").trim(),
			).length,
		};
		activeSection = nextSection;
		detail = {
			...detail,
			sections: detail.sections.map((part) =>
				part.key === nextSection.key ? nextSection : part,
			),
		};
		applyDetailProgress(selected, detail);
	}

	async function selectItem(item, preferredKey = "") {
		selected = item;
		detail = null;
		activeSection = null;
		units = [];
		notice = "";
		if (!item) return;
		loadingDetail = true;
		error = "";
		try {
			detail = await fetchJson(
				`/api/detail?type=${encodeURIComponent(item.type)}&id=${encodeURIComponent(item.id)}`,
			);
			applyDetailProgress(item, detail);
			activeSection = preferredSection(detail.sections, preferredKey);
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
		writeHistory("push");
	}

	function currentNavEntry() {
		if (!selected) return null;
		return {
			item: {
				type: selected.type,
				id: selected.id,
				label: detail?.entity?.label ?? selected.label,
				subtitle: detail?.entity?.subtitle || selected.subtitle,
			},
			sectionKey: activeSection?.key ?? "",
		};
	}

	function historySnapshot() {
		return {
			hoshimiStation: true,
			section,
			query,
			selected: selected
				? {
						type: selected.type,
						id: selected.id,
						label: detail?.entity?.label ?? selected.label,
						subtitle: detail?.entity?.subtitle || selected.subtitle,
					}
				: null,
			sectionKey: activeSection?.key ?? "",
			navStack: navStack.map((entry) => ({
				item: {
					type: entry.item?.type ?? "",
					id: entry.item?.id ?? "",
					label: entry.item?.label ?? "",
					subtitle: entry.item?.subtitle ?? "",
				},
				sectionKey: entry.sectionKey ?? "",
			})),
		};
	}

	function navigationUrl(
		item = selected,
		preferredKey = activeSection?.key ?? "",
		{ includeQuery = true } = {},
	) {
		if (typeof window === "undefined") return "";
		const url = new URL(window.location.href);
		url.searchParams.set("tab", section);
		if (includeQuery && query.trim()) url.searchParams.set("q", query.trim());
		else url.searchParams.delete("q");
		if (item?.type && item?.id) {
			url.searchParams.set("type", item.type);
			url.searchParams.set("id", item.id);
		} else {
			url.searchParams.delete("type");
			url.searchParams.delete("id");
		}
		if (preferredKey) url.searchParams.set("part", preferredKey);
		else url.searchParams.delete("part");
		return url.toString();
	}

	function writeHistory(mode = "push") {
		if (!historyReady || restoringHistory || typeof window === "undefined")
			return;
		try {
			window.history[mode === "replace" ? "replaceState" : "pushState"](
				historySnapshot(),
				"",
				navigationUrl(),
			);
		} catch (err) {
			console.warn("Failed to update navigation history", err);
		}
	}

	async function restoreHistory(snapshot) {
		if (!snapshot?.hoshimiStation) return;
		restoringHistory = true;
		try {
			section = snapshot.section || "groups";
			query = snapshot.query || "";
			navStack = Array.isArray(snapshot.navStack)
				? snapshot.navStack
				: [];
			if (snapshot.selected) {
				await loadItems({ keepSelection: true });
				await selectItem(snapshot.selected, snapshot.sectionKey || "");
			} else {
				await loadItems();
			}
		} finally {
			restoringHistory = false;
		}
	}

	async function navigateToItem(item, preferredKey = "", { clearQuery = false } = {}) {
		const previous = currentNavEntry();
		if (
			previous &&
			(previous.item.type !== item.type || previous.item.id !== item.id)
		) {
			navStack = [...navStack, previous].slice(-20);
		}
		if (clearQuery && query) {
			query = "";
			await loadItems({ keepSelection: true });
		}
		await selectItem(item, preferredKey);
		writeHistory("push");
	}

	function shouldOpenInNewTab(event) {
		return event?.button === 1 || event?.ctrlKey || event?.metaKey;
	}

	function openItemInNewTab(item, preferredKey = "", { clearQuery = false } = {}) {
		if (typeof window === "undefined" || !item?.type || !item?.id) return;
		window.open(
			navigationUrl(item, preferredKey, { includeQuery: !clearQuery }),
			"_blank",
			"noopener",
		);
	}

	function activateRootItem(event, item) {
		if (shouldOpenInNewTab(event)) {
			event.preventDefault();
			event.stopPropagation();
			openItemInNewTab(item);
			return;
		}
		selectRootItem(item);
	}

	function activateLinkedItem(event, item, preferredKey = "") {
		if (shouldOpenInNewTab(event)) {
			event.preventDefault();
			event.stopPropagation();
			openItemInNewTab(item, preferredKey, { clearQuery: true });
			return;
		}
		navigateToItem(item, preferredKey, { clearQuery: true });
	}

	function activateSection(event, part) {
		if (shouldOpenInNewTab(event) && selected) {
			event.preventDefault();
			event.stopPropagation();
			openItemInNewTab(selected, part.key);
			return;
		}
		loadUnits(part);
	}

	async function goBack({ syncHistory = true } = {}) {
		const previous = navStack.at(-1);
		if (!previous) return;
		navStack = navStack.slice(0, -1);
		await selectItem(previous.item, previous.sectionKey);
		if (syncHistory) writeHistory("replace");
	}

	async function openUnitEntity(group, preferredKey = "") {
		if (
			!group.scope_type ||
			!group.scope_id ||
			group.scope_type === "category"
		)
			return;
		await navigateToItem(
			{
				type: group.scope_type,
				id: group.scope_id,
				label: group.title,
				subtitle: group.subtitle,
			},
			preferredKey,
			{ clearQuery: true },
		);
	}

	function activateUnitEntity(event, group, preferredKey = "") {
		if (
			!group.scope_type ||
			!group.scope_id ||
			group.scope_type === "category"
		)
			return;
		const item = {
			type: group.scope_type,
			id: group.scope_id,
			label: group.title,
			subtitle: group.subtitle,
		};
		if (shouldOpenInNewTab(event)) {
			event.preventDefault();
			event.stopPropagation();
			openItemInNewTab(item, preferredKey, { clearQuery: true });
			return;
		}
		openUnitEntity(group, preferredKey);
	}

	function activateUnitEntityMiddleClick(event, group, preferredKey = "") {
		if (event?.button !== 1) return;
		activateUnitEntity(event, group, preferredKey);
	}

	async function loadUnits(part) {
		activeSection = part;
		loadingUnits = true;
		error = "";
		try {
			const params = new URLSearchParams({
				type: selected?.type ?? "category",
				id: selected?.id ?? "",
				key: part.key,
			});
			if (part.category) params.set("category", part.category);
			const data = await fetchJson(`/api/units?${params}`);
			units = (data.units ?? []).map((unit) => ({
				...unit,
				draft: unit.translation_text ?? "",
				dirty: false,
				saving: false,
				error: "",
			}));
		} catch (err) {
			error = err.message;
			units = [];
		} finally {
			loadingUnits = false;
		}
	}

	async function saveUnit(unit) {
		if (!currentUser) {
			loginError = "저장하려면 먼저 닉네임을 입력해 주세요.";
			return;
		}
		const missing = missingPlaceholders(unit.original_text, unit.draft);
		if (missing.length && unit.draft.trim()) {
			const ok = confirm(
				`원문에 있는 placeholder가 번역문에 없습니다: ${missing.join(", ")}\n그래도 저장할까요?`,
			);
			if (!ok) {
				unit.error = `placeholder 누락: ${missing.join(", ")}`;
				return;
			}
		}
		unit.saving = true;
		unit.error = "";
		notice = "";
		try {
			const data = await fetchJson("/api/unit", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					unit_id: unit.unit_id,
					translation_text: unit.draft,
					nickname: currentUser.nickname,
					pin: currentUser.pin,
				}),
			});
			unit.translation_text = unit.draft;
			unit.status = data.status;
			unit.translator_name = data.translator_name ?? currentUser.nickname;
			unit.dirty = false;
			if (
				unit.translation_text.trim() &&
				newDataItems.some((item) => item.unit_id === unit.unit_id)
			) {
				newDataItems = newDataItems.filter(
					(item) => item.unit_id !== unit.unit_id,
				);
				newDataCount = Math.max(0, newDataCount - 1);
			}
			refreshActiveSectionProgress();
			notice = "저장되었습니다.";
			await loadSummary();
		} catch (err) {
			unit.error = err.message;
		} finally {
			unit.saving = false;
		}
	}

	function placeholders(text) {
		return [
			...new Set(String(text ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? []),
		];
	}

	function missingPlaceholders(original, draft) {
		const translated = String(draft ?? "");
		return placeholders(original).filter(
			(placeholder) => !translated.includes(placeholder),
		);
	}

	function progress(done, total) {
		return total
			? Math.round((Number(done ?? 0) / Number(total)) * 100)
			: 0;
	}

	function changeSection(next) {
		section = next;
		navStack = [];
		loadItems().then(() => writeHistory("push"));
	}

	function queueSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => loadItems(), 250);
	}

	function retry() {
		if (selected) selectItem(selected);
		else loadItems();
	}

	function goHome() {
		section = "groups";
		query = "";
		navStack = [];
		expandedLinkGroups = {};
		loadItems().then(() => writeHistory("push"));
	}

	async function login() {
		loginError = "";
		const nickname = loginNickname.trim();
		const pin = loginPin.trim();
		if (!nickname) {
			loginError = "닉네임을 입력해 주세요.";
			return;
		}
		if (!/^\d{6}$/.test(pin)) {
			loginError = "비밀번호는 숫자 6자리로 입력해 주세요.";
			return;
		}
		loggingIn = true;
		try {
			const data = await fetchJson("/api/user", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ nickname, pin }),
			});
			currentUser = {
				nickname: data.user.nickname,
				pin,
				is_admin: Boolean(data.user.is_admin),
			};
			localStorage.setItem(
				"translatorUser",
				JSON.stringify(currentUser),
			);
			localStorage.setItem("translatorNickname", data.user.nickname);
			void loadNewData();
		} catch (err) {
			loginError = err.message;
		} finally {
			loggingIn = false;
		}
	}

	async function openRecent() {
		recentOpen = true;
		await loadRecent();
	}

	function closeRecent() {
		recentOpen = false;
		recentError = "";
	}

	async function openNewData() {
		newDataOpen = true;
		await loadNewData();
	}

	function closeNewData() {
		newDataOpen = false;
		newDataError = "";
	}

	function newDataSectionKey(item) {
		if (item.source_type !== "adv") return "direct";
		if (item.field_path === "place") return "adv_places";
		if (item.category === "adv/card") return "adv_card";
		if (item.category === "adv/bond") return "adv_bond";
		if (item.category === "adv/hbd") return "adv_hbd";
		if (item.category === "adv/love") return "adv_love";
		if (item.category === "adv/userhbd") return "adv_userhbd";
		if (item.category === "adv/group") return "adv_group";
		return "adv";
	}

	async function openNewDataItem(event, item) {
		const target = recentItemTarget(item);
		if (!target) return;
		const preferredKey = newDataSectionKey(item);
		if (shouldOpenInNewTab(event)) {
			event.preventDefault();
			event.stopPropagation();
			openItemInNewTab(target, preferredKey);
			return;
		}
		closeNewData();
		await navigateToItem(target, preferredKey);
	}

	function closeNewDataFromBackdrop(event) {
		if (event.target === event.currentTarget) closeNewData();
	}

	async function loadNewData() {
		if (!currentUser) return;
		newDataError = "";
		newDataLoading = true;
		try {
			const data = await fetchJson("/api/new-data", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					nickname: currentUser.nickname,
					pin: currentUser.pin,
					limit: 500,
				}),
			});
			newDataItems = data.items ?? [];
			newDataCount = Number(data.count ?? newDataItems.length);
		} catch (err) {
			newDataError = err.message;
			newDataItems = [];
		} finally {
			newDataLoading = false;
		}
	}

	function recentItemTarget(item) {
		if (!item?.scope_type || !item?.scope_id) return null;
		return {
			type: item.scope_type,
			id: item.scope_id,
			label: item.record_id || item.scope_id,
			subtitle: [item.category, item.field_path].filter(Boolean).join(" · "),
		};
	}

	async function openRecentItem(event, item) {
		const target = recentItemTarget(item);
		if (!target) return;
		if (shouldOpenInNewTab(event)) {
			event.preventDefault();
			event.stopPropagation();
			openItemInNewTab(target, "direct");
			return;
		}
		closeRecent();
		await navigateToItem(target, "direct");
	}

	function closeRecentFromBackdrop(event) {
		if (event.target === event.currentTarget) closeRecent();
	}

	async function loadRecent() {
		if (!currentUser) return;
		recentError = "";
		recentLoading = true;
		try {
			const data = await fetchJson("/api/admin/recent", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					nickname: currentUser.nickname,
					pin: currentUser.pin,
					translator_name: recentTranslator,
					limit: 150,
				}),
			});
			recentItems = data.items ?? [];
			recentTranslators = data.translators ?? [];
		} catch (err) {
			recentError = err.message;
			recentItems = [];
		} finally {
			recentLoading = false;
		}
	}

	function logout() {
		currentUser = null;
		newDataOpen = false;
		newDataItems = [];
		newDataCount = 0;
		loginPin = "";
		localStorage.removeItem("translatorUser");
		sessionStorage.removeItem("translatorUser");
	}

	function openBulkFill() {
		bulkOpen = true;
		bulkError = "";
		bulkPreview = null;
	}

	function canUseAiDraft() {
		return Boolean(currentUser);
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function waitForAiDraft(jobId) {
		for (let attempt = 0; attempt < 400; attempt += 1) {
			await sleep(1500);
			try {
				const data = await fetchJson(
					`/api/ai-translate?job_id=${encodeURIComponent(jobId)}`,
				);
				if (data.status !== "processing") return data;
			} catch (err) {
				if (/HTTP (502|503|504)/.test(err.message)) continue;
				throw err;
			}
		}
		throw new Error("AI 번역이 10분 안에 끝나지 않았습니다.");
	}

	function aiDraftSelection() {
		const targets = filteredUnits()
			.filter(
				(unit) =>
					!String(unit.translation_text ?? "").trim() &&
					!String(unit.draft ?? "").trim(),
			)
			.slice(0, 150);
		if (!targets.length) return { targets, referenceUnitIds: [] };
		const targetIds = new Set(targets.map((unit) => String(unit.unit_id)));
		const targetIndexes = units
			.map((unit, index) => (targetIds.has(String(unit.unit_id)) ? index : -1))
			.filter((index) => index >= 0);
		const firstTargetIndex = Math.min(...targetIndexes);
		const lastTargetIndex = Math.max(...targetIndexes);
		const referenceUnitIds = units
			.slice(firstTargetIndex, lastTargetIndex + 1)
			.filter(
				(unit) =>
					!targetIds.has(String(unit.unit_id)) &&
					Boolean(String(unit.translation_text ?? "").trim()),
			)
			.slice(0, 200)
			.map((unit) => unit.unit_id);
		return { targets, referenceUnitIds };
	}

	async function copyAiPrompt() {
		if (!currentUser) {
			aiDraftError = "먼저 로그인해 주세요.";
			return;
		}
		const { targets, referenceUnitIds } = aiDraftSelection();
		if (!targets.length) {
			aiDraftError = "복사할 미번역 항목이 없습니다.";
			return;
		}
		aiPromptCopying = true;
		aiDraftError = "";
		notice = "";
		try {
			const data = await fetchJson("/api/ai-translate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					unit_ids: targets.map((unit) => unit.unit_id),
					reference_unit_ids: referenceUnitIds,
					nickname: currentUser.nickname,
					pin: currentUser.pin,
					prompt_only: true,
				}),
			});
			await navigator.clipboard.writeText(data.prompt ?? "");
			notice = `외부 AI용 지침과 미번역 ${data.target_count ?? targets.length}개 복사됨`;
		} catch (err) {
			aiDraftError = err.message;
		} finally {
			aiPromptCopying = false;
		}
	}

	async function runAiDraft() {
		if (!currentUser) {
			aiDraftError = "먼저 로그인해 주세요.";
			return;
		}
		if (!canUseAiDraft()) {
			aiDraftError = "AI 초벌을 사용하려면 로그인해 주세요.";
			return;
		}
		const { targets, referenceUnitIds } = aiDraftSelection();
		if (!targets.length) {
			aiDraftError = "초벌을 채울 미번역 항목이 없습니다.";
			return;
		}
		const ok = confirm(
			`현재 표시된 미번역 ${targets.length}개에 AI 초벌을 채울까요?\n초안만 입력되고 저장은 직접 해야 합니다.`,
		);
		if (!ok) return;

		aiDrafting = true;
		aiDraftError = "";
		notice = "";
		try {
			let data = await fetchJson(
				"/api/ai-translate",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						unit_ids: targets.map((unit) => unit.unit_id),
						reference_unit_ids: referenceUnitIds,
						nickname: currentUser.nickname,
						pin: currentUser.pin,
					}),
				},
				30000,
			);
			if (data.job_id) data = await waitForAiDraft(data.job_id);
			const translated = new Map(
				(data.translations ?? []).map((item) => [
					String(item.unit_id),
					item.translation_text ?? "",
				]),
			);
			let applied = 0;
			for (const unit of units) {
				if (!translated.has(String(unit.unit_id))) continue;
				unit.draft = translated.get(String(unit.unit_id));
				unit.dirty = unit.draft !== unit.translation_text;
				unit.error = "";
				applied += 1;
			}
			notice = data.usage
				? `AI 초벌 ${applied}개 입력됨 · 오늘 ${data.usage.remaining}회 남음`
				: `AI 초벌 ${applied}개 입력됨`;
			if (data.warnings?.length) {
				const shown = data.warnings
					.slice(0, 20)
					.map((warning) => `${warning.unit_id}: ${warning.message}`)
					.join("\n");
				const hidden = data.warnings.length - 20;
				aiDraftError =
					hidden > 0 ? `${shown}\n... 외 ${hidden}개` : shown;
			}
		} catch (err) {
			aiDraftError = err.message;
		} finally {
			aiDrafting = false;
		}
	}

	function closeBulkFill() {
		if (bulkWorking) return;
		bulkOpen = false;
		bulkError = "";
		bulkPreview = null;
	}

	async function previewBulkFill() {
		if (!currentUser) {
			bulkError = "먼저 로그인해 주세요.";
			return;
		}
		bulkError = "";
		bulkPreview = null;
		bulkWorking = true;
		try {
			bulkPreview = await fetchJson("/api/bulk-fill", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					original_text: bulkOriginal,
					translation_text: bulkTranslation,
					overwrite: bulkOverwrite,
					apply: false,
					nickname: currentUser.nickname,
					pin: currentUser.pin,
				}),
			});
		} catch (err) {
			bulkError = err.message;
		} finally {
			bulkWorking = false;
		}
	}

	async function applyBulkFill() {
		if (!bulkPreview) {
			await previewBulkFill();
			if (!bulkPreview) return;
		}
		const targets = Number(bulkPreview.targets ?? 0);
		if (!targets) {
			bulkError = "변경할 항목이 없습니다.";
			return;
		}
		const matchLabel =
			bulkPreview.mode === "format" ? "포맷으로 일치하는 원문" : "정확히 일치하는 원문";
		const ok = confirm(
			`${matchLabel} ${targets.toLocaleString()}개에 번역을 채울까요?`,
		);
		if (!ok) return;
		bulkError = "";
		bulkWorking = true;
		try {
			const data = await fetchJson("/api/bulk-fill", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					original_text: bulkOriginal,
					translation_text: bulkTranslation,
					overwrite: bulkOverwrite,
					apply: true,
					nickname: currentUser.nickname,
					pin: currentUser.pin,
				}),
			});
			notice = `일괄 번역 ${data.updated ?? 0}개 적용됨`;
			bulkOpen = false;
			bulkPreview = null;
			await loadSummary();
			if (activeSection) await loadUnits(activeSection);
			await loadItems({ keepSelection: true });
		} catch (err) {
			bulkError = err.message;
		} finally {
			bulkWorking = false;
		}
	}

	async function loadGuidelines() {
		const data = await fetchJson("/api/guidelines");
		guidelines = data.markdown ?? "";
	}

	function markdownBlocks(markdown) {
		const blocks = [];
		let currentList = null;
		let currentTable = null;
		const tableCells = (line) =>
			line
				.replace(/^\|/, "")
				.replace(/\|$/, "")
				.split("|")
				.map((cell) => cell.trim());
		const isTableSeparator = (line) =>
			/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
		for (const rawLine of String(markdown ?? "").split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line) {
				currentList = null;
				currentTable = null;
				continue;
			}
			if (line.startsWith("# ")) {
				blocks.push({ type: "h1", text: line.slice(2).trim() });
				currentList = null;
				currentTable = null;
			} else if (line.startsWith("## ")) {
				blocks.push({ type: "h2", text: line.slice(3).trim() });
				currentList = null;
				currentTable = null;
			} else if (line.startsWith("- ")) {
				if (!currentList) {
					currentList = { type: "ul", items: [] };
					blocks.push(currentList);
				}
				currentList.items.push(line.slice(2).trim());
				currentTable = null;
			} else if (line.includes("|") && isTableSeparator(line)) {
				currentList = null;
			} else if (line.startsWith("|") && line.endsWith("|")) {
				currentList = null;
				if (!currentTable) {
					currentTable = { type: "table", rows: [] };
					blocks.push(currentTable);
				}
				currentTable.rows.push(tableCells(line));
			} else {
				blocks.push({ type: "p", text: line });
				currentList = null;
				currentTable = null;
			}
		}
		return blocks;
	}

	function handleKeydown(event) {
		if (
			(event.ctrlKey || event.metaKey) &&
			event.key.toLowerCase() === "k"
		) {
			event.preventDefault();
			document.querySelector("#global-search")?.focus();
		}
	}

	function selectedTitle() {
		return detail?.entity?.label ?? selected?.label ?? "선택한 항목 없음";
	}

	function selectedSubtitle() {
		return (
			detail?.entity?.subtitle || selected?.subtitle || selected?.id || ""
		);
	}

	function metaLine(item) {
		const done = Number(item.done ?? 0);
		const total = Number(item.total ?? 0);
		return `${item.subtitle || item.id} · ${done.toLocaleString()}/${total.toLocaleString()}`;
	}

	function isComplete(item) {
		const total = Number(item.total ?? 0);
		return total > 0 && Number(item.done ?? 0) >= total;
	}

	function fieldLabel(path) {
		const clean = String(path ?? "")
			.replace(/\[[^\]]+\]/g, "")
			.split(".")
			.pop();
		return fieldNames[clean] ?? clean ?? path;
	}

	function groupTitle(unit) {
		if (shouldGroupByOwner() && unit.scope_label) return unit.scope_label;
		if (unit.source_type === "adv") return unit.source_file;
		return categoryNames[unit.category] ?? unit.category;
	}

	function groupSubtitle(unit) {
		if (shouldGroupByOwner()) {
			const type = typeNames[unit.scope_type] ?? unit.scope_type;
			return `${type} · ${unit.scope_subtitle || unit.scope_id}`;
		}
		if (unit.source_type === "adv")
			return `${unit.category} · ${unit.record_id}`;
		return `${unit.source_file} · ${unit.record_id}`;
	}

	function shouldGroupCharacterAdvByFile(unit) {
		return (
			["adv_bond", "adv_hbd", "adv_userhbd"].includes(
				activeSection?.key,
			) &&
			unit.source_type === "adv" &&
			unit.scope_type === "character"
		);
	}

	function advFileGroupTitle(unit) {
		if (
			unit.field_path === "title" &&
			(unit.translation_text || unit.original_text)
		) {
			return unit.translation_text || unit.original_text;
		}
		return unit.source_file;
	}

	function unitTitle(unit) {
		const speaker = displaySpeaker(unit);
		if (unit.source_type === "adv") {
			const prefix = speaker ? `${speaker} · ` : "";
			return `${prefix}${unit.field_path}${unit.line_no ? ` · line ${unit.line_no}` : ""}`;
		}
		if (speaker) return `${speaker} · ${fieldLabel(unit.field_path)}`;
		return fieldLabel(unit.field_path);
	}

	function unitCode(unit) {
		if (unit.source_type === "adv")
			return `${unit.source_file} · ${unit.field_path}`;
		return unit.field_path;
	}

	function isManagerUnit(unit) {
		return (
			unit.speaker === "{user}" || unitFieldName(unit) === "managerText"
		);
	}

	function isPlayerChoiceUnit(unit) {
		return (
			["__player_choice__", "__player_text__"].includes(unit.speaker) ||
			unitFieldName(unit) === "choiceText"
		);
	}

	function unitFieldName(unit) {
		return String(unit.field_path ?? "")
			.replace(/\[[^\]]+\]/g, "")
			.split(".")
			.pop();
	}

	function speakerLabel(unit) {
		if (
			unit.speaker === "__player_choice__" ||
			unitFieldName(unit) === "choiceText"
		)
			return "플레이어 선택";
		if (unit.speaker === "__player_text__") return "플레이어";
		if (isManagerUnit(unit)) return "매니저";
		if (displaySpeaker(unit)) return "발화자";
		return "";
	}

	function displaySpeaker(unit) {
		const speaker = String(unit.speaker ?? "");
		if (!speaker || speaker.startsWith("__") || speaker === "{user}")
			return "";
		return speaker;
	}

	function untranslatedCount() {
		return units.filter(
			(unit) => !String(unit.translation_text ?? "").trim(),
		).length;
	}

	function scrollToNextUntranslated() {
		const target = document.querySelector(".unit-card.untranslated");
		target?.scrollIntoView({ behavior: "smooth", block: "center" });
	}

	function displayText(text) {
		return String(text ?? "")
			.replace(/\r\n/g, "\\n")
			.replace(/\n/g, "\\n");
	}

	function displayKstTime(value) {
		if (!value) return "";
		const date = new Date(`${String(value).replace(" ", "T")}Z`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat("ko-KR", {
			timeZone: "Asia/Seoul",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		}).format(date);
	}

	function shouldGroupByOwner() {
		const ownerGroupedKeys = [
			"members",
			"cards",
			"common_messages",
			"common_home_talks",
			"common_telephones",
			"call_patterns",
			"stories",
			"card_messages",
			"card_home_talks",
			"card_telephones",
			"skills",
			"costumes",
			"hair",
			"accessories",
			"goods",
			"home_actions",
			"evolution",
			"group_messages",
			"message_threads",
			"group_telephones",
			"linked_messages",
			"linked_telephones",
			"conditions",
			"call_patterns",
			"adv_card",
			"adv_bond",
			"adv_hbd",
			"adv_love",
			"adv_userhbd",
			"adv_group",
		];
		return (
			ownerGroupedKeys.includes(activeSection?.key) ||
			(selected?.type === "character" && activeSection?.key === "adv")
		);
	}

	function ownerGroupKey(unit) {
		if (!shouldGroupByOwner()) {
			return unit.source_type === "adv"
				? `${unit.source_type}:${unit.source_file}`
				: `${unit.category}:${unit.record_id}`;
		}
		if (shouldGroupCharacterAdvByFile(unit)) {
			return `adv-file:${unit.source_file}`;
		}
		if (unit.source_type === "adv" && unit.scope_type === "character") {
			return `adv-common:${unit.scope_id}`;
		}
		if (unit.owner_type && unit.owner_id) {
			return `${unit.owner_type}:${unit.owner_id}`;
		}
		if (unit.scope_type && unit.scope_id) {
			return `${unit.scope_type}:${unit.scope_id}`;
		}
		return unit.source_type === "adv"
			? `${unit.source_type}:${unit.source_file}`
			: `${unit.category}:${unit.record_id}`;
	}

	function ownerGroupTitle(unit) {
		if (shouldGroupByOwner() && shouldGroupCharacterAdvByFile(unit)) {
			return advFileGroupTitle(unit);
		}
		if (
			shouldGroupByOwner() &&
			unit.source_type === "adv" &&
			unit.scope_type === "character"
		) {
			return "캐릭터 공통 ADV";
		}
		if (shouldGroupByOwner() && unit.owner_label) return unit.owner_label;
		return groupTitle(unit);
	}

	function ownerGroupSubtitle(unit) {
		if (shouldGroupByOwner() && shouldGroupCharacterAdvByFile(unit)) {
			return `${unit.category} 쨌 ${unit.source_file}`;
		}
		if (
			shouldGroupByOwner() &&
			unit.source_type === "adv" &&
			unit.scope_type === "character"
		) {
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
		for (const unit of filteredUnits()) {
			const key = ownerGroupKey(unit);
			if (!map.has(key)) {
				map.set(key, {
					key,
					title: ownerGroupTitle(unit),
					subtitle: ownerGroupSubtitle(unit),
					source_type: unit.source_type,
					category: unit.category,
					scope_type: shouldGroupCharacterAdvByFile(unit)
						? "adv_file"
						: (unit.owner_type ?? unit.scope_type),
					scope_id: shouldGroupCharacterAdvByFile(unit)
						? unit.source_file
						: (unit.owner_id ?? unit.scope_id),
					units: [],
				});
			}
			map.get(key).units.push(unit);
		}
		return [...map.values()];
	}

	function canOpenEntity(group) {
		return (
			group.scope_type &&
			group.scope_id &&
			!["category"].includes(group.scope_type)
		);
	}

	function canOpenAdv(group) {
		return [
			"story",
			"story_collection",
			"story_part",
			"love",
			"card",
			"group",
		].includes(group.scope_type);
	}

	function advSectionKey(group) {
		if (group.scope_type === "card") return "adv_card";
		if (group.scope_type === "group") return "adv_group";
		if (group.scope_type === "love") return "adv";
		return "adv";
	}

	function entityButtonLabel(group) {
		const name = typeNames[group.scope_type] ?? "항목";
		return `${name} 열기`;
	}

	function linkGroups() {
		const map = new Map();
		for (const link of detail?.links ?? []) {
			const relation =
				relationNames[link.relation] ??
				relationNames[link.type] ??
				typeNames[link.type] ??
				link.relation;
			const key = `${relation}:${link.type}`;
			if (!map.has(key)) {
				map.set(key, {
					key,
					title: relation,
					type: typeNames[link.type] ?? link.type,
					links: [],
				});
			}
			map.get(key).links.push(link);
		}
		return [...map.values()];
	}

	function filteredUnits() {
		if (!showOnlyUntranslated) return units;
		return units.filter(
			(unit) => !String(unit.translation_text ?? "").trim(),
		);
	}

	function visibleLinks(group) {
		return expandedLinkGroups[group.key]
			? group.links
			: group.links.slice(0, 8);
	}

	function toggleLinkGroup(group) {
		expandedLinkGroups = {
			...expandedLinkGroups,
			[group.key]: !expandedLinkGroups[group.key],
		};
	}

	onMount(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem("translatorUser") ||
					sessionStorage.getItem("translatorUser") ||
					"null",
			);
			if (saved?.nickname && saved?.pin) {
				currentUser = {
					...saved,
					is_admin:
						Boolean(saved.is_admin) || saved.nickname === "사일",
				};
				loginNickname = saved.nickname;
				localStorage.setItem(
					"translatorUser",
					JSON.stringify(currentUser),
				);
				sessionStorage.removeItem("translatorUser");
			} else {
				loginNickname =
					localStorage.getItem("translatorNickname") || "";
			}
		} catch {
			loginNickname = localStorage.getItem("translatorNickname") || "";
		}
		if (currentUser) void loadNewData();
		const params = new URLSearchParams(window.location.search);
		const initialSelected =
			params.get("type") && params.get("id")
				? {
						type: params.get("type"),
						id: params.get("id"),
						label: params.get("id"),
						subtitle: "",
					}
				: null;
		const initialPart = params.get("part") || "";
		section = params.get("tab") || section;
		query = params.get("q") || "";
		if (initialSelected) selected = initialSelected;

		loadSummary().catch((err) => (error = err.message));
		loadItems({
			keepSelection: Boolean(initialSelected),
			preserveSelection: Boolean(initialSelected),
		}).then(async () => {
			if (initialSelected) await selectItem(initialSelected, initialPart);
			historyReady = true;
			writeHistory("replace");
		});
		loadGuidelines().catch((err) => (loginError = err.message));
		const handlePopState = (event) => {
			if (event.state?.hoshimiStation) {
				restoreHistory(event.state);
				return;
			}
			goBack({ syncHistory: false });
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Hoshimi Station</title>
</svelte:head>

<div class="shell">
	<header class="topbar">
		<button class="brand" onclick={goHome} title="처음 화면으로">
			<span>Hoshimi Station</span>
		</button>
		<label class="search">
			<span>🔍</span>
			<input
				id="global-search"
				bind:value={query}
				oninput={queueSearch}
				placeholder="ID / 원문 / 번역 검색... (Ctrl+K)"
			/>
		</label>
		<div class="guideline-popover-wrap">
			<button
				class="soft compact-button"
				class:active={guidelinesOpen}
				type="button"
				onclick={() => (guidelinesOpen = !guidelinesOpen)}
				aria-expanded={guidelinesOpen}
			>
				번역 지침
			</button>
			{#if guidelinesOpen}
				<aside class="guideline-popover" aria-label="번역 지침">
					<header>
						<strong>번역 지침</strong>
						<button
							class="soft compact-button"
							type="button"
							onclick={() => (guidelinesOpen = false)}
							>닫기</button
						>
					</header>
					<div class="floating-guideline-body">
						{#if guidelines}
							<div class="markdown-guidelines compact-guidelines">
								{#each markdownBlocks(guidelines) as block}
									{#if block.type === "h1"}
										<h2>{block.text}</h2>
									{:else if block.type === "h2"}
										<h3>{block.text}</h3>
									{:else if block.type === "p"}
										<p>{block.text}</p>
									{:else if block.type === "ul"}
										<ul>
											{#each block.items as item}
												<li>{item}</li>
											{/each}
										</ul>
									{:else if block.type === "table"}
										<div class="guideline-table-wrap">
											<table class="guideline-table">
												<tbody>
													{#each block.rows as row, rowIndex}
														<tr>
															{#each row as cell}
																{#if rowIndex === 0}
																	<th
																		>{cell}</th
																	>
																{:else}
																	<td
																		>{cell}</td
																	>
																{/if}
															{/each}
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
								{/each}
							</div>
						{:else}
							<div class="guideline-loading">
								번역 주의사항을 불러오는 중...
							</div>
						{/if}
					</div>
				</aside>
			{/if}
		</div>
		<button class="soft compact-button" onclick={openBulkFill}
			>일괄 번역</button
		>
		<div class="top-actions">
			{#if summary}
				<span class="summary-pill"
					>{summary.done ?? 0}/{summary.units ?? 0}</span
				>
			{/if}
			{#if currentUser}
				<span class="summary-pill">작업자: {currentUser.nickname}</span>
				<button
					class="soft compact-button"
					class:active={newDataCount > 0}
					onclick={openNewData}
					>신규 데이터{newDataCount ? ` ${newDataCount}` : ""}</button
				>
				<button class="soft compact-button" onclick={openRecent}
					>최근 작업</button
				>
				<button class="soft compact-button" onclick={logout}
					>나가기</button
				>
			{/if}
		</div>
	</header>

	<div class="workspace">
		<aside class="nav-pane">
			<div class="pane-title">
				<span
					>{tabs.find((tab) => tab.key === section)?.label ?? "항목"} 목록</span
				>
				<span>{items.length}</span>
			</div>

			<nav class="tabs">
				{#each tabs as tab}
					<button
						class:active={section === tab.key}
						onclick={() => changeSection(tab.key)}
						>{tab.label}</button
					>
				{/each}
			</nav>

			{#if section === "characters" || section === "cards"}
				<div class="chips">
					{#each groups as group}
						<button
							onclick={(event) => activateRootItem(event, group)}
							onauxclick={(event) =>
								activateRootItem(event, group)}
							>{group.label}</button
						>
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
						<button
							class="item-card"
							class:selected={selected?.id === item.id &&
								selected?.type === item.type}
							onclick={(event) =>
								activateRootItem(event, item)}
							onauxclick={(event) =>
								activateRootItem(event, item)}
						>
							<span class="type-badge"
								>{typeNames[item.type] ?? item.type}</span
							>
							<span class="item-main">
								<strong>{item.label}</strong>
								{#if item.translated_label}
									<small class="translated-name"
										>{item.translated_label}</small
									>
								{/if}
								<small>{metaLine(item)}</small>
								<i class:complete={isComplete(item)}
									><b
										style={`width:${progress(item.done, item.total)}%`}
									></b></i
								>
							</span>
						</button>
					{/each}
				{/if}
			</div>
		</aside>

		<aside class="work-pane">
			<div class="pane-title">
				<span>작업 묶음</span>
				<span>{detail?.sections?.length ?? 0}</span>
			</div>
			<div class="section-list">
				{#if loadingDetail}
					<div class="state-card">연결 구조를 읽는 중...</div>
				{:else if detail?.sections?.length}
					{#each detail.sections as part}
						<button
							class="section-row"
							class:active={activeSection?.key === part.key}
							onclick={(event) => activateSection(event, part)}
							onauxclick={(event) =>
								activateSection(event, part)}
						>
							<span>{part.icon}</span>
							<strong>{part.label}</strong>
							<em>{part.done}/{part.total}</em>
						</button>
					{/each}
				{:else}
					<div class="state-card">
						선택한 항목에 번역 단위가 없습니다.
					</div>
				{/if}
			</div>
		</aside>

		<aside class="links-pane">
			{#if detail?.links?.length}
				<div class="link-list">
					<div class="pane-title compact">
						연결 항목 <span>{detail.links.length}</span>
					</div>
					{#each linkGroups() as group}
						<section class="link-group">
							<header>
								<strong>{group.title}</strong>
								<span>{group.type} · {group.links.length}</span>
							</header>
							{#each visibleLinks(group) as link}
								<button
									class="mini-link"
									onmousedown={(event) =>
										activateLinkedItem(event, link)}
									onclick={(event) =>
										activateLinkedItem(event, link)}
								>
									<span
										>{typeNames[link.type] ??
											link.type}</span
									>
									<strong>
										{link.label}
										{#if link.translated_label}
											<small
												>{link.translated_label}</small
											>
										{/if}
									</strong>
								</button>
							{/each}
							{#if group.links.length > 8}
								<button
									class="more-line"
									onclick={() => toggleLinkGroup(group)}
								>
									{expandedLinkGroups[group.key]
										? "접기"
										: `외 ${group.links.length - 8}개 더 보기 (눌러서 펼침)`}
								</button>
							{/if}
						</section>
					{/each}
				</div>
			{:else}
				<div class="pane-title">
					<span>연결 항목</span>
					<span>0</span>
				</div>
				<div class="link-list">
					<div class="state-card">연결된 항목이 없습니다.</div>
				</div>
			{/if}
		</aside>

		<main class="editor-pane">
			<div class="editor-head">
				<div>
					<h1>
						{activeSection?.icon ?? "✦"}
						{activeSection?.label ?? "번역"}
					</h1>
					<p>{selectedTitle()} <span>{selectedSubtitle()}</span></p>
				</div>
				<div class="editor-actions">
					{#if notice}<span class="notice">{notice}</span>{/if}
					{#if navStack.length}
						<button class="soft" onclick={goBack}>이전 항목</button>
					{/if}
					<button class="soft" onclick={retry}>새로고침</button>
					{#if untranslatedCount()}
						<button
							class="soft jump"
							onclick={scrollToNextUntranslated}
							>미번역 {untranslatedCount()}</button
						>
					{/if}
					{#if canUseAiDraft()}
						<button
							class="soft"
							onclick={copyAiPrompt}
							disabled={aiPromptCopying || loadingUnits}
						>
							{aiPromptCopying ? "복사 중..." : "외부 AI용 복사"}
						</button>
						<button
							class="soft ai-button"
							onclick={runAiDraft}
							disabled={aiDrafting || loadingUnits}
						>
							{aiDrafting ? "AI 초벌 중..." : "AI 초벌"}
						</button>
					{/if}
					<label class="inline-check">
						<input
							type="checkbox"
							bind:checked={showOnlyUntranslated}
						/>
						<span>미번역만 보기</span>
					</label>
					<button
						class="save-all"
						onclick={() =>
							Promise.all(
								units
									.filter((unit) => unit.dirty)
									.map(saveUnit),
							)}>일괄 저장</button
					>
				</div>
			</div>

			{#if aiDraftError}
				<section class="warning-box">
					<strong>AI 초벌 확인 필요</strong>
					<p>{aiDraftError}</p>
					<button onclick={() => (aiDraftError = "")}>닫기</button>
				</section>
			{/if}

			{#if error}
				<section class="error-box">
					<strong>오류가 발생했습니다.</strong>
					<p>{error}</p>
					<button onclick={retry}>다시 시도</button>
				</section>
			{:else if loadingUnits}
				<section class="state-card large">
					번역 단위를 불러오는 중...
				</section>
			{:else if !units.length}
				<section class="state-card large">
					이 묶음에는 번역 단위가 없습니다.
				</section>
			{:else if showOnlyUntranslated && !filteredUnits().length}
				<section class="state-card large">
					이 묶음에는 미번역 항목이 없습니다.
				</section>
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
										<button
											onclick={(event) =>
												activateUnitEntity(
													event,
													group,
												)}
											onmousedown={(event) =>
												activateUnitEntityMiddleClick(
													event,
													group,
												)}
											>{entityButtonLabel(group)}</button
										>
									{/if}
									{#if canOpenAdv(group)}
										<button
											class="accent"
											onclick={(event) =>
												activateUnitEntity(
													event,
													group,
													advSectionKey(group),
												)}
											onmousedown={(event) =>
												activateUnitEntityMiddleClick(
													event,
													group,
													advSectionKey(group),
												)}>ADV 본문</button
										>
									{/if}
									<span>{group.units.length}</span>
								</div>
							</header>
							<div class="unit-stack">
								{#each group.units as unit}
									<article
										class="unit-card"
										class:manager={isManagerUnit(unit)}
										class:player-choice={isPlayerChoiceUnit(
											unit,
										)}
										class:untranslated={!String(
											unit.translation_text ?? "",
										).trim()}
									>
										<header>
											<strong>
												{#if speakerLabel(unit)}
													<span class="speaker-chip"
														>{speakerLabel(
															unit,
														)}</span
													>
												{/if}
												{unitTitle(unit)}
											</strong>
											<code>{unitCode(unit)}</code>
										</header>
										<div class="row">
											<div class="row-label">원문</div>
											<p class="original escaped">
												{displayText(
													unit.original_text,
												)}
											</p>
										</div>
										<div class="row current">
											<div class="row-label">현재</div>
											<p class="escaped">
												{unit.translation_text
													? displayText(
															unit.translation_text,
														)
													: "(미번역)"}
											</p>
										</div>
										<div class="row">
											<div class="row-label">번역</div>
											<textarea
												bind:value={unit.draft}
												oninput={() => {
													unit.dirty =
														unit.draft !==
														unit.translation_text;
													unit.error = "";
												}}
												placeholder="번역을 입력하세요..."
											></textarea>
										</div>
										<footer>
											<span class:dirty={unit.dirty}>
												{unit.error ||
													(unit.dirty
														? "저장 필요"
														: unit.status)}
												{#if unit.translator_name}
													<small>
														· {unit.translator_name}</small
													>
												{/if}
											</span>
											<button
												onclick={() => saveUnit(unit)}
												disabled={unit.saving}
												>{unit.saving
													? "저장 중..."
													: "저장"}</button
											>
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

{#if bulkOpen}
	<div class="modal-backdrop">
		<section class="bulk-modal">
			<header>
				<div>
					<h2>일괄 번역</h2>
					<p>원문이 완전히 같은 번역 단위만 채웁니다.</p>
				</div>
				<button class="soft compact-button" onclick={closeBulkFill}
					>닫기</button
				>
			</header>

			<label>
				<span>원문</span>
				<textarea
					bind:value={bulkOriginal}
					oninput={() => (bulkPreview = null)}
					placeholder="정확히 일치시킬 일본어 원문"
				></textarea>
			</label>
			<label>
				<span>번역문</span>
				<textarea
					bind:value={bulkTranslation}
					oninput={() => (bulkPreview = null)}
					placeholder="채워 넣을 번역문"
				></textarea>
			</label>
			<label class="check-line">
				<input
					type="checkbox"
					bind:checked={bulkOverwrite}
					onchange={() => (bulkPreview = null)}
				/>
				<span>이미 번역된 항목도 덮어쓰기</span>
			</label>

			{#if bulkError}
				<div class="login-error">{bulkError}</div>
			{/if}

			{#if bulkPreview}
				<div class="bulk-preview">
					<strong>
						대상 {bulkPreview.targets ?? 0}개 / {bulkPreview.mode === "format"
							? "포맷 일치"
							: "정확 일치"} {bulkPreview.total ?? 0}개 / 기존 번역 {bulkPreview.already_translated ??
							0}개
					</strong>
					{#if bulkPreview.samples?.length}
						<div class="bulk-samples">
							{#each bulkPreview.samples as sample}
								<div>
									<code
										>{sample.category} · {sample.record_id} ·
										{sample.field_path}</code
									>
									{#if sample.translation_text}
										<small
											>{displayText(
												sample.translation_text,
											)}</small
										>
									{/if}
									{#if sample.proposed_translation}
										<small>→ {displayText(sample.proposed_translation)}</small>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<p>변경할 항목이 없습니다.</p>
					{/if}
				</div>
			{/if}

			<footer>
				<button
					class="soft"
					onclick={previewBulkFill}
					disabled={bulkWorking}
					>{bulkWorking ? "확인 중..." : "미리보기"}</button
				>
				<button
					class="save-all"
					onclick={applyBulkFill}
					disabled={bulkWorking || !bulkPreview?.targets}>적용</button
				>
			</footer>
		</section>
	</div>
{/if}

{#if newDataOpen}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={closeNewDataFromBackdrop}
	>
		<section class="recent-modal">
			<header>
				<div>
					<h2>신규 미번역 데이터</h2>
					<p>DB 임포트에서 새로 추가됐으며 자동으로 채워지지 않은 항목입니다.</p>
				</div>
				<button class="soft compact-button" onclick={closeNewData}>닫기</button>
			</header>

			<div class="recent-controls">
				<strong>미번역 {newDataCount}개</strong>
				<button class="soft" onclick={loadNewData} disabled={newDataLoading}
					>{newDataLoading ? "불러오는 중..." : "새로고침"}</button
				>
			</div>

			{#if newDataError}
				<div class="login-error">{newDataError}</div>
			{:else if newDataLoading}
				<div class="state-card">신규 데이터를 불러오는 중...</div>
			{:else if !newDataItems.length}
				<div class="state-card">새로 추가된 미번역 항목이 없습니다.</div>
			{:else}
				<div class="recent-list">
					{#each newDataItems as item}
						<article class="recent-row">
							<header>
								<div>
									<strong>{item.category}</strong>
									{#if item.scope_type && item.scope_id}
										<small>{item.scope_type} · {item.scope_id}</small>
									{/if}
								</div>
								<time>{displayKstTime(item.imported_at)}</time>
							</header>
							<div class="recent-meta-row">
								<code>{item.source_file || item.record_id} · {item.field_path}</code>
								{#if recentItemTarget(item)}
									<button
										class="soft compact-button"
										onclick={(event) => openNewDataItem(event, item)}
										onauxclick={(event) => openNewDataItem(event, item)}
										>번역하기</button
									>
								{/if}
							</div>
							<p class="recent-original">{displayText(item.original_text)}</p>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	</div>
{/if}

{#if recentOpen}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={closeRecentFromBackdrop}
	>
		<section class="recent-modal">
			<header>
				<div>
					<h2>최근 번역</h2>
					<p>마지막 저장 기준으로 번역자와 수정 시간을 확인합니다.</p>
				</div>
				<button class="soft compact-button" onclick={closeRecent}
					>닫기</button
				>
			</header>

			<div class="recent-controls">
				<label>
					<span>작업자</span>
					<select bind:value={recentTranslator} onchange={loadRecent}>
						<option value="">전체</option>
						{#each recentTranslators as translator}
							<option value={translator.translator_name}>
								{translator.translator_name} · {translator.count}
							</option>
						{/each}
					</select>
				</label>
				<button
					class="soft"
					onclick={loadRecent}
					disabled={recentLoading}
					>{recentLoading ? "불러오는 중..." : "새로고침"}</button
				>
			</div>

			{#if recentError}
				<div class="login-error">{recentError}</div>
			{:else if recentLoading}
				<div class="state-card">최근 작업을 불러오는 중...</div>
			{:else if !recentItems.length}
				<div class="state-card">표시할 최근 작업이 없습니다.</div>
			{:else}
				<div class="recent-list">
					{#each recentItems as item}
						<article class="recent-row">
							<header>
								<div>
									<strong>{item.translator_name}</strong>
									{#if item.scope_type && item.scope_id}
										<small>{item.scope_type} · {item.scope_id}</small>
									{/if}
								</div>
								<time>{displayKstTime(item.updated_at)}</time>
							</header>
							<div class="recent-meta-row">
							<code
								>{item.category} · {item.source_file ||
									item.record_id} · {item.field_path}</code
							>
								{#if recentItemTarget(item)}
									<button
										class="soft compact-button"
										onclick={(event) => openRecentItem(event, item)}
										onauxclick={(event) => openRecentItem(event, item)}
										>항목 열기</button
									>
								{/if}
							</div>
							<p class="recent-original">
								{displayText(item.original_text)}
							</p>
							<p class="recent-translation">
								{displayText(item.translation_text)}
							</p>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	</div>
{/if}

{#if !currentUser}
	<div class="login-backdrop">
		<section class="guideline-panel">
			<div class="guideline-inner">
				{#if guidelines}
					<div class="markdown-guidelines">
						{#each markdownBlocks(guidelines) as block}
							{#if block.type === "h1"}
								<h2>{block.text}</h2>
							{:else if block.type === "h2"}
								<h3>{block.text}</h3>
							{:else if block.type === "p"}
								<p>{block.text}</p>
							{:else if block.type === "ul"}
								<ul>
									{#each block.items as item}
										<li>{item}</li>
									{/each}
								</ul>
							{:else if block.type === "table"}
								<div class="guideline-table-wrap">
									<table class="guideline-table">
										<tbody>
											{#each block.rows as row, rowIndex}
												<tr>
													{#each row as cell}
														{#if rowIndex === 0}
															<th>{cell}</th>
														{:else}
															<td>{cell}</td>
														{/if}
													{/each}
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						{/each}
					</div>
				{:else}
					<div class="guideline-loading">
						번역 주의사항을 불러오는 중...
					</div>
				{/if}
			</div>
		</section>

		<section class="login-side">
			<form
				class="login-panel"
				onsubmit={(event) => {
					event.preventDefault();
					login();
				}}
			>
				<div>
					<h2>작업자 입력</h2>
					<p>닉네임과 숫자 6자리 비밀번호만 임시로 저장합니다.</p>
					<p class="plain-password-warning">
						비밀번호는 평문으로 저장됩니다. 다른 곳에서 쓰지 않는
						단순 숫자를 사용해 주세요.
					</p>
				</div>
				<label>
					<span>닉네임</span>
					<input
						bind:value={loginNickname}
						maxlength="24"
						autocomplete="username"
						placeholder="예: 마키노"
					/>
				</label>
				<label>
					<span>비밀번호</span>
					<input
						bind:value={loginPin}
						inputmode="numeric"
						maxlength="6"
						autocomplete="current-password"
						placeholder="숫자 6자리"
					/>
				</label>
				{#if loginError}
					<div class="login-error">{loginError}</div>
				{/if}
				<button class="login-button" type="submit" disabled={loggingIn}
					>{loggingIn ? "확인 중..." : "들어가기"}</button
				>
			</form>
		</section>
	</div>
{/if}
