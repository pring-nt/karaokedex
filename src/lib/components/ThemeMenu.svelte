<script lang="ts">
	import PaletteIcon from 'phosphor-svelte/lib/PaletteIcon';
	import { preferences } from '#lib/app/preferences.svelte';
	import { THEMES, type ThemePreference } from '#lib/app/themes';
	import ChoiceMenu from './ChoiceMenu.svelte';

	const choices: { id: ThemePreference; label: string }[] = [
		{ id: 'system', label: 'Match system' },
		...THEMES
	];
</script>

<ChoiceMenu
	name="theme"
	label="Theme"
	{choices}
	value={preferences.themePreference}
	onchange={(id: ThemePreference) => {
		preferences.setThemePreference(id);
	}}
>
	{#snippet icon()}
		<PaletteIcon size={18} aria-hidden="true" />
	{/snippet}
	{#snippet preview(id: ThemePreference)}
		{#if id === 'system'}
			<span class="w-12" aria-hidden="true"></span>
		{:else}
			<span
				data-theme={id}
				class="flex w-12 justify-center gap-0.5 rounded-sm p-1"
				style:background="var(--base)"
				aria-hidden="true"
			>
				<span class="size-2 rounded-full" style:background="var(--accent)"></span>
				<span class="size-2 rounded-full" style:background="var(--accent-2)"></span>
				<span class="size-2 rounded-full" style:background="var(--accent-3)"></span>
			</span>
		{/if}
	{/snippet}
</ChoiceMenu>
