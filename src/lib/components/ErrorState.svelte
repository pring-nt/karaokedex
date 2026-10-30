<script lang="ts">
	import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
	import Button from './Button.svelte';

	let { message, onretry }: { message: string; onretry: () => void } = $props();
</script>

<section
	class="flex flex-col gap-4 rounded-xl border border-danger/30 bg-danger/10 p-6"
	role="alert"
>
	<div class="flex items-center gap-2 text-danger">
		<WarningCircleIcon size={20} aria-hidden="true" />
		<h2 class="text-lg">The songbook could not be loaded</h2>
	</div>
	<p class="text-sm text-subtle">{message}</p>
	<div>
		<Button variant="danger" onclick={onretry}>Try again</Button>
	</div>
</section>
