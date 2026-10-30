<script lang="ts">
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { catalog } from '#lib/app/catalog.svelte';
	import { patchSearch } from '#lib/app/navigate';
	import { preferences } from '#lib/app/preferences.svelte';
	import { parseParams } from '#lib/app/url';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ResultsSkeleton from '#lib/components/ResultsSkeleton.svelte';
	import SelectField from '#lib/components/SelectField.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import SongPanel from '#lib/components/SongPanel.svelte';
	import type { ReleaseSummary } from '#lib/search/engine';
	import { SONGBOOKS } from '#lib/songbooks';

	const params = $derived(browser ? parseParams(page.url.searchParams) : {});
	const songbook = $derived(params.book ?? preferences.songbook);

	let releases = $state<ReleaseSummary[]>([]);
	let loadedFor = $state('');

	$effect(() => {
		const book = catalog.songbook;
		if (!book || catalog.status !== 'ready') return;
		void catalog.releases().then((result) => {
			if (result.songbook !== catalog.songbook) return;
			releases = result.releases;
			loadedFor = result.songbook;
		});
	});

	const available = $derived(loadedFor === songbook ? releases : []);
	const selected = $derived(
		params.release && available.some((release) => release.label === params.release)
			? params.release
			: available.find((release) => release.count > 0)?.label
	);

	function choose(label: string): void {
		patchSearch(page.url, { release: label });
	}
</script>

<Seo
	title="New songs"
	description="The latest songs added to Platinum Karaoke machines, with their codes, for every update list."
	path="/new"
/>

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow="New songs"
		title={selected ?? 'Latest release'}
		subhead={`Songs first listed in this release of ${SONGBOOKS[songbook].name}`}
		compact
	/>

	{#if available.length > 1}
		<SelectField
			label="Release"
			value={selected ?? ''}
			options={available.map((release) => ({
				value: release.label,
				label: `${release.label} (${String(release.count)} ${release.count === 1 ? 'song' : 'songs'})`
			}))}
			onchange={choose}
		/>
	{/if}

	<SongPanel release={selected} listId="new-results" label="New songs">
		{#snippet idle()}
			<ResultsSkeleton />
		{/snippet}
	</SongPanel>
</div>
