import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { artists, releases, songArtists, songs, songTitles } from '../db/schema';
import { SONGBOOKS, type Songbook } from '../songbooks';
import { Catalog, type CatalogManifest } from './schema';

const RANGE_GAP = 100;

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const existing = groups.get(key(row));
		if (existing) existing.push(row);
		else groups.set(key(row), [row]);
	}
	return groups;
}

/** Spans of codes in use. Runs less than `RANGE_GAP` codes apart are merged into one span. */
function codeRanges(codes: readonly string[]): [string, string][] {
	const sorted = [...new Set(codes)].sort((a, b) => Number(a) - Number(b));
	const ranges: [string, string][] = [];
	for (const code of sorted) {
		const last = ranges.at(-1);
		if (last && Number(code) - Number(last[1]) < RANGE_GAP) last[1] = code;
		else ranges.push([code, code]);
	}
	return ranges;
}

/** Reads one songbook out of the build database into the compact catalog form, validated. */
export function buildCatalog(db: Db, songbook: Songbook, generatedAt: string): Catalog {
	const releaseRows = db
		.select()
		.from(releases)
		.where(eq(releases.songbook, songbook))
		.all()
		.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
	const releaseIndex = new Map(releaseRows.map((row, index) => [row.id, index]));

	const names = new Map(
		db
			.select()
			.from(artists)
			.all()
			.map((row) => [row.id, row.name])
	);
	const credits = groupBy(
		db.select().from(songArtists).where(eq(songArtists.songbook, songbook)).all(),
		(row) => row.code
	);
	const alternates = groupBy(
		db.select().from(songTitles).where(eq(songTitles.songbook, songbook)).all(),
		(row) => row.code
	);

	const artistIndex = new Map<number, number>();
	const artistList: string[] = [];
	const localArtist = (id: number): number => {
		const known = artistIndex.get(id);
		if (known !== undefined) return known;
		artistList.push(names.get(id) ?? '');
		artistIndex.set(id, artistList.length - 1);
		return artistList.length - 1;
	};

	const songRows = db
		.select()
		.from(songs)
		.where(eq(songs.songbook, songbook))
		.all()
		.sort((a, b) => Number(a.code) - Number(b.code) || a.code.localeCompare(b.code));

	const catalog = {
		songbook,
		version: releaseRows.at(-1)?.label ?? '',
		generatedAt,
		artists: artistList,
		releases: releaseRows.map((row) => [row.label, row.codeMin, row.codeMax]),
		songs: songRows.map((row) => [
			row.code,
			row.title,
			row.versionNote,
			(credits.get(row.code) ?? [])
				.sort((a, b) => a.position - b.position)
				.map((credit) => [localArtist(credit.artistId), credit.role === 'primary' ? 0 : 1]),
			releaseIndex.get(row.releaseId) ?? 0,
			(alternates.get(row.code) ?? []).map((alternate) => alternate.title)
		])
	};
	return Catalog.parse(catalog);
}

/** First 8 hex digits of the SHA-256 of the catalog without its `generatedAt`, so the name tracks the data. */
export function catalogFileName(catalog: Catalog): string {
	const hash = createHash('sha256')
		.update(JSON.stringify({ ...catalog, generatedAt: '' }))
		.digest('hex')
		.slice(0, 8);
	return `catalog.${catalog.songbook}.${hash}.json`;
}

export function manifestEntry(catalog: Catalog): CatalogManifest['songbooks'][number] {
	const info = SONGBOOKS[catalog.songbook];
	return {
		slug: catalog.songbook,
		name: info.name,
		models: [...info.models],
		file: catalogFileName(catalog),
		version: catalog.version,
		count: catalog.songs.length,
		codeRanges: codeRanges(catalog.songs.map((song) => song[0]))
	};
}
