<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { SortId, TableFilters } from '#lib/app/browse';
	import { catalog } from '#lib/app/catalog.svelte';
	import { aboveKeyboard } from '#lib/app/keyboard';
	import { listFor } from '#lib/app/library';
	import { patchSearch } from '#lib/app/navigate';
	import { preferences } from '#lib/app/preferences.svelte';
	import { parseParams } from '#lib/app/url';
	import type { Song } from '#lib/catalog/schema';
	import { SONGBOOK_SHORT, Songbook } from '#lib/songbooks';
	import type { SearchField } from '#lib/search/query';
	import Button from '#lib/components/Button.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import SearchBar from '#lib/components/SearchBar.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import type { PanelHandle } from '#lib/components/panel';
	import SongPanel from '#lib/components/SongPanel.svelte';

	const DEBOUNCE_MS = 150;
	const LIST_ID = 'results';
	const PHONE_QUERY = '(width < 48rem)';

	type View = 'search' | 'queue' | 'favorites';

	let text = $state('');
	let debounced = $state('');
	let view = $state<View>('search');
	let input = $state<HTMLInputElement | null>(null);
	let panel = $state<PanelHandle | null>(null);
	let results = $state<HTMLElement | null>(null);
	let otherSongs = $state<Song[]>([]);
	let mounted = $state(false);
	let lastWritten: string | undefined;

	const params = $derived(browser ? parseParams(page.url.searchParams) : {});
	const songbook = $derived(params.book ?? preferences.songbook);
	const queue = $derived(listFor(preferences.library, 'queue', songbook));
	const favorites = $derived(listFor(preferences.library, 'favorites', songbook));
	const recents = $derived(listFor(preferences.library, 'recents', songbook));
	const artistFilter = $derived(params.artist);
	const releaseFilter = $derived(params.release);
	const field = $derived(params.field ?? 'all');
	const searching = $derived(debounced.trim() !== '');
	/** Where the other-machine matches are listed, most matches first. */
	const machines = $derived(
		Songbook.options
			.map((slug) => ({
				slug,
				count: otherSongs.filter((song) => song.lists.includes(slug)).length
			}))
			.filter((machine) => machine.count > 0)
			.sort((a, b) => b.count - a.count)
	);
	/** Browsing is alphabetical. A search stays in best-match order until a sort is picked. */
	const sort = $derived<SortId | undefined>(
		params.sort ?? (debounced.trim() === '' ? 'title' : undefined)
	);
	/** The letter is a browsing shortcut: left on during a search it would hide matches. */
	const filters = $derived<TableFilters>({
		letter: debounced.trim() === '' ? params.letter : undefined,
		year: params.year,
		versions: params.versions === '1'
	});

	onMount(() => {
		text = params.q ?? '';
		debounced = text;
		lastWritten = params.q;
		mounted = true;
	});

	$effect(() => {
		const value = text;
		const timer = setTimeout(() => {
			debounced = value;
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
		};
	});

	$effect(() => {
		if (!mounted) return;
		const next = debounced.trim() === '' ? undefined : debounced;
		if (next === lastWritten) return;
		lastWritten = next;
		patchSearch(page.url, { q: next });
	});

	/** Only other navigations can change the query. Ours lag behind typing and must not undo it. */
	afterNavigate(({ type }) => {
		if (type === 'goto') return;
		lastWritten = parseParams(page.url.searchParams).q;
		text = lastWritten ?? '';
		debounced = text;
	});

	function setFilter(name: 'artist' | 'release', value: string | undefined): void {
		patchSearch(page.url, { [name]: value });
	}

	/** On a phone the keyboard leaves little room, so results move up to meet the search bar. */
	function showResults(): void {
		if (window.matchMedia(PHONE_QUERY).matches) results?.scrollIntoView({ block: 'start' });
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		) {
			return;
		}
		event.preventDefault();
		view = 'search';
		input?.focus();
	}

	const tabs = $derived([
		{ id: 'search', label: 'Search' },
		{ id: 'queue', label: `Queue (${String(queue.length)})` },
		{ id: 'favorites', label: `Favorites (${String(favorites.length)})` }
	] as const);
</script>

<Seo path="/" />
<svelte:window onkeydown={onWindowKeydown} />

