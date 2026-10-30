<script lang="ts">
	import {
		columnFilteringFeature,
		createFilteredRowModel,
		createPaginatedRowModel,
		createSortedRowModel,
		createTable,
		rowPaginationFeature,
		rowSortingFeature,
		tableFeatures,
		type ColumnDef,
		type FilterFn,
		type SortFn
	} from '@tanstack/svelte-table';
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import CaretDoubleLeftIcon from 'phosphor-svelte/lib/CaretDoubleLeftIcon';
	import CaretDoubleRightIcon from 'phosphor-svelte/lib/CaretDoubleRightIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import { resolve } from '$app/paths';
	import {
		columnFiltersFor,
		initial,
		nextSort,
		releaseKey,
		sortingFor,
		sortKey,
		type SortColumn,
		type SortId,
		type TableFilters
	} from '#lib/app/browse';
	import { optionId } from '#lib/app/ids';
	import { isFavorite } from '#lib/app/library';
	import { preferences } from '#lib/app/preferences.svelte';
	import { artistSlug } from '#lib/catalog/slug';
	import type { Song } from '#lib/catalog/schema';
	import { SONGBOOK_SHORT, type Songbook } from '#lib/songbooks';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import EmptyState from './EmptyState.svelte';
	import SelectField from './SelectField.svelte';

	const ROW_HEIGHT = 64;
	const LISTED_ROW_HEIGHT = 80;
	const PAGE_SIZES = [50, 100, 250] as const;

	let {
		songs,
		songbook,
		listId,
		activeIndex = -1,
		sort,
		filters = {},
		showLists = false,
		onsort,
		onopen,
		onremove,
		label
	}: {
		songs: Song[];
		songbook: Songbook;
		listId: string;
		activeIndex?: number;
		/** Without one, rows keep the order of `songs`. */
		sort?: SortId;
		filters?: TableFilters;
		/** Show which lists print each song, in place of its release. */
		showLists?: boolean;
		onsort: (sort: SortId) => void;
		onopen: (song: Song, index: number) => void;
		/** When given, every row gets a remove button that does not open the song. */
		onremove?: (song: Song) => void;
		label: string;
	} = $props();

	const mobileColumns = $derived(
		onremove ? 'grid-cols-[minmax(0,1fr)_auto_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
	);
	const desktopColumns = $derived(
		onremove
			? 'md:grid md:grid-cols-[6rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_auto]'
			: 'md:grid md:grid-cols-[6rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem]'
	);

	let pageSize = $state<number>(PAGE_SIZES[1]);
	/** A page belongs to one list: new songs, a new sort or new filters start again from the first. */
	const scope = $derived({ songs, sort, filters });
	let turned = $state.raw<{ scope: unknown; index: number } | null>(null);
	const pageIndex = $derived(turned?.scope === scope ? turned.index : 0);

	const features = tableFeatures({
		rowSortingFeature,
		columnFilteringFeature,
		rowPaginationFeature,
		sortedRowModel: createSortedRowModel(),
		filteredRowModel: createFilteredRowModel(),
		paginatedRowModel: createPaginatedRowModel()
	});
	type Features = typeof features;

	/** Accessors return prepared keys, which the table caches per row, so comparing stays cheap. */
	const byValue: SortFn<Features, Song> = (a, b, id) => {
		const left = a.getValue<string | number>(id);
		const right = b.getValue<string | number>(id);
		return left < right ? -1 : left > right ? 1 : 0;
	};
	const byLetter: FilterFn<Features, Song> = (row, id, letter) =>
		initial(row.getValue<string>(id)) === letter;
	const byYear: FilterFn<Features, Song> = (row, id, year: string) =>
		row.original.release.startsWith(`${year}-`);
	const hasVersion: FilterFn<Features, Song> = (row, id) => row.getValue(id) !== null;

	const columns: ColumnDef<Features, Song>[] = [
		{ id: 'code', accessorFn: (song) => Number(song.code), header: 'Code', sortFn: byValue },
		{
			id: 'title',
			accessorFn: (song) => sortKey(song.title),
			header: 'Title',
			sortFn: byValue,
			filterFn: byLetter
		},
		{
			id: 'artists',
			accessorFn: (song) => sortKey(song.artists.map((a) => a.name).join(', ')),
			header: 'Artists',
			sortFn: byValue,
			filterFn: byLetter
		},
		{
			id: 'release',
			accessorFn: (song) => releaseKey(song.release),
			header: 'Added',
			sortFn: byValue,
			filterFn: byYear
		},
		{ id: 'version', accessorKey: 'versionNote', filterFn: hasVersion }
	];
	const table = createTable({
		features,
		get data() {
			return songs;
		},
		columns,
		autoResetPageIndex: false,
		get state() {
			return {
				sorting: sortingFor(sort),
				columnFilters: columnFiltersFor(filters, sort),
				pagination: { pageIndex, pageSize }
			};
		}
	});

	const rows = $derived(table.getRowModel().rows);
	const headers = $derived(
		table
			.getHeaderGroups()
			.flatMap((group) => group.headers.filter((h) => h.column.id !== 'version'))
	);
	const direction = $derived(sortingFor(sort).at(0));

	const total = $derived(table.getPrePaginatedRowModel().rows.length);
	const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
	const firstRow = $derived(pageIndex * pageSize + 1);
	const lastRow = $derived(Math.min(total, (pageIndex + 1) * pageSize));

	function goToPage(index: number): void {
		turned = { scope, index: Math.min(pageCount - 1, Math.max(0, index)) };
		top?.scrollIntoView({ block: 'start' });
	}

	function listNames(song: Song): string {
		return song.lists.map((list) => SONGBOOK_SHORT[list]).join(', ');
	}

	/** How many rows are on this page. */
	export function count(): number {
		return rows.length;
	}

	/** The song in a row as displayed, which sorting may have moved. */
	export function songAt(index: number): Song | undefined {
		return rows[index]?.original;
	}

	let container = $state<HTMLElement | null>(null);
	let top = $state<HTMLElement | null>(null);

	const virtualizer = createWindowVirtualizer({
		count: 0,
		estimateSize: () => (showLists ? LISTED_ROW_HEIGHT : ROW_HEIGHT),
		overscan: 8
	});

	$effect(() => {
		const count = rows.length;
		const top = container ? container.getBoundingClientRect().top + window.scrollY : 0;
		untrack(() => {
			const current = get(virtualizer);
			current.setOptions({ ...current.options, count, scrollMargin: top });
			current.measure();
		});
	});

	$effect(() => {
		const index = activeIndex;
		if (index < 0) return;
		untrack(() => {
			get(virtualizer).scrollToIndex(index, { align: 'auto' });
		});
	});
