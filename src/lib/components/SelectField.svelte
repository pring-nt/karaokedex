<script lang="ts">
	import * as Select from '#lib/components/ui/select';

	let {
		label,
		inline = false,
		value,
		options,
		onchange
	}: {
		label: string;
		/** Label beside the control instead of above it. */
		inline?: boolean;
		value: string;
		options: { value: string; label: string }[];
		onchange: (value: string) => void;
	} = $props();

	const selected = $derived(options.find((option) => option.value === value)?.label);
</script>

<div class={inline ? 'flex items-center gap-2' : 'flex flex-col gap-1'}>
	<span class={inline ? 'text-xs text-subtle' : 'eyebrow'}>{label}</span>
	<Select.Root type="single" {value} onValueChange={onchange}>
		<Select.Trigger
			aria-label={label}
			class="min-h-11 min-w-20 rounded-md border-highlight-med bg-highlight-low text-sm text-text md:min-h-9"
		>
			{selected}
		</Select.Trigger>
		<Select.Content class="max-h-72 rounded-md bg-overlay text-text">
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} class="min-h-11 text-sm md:min-h-8">
					{option.label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
