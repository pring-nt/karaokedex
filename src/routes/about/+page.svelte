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
			read from the songlist PDFs that Platinum publishes on its own website, and nothing else. Most
			Platinum lists share one numbering, so a code means the same song across them, and a song
			missing from your machine's list may still be listed for another. P-Series is the exception:
			its codes are its own.
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
			Every list comes from the songlist page at platinumkaraoke.com. A song listed for another
			machine is not proof that yours has it. Entries that look wrong in the PDFs are corrected by
			hand and flagged for review rather than guessed.
		</p>
	</section>
</div>