<div class="flex flex-col gap-3 md:gap-6">
	<div
		class="flex gap-1 rounded-xl bg-highlight-low p-1 md:self-start"
		role="tablist"
		aria-label="View"
	>
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={view === tab.id}
				class="min-h-11 flex-1 rounded-lg px-3 text-sm transition-colors duration-(--dur-fast) md:min-h-9 md:flex-none {view ===
				tab.id
					? 'bg-accent/15 text-accent'
					: 'text-subtle hover:text-text'}"
				onclick={() => {
					view = tab.id;
				}}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if view === 'search'}
		<div
			use:aboveKeyboard
			class="fixed inset-x-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:sticky md:top-14 md:bottom-auto md:p-0 md:py-2"
		>
			<SearchBar
				bind:value={text}
				bind:element={input}
				{field}
				onfield={(next: SearchField) => {
					patchSearch(page.url, { field: next === 'all' ? undefined : next });
				}}
				listId={LIST_ID}
				onfocus={showResults}
				activeId={panel?.activeId()}
				onmove={(delta: 1 | -1) => panel?.move(delta)}
				onactivate={() => {
					preferences.addRecent(text);
					panel?.openActive();
				}}
			/>
		</div>

		{#if artistFilter || releaseFilter}
			<div class="flex flex-wrap gap-2">
				{#if artistFilter}
					<Button
						variant="outline"
						onclick={() => {
							setFilter('artist', undefined);
						}}
					>
						Artist: {artistFilter.replaceAll('-', ' ')} ×
					</Button>
				{/if}
				{#if releaseFilter}
					<Button
						variant="outline"
						onclick={() => {
							setFilter('release', undefined);
						}}
					>
						Release: {releaseFilter} ×
					</Button>
				{/if}
			</div>
		{/if}

		<div bind:this={results} class="scroll-mt-3">
			<SongPanel
				bind:this={panel}
				query={debounced}
				{field}
				artist={artistFilter}
				release={releaseFilter}
				browse
				{sort}
				{filters}
				onsort={(next: SortId | undefined) => {
					patchSearch(page.url, { sort: next });
				}}
				onfilter={(changes: TableFilters) => {
					patchSearch(page.url, { ...changes, versions: changes.versions ? '1' : undefined });
				}}
				listId={LIST_ID}
				label="Search results"
				onopen={() => {
					preferences.addRecent(debounced);
				}}
			>
				{#snippet noResults()}
					{#if otherSongs.length > 0}
						<p class="text-sm text-subtle">Not on the {SONGBOOK_SHORT[songbook]} list.</p>
					{:else}
						<EmptyState
							eyebrow="No matches"
							title="Nothing found"
							subhead="Try fewer letters, another spelling, or a different search field."
						/>
					{/if}
				{/snippet}
				{#snippet idle()}
					<div class="max-md:sr-only">
						<PageHeader
							eyebrow="Platinum Karaoke songbook"
							title="Find any song code, fast."
							subhead="Browse the whole songbook below, or pick code, title or artist and search. Press / to jump to the search box."
						/>
					</div>
					{#if recents.length > 0}
						<section class="flex flex-col gap-2" aria-label="Recent searches">
							<div class="flex items-center justify-between">
								<h2 class="eyebrow">Recent searches</h2>
								<Button
									variant="ghost"
									onclick={() => {
										preferences.clearRecents();
									}}>Clear</Button
								>
							</div>
							<ul class="flex gap-2 overflow-x-auto md:flex-wrap">
								{#each recents as recent (recent)}
									<li class="shrink-0">
										<Button
											variant="secondary"
											onclick={() => {
												text = recent;
												input?.focus();
											}}>{recent}</Button
										>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				{/snippet}
			</SongPanel>
		</div>

		{#if searching && catalog.otherCount > 0 && !releaseFilter}
			<section class="flex flex-col gap-3" aria-label="Songs from other machines">
				{#if otherSongs.length > 0}
					<div class="flex flex-col gap-1">
						<h2 class="eyebrow">Also listed for other machines</h2>
						<p class="text-xs text-subtle">
							Not on your machine's list. Platinum's lists share one code system, so they may still
							work: try the code.
						</p>
						{#if searching}
							<div class="flex flex-wrap items-center gap-2 pt-2">
								<span class="text-xs text-subtle">Check on:</span>
								{#each machines as machine (machine.slug)}
									<Button
										variant="outline"
										onclick={() => {
											patchSearch(page.url, { book: machine.slug });
										}}
									>
										{SONGBOOK_SHORT[machine.slug]} ({machine.count})
									</Button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				<SongPanel
					others
					query={debounced}
					{field}
					artist={artistFilter}
					listId="other-results"
					label="Songs listed for other machines"
					onshown={(shown: Song[]) => {
						otherSongs = shown;
					}}
				>
					{#snippet noResults()}{/snippet}
				</SongPanel>
			</section>
		{/if}
	{:else if view === 'queue'}
		<div class="flex items-center justify-between">
			<h2 class="eyebrow">Tonight's queue</h2>
			{#if queue.length > 0}
				<Button
					variant="danger"
					onclick={() => {
						preferences.clearQueue();
					}}>Clear queue</Button
				>
			{/if}
		</div>
		<SongPanel
			codes={queue}
			listId="queue"
			label="Tonight's queue"
			onremove={(song: Song) => {
				preferences.toggleQueued(song.code);
			}}
		>
			{#snippet noResults()}
				<EmptyState
					eyebrow="Tonight's queue"
					title="Nothing queued"
					subhead="Open a song and choose Add to queue to line it up."
				/>
			{/snippet}
		</SongPanel>
	{:else}
		<SongPanel codes={favorites} listId="favorites" label="Favorites">
			{#snippet noResults()}
				<EmptyState
					eyebrow="Favorites"
					title="No favorites yet"
					subhead="Open a song and choose Favorite to keep it here."
				/>
			{/snippet}
		</SongPanel>
	{/if}
</div>
