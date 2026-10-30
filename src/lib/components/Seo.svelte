<script lang="ts">
	import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '#lib/site';

	const IMAGE_ALT =
		'KaraokeDex: find any song code, fast. A songbook for Platinum Karaoke machines.';

	let {
		title,
		description = SITE_DESCRIPTION,
		path
	}: {
		/** The page's own name. Leave it out on the home page. */
		title?: string;
		description?: string;
		/** Path without a query, so every machine and search shares one canonical page. */
		path: string;
	} = $props();

	const fullTitle = $derived(
		title ? `${title} | ${SITE_NAME}` : `${SITE_NAME}: Platinum Karaoke song codes`
	);
	const url = $derived(`${SITE_URL}${path}`);
	const image = `${SITE_URL}/og.png`;
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={IMAGE_ALT} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
	<meta name="twitter:image:alt" content={IMAGE_ALT} />
</svelte:head>
