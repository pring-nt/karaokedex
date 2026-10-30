<script lang="ts">
	import { catalog } from '#lib/app/catalog.svelte';
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import { SONGBOOKS, type Songbook } from '#lib/songbooks';
	import CoverageNotice from './CoverageNotice.svelte';
	import SongbookSwitcher from './SongbookSwitcher.svelte';

	let { songbook, onchange }: { songbook: Songbook; onchange: (songbook: Songbook) => void } =
		$props();

	const ready = $derived(catalog.status === 'ready' && catalog.songbook === songbook);
	const summary = $derived(
		`${catalog.count.toLocaleString('en-US')} songs · through ${catalog.version}`
	);
</script>

<section class="flex flex-col gap-2" aria-label="Songbook">
	<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 md:items-end">
		<SongbookSwitcher value={songbook} {onchange} />
		{#if ready}
			<p class="text-micro tracking-wider text-subtle uppercase max-md:hidden">{summary}</p>
		{/if}
		<details class="group text-xs text-subtle open:basis-full md:hidden">
			<summary class="flex min-h-11 cursor-pointer list-none items-center justify-end gap-1">
				<InfoIcon size={14} aria-hidden="true" />
				{#if ready}{catalog.count.toLocaleString('en-US')} songs{:else}About{/if}
			</summary>
			<div class="flex flex-col gap-1 pb-2">
				<p>{SONGBOOKS[songbook].models.join(', ')}</p>
				{#if ready}<p>{summary}</p>{/if}
				<CoverageNotice {songbook} />
			</div>
		</details>
	</div>
	<div class="max-md:hidden"><CoverageNotice {songbook} /></div>
</section>
