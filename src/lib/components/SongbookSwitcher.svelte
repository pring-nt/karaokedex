<script lang="ts">
	import { SONGBOOK_SHORT, SONGBOOKS, Songbook } from '#lib/songbooks';
	import SelectField from './SelectField.svelte';

	let { value, onchange }: { value: Songbook; onchange: (songbook: Songbook) => void } = $props();

	/** Names the first models too, since people know their machine, not the list it uses. */
	function optionLabel(slug: Songbook): string {
		const short = SONGBOOK_SHORT[slug];
		const models = SONGBOOKS[slug].models.filter((model) => model !== short).slice(0, 3);
		return models.length > 0 ? `${short}: ${models.join(', ')}` : short;
	}

	const options = Songbook.options.map((slug) => ({ value: slug, label: optionLabel(slug) }));
</script>

<SelectField
	label="Machine"
	{value}
	{options}
	onchange={(next: string) => {
		onchange(Songbook.parse(next));
	}}
/>
