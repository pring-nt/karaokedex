<script lang="ts">
	import { Popover } from 'bits-ui';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import PaletteIcon from 'phosphor-svelte/lib/PaletteIcon';
	import { preferences } from '#lib/app/preferences.svelte';
	import { THEMES, type ThemePreference } from '#lib/app/themes';

	const choices: { id: ThemePreference; label: string }[] = [
		{ id: 'system', label: 'Match system' },
		...THEMES
	];
</script>

<Popover.Root>
	<Popover.Trigger
		class="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-subtle transition-colors duration-(--dur-fast) hover:bg-highlight-med/50 hover:text-text md:min-h-9"
		aria-label="Change theme"
	>
		<PaletteIcon size={18} aria-hidden="true" />
		<span class="hidden sm:inline">Theme</span>
		<CaretDownIcon size={12} aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			align="end"
			sideOffset={8}
			class="z-20 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-overlay p-2 shadow-(--shadow-1) outline-none"
		>
			<fieldset class="flex flex-col">
				<legend class="eyebrow px-2 py-2">Theme</legend>
				{#each choices as choice (choice.id)}
					<label
						class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-subtle transition-colors duration-(--dur-fast) hover:bg-highlight-med/50 has-checked:bg-accent/15 has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent md:min-h-9"
					>
						<input
							type="radio"
							name="theme"
							class="sr-only"
							value={choice.id}
							checked={preferences.themePreference === choice.id}
							onchange={() => {
								preferences.setThemePreference(choice.id);
							}}
						/>
						{#if choice.id === 'system'}
							<span class="w-12" aria-hidden="true"></span>
						{:else}
							<span
								data-theme={choice.id}
								class="flex w-12 justify-center gap-0.5 rounded-sm p-1"
								style:background="var(--base)"
								aria-hidden="true"
							>
								<span class="size-2 rounded-full" style:background="var(--accent)"></span>
								<span class="size-2 rounded-full" style:background="var(--accent-2)"></span>
								<span class="size-2 rounded-full" style:background="var(--accent-3)"></span>
							</span>
						{/if}
						{choice.label}
					</label>
				{/each}
			</fieldset>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
