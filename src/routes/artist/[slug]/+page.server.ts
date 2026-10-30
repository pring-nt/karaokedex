import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Catalog, CatalogManifest } from '#lib/catalog/schema';
import { artistSlug } from '#lib/catalog/slug';

export const prerender = true;

/**
 * Every artist in every built catalog, so each `/artist/<slug>` page exists as static HTML.
 * Without catalogs (a build with no PDFs) there are no artist pages.
 */
export function entries(): { slug: string }[] {
	const manifestPath = join('static', 'catalog-manifest.json');
	if (!existsSync(manifestPath)) return [];
	const manifest = CatalogManifest.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
	const slugs = new Set<string>();
	for (const { file } of manifest.songbooks) {
		const catalog = Catalog.parse(JSON.parse(readFileSync(join('static', file), 'utf8')));
		for (const name of catalog.artists) slugs.add(artistSlug(name));
	}
	return [...slugs].map((slug) => ({ slug }));
}
