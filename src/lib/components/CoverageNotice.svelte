<script lang="ts">
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import type { Songbook } from '#lib/songbooks';

	const NOTICES: Partial<Record<Songbook, string>> = {
		ks: 'Built from every published KS-5, KS-40 and KS-100 update. The original song list has not been published.',
		hdd: 'Includes songs added from January 2015 onward. The older base catalog has not been published.',
		'p-series':
			'Based on the Volume 59 full list. Later volume additions are not included yet. P-Series codes are its own: they do not match the other lists.'
	};
	const UPDATES_ONLY =
		'Built from published update lists. The original song list has not been published.';

	let { songbook }: { songbook: Songbook } = $props();
</script>

<p class="flex items-start gap-2 text-xs text-subtle">
	<InfoIcon size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
	<span>{NOTICES[songbook] ?? UPDATES_ONLY}</span>
</p>
