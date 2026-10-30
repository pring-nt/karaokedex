<script lang="ts">
	import { LETTERS, SORTS, sortingFor, type SortId, type TableFilters } from '#lib/app/browse';
	import Button from './Button.svelte';
	import SelectField from './SelectField.svelte';

	const RELEVANCE = 'relevance';
	const ANY = 'any';
	const letterOptions = [
		{ value: ANY, label: 'Any letter' },
		...LETTERS.map((letter) => ({ value: letter, label: letter.toUpperCase() })),
		{ value: '#', label: 'Numbers and symbols' }
	];

	let {
		sort,
		filters,
		years,
		hasVersions,
		relevance,
		onsort,
		onfilter
	}: {
		sort?: SortId;
		filters: TableFilters;
		years: string[];
		/** Whether any song here has a version note, so the filter would do something. */
		hasVersions: boolean;
		/** Offer the search's own order, which only exists while there is a query. */
		relevance: boolean;
		onsort: (sort: SortId | undefined) => void;
		onfilter: (changes: TableFilters) => void;
	} = $props();

	const byArtist = $derived(sortingFor(sort).at(0)?.id === 'artists');
	const filtered = $derived(Boolean(filters.letter || filters.year || filters.versions));
	const sortOptions = $derived([
		...(relevance ? [{ value: RELEVANCE, label: 'Best match' }] : []),
		...SORTS.map((entry) => ({ value: entry.id, label: entry.label }))
	]);
</script>

<div class="flex flex-wrap items-end gap-3">
	<SelectField
		label="Sort"
		value={sort ?? RELEVANCE}
		options={sortOptions}
		onchange={(value: string) => {
			onsort(SORTS.find((entry) => entry.id === value)?.id);
		}}
	/>
	<SelectField
		label={byArtist ? 'Artist starts with' : 'Title starts with'}
		value={filters.letter ?? ANY}
		options={letterOptions}
		onchange={(value: string) => {
			onfilter({ letter: value === ANY ? undefined : value });
		}}
	/>
	{#if years.length > 1}
		<SelectField
			label="Added in"
			value={filters.year ?? ANY}
			options={[
				{ value: ANY, label: 'Any year' },
				...years.map((year) => ({ value: year, label: year }))
			]}
			onchange={(value: string) => {
				onfilter({ year: value === ANY ? undefined : value });
			}}
		/>
	{/if}
	{#if hasVersions}
		<label class="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-subtle md:min-h-9">
			<input
				type="checkbox"
				class="accent-accent"
				checked={filters.versions === true}
				onchange={(event) => {
					onfilter({ versions: event.currentTarget.checked || undefined });
				}}
			/>
			Covers and remixes only
		</label>
	{/if}
	{#if filtered}
		<Button
			variant="ghost"
			onclick={() => {
				onfilter({ letter: undefined, year: undefined, versions: undefined });
			}}>Clear filters</Button
		>
	{/if}
</div>
