<div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading songs" role="status">
	{#each [0, 1, 2, 3, 4, 5, 6, 7] as row (row)}
		<div class="h-14 shimmer rounded-lg"></div>
	{/each}
</div>