</script>

{#snippet pager()}
	<nav class="flex flex-wrap items-center gap-2" aria-label="Pages">
		<Button
			variant="ghost"
			size="icon"
			aria-label="First page"
			disabled={pageIndex === 0}
			onclick={() => {
				goToPage(0);
			}}><CaretDoubleLeftIcon size={16} aria-hidden="true" /></Button
		>
		<Button
			variant="ghost"
			size="icon"
			aria-label="Previous page"
			disabled={pageIndex === 0}
			onclick={() => {
				goToPage(pageIndex - 1);
			}}><CaretLeftIcon size={16} aria-hidden="true" /></Button
		>
		<label class="flex items-center gap-2 text-xs text-subtle tabular-nums">
			Page
			<input
				type="number"
				inputmode="numeric"
				min="1"
				max={pageCount}
				value={pageIndex + 1}
				aria-label={`Page number, 1 to ${String(pageCount)}`}
				class="min-h-11 w-16 [appearance:textfield] appearance-none rounded-md border border-highlight-med bg-highlight-low px-2 text-center text-[length:var(--text-base)] text-text md:min-h-9 md:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				onchange={(event) => {
					const input = event.currentTarget;
					const page = Number.parseInt(input.value, 10);
					if (Number.isNaN(page)) input.value = String(pageIndex + 1);
					else {
						goToPage(page - 1);
						input.value = String(Math.min(pageCount, Math.max(1, page)));
					}
				}}
			/>
			of {pageCount.toLocaleString()}
		</label>
		<Button
			variant="ghost"
			size="icon"
			aria-label="Next page"
			disabled={pageIndex >= pageCount - 1}
			onclick={() => {
				goToPage(pageIndex + 1);
			}}><CaretRightIcon size={16} aria-hidden="true" /></Button
		>
		<Button
			variant="ghost"
			size="icon"
			aria-label="Last page"
			disabled={pageIndex >= pageCount - 1}
			onclick={() => {
				goToPage(pageCount - 1);
			}}><CaretDoubleRightIcon size={16} aria-hidden="true" /></Button
		>
	</nav>
{/snippet}

