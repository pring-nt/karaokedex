import { SITE_URL } from '#lib/site';

export const prerender = true;

export function GET(): Response {
	const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
