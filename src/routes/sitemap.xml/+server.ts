import { SITE_URL } from '#lib/site';

export const prerender = true;

const PATHS = ['/', '/new', '/about'];

export function GET(): Response {
	const urls = PATHS.map((path) => `\t<url><loc>${SITE_URL}${path}</loc></url>`).join('\n');
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
