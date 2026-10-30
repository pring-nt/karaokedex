<script lang="ts">
	import type { Snippet } from 'svelte';
	import PageHeader from './PageHeader.svelte';

	let {
		eyebrow,
		title,
		subhead,
		children
	}: { eyebrow: string; title: string; subhead?: string; children?: Snippet } = $props();
</script>

<section class="card relative flex flex-col gap-6 rounded-xl p-6">
	<div class="blob -top-12 -left-12" aria-hidden="true"></div>
	<div class="relative flex flex-col gap-6">
		<PageHeader {eyebrow} {title} {subhead} compact />
		{#if children}
			{@render children()}
		{/if}
	</div>
</section>
