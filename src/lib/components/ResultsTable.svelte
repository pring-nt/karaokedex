<script lang="ts">
	import { createTable, tableFeatures, type ColumnDef } from '@tanstack/svelte-table';
	import { createWindowVirtualizer } from '@tanstack/svelte-virtual';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import { resolve } from '$app/paths';
	import { optionId } from '#lib/app/ids';
	import { isFavorite } from '#lib/app/library';
	import { preferences } from '#lib/app/preferences.svelte';
	import { artistSlug } from '#lib/catalog/slug';
	import type { Song } from '#lib/catalog/schema';
	import type { Songbook } from '#lib/songbooks';
	import Badge from './Badge.svelte';

	const ROW_HEIGHT = 64;

	let {
		songs,
		songbook,
		listId,
		activeIndex = -1,
		onopen,
		label
	}: {
		songs: Song[];
		songbook: Songbook;
		listId: string;
		activeIndex?: number;
		onopen: (song: Song, index: number) => void;
		label: string;
	} = $props();

	const features = tableFeatures({});
	const columns: ColumnDef<typeof features, Song>[] = [
		{ id: 'code', accessorKey: 'code', header: 'Code' },
		{ id: 'title', accessorKey: 'title', header: 'Title' },
		{
			id: 'artists',
			accessorFn: (song) => song.artists.map((a) => a.name).join(', '),
			header: 'Artists'
		}
	];
	const table = createTable({
		features,
		get data() {
			return songs;
		},
		columns
	});

	const rows = $derived(table.getRowModel().rows);
	const headers = $derived(table.getHeaderGroups().flatMap((group) => group.headers));

	let container = $state<HTMLElement | null>(null);

	const virtualizer = createWindowVirtualizer({
		count: 0,
		estimateSize: () => ROW_HEIGHT,
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

<div class="flex flex-col">
	<div
		class="hidden grid-cols-[6rem_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-highlight-low px-4 py-2 text-micro tracking-[0.15em] text-subtle uppercase md:grid"
		aria-hidden="true"
	>
		{#each headers as header (header.id)}
			<span class={header.column.id === 'code' ? 'text-right' : ''}
				>{header.column.columnDef.header}</span
			>
		{/each}
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
					class="absolute top-0 left-0 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-highlight-low px-4 transition-colors duration-(--dur-fast) hover:bg-highlight-med/40 md:grid-cols-[6rem_minmax(0,1.4fr)_minmax(0,1fr)] {active
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
					</span>
					<span
						class="text-right font-mono text-[length:var(--text-base)] text-accent tabular-nums md:order-1 md:text-sm"
					>
						{song.code}
					</span>
					<span class="hidden min-w-0 truncate text-sm text-subtle md:order-3 md:block">
						{#each song.artists as artist, position (artist.name)}
							<a
								href={resolve(`/artist/[slug]?book=${songbook}`, { slug: artistSlug(artist.name) })}
								class="underline-offset-4 hover:text-accent hover:underline"
								onclick={(event) => {
									event.stopPropagation();
								}}>{artist.name}</a
							>{position < song.artists.length - 1 ? ', ' : ''}
						{/each}
					</span>
				</div>
			{/if}
		{/each}
	</div>
</div>
