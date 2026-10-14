<script>
	import { onMount, tick } from "svelte";
	import SearchText from "$lib/SearchText.svelte";
	import ViewportBlock from "$lib/ViewportBlock.svelte";
	import { unitBatches, UNIT_BATCH_SIZE } from "$lib/viewport-blocks.js";
	import { translationDiff } from "$lib/translation-diff.js";
	import "./page.css";

	const tabs = [
		{ key: "groups", label: "Group" },
		{ key: "characters", label: "Character" },
		{ key: "stories", label: "Stories/ADV" },
		{ key: "messages", label: "Message" },
		{ key: "telephones", label: "Phone" },
		{ key: "home", label: "Home Talk" },
		{ key: "cards", label: "Card" },
		{ key: "masterdb", label: "MasterDB" },
	];

	const typeNames = {
		group: "Group",
		character: "Character",
		card: "Card",
		card_evolution_message: "Blooming Lines",
		costume: "Costume",
		hair: "Hair",
		accessory: "Accessory",
		home_action: "Home Action",
		love_home_action: "Moshikoi Home Action",
		company_enjoy_home_action: "Company Home Action",
		showcase_toy: "Goods",
		showcase_toy_category: "Goods Category",
		skill: "Skill",
		skill_efficacy: "Skill Effect",
		live_ability: "Live Ability",
		activity_ability: "Work Ability",
		story_part: "Story Part",
		story_collection: "Story Collection",
		story: "Story",
		love: "Moshikoi Story",
		message_group: "Message Group",
		message_thread: "Message Series",
		message: "Message",
		telephone: "Phone",
		condition_description: "Condition Description",
		excursion_place: "Excursion Place",
		home_talk: "Home Talk",
		call_pattern: "Login Lines",
		adv_file: "ADV File",
		search: "Search",
		category: "Category",
	};

	const relationNames = {
		member: "Member",
		has_card: "Card",
		has_costume: "Costume",
		has_hair: "Hair",
		has_accessory: "Accessory",
		home_action: "Home Action",
		love_home_action: "Love Home Action",
		company_enjoy_home_action: "Company Home Action",
		excursion_place: "Excursion Place",
		costume_home_action: "Costume Home Action",
		condition_costume_home_action: "Costume Home Action",
		card_call_pattern: "Card Login Lines",
		call_pattern: "Login Lines",
		costume_card: "Costume Card",
		fitting_hair: "Fitting Hair",
		has_showcase_toy: "Goods",
		card_goods: "Card Goods",
		character_goods: "Character Goods",
		has_message: "Message",
		has_telephone: "Phone",
		has_home_talk: "Home Talk",
		has_adv: "ADV",
		card_story: "Card Story",
		card_message: "Card Message",
		card_telephone: "Card Phone Call",
		card_home_talk: "Card Home Talk",
		evolution_message: "Blooming Lines",
		reward_costume: "Reward Costume",
		reward_hair: "Reward Hair",
		default_hair: "Default Hair",
		wearable_costume: "Wearable Costume",
		not_wearable_costume: "Non-wearable Costume",
		skillId1: "Skill 1",
		skillId2: "Skill 2",
		skillId3: "Skill 3",
		skillId4: "Skill 4",
		skill_efficacy: "Skill Effect",
		skillId1_efficacy: "Skill 1 Effect",
		skillId2_efficacy: "Skill 2 Effect",
		skillId3_efficacy: "Skill 3 Effect",
		skillId4_efficacy: "Skill 4 Effect",
		liveAbilitySkill: "Live Ability Skill",
		liveAbilitySkill_efficacy: "Live Ability Skill Effect",
		level_skill: "Level Skill",
		liveAbilityId: "Live Ability",
		activityAbilityId: "Work Ability",
		episode: "Episode",
		episode_adv: "Episode ADV",
		chapter_episode: "Chapter Episode",
		chapter_adv: "Chapter ADV",
		uses_adv: "Used ADV",
		choice_adv: "Choice ADV",
		message_group: "Message Group",
		message_thread: "Message Series",
		thread_message: "Series Message",
		in_thread: "Parent Series",
		in_group: "Parent Group",
		company_enjoy_story: "Bond Story",
		company_enjoy_adv: "Bond ADV",
		message_telephone: "Linked Phone Call",
		unlock_condition: "Unlock Condition",
		condition: "Condition Description",
		message_condition: "Message Condition",
		telephone_condition: "Phone Condition",
		home_talk_condition: "Home Talk Condition",
	};

	const fieldNames = {
		value: "Text",
		name: "Name",
		place: "Place",
		description: "Description",
		obtainMessage: "Obtain Message",
		evolveMessage: "Evolve Message",
		title: "Title",
		text: "Line",
		excursionFirstText: "Excursion Intro",
		choiceText: "Choice",
		managerText: "Manager Line",
		displayConditionDescription: "Display Condition",
		branchFirstText: "Branch Guide",
		branchCautionText: "Branch Caution",
		profile: "Profile",
		shortProfile: "Short Profile",
		catchphrase: "Catchphrase",
		favorite: "Likes",
		unfavorite: "Dislikes",
		hometown: "Hometown/School",
		cv: "Voice Actor",
		age: "Age",
		birthday: "Birthday",
		zodiacSign: "Zodiac Sign",
		firstName: "Name",
		groupName: "Group Name",
		idiom: "Idiom",
	};

	const categoryNames = {
		Localization: "Localization",
		Card: "Card Info",
		Costume: "Costume",
		Hair: "Hair",
		Accessory: "Accessory",
		HomeAction: "Home Action",
		LoveHomeAction: "Moshikoi Home Action",
		CompanyEnjoyHomeAction: "Company Home Action",
		ShowcaseToy: "Goods",
		ShowcaseToyCategory: "Goods Category",
		Skill: "Skill",
		LiveAbility: "Live Ability",
		ActivityAbility: "Work Ability",
		Story: "Story Info",
		StoryPart: "Story Part",
		EventStory: "Event Story",
		ExtraStory: "Extra Story",
		Message: "Message",
		MessageGroup: "Message Group",
		ConditionDescription: "Condition Description",
		ExcursionGazeReaction: "Excursion Reaction",
		ExcursionPlace: "Excursion Place",
		Telephone: "Phone",
		HomeTalk: "Home Talk",
		HomeTalkCallPattern: "Login Lines",
		CardEvolutionMessage: "Blooming Lines",
		Character: "Character Profile",
		CharacterGroup: "Group Info",
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
	let bodyFindOpen = $state(false);
	let bodyFindQuery = $state("");
	let bodyFindTerm = $state("");
	let bodyFindInput = $state();
	let editorPane = $state();
	let findReturnFocus;
	let bodyFindIndex = $state(0);
	let findNavigation = 0;
	const bodyFindMatches = $derived.by(() => {
		const term = bodyFindTerm.toLowerCase();
		if (!bodyFindOpen || !term || loadingUnits) return [];
		return filteredUnits().filter(unit =>
			[unit.original_text, unit.translation_text, unit.draft].some(
				value => displayText(value).toLowerCase().includes(term),
			),
		);
	});
	const bodyFindActive = $derived(bodyFindMatches[bodyFindIndex]?.unit_id);
	$effect(() => {
		const term = bodyFindQuery;
		const timer = setTimeout(() => { bodyFindTerm = term; }, 150);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		// Recompute the position when text, filters, or the loaded section change.
		const matches = bodyFindMatches;
		bodyFindIndex = 0;
		if (matches.length) void revealFindMatch(matches[0].unit_id);
	});

	async function openBodyFind() {
		if (!bodyFindOpen) findReturnFocus = document.activeElement;
		bodyFindOpen = true;
		await tick();
		bodyFindInput?.focus();
		bodyFindInput?.select();
	}

	function closeBodyFind() {
		findNavigation++;
		bodyFindOpen = false;
		if (findReturnFocus?.isConnected) findReturnFocus.focus({ preventScroll: true });
		else editorPane?.focus({ preventScroll: true });
	}

	async function revealFindMatch(id) {
		const request = ++findNavigation;
		await tick();
		if (request !== findNavigation || !bodyFindOpen) return;
		await scrollToUnit(id);
	}

	function moveBodyFind(direction) {
		if (!bodyFindMatches.length) return;
		bodyFindIndex = (bodyFindIndex + direction + bodyFindMatches.length) % bodyFindMatches.length;
		void revealFindMatch(bodyFindMatches[bodyFindIndex].unit_id);
	}

	let unloadedSectionDone = 0;
	let loadingItems = $state(true);
	let loadingDetail = $state(false);
	let loadingUnits = $state(false);
	let acceptingSuggestions = $state(false);
	let suggestionSaveProgress = $state("");
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
	let navPaneCollapsed = $state(false);
	let workPaneCollapsed = $state(false);
	let linksPaneCollapsed = $state(false);
	let mobilePane = $state("nav");
	let selectedFieldLabels = $state(null);
	let fieldFilterElement;
	const fieldFilterOptions = $derived.by(() => {
		const counts = new Map();
		for (const unit of units) {
			const label = fieldLabel(unit.field_path);
			const count = counts.get(label) ?? { done: 0, total: 0 };
			count.total += 1;
			if (String(unit.translation_text ?? "").trim()) count.done += 1;
			counts.set(label, count);
		}
		return [...counts].sort(([a], [b]) => a.localeCompare(b, "ko"));
	});

	function fieldFilterDismiss(node) {
		const close = (event) => {
			if (event.type === "keydown" && event.key !== "Escape") return;
			if (event.type === "pointerdown" && node.contains(event.target)) return;
			if (node.open && event.type === "keydown") node.querySelector("summary")?.focus();
			node.open = false;
		};
		document.addEventListener("pointerdown", close);
		document.addEventListener("keydown", close);
		return { destroy() {
			document.removeEventListener("pointerdown", close);
			document.removeEventListener("keydown", close);
		} };
	}

	function toggleFieldLabel(label, checked) {
		const selected = new Set(selectedFieldLabels ?? fieldFilterOptions.map(([name]) => name));
		if (checked) selected.add(label);
		else selected.delete(label);
		selectedFieldLabels = selected.size === fieldFilterOptions.length ? null : [...selected];
	}
	let aiDrafting = $state(false);
	let aiPromptCopying = $state(false);
	let aiPromptPreview = $state("");
	let aiPromptTargetCount = $state(0);
	let aiPromptCopyHelp = $state("");
	let aiPromptTextarea = $state();
	let aiDraftError = $state("");
	let searchTimer;

	async function fetchJson(url, options = {}, timeoutMs = 20000) {
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
						`The server connection was interrupted. Please try again shortly. (HTTP ${response.status})`,
					);
				}
				const snippet = text.replace(/\s+/g, " ").slice(0, 240);
				throw new Error(
					`Non-JSON response: ${response.status} ${response.url} ${snippet}`,
				);
			}
			if (!response.ok || data.error)
				throw new Error(data.error || `HTTP ${response.status}`);
			return data;
		} catch (err) {
			if (err.name === "AbortError")
				throw new Error(
					"The request timed out. Please check the server status.",
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
			total: Math.max(Number(activeSection.total ?? 0), units.length),
			done: unloadedSectionDone + units.filter((unit) =>
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
		mobilePane = "work";
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
			mobilePane = snapshot.selected ? "editor" : "nav";
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
		mobilePane = preferredKey ? "editor" : "work";
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
		mobilePane = "editor";
	}

	async function goBack({ syncHistory = true } = {}) {
		const previous = navStack.at(-1);
		if (!previous) return;
		navStack = navStack.slice(0, -1);
		await selectItem(previous.item, previous.sectionKey);
		mobilePane = "editor";
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
		unloadedSectionDone = 0;
		selectedFieldLabels = null;
		if (fieldFilterElement) fieldFilterElement.open = false;
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
			const data = await fetchJson(`/api/units?${params}`, {
				headers: canUseCodexSuggestions() ? { "x-ai-suggestion-pin": currentUser.pin } : {},
			});
			units = (data.units ?? []).map((unit) => ({
				...unit,
				draft: unit.translation_text ?? "",
				dirty: false,
				saving: false,
				error: "",
			}));
			// Saving a loaded row must not discard progress for rows beyond the API limit.
			unloadedSectionDone = Math.max(0, Number(part.done ?? 0) - units.filter(
				unit => String(unit.translation_text ?? "").trim(),
			).length);
		} catch (err) {
			error = err.message;
			units = [];
		} finally {
			loadingUnits = false;
		}
		await tick();
		if (window.location.hash.startsWith("#unit-")) {
			try { await scrollToUnit(decodeURIComponent(window.location.hash.slice("#unit-".length))); } catch { /* Ignore malformed URL fragments. */ }
		}
	}

	function suggestionReferenceUrl(reference) {
		const params = new URLSearchParams({ tab: "stories", type: reference.scope_type, id: reference.scope_id });
		if (reference.source_type === "adv") {
			params.set("type", "adv_file");
			params.set("id", reference.source_file);
			params.set("part", "adv");
		}
		if (reference.field_path === "place") params.set("part", "adv_places");
		return `/?${params}#${encodeURIComponent(`unit-${reference.unit_id}`)}`;
	}

	function canUseCodexSuggestions() {
		return currentUser?.nickname === "admin";
	}

	function canAcceptSuggestion(unit) {
		return Boolean(unit.ai_suggestion && !unit.ai_suggestion.accepted_at &&
			!unit.ai_suggestion.stale && !unit.dirty && !unit.saving);
	}

	async function useVisibleAiSuggestions() {
		if (acceptingSuggestions || loadingUnits || !canUseCodexSuggestions()) return;
		const targets = filteredUnits().filter(canAcceptSuggestion);
		if (!targets.length) return;
		acceptingSuggestions = true;
		let saved = 0;
		let failed = 0;
		let skipped = 0;
		try {
			for (const [index, unit] of targets.entries()) {
				suggestionSaveProgress = `${index + 1}/${targets.length}`;
				if (!canAcceptSuggestion(unit)) { skipped++; continue; }
				if (await useAiSuggestion(unit, true)) saved++;
				else failed++;
			}
			await loadSummary();
		} finally {
			acceptingSuggestions = false;
			suggestionSaveProgress = "";
			notice = `Saved ${saved} AI suggestions${failed ? ` · ${failed} failed (check per-item errors)` : ""}${skipped ? ` · ${skipped} skipped` : ""}`;
		}
	}

	async function useAiSuggestion(unit, batch = false) {
		if (!canUseCodexSuggestions()) {
			unit.error = "AI suggestions can only be used by the admin account.";
			return false;
		}
		if (!canAcceptSuggestion(unit)) return false;
		unit.saving = true;
		unit.error = "";
		try {
			const data = await fetchJson("/api/ai-suggestions/accept", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ unit_id: unit.unit_id, created_at: unit.ai_suggestion.created_at,
					nickname: currentUser.nickname, pin: currentUser.pin }),
			});
			Object.assign(unit, data.unit, { draft: data.unit.translation_text, dirty: false });
			unit.ai_suggestion = { ...unit.ai_suggestion, accepted_at: "accepted", accepted_by: currentUser.nickname };
			if (newDataItems.some((item) => item.unit_id === unit.unit_id)) {
				newDataItems = newDataItems.filter((item) => item.unit_id !== unit.unit_id);
				newDataCount = Math.max(0, newDataCount - 1);
			}
			refreshActiveSectionProgress();
			if (!batch) {
				notice = "Saved the AI suggestion as the translation.";
				await loadSummary();
			}
			return true;
		} catch (err) {
			unit.error = err.message;
			return false;
		} finally {
			unit.saving = false;
		}
	}

	async function saveUnit(unit) {
		if (!currentUser) {
			loginError = "Enter a nickname before saving.";
			return;
		}
		const missing = missingPlaceholders(unit.original_text, unit.draft);
		if (missing.length && unit.draft.trim()) {
			const ok = confirm(
				`Placeholders in the source are missing from the translation: ${missing.join(", ")}\nSave anyway?`,
			);
			if (!ok) {
				unit.error = `Missing placeholders: ${missing.join(", ")}`;
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
					expected_revision: unit.revision,
					translation_text: unit.draft,
					nickname: currentUser.nickname,
					pin: currentUser.pin,
				}),
			});
			unit.translation_text = unit.draft;
			unit.status = data.status;
			unit.revision = data.revision;
			unit.translator_name = data.translator_name ?? currentUser.nickname;
			unit.dirty = false;
			if (unit.ai_suggestion && !unit.ai_suggestion.accepted_at) {
				unit.ai_suggestion.stale = unit.revision !== unit.ai_suggestion.base_revision || unit.original_text !== unit.ai_suggestion.base_original_text || unit.translation_text !== unit.ai_suggestion.base_translation_text;
			}
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
			notice = "Saved.";
			await loadSummary();
		} catch (err) {
			unit.error = err.message;
		} finally {
			unit.saving = false;
		}
	}

	async function fillCardInfo(unit) {
		if (!currentUser) {
			unit.error = "Login required.";
			return;
		}
		if (!unit.draft.trim()) {
			unit.error = "Enter the translation first.";
			return;
		}
		
		const ok = confirm(`Fill the remaining items (home talks, messages, goods, etc.) with '${unit.draft}'?\n(Already translated items will be overwritten)`);
		if (!ok) return;

		unit.saving = true;
		unit.error = "";
		notice = "";
		try {
			const data = await fetchJson("/api/bulk-card-fill", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					card_id: selected?.id,
					raw_title: unit.draft,
					nickname: currentUser.nickname,
					pin: currentUser.pin,
				}),
			});
			if (!data.ok) throw new Error(data.error || "Bulk fill failed");
			
			notice = `Filled ${data.updated} items. (Title: ${data.title}, Character: ${data.chr})`;
			unit.dirty = false;
			unit.translation_text = unit.draft;
			unit.status = "translated";
			if (activeSection) await loadUnits(activeSection);
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
		mobilePane = "nav";
		loadItems().then(() => writeHistory("push"));
	}

	function queueSearch() {
		mobilePane = "nav";
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
		mobilePane = "nav";
		expandedLinkGroups = {};
		loadItems().then(() => writeHistory("push"));
	}

	async function login() {
		loginError = "";
		const nickname = loginNickname.trim();
		const pin = loginPin.trim();
		if (!nickname) {
			loginError = "Enter a nickname.";
			return;
		}
		if (!/^\d{6}$/.test(pin)) {
			loginError = "Enter a 6-digit numeric password.";
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
			if (activeSection && canUseCodexSuggestions()) {
				const params = new URLSearchParams({ type: selected?.type ?? "category", id: selected?.id ?? "", key: activeSection.key });
				if (activeSection.category) params.set("category", activeSection.category);
				const data = await fetchJson(`/api/units?${params}`, { headers: { "x-ai-suggestion-pin": currentUser.pin } });
				const suggestions = new Map(data.units.map((unit) => [unit.unit_id, unit.ai_suggestion]));
				for (const unit of units) unit.ai_suggestion = suggestions.get(unit.unit_id) ?? null;
			}
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
		if (item.category === "adv/excursion") return "adv_excursion";
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
			recentItems = (data.items ?? []).map((item) => ({
				...item,
				diff: !item.previous_text ? null : translationDiff(item.previous_text, item.translation_text),
			}));
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
		for (const unit of units) unit.ai_suggestion = null;
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
		for (let attempt = 0; attempt < 600; attempt += 1) {
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
		throw new Error("AI translation did not finish within 15 minutes.");
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

	async function copyPromptText(text) {
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch { /* Fall back when clipboard permissions deny access. */ }
		}
		// LAN HTTP origins need the compatibility copy command.
		const field = document.createElement("textarea");
		const previousFocus = document.activeElement;
		field.value = text;
		field.readOnly = true;
		field.style.cssText = "position:fixed;top:0;left:-9999px;font-size:16px";
		document.body.appendChild(field);
		try {
			field.focus({ preventScroll: true });
			field.select();
			return document.execCommand("copy");
		} catch {
			return false;
		} finally {
			field.remove();
			if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
		}
	}

	async function copyAiPrompt() {
		if (!currentUser) {
			aiDraftError = "Please log in first.";
			return;
		}
		const { targets, referenceUnitIds } = aiDraftSelection();
		if (!targets.length) {
			aiDraftError = "There are no untranslated items to copy.";
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
			const prompt = String(data.prompt ?? "");
			if (!prompt.trim()) throw new Error("The prompt to copy is empty.");
			const targetCount = data.target_count ?? targets.length;
			if (await copyPromptText(prompt)) {
				notice = `Copied guidelines and ${targetCount} untranslated items for external AI`;
				return;
			}
			aiPromptPreview = prompt;
			aiPromptTargetCount = targetCount;
			aiPromptCopyHelp = "";
		} catch (err) {
			aiDraftError = err.message;
		} finally {
			aiPromptCopying = false;
		}
	}

	async function copyPreparedAiPrompt() {
		if (!aiPromptTextarea) return;
		if (await copyPromptText(aiPromptPreview)) {
			notice = `Copied guidelines and ${aiPromptTargetCount} untranslated items for external AI`;
			aiPromptPreview = "";
		} else {
			aiPromptTextarea.focus();
			aiPromptTextarea.select();
			aiPromptCopyHelp = "Automatic copy was blocked. Please copy the selected text manually.";
		}
	}

	async function runAiDraft() {
		if (!currentUser) {
			aiDraftError = "Please log in first.";
			return;
		}
		if (!canUseAiDraft()) {
			aiDraftError = "Log in to use AI drafts.";
			return;
		}
		const { targets, referenceUnitIds } = aiDraftSelection();
		if (!targets.length) {
			aiDraftError = "There are no untranslated items to draft.";
			return;
		}
		const ok = confirm(
			`Fill AI drafts for ${targets.length} untranslated items matching the current filter?\nItems outside the screen are included; up to 150 are processed at a time.\nOnly drafts are entered; you must save them yourself.`,
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
			units = units.map((unit) => {
				if (!translated.has(String(unit.unit_id))) return unit;
				const draft = translated.get(String(unit.unit_id));
				applied += 1;
				return {
					...unit,
					draft,
					dirty: draft !== unit.translation_text,
					error: "",
				};
			});
			notice = data.usage
				? `${applied} AI drafts entered · ${data.usage.remaining} left today`
				: `${applied} AI drafts entered`;
			if (data.warnings?.length) {
				const shown = data.warnings
					.slice(0, 20)
					.map((warning) => `${warning.unit_id}: ${warning.message}`)
					.join("\n");
				const hidden = data.warnings.length - 20;
				aiDraftError =
					hidden > 0 ? `${shown}\n... and ${hidden} more` : shown;
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
			bulkError = "Please log in first.";
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
			bulkError = "There are no items to change.";
			return;
		}
		const matchLabel =
			bulkPreview.mode === "format" ? "format-matching source" : "exactly matching source";
		const ok = confirm(
			`Fill translations for ${targets.toLocaleString()} ${matchLabel} items?`,
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
			notice = `Bulk translation applied to ${data.updated ?? 0} items`;
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
		if (event.isComposing || document.querySelector('.modal-backdrop, .login-backdrop')) return;
		const inEditor = editorPane?.contains(event.target);
		if (inEditor && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
			event.preventDefault();
			void openBodyFind();
			return;
		}
		if (inEditor && bodyFindOpen && event.key === "Escape") {
			event.preventDefault();
			closeBodyFind();
			return;
		}

		if (
			(event.ctrlKey || event.metaKey) &&
			event.key.toLowerCase() === "k"
		) {
			event.preventDefault();
			document.querySelector("#global-search")?.focus();
		}
	}

	function selectedTitle() {
		return detail?.entity?.label ?? selected?.label ?? "No item selected";
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

	const excursionPlaceLabels = {
		"01_01": "Ferris Wheel",
		"01_02": "Coast",
		"01_03": "Pool",
		"01_04": "Shopping",
		"01_05": "Outing End",
	};

	function shouldGroupCharacterAdvByFile(unit) {
		return (
			["adv_bond", "adv_hbd", "adv_userhbd", "adv_excursion"].includes(
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
		const m = unit.source_file?.match(/^adv_event_excursion_.*_(\d{2}_\d{2})\.txt$/);
		if (m && excursionPlaceLabels[m[1]]) {
			return `${excursionPlaceLabels[m[1]]} (${m[1]}) · ${unit.source_file}`;
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
			return "Player choice";
		if (unit.speaker === "__player_text__") return "Player";
		if (isManagerUnit(unit)) return "Manager";
		if (displaySpeaker(unit)) return "Speaker";
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
			(unit) =>
				(selectedFieldLabels === null || selectedFieldLabels.includes(fieldLabel(unit.field_path))) &&
				!String(unit.translation_text ?? "").trim(),
		).length;
	}

	async function scrollToUnit(id) {
		for (const group of unitGroups()) {
			const index = group.units.findIndex(unit => unit.unit_id === id);
			if (index < 0) continue;
			const first = group.units[Math.floor(index / UNIT_BATCH_SIZE) * UNIT_BATCH_SIZE];
			const block = document.getElementById(`unit-block-${first.unit_id}`);
			block?.dispatchEvent(new Event("reveal-unit"));
			await tick();
			block?.scrollIntoView({ block: "start" });
			await tick();
			document.getElementById(`unit-${id}`)?.scrollIntoView({ block: "center" });
			return;
		}
	}

	function scrollToNextUntranslated() {
		const target = filteredUnits().find(unit => !String(unit.translation_text ?? "").trim());
		if (target) void scrollToUnit(target.unit_id);
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
			"card_home_dialogues",
			"card_home_talks",
			"card_telephones",
			"skills",
			"card_skills",
			"costumes",
			"hair",
			"accessories",
			"goods",
			"home_actions",
			"evolution",
			"group_message_titles",
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
			"adv_excursion",
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
			return "Character Common ADV";
		}
		if (shouldGroupByOwner() && unit.owner_label) return unit.owner_label;
		return groupTitle(unit);
	}

	function ownerGroupSubtitle(unit) {
		if (shouldGroupByOwner() && shouldGroupCharacterAdvByFile(unit)) {
			return `${unit.category} · ${unit.source_file}`;
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
		const name = typeNames[group.scope_type] ?? "Item";
		return `Open ${name}`;
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
		return units.filter(
			(unit) =>
				(selectedFieldLabels === null || selectedFieldLabels.includes(fieldLabel(unit.field_path))) &&
				(!showOnlyUntranslated || !String(unit.translation_text ?? "").trim()),
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
						Boolean(saved.is_admin) || saved.nickname === "admin",
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
		if (initialSelected) mobilePane = "editor";

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
		<button class="brand" onclick={goHome} title="Back to start">
			<span>Hoshimi Station</span>
		</button>
		<label class="search">
			<span>🔍</span>
			<input
				id="global-search"
				bind:value={query}
				oninput={queueSearch}
				placeholder="Search ID / source / translation... (Ctrl+K)"
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
				Translation guidelines
			</button>
			{#if guidelinesOpen}
				<aside class="guideline-popover" aria-label="Translation guidelines">
					<header>
						<strong>Translation guidelines</strong>
						<button
							class="soft compact-button"
							type="button"
							onclick={() => (guidelinesOpen = false)}
							>Close</button
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
								Loading translation notes...
							</div>
						{/if}
					</div>
				</aside>
			{/if}
		</div>
		<button class="soft compact-button top-bulk-button" onclick={openBulkFill}
			>Bulk translate</button
		>
		<div class="top-actions">
			{#if summary}
				<span class="summary-pill"
					>{summary.done ?? 0}/{summary.units ?? 0}</span
				>
			{/if}
			{#if currentUser}
				<span class="summary-pill">Worker: {currentUser.nickname}</span>
				<button
					class="soft compact-button"
					class:active={newDataCount > 0}
					onclick={openNewData}
					>New data{newDataCount ? ` ${newDataCount}` : ""}</button
				>
				<button class="soft compact-button" onclick={openRecent}
					>Recent work</button
				>
				<button class="soft compact-button" onclick={logout}
					>Log out</button
				>
			{/if}
		</div>
	</header>

	<div
		class="workspace"
		class:nav-collapsed={navPaneCollapsed}
		class:work-collapsed={workPaneCollapsed}
		class:links-collapsed={linksPaneCollapsed}
	>
		<nav class="mobile-workspace-nav" aria-label="Workspace">
			<button class:active={mobilePane === "nav"} aria-pressed={mobilePane === "nav"} onclick={() => (mobilePane = "nav")}>List</button>
			<button class:active={mobilePane === "work"} aria-pressed={mobilePane === "work"} disabled={!selected} onclick={() => (mobilePane = "work")}>Work group</button>
			<button class:active={mobilePane === "links"} aria-pressed={mobilePane === "links"} disabled={!selected} onclick={() => (mobilePane = "links")}>Linked items</button>
			<button class:active={mobilePane === "editor"} aria-pressed={mobilePane === "editor"} disabled={!selected} onclick={() => (mobilePane = "editor")}>Translate</button>
		</nav>
		<aside class="nav-pane" class:collapsed={navPaneCollapsed} class:mobile-active={mobilePane === "nav"}>
			<div class="pane-title">
				<span class="pane-heading"
					>{tabs.find((tab) => tab.key === section)?.label ?? "Item"} list</span
				>
				<div class="pane-title-tools">
					<span class="pane-count">{items.length}</span>
					<button
						class="pane-toggle"
						type="button"
						title={navPaneCollapsed ? "Expand list" : "Collapse list"}
						aria-label={navPaneCollapsed ? "Expand list" : "Collapse list"}
						onclick={() => (navPaneCollapsed = !navPaneCollapsed)}
						>{navPaneCollapsed ? "›" : "‹"}</button
					>
				</div>
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
					<div class="state-card">Loading list...</div>
				{:else if !items.length}
					<div class="state-card">No items to display.</div>
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

		<aside class="work-pane" class:collapsed={workPaneCollapsed} class:mobile-active={mobilePane === "work"}>
			<div class="pane-title">
				<span class="pane-heading">Work group</span>
				<div class="pane-title-tools">
					<span class="pane-count">{detail?.sections?.length ?? 0}</span>
					<button
						class="pane-toggle"
						type="button"
						title={workPaneCollapsed ? "Expand work group" : "Collapse work group"}
						aria-label={workPaneCollapsed ? "Expand work group" : "Collapse work group"}
						onclick={() => (workPaneCollapsed = !workPaneCollapsed)}
						>{workPaneCollapsed ? "›" : "‹"}</button
					>
				</div>
			</div>
			{#if selected}<div class="mobile-pane-context">{selectedTitle()}</div>{/if}
			<div class="section-list">
				{#if loadingDetail}
					<div class="state-card">Reading link structure...</div>
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
						The selected item has no translation units.
					</div>
				{/if}
			</div>
		</aside>

		<aside class="links-pane" class:collapsed={linksPaneCollapsed} class:mobile-active={mobilePane === "links"}>
			<div class="pane-title">
				<span class="pane-heading">Linked items</span>
				<div class="pane-title-tools">
					<span class="pane-count">{detail?.links?.length ?? 0}</span>
					<button
						class="pane-toggle"
						type="button"
						title={linksPaneCollapsed ? "Expand linked items" : "Collapse linked items"}
						aria-label={linksPaneCollapsed ? "Expand linked items" : "Collapse linked items"}
						onclick={() => (linksPaneCollapsed = !linksPaneCollapsed)}
						>{linksPaneCollapsed ? "›" : "‹"}</button
					>
				</div>
			</div>
			{#if selected}<div class="mobile-pane-context">{selectedTitle()}</div>{/if}
			{#if detail?.links?.length}
				<div class="link-list">
					{#each linkGroups() as group}
						<section class="link-group">
							<header>
								<strong>{group.title}</strong>
								<span>{group.type} · {group.links.length}</span>
							</header>
							{#each visibleLinks(group) as link}
								<button
									class="mini-link"
									onmousedown={(event) => {
										if (event.button === 1) activateLinkedItem(event, link);
									}}
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
										? "Collapse"
										: `Show ${group.links.length - 8} more (click to expand)`}
								</button>
							{/if}
						</section>
					{/each}
				</div>
			{:else}
				<div class="link-list">
					<div class="state-card">No linked items.</div>
				</div>
			{/if}
		</aside>

		<main bind:this={editorPane} tabindex="-1" class="editor-pane" class:mobile-active={mobilePane === "editor"}>
			<div class="editor-head">
				<div>
					<h1>
						{activeSection?.icon ?? "✦"}
						{activeSection?.label ?? "Translation"}
					</h1>
					<p>{selectedTitle()} <span>{selectedSubtitle()}</span></p>
				</div>
				<div class="editor-actions">
					{#if notice}<span class="notice">{notice}</span>{/if}
					{#if navStack.length}
						<button class="soft" onclick={goBack}>Previous item</button>
					{/if}
					<button class="soft" onclick={retry}>Refresh</button>
					{#if untranslatedCount()}
						<button
							class="soft jump"
							onclick={scrollToNextUntranslated}
							>Untranslated {untranslatedCount()}</button
						>
					{/if}
					{#if canUseAiDraft()}
						<button
							class="soft"
							onclick={copyAiPrompt}
							disabled={aiPromptCopying || loadingUnits}
						>
							{aiPromptCopying ? "Copying..." : "Copy for external AI"}
						</button>
						<button
							class="soft ai-button"
							onclick={runAiDraft}
							aria-busy={aiDrafting}
							disabled={aiDrafting || loadingUnits}
						>
							{aiDrafting ? "Drafting with AI..." : "AI draft"}
						</button>
					{/if}
					<details class="field-filter" bind:this={fieldFilterElement} use:fieldFilterDismiss>
						<summary class="soft" class:active={selectedFieldLabels !== null} class:untranslated={showOnlyUntranslated}>Category {selectedFieldLabels === null ? "All" : `${selectedFieldLabels.length}`}{showOnlyUntranslated ? " · untranslated" : ""}</summary>
						<div class="field-filter-menu">
							<label class="field-filter-untranslated">
								<input type="checkbox" bind:checked={showOnlyUntranslated} />
								<span>Untranslated only</span>
							</label>
							<div class="field-filter-actions">
								<button class="soft" onclick={() => (selectedFieldLabels = null)}>Select all</button>
								<button class="soft" onclick={() => (selectedFieldLabels = [])}>Clear all</button>
							</div>
							{#each fieldFilterOptions as [label, count] (label)}
								<label>
									<input type="checkbox" checked={selectedFieldLabels === null || selectedFieldLabels.includes(label)} onchange={(event) => toggleFieldLabel(label, event.currentTarget.checked)} />
									<span>{label}</span><small>{count.done}/{count.total}</small>
								</label>
							{/each}
						</div>
					</details>
					{#if canUseCodexSuggestions()}
					<button
						class="soft ai-button"
						onclick={useVisibleAiSuggestions}
						aria-busy={acceptingSuggestions}
						disabled={!currentUser || loadingUnits || acceptingSuggestions || !filteredUnits().some(canAcceptSuggestion)}
						title="Immediately saves the usable AI suggestions for the displayed items as translations. Unsaved input, stale suggestions, and already used suggestions are excluded."
					>
						{acceptingSuggestions ? `Saving AI suggestions ${suggestionSaveProgress}` : `Use all AI suggestions (${filteredUnits().filter(canAcceptSuggestion).length})`}
					</button>
					{/if}
					<button
						class="save-all"
						onclick={() =>
							Promise.all(
								units
									.filter((unit) => unit.dirty)
									.map(saveUnit),
							)}>Save all</button
					>
				</div>
				<div class="editor-search-row">
					{#if bodyFindOpen}
						<div class="body-finder" role="search" aria-label="Body search">
							<div class="body-find-field"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
							<input bind:this={bodyFindInput} bind:value={bodyFindQuery}
								aria-label="Search source and translation in the current filter" placeholder="Search source / translation"
								onkeydown={(event) => {
									if (event.key === "Enter" && !event.isComposing) {
									 event.preventDefault(); moveBodyFind(event.shiftKey ? -1 : 1);
									}
								}} />
							<span class="body-find-count" aria-live="polite">{bodyFindQuery !== bodyFindTerm ? "Searching…" : `${bodyFindMatches.length ? bodyFindIndex + 1 : 0} / ${bodyFindMatches.length} items`}</span>
							</div>
							<button class="body-find-control" aria-label="Previous result" title="Previous (Shift+Enter)" disabled={!bodyFindMatches.length} onclick={() => moveBodyFind(-1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
							<button class="body-find-control" aria-label="Next result" title="Next (Enter)" disabled={!bodyFindMatches.length} onclick={() => moveBodyFind(1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
							<button class="body-find-control" aria-label="Close body search" title="Close (Esc)" onclick={closeBodyFind}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
						</div>
					{:else}
						<button class="soft body-find-trigger" onclick={openBodyFind} title="Search source, translations, and drafts in the current filter"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>Search text <kbd>Ctrl F</kbd></button>
					{/if}
				</div>
			</div>

			{#if !loadingUnits && !error && activeSection && activeSection.total > units.length}
				<section class="warning-box">
					Loaded {units.length.toLocaleString()} of {activeSection.total.toLocaleString()}.
					The remaining items are not shown yet because of the query limit.
				</section>
			{/if}

			{#if aiDraftError}
				<section class="warning-box">
					<strong>AI draft needs review</strong>
					<p>{aiDraftError}</p>
					<button onclick={() => (aiDraftError = "")}>Close</button>
				</section>
			{/if}

			{#if error}
				<section class="error-box">
					<strong>An error occurred.</strong>
					<p>{error}</p>
					<button onclick={retry}>Retry</button>
				</section>
			{:else if loadingUnits}
				<section class="state-card large">
					Loading translation units...
				</section>
			{:else if !units.length}
				<section class="state-card large">
					This group has no translation units.
				</section>
			{:else if !filteredUnits().length}
				<section class="state-card large">
					No items match the selected criteria.
				</section>
			{:else}
				<div class="group-stack">
					{#each unitGroups() as group (group.key)}
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
												)}>ADV Text</button
										>
									{/if}
									<span>{group.units.length}</span>
								</div>
							</header>
							<div class="unit-stack">
								{#each unitBatches(group.units) as batch (batch[0].unit_id)}
								<ViewportBlock id={`unit-block-${batch[0].unit_id}`} count={batch.length}>
								{#each batch as unit (unit.unit_id)}
									<article
										class="unit-card"
										class:find-active={bodyFindOpen && bodyFindActive === unit.unit_id}
										id={`unit-${unit.unit_id}`}
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
											<div class="row-label">Source</div>
											<p class="original escaped">
												<SearchText text={displayText(unit.original_text)} query={bodyFindOpen ? bodyFindTerm : ""} />
											</p>
										</div>
										<div class="row current">
											<div class="row-label">Current</div>
											<p class="escaped">
												<SearchText text={unit.translation_text ? displayText(unit.translation_text) : "(untranslated)"} query={bodyFindOpen ? bodyFindTerm : ""} />
											</p>
										</div>
										<div class="row">
											<div class="row-label">Translation</div>
											<textarea
												bind:value={unit.draft}
												oninput={() => {
													unit.dirty =
														unit.draft !==
														unit.translation_text;
													unit.error = "";
												}}
												placeholder="Enter translation..."
											></textarea>
											{#if bodyFindOpen && bodyFindTerm && unit.dirty && displayText(unit.draft).toLowerCase().includes(bodyFindTerm.toLowerCase())}
												<p class="draft-find-preview escaped"><SearchText text={displayText(unit.draft)} query={bodyFindTerm} /></p>
											{/if}
										</div>
										{#if canUseCodexSuggestions()}
										<div class="row ai-suggestion">
											<div class="row-label">AI suggestion</div>
											<div class="suggestion-content">
												{#if unit.ai_suggestion}
													<div class="suggestion-heading">
														<strong>{unit.ai_suggestion.accepted_at ? "Used suggestion" : "Translation suggestion"}</strong>
														<button class="soft suggestion-save" onclick={() => useAiSuggestion(unit)}
															disabled={unit.saving || Boolean(unit.ai_suggestion.accepted_at) || unit.ai_suggestion.stale || unit.dirty}>
															{unit.saving ? "Saving..." : unit.ai_suggestion.accepted_at ? "Used" : "Use"}
														</button>
													</div>
													<p class="suggestion-text">{displayText(unit.ai_suggestion.translation_text)}</p>
													<p class="suggestion-reason"><strong>Reason</strong><br />{unit.ai_suggestion.reason}</p>
													{#if unit.ai_suggestion.references.length}
														<div class="suggestion-references">
															<strong>Reference translation</strong>
															{#each unit.ai_suggestion.references as reference}
																<a href={suggestionReferenceUrl(reference)} target="_blank" rel="noopener noreferrer">{reference.label || reference.source_file} ↗</a>
																<small>{displayText(reference.original_text)} → {displayText(reference.translation_text)}</small>
															{/each}
														</div>
													{/if}
													{#if !unit.ai_suggestion.accepted_at && unit.ai_suggestion.stale}
														<small class="suggestion-warning">The content changed after the suggestion, so it cannot be used.</small>
													{:else if !unit.ai_suggestion.accepted_at && unit.dirty}
														<small class="suggestion-warning">Save or revert your draft translation before using this.</small>
													{/if}
												{:else}
													<span class="suggestion-empty">No AI suggestion yet.</span>
												{/if}
											</div>
										</div>
										{/if}
										<footer>
											<span class:dirty={unit.dirty}>
												{unit.error ||
													(unit.dirty
														? "Save needed"
														: unit.status)}
												{#if unit.translator_name}
													<small>
														· {unit.translator_name}</small
													>
												{/if}
											</span>
											{#if unit.category === "Card" && unit.field_path === "name"}
												<button
													class="accent"
													onclick={() => fillCardInfo(unit)}
													disabled={unit.saving}
												>{unit.saving ? "Filling..." : "Fill remaining items with this translation"}</button>
											{/if}
											<button
												onclick={() => saveUnit(unit)}
												disabled={unit.saving}
												>{unit.saving
													? "Saving..."
													: "Save"}</button
											>
										</footer>
									</article>
								{/each}
								</ViewportBlock>
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
					<h2>Bulk translate</h2>
					<p>Only translation units with identical source text are filled.</p>
				</div>
				<button class="soft compact-button" onclick={closeBulkFill}
					>Close</button
				>
			</header>

			<label>
				<span>Source</span>
				<textarea
					bind:value={bulkOriginal}
					oninput={() => (bulkPreview = null)}
					placeholder="Japanese source to match exactly"
				></textarea>
			</label>
			<label>
				<span>Translation</span>
				<textarea
					bind:value={bulkTranslation}
					oninput={() => (bulkPreview = null)}
					placeholder="Translation to fill in"
				></textarea>
			</label>
			<label class="check-line">
				<input
					type="checkbox"
					bind:checked={bulkOverwrite}
					onchange={() => (bulkPreview = null)}
				/>
				<span>Overwrite already translated items</span>
			</label>

			{#if bulkError}
				<div class="login-error">{bulkError}</div>
			{/if}

			{#if bulkPreview}
				<div class="bulk-preview">
					<strong>
						Targets {bulkPreview.targets ?? 0} / {bulkPreview.mode === "format"
							? "Format match"
							: "Exact match"} {bulkPreview.total ?? 0} / Existing translations {bulkPreview.already_translated ??
							0}
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
						<p>There are no items to change.</p>
					{/if}
				</div>
			{/if}

			<footer>
				<button
					class="soft"
					onclick={previewBulkFill}
					disabled={bulkWorking}
					>{bulkWorking ? "Checking..." : "Preview"}</button
				>
				<button
					class="save-all"
					onclick={applyBulkFill}
					disabled={bulkWorking || !bulkPreview?.targets}>Apply</button
				>
			</footer>
		</section>
	</div>
{/if}

{#if aiPromptPreview}
	<div class="modal-backdrop">
		<div class="bulk-modal ai-prompt-modal" role="dialog" aria-modal="true" aria-label="Prompt for external AI" tabindex="-1">
			<header>
				<div>
					<h2>Prompt for external AI</h2>
					<p>Guidelines and {aiPromptTargetCount} untranslated items</p>
				</div>
				<button class="soft compact-button" onclick={() => (aiPromptPreview = "")}>Close</button>
			</header>
			<textarea bind:this={aiPromptTextarea} value={aiPromptPreview} readonly aria-label="Prompt for external AI" spellcheck="false"></textarea>
			{#if aiPromptCopyHelp}<p class="ai-prompt-copy-help" role="status">{aiPromptCopyHelp}</p>{/if}
			<footer>
				<button class="soft" onclick={() => { aiPromptTextarea?.focus(); aiPromptTextarea?.select(); }}>Select all</button>
				<button class="save-all" onclick={copyPreparedAiPrompt}>Copy</button>
			</footer>
		</div>
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
					<h2>New untranslated data</h2>
					<p>Items newly added by DB import that were not filled automatically.</p>
				</div>
				<button class="soft compact-button" onclick={closeNewData}>Close</button>
			</header>

			<div class="recent-controls">
				<strong>{newDataCount} untranslated</strong>
				<button class="soft" onclick={loadNewData} disabled={newDataLoading}
					>{newDataLoading ? "Loading..." : "Refresh"}</button
				>
			</div>

			{#if newDataError}
				<div class="login-error">{newDataError}</div>
			{:else if newDataLoading}
				<div class="state-card">Loading new data...</div>
			{:else if !newDataItems.length}
				<div class="state-card">No newly added untranslated items.</div>
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
										>Translate</button
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
					<h2>Recent translations</h2>
					<p>Shows the translator and edit time of the last save.</p>
				</div>
				<button class="soft compact-button" onclick={closeRecent}
					>Close</button
				>
			</header>

			<div class="recent-controls">
				<label>
					<span>Worker</span>
					<select bind:value={recentTranslator} onchange={loadRecent}>
						<option value="">All</option>
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
					>{recentLoading ? "Loading..." : "Refresh"}</button
				>
			</div>

			{#if recentError}
				<div class="login-error">{recentError}</div>
			{:else if recentLoading}
				<div class="state-card">Loading recent work...</div>
			{:else if !recentItems.length}
				<div class="state-card">No recent work to display.</div>
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
										>Open item</button
									>
								{/if}
							</div>
							<p class="recent-original">{displayText(item.original_text)}</p>
							{#if item.diff}
								<div class="recent-change">
									<div class="recent-embed recent-embed-before">
										<div class="recent-embed-heading">
											<span>Before</span>
											{#if item.previous_translator_name}
												<span>Previous translator: {item.previous_translator_name}</span>
											{/if}
										</div>
										<p class="recent-translation">
											{#each item.diff.oldSegments as segment}
												{#if segment.changed}<mark class="recent-removed">{displayText(segment.text)}</mark>{:else}{displayText(segment.text)}{/if}
											{/each}
										</p>
									</div>
									<div class="recent-embed recent-embed-after">
										<span class="recent-embed-heading">After</span>
										<p class="recent-translation">
											{#each item.diff.newSegments as segment}
												{#if segment.changed}<mark class="recent-added">{displayText(segment.text)}</mark>{:else}{displayText(segment.text)}{/if}
											{/each}
										</p>
									</div>
								</div>
							{:else}
								<div class="recent-embed recent-embed-after">
									<span class="recent-embed-heading">Translation</span>
									<p class="recent-translation">{displayText(item.translation_text)}</p>
								</div>
							{/if}
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
						Loading translation notes...
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
					<h2>Enter worker</h2>
					<p>Only a nickname and a 6-digit numeric password are stored temporarily.</p>
					<p class="plain-password-warning">
						The password is stored in plain text. Use a simple number
						you do not use anywhere else.
					</p>
				</div>
				<label>
					<span>Nickname</span>
					<input
						bind:value={loginNickname}
						maxlength="24"
						autocomplete="username"
						placeholder="e.g. Makino"
					/>
				</label>
				<label>
					<span>Password</span>
					<input
						bind:value={loginPin}
						inputmode="numeric"
						maxlength="6"
						autocomplete="current-password"
						placeholder="6 digits"
					/>
				</label>
				{#if loginError}
					<div class="login-error">{loginError}</div>
				{/if}
				<button class="login-button" type="submit" disabled={loggingIn}
					>{loggingIn ? "Checking..." : "Enter"}</button
				>
			</form>
		</section>
	</div>
{/if}
