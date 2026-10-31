import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { artists, releases, songArtists, songs, songTitles } from '../db/schema';
import { normalize } from '../normalize/text';
import { SHARED_SONGBOOKS, SONGBOOKS, type Songbook } from '../songbooks';
import { Catalog, SharedCatalog, sharedKey, type CatalogManifest } from './schema';

const RANGE_GAP = 100;
/** A shorter match than this could be two different songs. */
const MIN_PREFIX = 8;

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

/** Compares titles across lists, allowing one to be cut short, as narrow PDF columns often do. */
function sameTitle(a: string, b: string): boolean {
	const left = normalize(a).replaceAll(' ', '');
	const right = normalize(b).replaceAll(' ', '');
	const length = Math.min(left.length, right.length);
	return (
		left === right || (length >= MIN_PREFIX && left.slice(0, length) === right.slice(0, length))
	);
}

/** Merges catalogs of the shared numbering by code, in `SHARED_SONGBOOKS` order, or null if none exist. */
export function buildShared(catalogs: readonly Catalog[]): SharedCatalog | null {
	const members = SHARED_SONGBOOKS.flatMap(
		(slug) => catalogs.find((catalog) => catalog.songbook === slug) ?? []
	);
	if (members.length === 0) return null;

	const artists: string[] = [];
	const artistIndex = new Map<string, number>();
	const localArtist = (name: string): number => {
		const known = artistIndex.get(name);
		if (known !== undefined) return known;
		artists.push(name);
		artistIndex.set(name, artists.length - 1);
		return artists.length - 1;
	};

	const merged = new Map<string, SharedCatalog['songs'][number]>();
	members.forEach((catalog, position) => {
		for (const [code, title, versionNote, credits] of catalog.songs) {
			const key = sharedKey(code);
			const existing = merged.get(key);
			if (existing) {
				const onList = catalog.songbook !== 'p-series' || sameTitle(existing[1], title);
				if (onList && !existing[4].includes(position)) existing[4].push(position);
				continue;
			}
			const local = credits.map(([artist, role]): [number, 0 | 1] => [
				localArtist(catalog.artists[artist] ?? ''),
				role
			]);
			merged.set(key, [code, title, versionNote, local, [position]]);
		}
	});

	return SharedCatalog.parse({
		version: members.map((catalog) => catalog.version).join(' '),
		generatedAt: members[0].generatedAt,
		songbooks: members.map((catalog) => catalog.songbook),
		artists,
		songs: [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, song]) => song)
	});
}

export function sharedFileName(shared: SharedCatalog): string {
	const hash = createHash('sha256')
		.update(JSON.stringify({ ...shared, generatedAt: '' }))
		.digest('hex')
		.slice(0, 8);
	return `catalog.shared.${hash}.json`;
}
