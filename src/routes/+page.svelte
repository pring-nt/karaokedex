<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { listFor } from '#lib/app/library';
	import { patchSearch } from '#lib/app/navigate';
	import { preferences } from '#lib/app/preferences.svelte';
	import { parseParams } from '#lib/app/url';
	import Button from '#lib/components/Button.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import SearchBar from '#lib/components/SearchBar.svelte';
	import type { PanelHandle } from '#lib/components/panel';
	import SongPanel from '#lib/components/SongPanel.svelte';

	const DEBOUNCE_MS = 150;
	const LIST_ID = 'results';

	type View = 'search' | 'queue' | 'favorites';

	let text = $state('');
	let debounced = $state('');
	let view = $state<View>('search');
	let input = $state<HTMLInputElement | null>(null);
	let panel = $state<PanelHandle | null>(null);
	let mounted = $state(false);
	let lastWritten: string | undefined;

	const params = $derived(browser ? parseParams(page.url.searchParams) : {});
	const songbook = $derived(params.book ?? preferences.songbook);
	const queue = $derived(listFor(preferences.library, 'queue', songbook));
	const favorites = $derived(listFor(preferences.library, 'favorites', songbook));
	const recents = $derived(listFor(preferences.library, 'recents', songbook));
	const artistFilter = $derived(params.artist);
	const releaseFilter = $derived(params.release);

	onMount(() => {
		text = params.q ?? '';
		debounced = text;
		lastWritten = params.q;
		mounted = true;
	});

	$effect(() => {
		const value = text;
		const timer = setTimeout(() => {
			debounced = value;
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
		};
	});

	$effect(() => {
		if (!mounted) return;
		const next = debounced.trim() === '' ? undefined : debounced;
		if (next === lastWritten) return;
		lastWritten = next;
		patchSearch(page.url, { q: next });
	});

	$effect(() => {
		if (!mounted || params.q === lastWritten) return;
		lastWritten = params.q;
		text = params.q ?? '';
		debounced = text;
	});

	function setFilter(name: 'artist' | 'release', value: string | undefined): void {
		patchSearch(page.url, { [name]: value });
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		) {
			return;
		}
		event.preventDefault();
		view = 'search';
		input?.focus();
	}

	const tabs = $derived([
		{ id: 'search', label: 'Search' },
		{ id: 'queue', label: `Queue (${String(queue.length)})` },
		{ id: 'favorites', label: `Favorites (${String(favorites.length)})` }
	] as const);
</script>

<svelte:head>
	<title>KaraokeDex</title>
	<meta name="description" content="A fast, searchable songbook for Platinum Karaoke song codes." />
</svelte:head>
<svelte:window onkeydown={onWindowKeydown} />

<div class="flex flex-col gap-6">
	<div
		class="flex flex-wrap gap-1 self-start rounded-xl bg-highlight-low p-1"
		role="tablist"
		aria-label="View"
	>
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={view === tab.id}
				class="min-h-11 rounded-lg px-3 text-sm transition-colors duration-(--dur-fast) md:min-h-9 {view ===
				tab.id
					? 'bg-accent/15 text-accent'
					: 'text-subtle hover:text-text'}"
				onclick={() => {
					view = tab.id;
				}}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if view === 'search'}
		<div
			class="fixed inset-x-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:sticky md:top-14 md:bottom-auto md:p-0 md:py-2"
		>
			<SearchBar
				bind:value={text}
				bind:element={input}
				listId={LIST_ID}
				activeId={panel?.activeId()}
				onmove={(delta: 1 | -1) => panel?.move(delta)}
				onactivate={() => {
					preferences.addRecent(text);
					panel?.openActive();
				}}
			/>
		</div>

		{#if artistFilter || releaseFilter}
			<div class="flex flex-wrap gap-2">
				{#if artistFilter}
					<Button
						variant="outline"
						onclick={() => {
							setFilter('artist', undefined);
						}}
					>
						Artist: {artistFilter.replaceAll('-', ' ')} ×
					</Button>
				{/if}
				{#if releaseFilter}
					<Button
						variant="outline"
						onclick={() => {
							setFilter('release', undefined);
						}}
					>
						Release: {releaseFilter} ×
					</Button>
				{/if}
			</div>
		{/if}

		<SongPanel
			bind:this={panel}
			query={debounced}
			artist={artistFilter}
			release={releaseFilter}
			listId={LIST_ID}
			label="Search results"
			onopen={() => {
				preferences.addRecent(debounced);
			}}
		>
			{#snippet idle()}
				<PageHeader
					eyebrow="Platinum Karaoke songbook"
					title="Find any song code, fast."
					subhead="Type a code, a title or an artist. Press / to jump to the search box."
				/>
				{#if recents.length > 0}
					<section class="flex flex-col gap-2" aria-label="Recent searches">
						<div class="flex items-center justify-between">
							<h2 class="eyebrow">Recent searches</h2>
							<Button
								variant="ghost"
								onclick={() => {
									preferences.clearRecents();
								}}>Clear</Button
							>
						</div>
						<ul class="flex flex-wrap gap-2">
							{#each recents as recent (recent)}
								<li>
									<Button
										variant="secondary"
										onclick={() => {
											text = recent;
											input?.focus();
										}}>{recent}</Button
									>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/snippet}
		</SongPanel>
	{:else if view === 'queue'}
		<div class="flex items-center justify-between">
			<h2 class="eyebrow">Tonight's queue</h2>
			{#if queue.length > 0}
				<Button
					variant="danger"
					onclick={() => {
						preferences.clearQueue();
					}}>Clear queue</Button
				>
			{/if}
		</div>
		<SongPanel codes={queue} listId="queue" label="Tonight's queue">
			{#snippet noResults()}
				<EmptyState
					eyebrow="Tonight's queue"
					title="Nothing queued"
					subhead="Open a song and choose Add to queue to line it up."
				/>
			{/snippet}
		</SongPanel>
	{:else}
		<SongPanel codes={favorites} listId="favorites" label="Favorites">
			{#snippet noResults()}
				<EmptyState
					eyebrow="Favorites"
					title="No favorites yet"
					subhead="Open a song and choose Favorite to keep it here."
				/>
			{/snippet}
		</SongPanel>
	{/if}
</div>