<div bind:this={top} class="flex scroll-mt-3 flex-col gap-2 md:scroll-mt-48">
	<div class="flex flex-wrap items-center justify-between gap-2 px-4">
		<p class="text-xs text-subtle tabular-nums" aria-live="polite">
			{#if total > pageSize}
				{firstRow.toLocaleString()}-{lastRow.toLocaleString()} of {total.toLocaleString()} songs
			{:else}
				{total.toLocaleString()}
				{total === 1 ? 'song' : 'songs'}
			{/if}
		</p>
		{#if total > PAGE_SIZES[0]}
			<SelectField
				inline
				label="Per page"
				value={String(pageSize)}
				options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
				onchange={(value: string) => {
					pageSize = Number(value);
					turned = null;
				}}
			/>
		{/if}
	</div>
	{#if total === 0}
		<EmptyState
			eyebrow="Filtered out"
			title="No songs match these filters"
			subhead="Clear the filters to see everything again."
		/>
	{/if}
	<div
		class="hidden gap-4 {desktopColumns} border-b border-highlight-low px-4 py-2 text-micro tracking-[0.15em] text-subtle uppercase md:grid"
	>
		{#each headers as header (header.id)}
			{@const column = header.column.id as SortColumn}
			{@const sorted = direction?.id === column}
			<button
				type="button"
				class="flex items-center gap-1 uppercase transition-colors duration-(--dur-fast) hover:text-text {column ===
				'code'
					? 'justify-end'
					: ''} {sorted ? 'text-accent' : ''}"
				aria-label={`Sort by ${String(header.column.columnDef.header)}`}
				onclick={() => {
					onsort(nextSort(sort, column));
				}}
			>
				{header.column.columnDef.header}
				{#if sorted}
					{#if direction.desc}
						<CaretDownIcon size={10} aria-hidden="true" />
					{:else}
						<CaretUpIcon size={10} aria-hidden="true" />
					{/if}
				{/if}
			</button>
		{/each}
		{#if onremove}<span></span>{/if}
	</div>

	<div
		bind:this={container}
		id={listId}
		role="listbox"
		aria-label={label}
		class="relative w-full"
		style:height={`${String($virtualizer.getTotalSize())}px`}
	>
		{#each $virtualizer.getVirtualItems() as item (item.key)}
			{@const song = rows[item.index]?.original}
			{#if song}
				{@const active = item.index === activeIndex}
				{@const favorite = isFavorite(preferences.library, songbook, song.code)}
				<div
					id={optionId(listId, item.index)}
					role="option"
					tabindex="-1"
					aria-selected={active}
					class="absolute top-0 left-0 grid w-full cursor-pointer items-center gap-x-4 border-b border-highlight-low px-4 transition-colors duration-(--dur-fast) hover:bg-highlight-med/40 {mobileColumns} {desktopColumns} {active
						? 'bg-accent/8 shadow-[inset_2px_0_0_var(--accent)]'
						: ''}"
					style:height={`${String(item.size)}px`}
					style:transform={`translateY(${String(item.start - $virtualizer.options.scrollMargin)}px)`}
					onclick={() => {
						onopen(song, item.index);
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onopen(song, item.index);
						}
					}}
				>
					<span class="flex min-w-0 flex-col md:order-2">
						<span class="flex min-w-0 items-center gap-2">
							<span class="truncate text-sm text-text">{song.title}</span>
							{#if song.versionNote}
								<span class="shrink-0"><Badge>{song.versionNote}</Badge></span>
							{/if}
							{#if favorite}
								<StarIcon
									size={12}
									weight="fill"
									class="shrink-0 text-warning"
									aria-hidden="true"
								/>
								<span class="sr-only">Favorite</span>
							{/if}
						</span>
						<span class="truncate text-xs text-subtle md:hidden">
							{song.artists.map((a) => a.name).join(', ')}
						</span>
						{#if showLists}
							<span class="truncate text-micro text-warning md:hidden">{listNames(song)}</span>
						{/if}
					</span>
					<span
						class="text-right font-mono text-[length:var(--text-base)] text-accent tabular-nums md:order-1 md:text-sm"
					>
						{song.code}
					</span>
					<span class="hidden min-w-0 truncate text-sm text-subtle md:order-3 md:block">
						{#each song.artists as artist, position (artist.name)}
							<a
								href={resolve(
									`/artist?book=${songbook}&artist=${encodeURIComponent(artistSlug(artist.name))}`
								)}
								class="underline-offset-4 hover:text-accent hover:underline"
								onclick={(event) => {
									event.stopPropagation();
								}}>{artist.name}</a
							>{position < song.artists.length - 1 ? ', ' : ''}
						{/each}
					</span>
					<span
						class="hidden text-xs text-subtle tabular-nums md:order-4 md:block {showLists
							? 'line-clamp-3'
							: 'truncate'}"
						title={showLists ? listNames(song) : undefined}
					>
						{showLists ? listNames(song) : song.release}
					</span>
					{#if onremove}
						<span class="md:order-5">
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Remove ${song.title} from the queue`}
								onclick={(event: MouseEvent) => {
									event.stopPropagation();
									onremove(song);
								}}
								onkeydown={(event: KeyboardEvent) => {
									event.stopPropagation();
								}}
							>
								<XIcon size={16} aria-hidden="true" />
							</Button>
						</span>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
	{#if pageCount > 1}
		<div class="flex justify-center pt-2">{@render pager()}</div>
	{/if}
</div>
