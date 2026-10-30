<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import { pulse } from '#lib/motion/anime';
	import Button from './Button.svelte';

	const FEEDBACK_MS = 1600;

	let { code }: { code: string } = $props();
	let copied = $state(false);
	let failed = $state(false);
	let button = $state<HTMLElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(): Promise<void> {
		failed = false;
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
		} catch {
			failed = true;
			copied = false;
		}
		if (button) pulse(button);
		clearTimeout(timer);
		timer = setTimeout(() => {
			copied = false;
			failed = false;
		}, FEEDBACK_MS);
	}
</script>

<span bind:this={button} class="inline-flex">
	<Button variant="primary" onclick={copy} aria-label={`Copy code ${code}`}>
		{#if copied}
			<CheckIcon size={16} aria-hidden="true" /> Copied
		{:else if failed}
			Copy failed
		{:else}
			<CopyIcon size={16} aria-hidden="true" /> Copy code
		{/if}
	</Button>
</span>
<span class="sr-only" role="status">{copied ? `Code ${code} copied` : ''}</span>
