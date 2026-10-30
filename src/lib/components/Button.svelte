<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils';
	import { button, type ButtonVariants } from './button';

	type Props = ButtonVariants & {
		class?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes, 'class' | 'children'>;

	let { variant, size, class: className, children, ...rest }: Props = $props();
</script>

<button type="button" class={cn(button({ variant, size }), className)} {...rest}>
	{@render children()}
</button>
