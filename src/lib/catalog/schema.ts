import { z } from 'zod';
import { Songbook } from '../songbooks';

const Code = z.string().regex(/^\d{4,5}$/);
const Index = z.number().int().nonnegative();

/**
 * Compact on-the-wire catalog: one file per songbook. A song is
 * `[code, title, versionNote, [[artistIndex, role]], releaseIndex, altTitles]`, with role 0 for a
 * primary and 1 for a featured artist. Codes are strings: leading zeros are part of the code.
 */
export const Catalog = z
	.object({
		songbook: Songbook,
		version: z.string().min(1),
		generatedAt: z.string().min(1),
		artists: z.array(z.string().min(1)),
		releases: z.array(z.tuple([z.string().min(1), Code, Code])),
		songs: z.array(
			z.tuple([
				Code,
				z.string().min(1),
				z.string().min(1).nullable(),
				z.array(z.tuple([Index, z.union([z.literal(0), z.literal(1)])])),
				Index,
				z.array(z.string().min(1))
			])
		)
	})
	.superRefine((catalog, context) => {
		catalog.songs.forEach(([code, , , credits, release], position) => {
			if (release >= catalog.releases.length) {
				context.addIssue({
					code: 'custom',
					message: `song ${code} points at a missing release`,
					path: ['songs', position]
				});
			}
			if (credits.some(([artist]) => artist >= catalog.artists.length)) {
				context.addIssue({
					code: 'custom',
					message: `song ${code} points at a missing artist`,
					path: ['songs', position]
				});
			}
		});
	});
export type Catalog = z.infer<typeof Catalog>;

export const CatalogManifest = z.object({
	songbooks: z.array(
		z.object({
			slug: Songbook,
			name: z.string().min(1),
			models: z.array(z.string().min(1)),
			file: z.string().regex(/^catalog\.[a-z-]+\.[0-9a-f]{8}\.json$/),
			version: z.string().min(1),
			count: Index,
			/** Spans of codes in use, with runs closer than 100 codes merged. */
			codeRanges: z.array(z.tuple([Code, Code]))
		})
	)
});
export type CatalogManifest = z.infer<typeof CatalogManifest>;

export interface Song {
	code: string;
	title: string;
	versionNote: string | null;
	altTitles: string[];
	artists: { name: string; role: 'primary' | 'featured' }[];
	/** Label of the release that first listed the song. */
	release: string;
}

/** Expands the compact form into plain songs for indexing and display. */
export function expandCatalog(catalog: Catalog): Song[] {
	return catalog.songs.map(([code, title, versionNote, credits, release, altTitles]) => ({
		code,
		title,
		versionNote,
		altTitles,
		artists: credits.map(([artist, role]) => ({
			name: catalog.artists[artist] ?? '',
			role: role === 0 ? 'primary' : 'featured'
		})),
		release: catalog.releases[release]?.[0] ?? ''
	}));
}
