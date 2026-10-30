<script lang="ts">
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import Button from './Button.svelte';

	let {
		value = $bindable(''),
		listId,
		activeId,
		placeholder = 'Search by code, title or artist',
		onmove,
		onactivate,
		element = $bindable(null)
	}: {
		value?: string;
		listId: string;
		activeId?: string;
		placeholder?: string;
		onmove: (delta: 1 | -1) => void;
		onactivate: () => void;
		element?: HTMLInputElement | null;
	} = $props();

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			onmove(event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			onactivate();
		} else if (event.key === 'Escape') {
			if (value === '') element?.blur();
			else value = '';
		}
	}
</script>

<div class="glass flex items-center gap-2 rounded-lg px-3">
	<MagnifyingGlassIcon size={18} class="shrink-0 text-subtle" aria-hidden="true" />
	<input
		bind:this={element}
		bind:value
		{onkeydown}
		type="search"
		role="combobox"
		aria-label="Search songs"
		aria-controls={listId}
		aria-expanded="true"
		aria-activedescendant={activeId}
		aria-autocomplete="list"
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		enterkeyhint="search"
		{placeholder}
		class="min-h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent px-2 py-3 text-[length:var(--text-base)] text-text outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
	/>
	{#if value !== ''}
		<Button
			variant="ghost"
			size="icon"
			aria-label="Clear search"
			onclick={() => {
				value = '';
				element?.focus();
			}}
		>
			<XIcon size={16} aria-hidden="true" />
		</Button>
	{:else}
		<kbd
			class="hidden rounded-sm border border-highlight-med px-2 py-1 text-micro text-subtle md:inline"
			aria-hidden="true">/</kbd
		>
	{/if}
</div>
