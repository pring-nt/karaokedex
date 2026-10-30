<script lang="ts">
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { preferences } from '#lib/app/preferences.svelte';
	import { parseParams } from '#lib/app/url';
	import type { Song } from '#lib/catalog/schema';
	import { artistSlug } from '#lib/catalog/slug';
	import { button } from '#lib/components/button';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import SongPanel from '#lib/components/SongPanel.svelte';
	import { SONGBOOK_SHORT, SONGBOOKS, Songbook } from '#lib/songbooks';

	const slug = $derived(page.params.slug ?? '');
	const params = $derived(browser ? parseParams(page.url.searchParams) : {});
	const songbook = $derived(params.book ?? preferences.songbook);
	const others = $derived(Songbook.options.filter((option) => option !== songbook));

	let songs = $state<Song[]>([]);
	const name = $derived(
		songs.flatMap((song) => song.artists).find((artist) => artistSlug(artist.name) === slug)
			?.name ?? slug.replaceAll('-', ' ')
	);
</script>

<svelte:head>
	<title>{name} | KaraokeDex</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow="Artist"
		title={name}
		subhead={`${String(songs.length)} ${songs.length === 1 ? 'song' : 'songs'} in ${SONGBOOKS[songbook].name}`}
		compact
	/>
	<SongPanel
		artist={slug}
		listId="artist-results"
		label={`Songs by ${name}`}
		onshown={(shown: Song[]) => {
			songs = shown;
		}}
	>
		{#snippet noResults()}
			<EmptyState
				eyebrow="Artist"
				title="No songs in this songbook"
				subhead="This artist may be listed in another songbook."
			>
				<div class="flex flex-wrap gap-2">
					{#each others as other (other)}
						<a class={button()} href={resolve(`/artist/[slug]?book=${other}`, { slug })}>
							Look in {SONGBOOK_SHORT[other]}
						</a>
					{/each}
				</div>
			</EmptyState>
		{/snippet}
	</SongPanel>
</div>
