<script lang="ts">
	import type { Snippet } from 'svelte';
	import { optionId } from '#lib/app/ids';
	import { catalog } from '#lib/app/catalog.svelte';
	import type { Song } from '#lib/catalog/schema';
	import type { SearchOptions } from '#lib/search/engine';
	import { staggerIn } from '#lib/motion/anime';
	import type { Songbook } from '#lib/songbooks';
	import EmptyState from './EmptyState.svelte';
	import ErrorState from './ErrorState.svelte';
	import ResultsSkeleton from './ResultsSkeleton.svelte';
	import ResultsTable from './ResultsTable.svelte';
	import SongCard from './SongCard.svelte';

	const LIMIT = 300;
	/** Skeletons only appear after this long, so quick answers do not flash. */
	const SKELETON_DELAY_MS = 200;

	let {
		query = '',
		artist,
		release,
		codes,
		listId,
		label,
		idle,
		noResults,
		onopen,
		onshown,
		onremove
	}: {
		query?: string;
		artist?: string;
		release?: string;
		/** Fixed list of codes (queue, favorites) instead of a search. */
		codes?: string[];
		listId: string;
		label: string;
		/** Shown instead of results while there is nothing to search for. */
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
	let sequence = 0;

	const wanted = $derived(
		codes !== undefined || query.trim() !== '' || artist !== undefined || release !== undefined
	);
	const current = $derived(shown && shown.songbook === catalog.songbook ? shown : null);

	$effect(() => {
		const songbook = catalog.songbook;
		if (!songbook || !wanted || catalog.status === 'error') {
			shown = null;
			pending = false;
			failure = '';
			return;
		}
		const turn = ++sequence;
		const options: SearchOptions = { limit: LIMIT, artist, release };
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
				activeIndex = result.songs.length > 0 ? 0 : -1;
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
		const count = current?.songs.length ?? 0;
		if (count === 0) return;
		activeIndex = Math.min(count - 1, Math.max(0, activeIndex + delta));
	}

	export function openActive(): void {
		const song = current?.songs[activeIndex];
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
	{:else if !wanted}
		{#if idle}{@render idle()}{/if}
	{:else if !current}
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
				subhead="Try fewer letters, another spelling, or a song code."
			/>
		{/if}
	{:else}
		<p class="text-xs text-subtle">
			{#if current.total > current.songs.length}
				Showing the first {current.songs.length} of {current.total} matches
			{:else}
				{current.total}
				{current.total === 1 ? 'match' : 'matches'}
			{/if}
		</p>
		<div use:staggerIn>
			<ResultsTable
				songs={current.songs}
				songbook={current.songbook}
				{listId}
				{activeIndex}
				{label}
				{onremove}
				onopen={(song: Song, index: number) => {
					activeIndex = index;
					open(song);
				}}
			/>
		</div>
	{/if}
</div>

<SongCard
	song={selected}
	songbook={current?.songbook ?? catalog.songbook ?? 'hdd'}
	onclose={() => {
		selected = null;
	}}
/>
