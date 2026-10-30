<script lang="ts">
	import TextAaIcon from 'phosphor-svelte/lib/TextAaIcon';
	import { FONTS, type FontId } from '#lib/app/fonts';
	import { preferences } from '#lib/app/preferences.svelte';
	import ChoiceMenu from './ChoiceMenu.svelte';
</script>

<ChoiceMenu
	name="font"
	label="Font"
	choices={FONTS}
	value={preferences.font}
	onchange={(id: FontId) => {
		preferences.setFont(id);
	}}
>
	{#snippet icon()}
		<TextAaIcon size={18} aria-hidden="true" />
	{/snippet}
	{#snippet preview(id: FontId)}
		<span
			data-font={id}
			class="w-12 text-center font-display text-[length:var(--text-lg)] leading-none"
			aria-hidden="true">Ag</span
		>
	{/snippet}
</ChoiceMenu>
