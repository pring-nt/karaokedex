<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'accent-2',
		children
	}: { tone?: 'accent' | 'accent-2' | 'success' | 'warning' | 'danger'; children: Snippet } =
		$props();
</script>

<span
	class="inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-micro leading-none"
	style:--tone={`var(--${tone})`}
	style:color="var(--tone)"
	style:background="color-mix(in srgb, var(--tone) 10%, transparent)"
	style:border-color="color-mix(in srgb, var(--tone) 20%, transparent)"
>
	{@render children()}
</span>
