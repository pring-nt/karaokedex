<script lang="ts">
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { SearchField } from '#lib/search/query';
	import Button from './Button.svelte';

	const FIELDS: { id: SearchField; label: string; placeholder: string }[] = [
		{ id: 'all', label: 'All', placeholder: 'Search by code, title or artist' },
		{ id: 'code', label: 'Code', placeholder: 'Song code, like 42195' },
		{ id: 'title', label: 'Title', placeholder: 'Song title' },
		{ id: 'artist', label: 'Artist', placeholder: 'Artist name' }
	];

	let {
		value = $bindable(''),
		field = 'all',
		onfield,
		onfocus,
		listId,
		activeId,
		onmove,
		onactivate,
		element = $bindable(null)
	}: {
		value?: string;
		field?: SearchField;
		onfield: (field: SearchField) => void;
		onfocus?: () => void;
		listId: string;
		activeId?: string;
		onmove: (delta: 1 | -1) => void;
		onactivate: () => void;
		element?: HTMLInputElement | null;
	} = $props();

	const placeholder = $derived(FIELDS.find((choice) => choice.id === field)?.placeholder);

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

<div class="glass flex flex-col rounded-lg px-3 py-2">
	<fieldset class="flex items-center gap-1">
		<legend class="sr-only">Search by</legend>
		<span class="eyebrow mr-2 hidden sm:inline" aria-hidden="true">Search by</span>
		{#each FIELDS as choice (choice.id)}
			<label
				class="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm text-subtle transition-colors duration-(--dur-fast) hover:bg-highlight-med/50 hover:text-text has-checked:bg-accent/15 has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent sm:flex-none md:min-h-8"
			>
				<input
					type="radio"
					name="search-field"
					class="sr-only"
					value={choice.id}
					checked={field === choice.id}
					onchange={() => {
						onfield(choice.id);
						element?.focus();
					}}
				/>
				{choice.label}
			</label>
		{/each}
	</fieldset>
	<div class="flex items-center gap-2">
		<MagnifyingGlassIcon size={18} class="shrink-0 text-subtle" aria-hidden="true" />
		<input
			bind:this={element}
			bind:value
			{onkeydown}
			{onfocus}
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
			inputmode={field === 'code' ? 'numeric' : 'search'}
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
</div>
