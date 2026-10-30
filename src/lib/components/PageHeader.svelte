<script lang="ts">
	let {
		eyebrow,
		title,
		subhead,
		compact = false,
		gradient = true
	}: {
		eyebrow: string;
		title: string;
		subhead?: string;
		compact?: boolean;
		gradient?: boolean;
	} = $props();
</script>

<header class="flex flex-col gap-1">
	<span class="eyebrow">{eyebrow}</span>
	<h1 class={compact ? 'display mt-2 text-4xl' : 'display mt-3'}>
		{#if gradient}
			<span class="gradient-text">{title}</span>
		{:else}
			{title}
		{/if}
	</h1>
	{#if subhead}
		<p class="subhead">{subhead}</p>
	{/if}
</header>
