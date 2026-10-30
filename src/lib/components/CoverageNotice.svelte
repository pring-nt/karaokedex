<script lang="ts">
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import type { Songbook } from '#lib/songbooks';

	const NOTICES: Record<Songbook, string> = {
		hdd: 'Includes songs added from January 2015 onward. The older base catalog has not been published.',
		'p-series': 'Based on the Volume 59 full list. Later volume additions are not included yet.'
	};

	let { songbook }: { songbook: Songbook } = $props();
</script>

<p class="flex items-start gap-2 text-xs text-subtle">
	<InfoIcon size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
	<span>{NOTICES[songbook]}</span>
</p>
