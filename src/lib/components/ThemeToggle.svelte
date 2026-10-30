<script lang="ts">
	import MoonIcon from 'phosphor-svelte/lib/MoonIcon';
	import SunIcon from 'phosphor-svelte/lib/SunIcon';
	import { preferences } from '#lib/app/preferences.svelte';
	import Button from './Button.svelte';

	const next = $derived(preferences.theme === 'dark' ? 'light' : 'dark');
</script>

<Button
	variant="ghost"
	size="icon"
	aria-label={`Switch to ${next} theme`}
	onclick={() => {
		preferences.setTheme(next);
	}}
>
	{#if preferences.theme === 'dark'}
		<SunIcon size={18} aria-hidden="true" />
	{:else}
		<MoonIcon size={18} aria-hidden="true" />
	{/if}
</Button>
