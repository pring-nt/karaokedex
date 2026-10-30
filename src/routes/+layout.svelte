<script lang="ts">
	import './layout.css';
	import MicrophoneStageIcon from 'phosphor-svelte/lib/MicrophoneStageIcon';
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { catalog } from '#lib/app/catalog.svelte';
	import { patchSearch } from '#lib/app/navigate';
	import { preferences } from '#lib/app/preferences.svelte';
	import { parseParams } from '#lib/app/url';
	import favicon from '#lib/assets/favicon.svg';
	import Aurora from '#lib/components/Aurora.svelte';
	import BookBar from '#lib/components/BookBar.svelte';
	import FontMenu from '#lib/components/FontMenu.svelte';
	import ThemeMenu from '#lib/components/ThemeMenu.svelte';
	import type { Songbook } from '#lib/songbooks';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let ready = $state(false);

	onMount(() => {
		preferences.init();
		ready = true;
	});

	const params = $derived(browser ? parseParams(page.url.searchParams) : {});
	const songbook = $derived<Songbook>(params.book ?? preferences.songbook);

	$effect(() => {
		if (!ready) return;
		preferences.setSongbook(songbook);
		if (params.book !== songbook) patchSearch(page.url, { book: songbook });
		void catalog.load(songbook).catch(() => undefined);
	});

	function switchBook(next: Songbook): void {
		patchSearch(page.url, {
			book: next,
			artist: undefined,
			release: undefined,
			year: undefined,
			versions: undefined
		});
	}

	const links = [
		{ label: 'Search', path: '/', href: (book: Songbook) => resolve(`/?book=${book}`) },
		{ label: 'New', path: '/new', href: (book: Songbook) => resolve(`/new?book=${book}`) },
		{ label: 'About', path: '/about', href: (book: Songbook) => resolve(`/about?book=${book}`) }
	] as const;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Aurora />

<div class="flex min-h-dvh flex-col">
	<header class="glass top-0 z-10 rounded-none border-x-0 border-t-0 shadow-none md:sticky">
		<div
			class="mx-auto flex max-w-300 flex-wrap items-center gap-x-2 px-4 md:h-14 md:flex-nowrap md:gap-4 md:px-8"
		>
			<a
				href={resolve(`/?book=${songbook}`)}
				class="flex min-h-11 items-center gap-2 font-display text-xl tracking-tight text-text"
			>
				<MicrophoneStageIcon size={20} weight="bold" class="text-accent" aria-hidden="true" />
				<span class="gradient-text">KaraokeDex</span>
			</a>
			<nav
				class="order-last flex w-full items-center justify-between md:order-none md:ml-4 md:w-auto md:justify-start"
				aria-label="Main"
			>
				{#each links as link (link.path)}
					{@const current = page.url.pathname === resolve(link.path)}
					<a
						href={link.href(songbook)}
						aria-current={current ? 'page' : undefined}
						class="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm transition-colors duration-(--dur-fast) hover:bg-highlight-med/50 md:min-h-9 md:flex-none {current
							? 'text-accent'
							: 'text-subtle'}"
					>
						{link.label}
					</a>
				{/each}
			</nav>
			<div class="ml-auto flex items-center">
				<FontMenu />
				<ThemeMenu />
			</div>
		</div>
	</header>

	<main
		class="mx-auto flex w-full max-w-300 flex-1 flex-col gap-3 px-4 pt-3 pb-28 md:gap-6 md:px-8 md:pt-6 md:pb-12"
	>
		<BookBar {songbook} onchange={switchBook} />
		{@render children()}
	</main>

	<footer class="mx-auto w-full max-w-300 px-4 pb-24 text-micro text-muted md:px-8 md:pb-8">
		Not affiliated with Platinum Karaoke. Song codes come from Platinum's public songlists.
	</footer>
</div>
