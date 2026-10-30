<script lang="ts" generics="T extends string">
	import { Popover } from 'bits-ui';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import type { Snippet } from 'svelte';

	let {
		name,
		label,
		choices,
		value,
		onchange,
		icon,
		preview
	}: {
		/** Lower-case word for the radio group and the trigger's accessible name. */
		name: string;
		label: string;
		choices: readonly { id: T; label: string }[];
		value: T;
		onchange: (id: T) => void;
		icon: Snippet;
		preview: Snippet<[T]>;
	} = $props();
</script>

<Popover.Root>
	<Popover.Trigger
		class="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-subtle transition-colors duration-(--dur-fast) hover:bg-highlight-med/50 hover:text-text md:min-h-9"
		aria-label={`Change ${name}`}
	>
		{@render icon()}
		<span class="hidden sm:inline">{label}</span>
		<CaretDownIcon size={12} aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			align="end"
			sideOffset={8}
			class="z-20 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-overlay p-2 shadow-(--shadow-1) outline-none"
		>
			<fieldset class="flex flex-col">
				<legend class="eyebrow px-2 py-2">{label}</legend>
				{#each choices as choice (choice.id)}
					<label
						class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-subtle transition-colors duration-(--dur-fast) hover:bg-highlight-med/50 has-checked:bg-accent/15 has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent md:min-h-9"
					>
						<input
							type="radio"
							{name}
							class="sr-only"
							value={choice.id}
							checked={value === choice.id}
							onchange={() => {
								onchange(choice.id);
							}}
						/>
						{@render preview(choice.id)}
						{choice.label}
					</label>
				{/each}
			</fieldset>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
