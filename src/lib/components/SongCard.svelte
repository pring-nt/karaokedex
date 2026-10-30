<script lang="ts">
	import { Dialog } from 'bits-ui';
	import ListPlusIcon from 'phosphor-svelte/lib/ListPlusIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { resolve } from '$app/paths';
	import { isFavorite, isQueued } from '#lib/app/library';
	import { preferences } from '#lib/app/preferences.svelte';
	import { artistSlug } from '#lib/catalog/slug';
	import type { Song } from '#lib/catalog/schema';
	import { sheetIn } from '#lib/motion/anime';
	import { SONGBOOK_SHORT, type Songbook } from '#lib/songbooks';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import CopyButton from './CopyButton.svelte';

	let { song, songbook, onclose }: { song: Song | null; songbook: Songbook; onclose: () => void } =
		$props();

	const favorite = $derived(song ? isFavorite(preferences.library, songbook, song.code) : false);
	const queued = $derived(song ? isQueued(preferences.library, songbook, song.code) : false);
	const otherLists = $derived(
		(song?.lists ?? []).filter((list) => list !== songbook).map((list) => SONGBOOK_SHORT[list])
	);
</script>

<Dialog.Root
	open={song !== null}
	onOpenChange={(open) => {
		if (!open) onclose();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="scrim fixed inset-0 z-30" />
		<Dialog.Content
			class="fixed inset-x-0 bottom-0 z-30 outline-none md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2"
		>
			{#if song}
				<div
					use:sheetIn
					class="glass relative flex max-h-[85dvh] flex-col gap-6 overflow-y-auto rounded-t-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:rounded-xl"
				>
					<Dialog.Close
						class="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-xl text-subtle hover:bg-highlight-med/60 md:size-9"
						aria-label="Close"
					>
						<XIcon size={16} aria-hidden="true" />
					</Dialog.Close>

					<div class="flex flex-col gap-1 pr-10">
						<span class="eyebrow">
							{song.lists.includes(songbook) || song.lists.length === 0
								? `${SONGBOOK_SHORT[songbook]} · ${song.release}`
								: `Not on the ${SONGBOOK_SHORT[songbook]} list`}
						</span>
						<Dialog.Title class="sr-only">{song.title}, code {song.code}</Dialog.Title>
						<p class="font-mono text-hero leading-none tracking-tight text-accent tabular-nums">
							{song.code}
						</p>
					</div>

					{#if song.lists.length > 0 && !song.lists.includes(songbook)}
						<p class="text-xs text-warning">
							This code is listed for other machines, so yours may or may not have it. Try it on the
							machine.
						</p>
					{/if}

					<Dialog.Description class="flex flex-col gap-3">
						<span class="flex flex-wrap items-center gap-2 font-display text-2xl text-text">
							{song.title}
							{#if song.versionNote}
								<Badge>{song.versionNote}</Badge>
							{/if}
						</span>
						{#if song.artists.length > 0}
							<span class="flex flex-wrap gap-x-3 gap-y-1 text-sm">
								{#each song.artists as artist (artist.name)}
									<a
										href={resolve(
											`/artist?book=${songbook}&artist=${encodeURIComponent(artistSlug(artist.name))}`
										)}
										onclick={onclose}
										class="text-subtle underline-offset-4 hover:text-accent hover:underline"
									>
										{#if artist.role === 'featured'}<span class="text-muted"
												>feat.
											</span>{/if}{artist.name}
									</a>
								{/each}
							</span>
						{/if}
						{#if song.altTitles.length > 0}
							<span class="text-xs text-subtle">Also listed as {song.altTitles.join(', ')}</span>
						{/if}
						{#if otherLists.length > 0}
							<span class="text-xs text-subtle">Also on: {otherLists.join(', ')}</span>
						{/if}
					</Dialog.Description>

					<div class="flex flex-wrap gap-2">
						<CopyButton code={song.code} />
						<Button
							variant={favorite ? 'primary' : 'secondary'}
							aria-pressed={favorite}
							onclick={() => {
								preferences.toggleFavorite(song.code);
							}}
						>
							<StarIcon size={16} weight={favorite ? 'fill' : 'regular'} aria-hidden="true" />
							Favorite
						</Button>
						<Button
							variant={queued ? 'primary' : 'secondary'}
							aria-pressed={queued}
							onclick={() => {
								preferences.toggleQueued(song.code);
							}}
						>
							{#if queued}
								<ListChecksIcon size={16} aria-hidden="true" /> In tonight's queue
							{:else}
								<ListPlusIcon size={16} aria-hidden="true" /> Add to queue
							{/if}
						</Button>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
