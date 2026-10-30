<script lang="ts">
	let { size = 20 }: { size?: number } = $props();
</script>

<!-- Lucide book-audio, ISC license. -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="url(#brand-gradient)"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- Fixed coordinates: a gradient sized to each path would hide the straight bars. -->
	<defs>
		<linearGradient
			id="brand-gradient"
			gradientUnits="userSpaceOnUse"
			x1="4"
			y1="2"
			x2="20"
			y2="22"
		>
			<stop offset="0" style:stop-color="var(--accent)" />
			<stop offset="0.5" style:stop-color="var(--accent-2)" />
			<stop offset="1" style:stop-color="var(--accent-3)" />
		</linearGradient>
	</defs>
	<path d="M12 6v7" />
	<path d="M16 8v3" />
	<path
		d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"
	/>
	<path d="M8 8v3" />
</svg>
