<script lang="ts">
	import { catalog } from '#lib/app/catalog.svelte';
	import type { Songbook } from '#lib/songbooks';
	import CoverageNotice from './CoverageNotice.svelte';
	import SongbookSwitcher from './SongbookSwitcher.svelte';

	let { songbook, onchange }: { songbook: Songbook; onchange: (songbook: Songbook) => void } =
		$props();
</script>

<section class="flex flex-col gap-2" aria-label="Songbook">
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
		<SongbookSwitcher value={songbook} {onchange} />
		{#if catalog.status === 'ready' && catalog.songbook === songbook}
			<p class="text-micro tracking-wider text-subtle uppercase">
				{catalog.count.toLocaleString('en-US')} songs · through {catalog.version}
			</p>
		{/if}
	</div>
	<CoverageNotice {songbook} />
</section>
