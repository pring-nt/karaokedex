<script lang="ts">
	import { onMount } from 'svelte';
	import { CatalogManifest } from '#lib/catalog/schema';
	import CoverageNotice from '#lib/components/CoverageNotice.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { Songbook } from '#lib/songbooks';

	let manifest = $state<CatalogManifest | null>(null);

	onMount(() => {
		fetch('/catalog-manifest.json')
			.then((response) => response.json())
			.then((json: unknown) => {
				manifest = CatalogManifest.parse(json);
			})
			.catch(() => {
				manifest = null;
			});
	});
</script>

<svelte:head>
	<title>About | KaraokeDex</title>
</svelte:head>

<div class="flex max-w-180 flex-col gap-8">
	<PageHeader eyebrow="About" title="Where the codes come from" compact />

	<section class="flex flex-col gap-3 text-sm leading-relaxed">
		<p>
			KaraokeDex is a searchable songbook for Platinum Karaoke. Song codes, titles and artists are
			read from the songlist PDFs that Platinum publishes on its own website, and nothing else. Each
			songbook is a separate numbering: a code only means something inside its songbook, so the
			songbook is always shown next to a code.
		</p>
		<p class="text-subtle">
			This is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by
			Platinum Karaoke.
		</p>
	</section>

	<section class="flex flex-col gap-4" aria-label="Coverage">
		<h2 class="eyebrow">Coverage</h2>
		{#each Songbook.options as slug (slug)}
			{@const entry = manifest?.songbooks.find((candidate) => candidate.slug === slug)}
			<article class="card flex flex-col gap-2 rounded-xl p-6">
				<h3 class="text-lg">{entry?.name ?? slug}</h3>
				{#if entry}
					<p class="text-sm text-subtle">
						{entry.count.toLocaleString('en-US')} songs, through {entry.version}.
					</p>
				{/if}
				<CoverageNotice songbook={slug} />
			</article>
		{/each}
	</section>

	<section class="flex flex-col gap-3 text-sm leading-relaxed">
		<h2 class="eyebrow">Sources</h2>
		<p>
			The monthly HDD lists and the P-series full list come from the songlist page at
			platinumkaraoke.com. Entries that look wrong in the PDFs are corrected by hand and flagged for
			review rather than guessed.
		</p>
	</section>
</div>
