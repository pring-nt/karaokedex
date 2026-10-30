<script lang="ts">
	import type { Snippet } from 'svelte';
	import { optionId } from '#lib/app/ids';
	import { catalog } from '#lib/app/catalog.svelte';
	import type { Song } from '#lib/catalog/schema';
	import { releaseYears, type SortId, type TableFilters } from '#lib/app/browse';
	import type { SearchOptions } from '#lib/search/engine';
	import type { SearchField } from '#lib/search/query';
	import { staggerIn } from '#lib/motion/anime';
	import { DEFAULT_SONGBOOK, type Songbook } from '#lib/songbooks';
	import BrowseToolbar from './BrowseToolbar.svelte';
	import EmptyState from './EmptyState.svelte';
	import type { TableHandle } from './panel';
	import ErrorState from './ErrorState.svelte';
	import ResultsSkeleton from './ResultsSkeleton.svelte';
	import ResultsTable from './ResultsTable.svelte';
	import SongCard from './SongCard.svelte';

	/** The whole result set goes to the table, which sorts and filters it and only renders what is on screen. */
	const LIMIT = Number.MAX_SAFE_INTEGER;
	/** Skeletons only appear after this long, so quick answers do not flash. */
	const SKELETON_DELAY_MS = 200;

	let {
		query = '',
		field,
		artist,
		release,
		codes,
		others = false,
		browse = false,
		sort,
		filters = {},
		onsort,
		onfilter,
		listId,
		label,
		idle,
		noResults,
		onopen,
		onshown,
		onremove
	}: {
		query?: string;
		field?: SearchField;
		artist?: string;
		release?: string;
		/** Fixed list of codes (queue, favorites) instead of a search. */
		codes?: string[];
		/** Search songs that only other lists print, and say which ones. */
		others?: boolean;
		/** List every song while nothing is searched for, with the sort and filter toolbar. */
		browse?: boolean;
		/** With `onsort`, the page owns the sort. Otherwise the panel keeps its own. */
		sort?: SortId;
		filters?: TableFilters;
		onsort?: (sort: SortId | undefined) => void;
		onfilter?: (changes: TableFilters) => void;
		listId: string;
		label: string;
		/** Shown while there is nothing to search for: above the list when browsing, else instead of it. */
		idle?: Snippet;
		noResults?: Snippet;
		onopen?: (song: Song) => void;
		/** Called with the songs on screen whenever a new result set arrives. */
		onshown?: (songs: Song[]) => void;
		/** Adds a remove button to each row. */
		onremove?: (song: Song) => void;
	} = $props();

	interface Shown {
		songbook: Songbook;
		total: number;
		songs: Song[];
	}

	let shown = $state<Shown | null>(null);
	let pending = $state(false);
	let slow = $state(false);
	let failure = $state('');
	let activeIndex = $state(-1);
	let selected = $state<Song | null>(null);
	let localSort = $state<SortId | undefined>();
	let table = $state<TableHandle | null>(null);
	let sequence = 0;

	const searching = $derived(
		codes !== undefined || query.trim() !== '' || artist !== undefined || release !== undefined
	);
	const wanted = $derived(browse || searching);
	const current = $derived(shown && shown.songbook === catalog.songbook ? shown : null);
	const activeSort = $derived(onsort ? sort : localSort);
	const years = $derived(browse ? releaseYears((current?.songs ?? []).map((s) => s.release)) : []);
	const hasVersions = $derived(current?.songs.some((song) => song.versionNote !== null) ?? false);

	function changeSort(next: SortId | undefined): void {
		if (onsort) onsort(next);
		else localSort = next;
		activeIndex = -1;
	}

	function changeFilters(changes: TableFilters): void {
		onfilter?.(changes);
		activeIndex = -1;
	}

	$effect(() => {
		const songbook = catalog.songbook;
		if (!songbook || !wanted || catalog.status === 'error') {
			shown = null;
			pending = false;
			failure = '';
			return;
		}
		const turn = ++sequence;
		const options: SearchOptions = { limit: LIMIT, field, artist, release, others };
		const input = { query, codes: codes ? [...codes] : undefined, options };
		pending = true;
		failure = '';
		const timer = setTimeout(() => {
			if (turn === sequence) slow = true;
		}, SKELETON_DELAY_MS);

		const run = input.codes
			? catalog.songsByCodes(input.codes).then(({ songbook: book, songs }): Shown => ({
					songbook: book,
					total: songs.length,
					songs
				}))
			: catalog
					.search(input.query, input.options)
					.then(({ songbook: book, total, hits }): Shown => ({
						songbook: book,
						total,
						songs: hits.map((hit) => hit.song)
					}));
		run.then(
			(result) => {
				if (turn !== sequence) return;
				shown = result;
				onshown?.(result.songs);
				activeIndex = result.songs.length > 0 && input.query.trim() !== '' && !others ? 0 : -1;
				pending = false;
				slow = false;
			},
			(error: unknown) => {
				if (turn !== sequence) return;
				pending = false;
				slow = false;
				failure = error instanceof Error ? error.message : String(error);
			}
		);
		return () => {
			clearTimeout(timer);
		};
	});

	export function move(delta: 1 | -1): void {
		const count = table?.count() ?? 0;
		if (count === 0) return;
		activeIndex = Math.min(count - 1, Math.max(0, activeIndex + delta));
	}

	export function openActive(): void {
		const song = table?.songAt(activeIndex);
		if (song) open(song);
	}

	export function activeId(): string | undefined {
		return current && activeIndex >= 0 ? optionId(listId, activeIndex) : undefined;
	}

	function open(song: Song): void {
		selected = song;
		onopen?.(song);
	}
</script>

<div class="flex flex-col gap-4" aria-live="polite">
	{#if catalog.status === 'error'}
		<ErrorState
			message={catalog.error}
			onretry={() => {
				void catalog.retry();
			}}
		/>
	{:else if failure !== ''}
		<ErrorState
			message={failure}
			onretry={() => {
				void catalog.retry();
			}}
		/>
	{:else}
		{#if !searching && idle}{@render idle()}{/if}
		{#if wanted}
			{#if !current}
				{#if pending && (slow || catalog.status === 'loading')}
					<ResultsSkeleton />
				{/if}
			{:else if current.songs.length === 0}
				{#if noResults}
					{@render noResults()}
				{:else}
					<EmptyState
						eyebrow="No matches"
						title="Nothing found"
						subhead="Try fewer letters, another spelling, or a different search field."
					/>
				{/if}
			{:else}
				{#if browse}
					<BrowseToolbar
						sort={activeSort}
						{filters}
						{years}
						{hasVersions}
						relevance={searching}
						onsort={changeSort}
						onfilter={changeFilters}
					/>
				{/if}
				<div use:staggerIn>
					<ResultsTable
						bind:this={table}
						songs={current.songs}
						songbook={current.songbook}
						{listId}
						{activeIndex}
						{label}
						sort={activeSort}
						{filters}
						showLists={others}
						onsort={changeSort}
						{onremove}
						onopen={(song: Song, index: number) => {
							activeIndex = index;
							open(song);
						}}
					/>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<SongCard
	song={selected}
	songbook={current?.songbook ?? catalog.songbook ?? DEFAULT_SONGBOOK}
	onclose={() => {
		selected = null;
	}}
/>
