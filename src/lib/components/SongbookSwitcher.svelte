<script lang="ts">
	import { SONGBOOK_SHORT, SONGBOOKS, Songbook } from '#lib/songbooks';

	let { value, onchange }: { value: Songbook; onchange: (songbook: Songbook) => void } = $props();
</script>

<fieldset class="flex min-w-0 flex-col gap-1">
	<legend class="sr-only">Songbook</legend>
	<div class="inline-flex rounded-xl bg-highlight-low p-1">
		{#each Songbook.options as slug (slug)}
			<label class="relative">
				<input
					type="radio"
					name="songbook"
					class="peer sr-only"
					value={slug}
					checked={value === slug}
					onchange={() => {
						onchange(slug);
					}}
				/>
				<span
					class="flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm text-subtle transition-colors duration-(--dur-fast) peer-checked:bg-accent/15 peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent md:min-h-9"
				>
					{SONGBOOK_SHORT[slug]}
				</span>
			</label>
		{/each}
	</div>
	<p class="truncate text-micro tracking-wider text-subtle uppercase max-md:hidden">
		{SONGBOOKS[value].models.join(' · ')}
	</p>
</fieldset>
