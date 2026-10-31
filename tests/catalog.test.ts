import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildShared, catalogFileName } from '../src/lib/catalog/build';
import { buildCatalogs, type PdfInput, type PipelineResult } from '../src/lib/catalog/pipeline';
import { Catalog, CatalogManifest, expandCatalog } from '../src/lib/catalog/schema';
import { SearchIndex } from '../src/lib/search';
import type { Songbook } from '../src/lib/songbooks';
import { SearchEngine, type CatalogCache } from '../src/lib/search/engine';

const fixtures = join(import.meta.dir, 'fixtures');
const dataDir = join(import.meta.dir, '..', 'data');
const aliases = { atomic: [], map: {} };
const NOW = '2026-10-30T00:00:00.000Z';

async function pdf(songbook: PdfInput['songbook'], label: string, path: string): Promise<PdfInput> {
	return { songbook, label, data: new Uint8Array(await readFile(path)) };
}

const hasPdfs = existsSync(join(fixtures, 'hdd', '2026-06.pdf'));

/** Songlist PDFs are not in the repo. Without local copies, the tests that read them skip. */
const hdd = hasPdfs
	? await Promise.all(
			['2026-06', '2026-07', '2026-08'].map((label) =>
				pdf('hdd', label, join(fixtures, 'hdd', `${label}.pdf`))
			)
		)
	: [];
const sample = hasPdfs
	? await pdf('p-series', 'full-vol-59', join(fixtures, 'p-series', 'full-vol-59-start.pdf'))
	: { songbook: 'p-series' as const, label: '', data: new Uint8Array() };
const built: PipelineResult = hasPdfs
	? await buildCatalogs([...hdd, sample], { aliases, corrections: {}, generatedAt: NOW })
	: { catalogs: [], shared: null, manifest: { songbooks: [] }, reports: [], errors: [] };

function catalogFor(slug: 'hdd' | 'p-series') {
	const found = built.catalogs.find((entry) => entry.catalog.songbook === slug);
	if (!found) throw new Error(`no ${slug} catalog`);
	return found;
}

describe.skipIf(!hasPdfs)('buildCatalogs', () => {
	test('emits one validated catalog per songbook and a matching manifest', () => {
		expect(built.errors).toEqual([]);
		expect(built.catalogs.map((entry) => entry.catalog.songbook)).toEqual(['hdd', 'p-series']);
		expect(CatalogManifest.parse(built.manifest).songbooks.map((entry) => entry.slug)).toEqual([
			'hdd',
			'p-series'
		]);
		const entry = built.manifest.songbooks[0];
		expect(entry).toMatchObject({ slug: 'hdd', version: '2026-08', count: 220 });
		expect(entry.file).toBe(catalogFor('hdd').file);
	});

	test('every catalog round-trips through JSON and Zod with no loss, leading zeros included', () => {
		for (const { catalog, json } of built.catalogs) {
			expect(Catalog.parse(JSON.parse(json))).toEqual(catalog);
		}
		const codes = catalogFor('p-series').catalog.songs.map((song) => song[0]);
		expect(codes).toContain('0088');
		expect(codes.every((code) => typeof code === 'string')).toBe(true);
	});

	test('no PDFs gives an empty manifest, so a build without data still succeeds', async () => {
		const empty = await buildCatalogs([], { aliases, corrections: {}, generatedAt: NOW });
		expect(empty).toMatchObject({ catalogs: [], errors: [], manifest: { songbooks: [] } });
	});

	test('releases are listed in label order and songs by code', () => {
		const { catalog } = catalogFor('hdd');
		expect(catalog.releases.map((release) => release[0])).toEqual([
			'2026-06',
			'2026-07',
			'2026-08'
		]);
		const numeric = catalog.songs.map((song) => Number(song[0]));
		expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
	});

	test('the file name tracks the data, not the build time', async () => {
		const later = await buildCatalogs([...hdd, sample], {
			aliases,
			corrections: {},
			generatedAt: '2030-01-01T00:00:00.000Z'
		});
		expect(catalogFor('hdd').file).toMatch(/^catalog\.hdd\.[0-9a-f]{8}\.json$/);
		expect(later.manifest.songbooks[0].file).toBe(built.manifest.songbooks[0].file);

		const fewer = await buildCatalogs(hdd.slice(0, 2), {
			aliases,
			corrections: {},
			generatedAt: NOW
		});
		expect(fewer.manifest.songbooks[0].file).not.toBe(built.manifest.songbooks[0].file);
		expect(catalogFileName(catalogFor('hdd').catalog)).toBe(catalogFor('hdd').file);
	});

	test('code ranges merge runs closer than 100 codes', () => {
		expect(built.manifest.songbooks[0].codeRanges).toEqual([['42227', '42446']]);
	});

	test('artists are shared and roles are kept', () => {
		const songs = expandCatalog(catalogFor('hdd').catalog);
		const bini = songs.filter((song) => song.artists.some((artist) => artist.name === 'BINI'));
		expect(bini.length).toBeGreaterThan(0);
		expect(
			songs.find((song) => song.code === '42289')?.artists.map((artist) => artist.name)
		).toEqual(['Ofenbach vs. Nick Waterhouse']);
	});

	test('a release with errors is left out and reported; an unused correction fails the build', async () => {
		const broken = await pdf('hdd', '2021-03', join(fixtures, 'hdd', '2021-03.pdf'));
		const result = await buildCatalogs([...hdd, broken], {
			aliases,
			corrections: { 'hdd:99999': { title: 'Nope' } },
			generatedAt: NOW
		});
		expect(result.errors).toEqual([
			'hdd 2021-03: 2021-03: duplicate codes 29386',
			'correction hdd:99999 matches no row in any release'
		]);
		expect(result.catalogs[0]?.catalog.releases.map((release) => release[0])).toEqual([
			'2026-06',
			'2026-07',
			'2026-08'
		]);
	});

	test('a correction that matches is applied and not reported', async () => {
		const result = await buildCatalogs(hdd, {
			aliases,
			corrections: { 'hdd:42289': { title: 'Katchi (fixed)' } },
			generatedAt: NOW
		});
		expect(result.errors).toEqual([]);
		const songs = expandCatalog(result.catalogs[0]?.catalog ?? catalogFor('hdd').catalog);
		expect(songs.find((song) => song.code === '42289')?.title).toBe('Katchi (fixed)');
	});

	test('searching the built catalogs finds the plan examples', () => {
		const hddSongs = expandCatalog(catalogFor('hdd').catalog);
		const hddIndex = new SearchIndex(hddSongs);
		expect(hddSongs[hddIndex.search('42289').hits[0]?.index ?? -1]?.title).toBe('Katchi');
		const cup = hddIndex.search('cup of joe').hits.map((hit) => hddSongs[hit.index]);
		expect(cup.length).toBeGreaterThan(0);
		expect(cup.every((song) => song.artists.some((artist) => artist.name === 'Cup of Joe'))).toBe(
			true
		);
		const bini = hddIndex.search('a:bini').hits.map((hit) => hddSongs[hit.index]);
		expect(bini.length).toBeGreaterThan(0);
		expect(bini.every((song) => song.artists.some((artist) => artist.name === 'BINI'))).toBe(true);

		const pSongs = expandCatalog(catalogFor('p-series').catalog);
		const pIndex = new SearchIndex(pSongs);
		for (const query of ['88', '0088']) {
			expect(pSongs[pIndex.search(query).hits[0]?.index ?? -1]?.title).toBe('A Horse With No Name');
		}
	});
});

/** The rejection message of a promise, or an empty string when it resolves. */
async function failure(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		return String(error);
	}
	return '';
}

describe.skipIf(!hasPdfs)('SearchEngine', () => {
	function memoryCache() {
		const store = new Map<string, string>();
		const stats = { reads: 0, writes: 0 };
		const cache: CatalogCache = {
			get: (hash) => {
				stats.reads++;
				return Promise.resolve(store.get(hash));
			},
			put: (hash, json) => {
				stats.writes++;
				store.set(hash, json);
				return Promise.resolve();
			}
		};
		return { cache, stats };
	}

	function files(extra: Record<string, string> = {}) {
		const served = new Map<string, string>([
			['/catalog-manifest.json', JSON.stringify(built.manifest)],
			...built.catalogs.map(({ file, json }): [string, string] => [`/${file}`, json]),
			...(built.shared ? ([[`/${built.shared.file}`, built.shared.json]] as const) : []),
			...Object.entries(extra)
		]);
		const requested: string[] = [];
		return {
			requested,
			fetchText: (url: string) => {
				requested.push(url);
				const body = served.get(url);
				return body === undefined ? Promise.reject(new Error(`404 ${url}`)) : Promise.resolve(body);
			}
		};
	}

	test('loads a songbook, searches it, and reuses the cache on the next load', async () => {
		const { cache, stats } = memoryCache();
		const first = files();
		const engine = new SearchEngine({ fetchText: first.fetchText, cache });
		const loaded = await engine.load('hdd');
		expect(loaded).toMatchObject({
			songbook: 'hdd',
			version: '2026-08',
			count: 220,
			fromCache: false
		});
		expect(engine.search('42289').hits[0]?.song.title).toBe('Katchi');
		expect(stats.writes).toBe(2);

		const second = files();
		const again = await new SearchEngine({ fetchText: second.fetchText, cache }).load('hdd');
		expect(again.fromCache).toBe(true);
		expect(second.requested).toEqual(['/catalog-manifest.json']);
	});

	test('switching songbooks never serves a code from the other one', async () => {
		const served = files();
		const engine = new SearchEngine({ fetchText: served.fetchText, cache: memoryCache().cache });
		await engine.load('p-series');
		expect(engine.search('0088').hits[0]?.song.title).toBe('A Horse With No Name');
		await engine.load('hdd');
		expect(engine.songbook).toBe('hdd');
		expect(engine.search('0088').hits.filter((hit) => hit.song.code === '0088')).toEqual([]);
	});

	test('rejects an unknown songbook, a corrupt catalog and a catalog for the wrong songbook', async () => {
		const unknown = files();
		const noBooks = new SearchEngine({
			fetchText: (url) =>
				url.endsWith('manifest.json')
					? Promise.resolve('{"songbooks":[]}')
					: unknown.fetchText(url),
			cache: memoryCache().cache
		});
		expect(await failure(noBooks.load('hdd'))).toContain('not in the catalog manifest');

		const file = catalogFor('hdd').file;
		const corrupt = files({ [`/${file}`]: '{"songbook":"hdd"}' });
		expect(
			await failure(
				new SearchEngine({ fetchText: corrupt.fetchText, cache: memoryCache().cache }).load('hdd')
			)
		).not.toBe('');

		const swapped = files({ [`/${file}`]: catalogFor('p-series').json });
		expect(
			await failure(
				new SearchEngine({ fetchText: swapped.fetchText, cache: memoryCache().cache }).load('hdd')
			)
		).toContain('holds p-series');
	});

	test('search before load is an error', () => {
		const engine = new SearchEngine({ fetchText: files().fetchText, cache: memoryCache().cache });
		expect(() => engine.search('x')).toThrow('no songbook loaded');
	});
});

describe.skipIf(!hasPdfs)('SearchEngine filters and lists', () => {
	async function loaded() {
		const served = new Map<string, string>([
			['/catalog-manifest.json', JSON.stringify(built.manifest)],
			...built.catalogs.map(({ file, json }): [string, string] => [`/${file}`, json]),
			...(built.shared ? ([[`/${built.shared.file}`, built.shared.json]] as const) : [])
		]);
		const engine = new SearchEngine({
			fetchText: (url) => {
				const body = served.get(url);
				return body === undefined ? Promise.reject(new Error(`404 ${url}`)) : Promise.resolve(body);
			},
			cache: { get: () => Promise.resolve(undefined), put: () => Promise.resolve() }
		});
		await engine.load('hdd');
		return engine;
	}

	test('an artist filter keeps only that artist, with or without a query', async () => {
		const engine = await loaded();
		const all = engine.search('', { artist: 'cup-of-joe', limit: 500 });
		expect(all.total).toBeGreaterThan(0);
		expect(all.hits.every((hit) => hit.song.artists.some((a) => a.name === 'Cup of Joe'))).toBe(
			true
		);

		const narrowed = engine.search('bagyo', { artist: 'cup-of-joe' });
		expect(narrowed.hits.map((hit) => hit.song.title)).toEqual(['Bagyo']);
		expect(engine.search('bagyo', { artist: 'bini' }).total).toBe(0);
		expect(engine.search('', { artist: 'nobody-at-all' })).toEqual({ hits: [], total: 0 });
	});

	test('a release filter lists that release by code, and releases come newest first', async () => {
		const engine = await loaded();
		const releases = engine.releases();
		expect(releases.map((release) => release.label)).toEqual(['2026-08', '2026-07', '2026-06']);
		expect(releases.map((release) => release.count)).toEqual([70, 70, 80]);

		const june = engine.search('', { release: '2026-06', limit: 500 });
		expect(june.total).toBe(80);
		const numbers = june.hits.map((hit) => Number(hit.song.code));
		expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
		expect(engine.search('', { release: '2026-06', limit: 5 }).hits).toHaveLength(5);
	});

	test('songsByCodes keeps the order asked for and skips unknown codes', async () => {
		const engine = await loaded();
		expect(engine.songsByCodes(['42289', '00000', '42227']).map((song) => song.code)).toEqual([
			'42289',
			'42227'
		]);
	});
});

const real = existsSync(join(dataDir, 'pdfs', 'hdd', '2026-05.pdf'));
describe.skipIf(!real)('real data @full', () => {
	test('42195 is Zero Pressure in the real 2026-05 release', async () => {
		const input = await pdf('hdd', '2026-05', join(dataDir, 'pdfs', 'hdd', '2026-05.pdf'));
		const result = await buildCatalogs([input], { aliases, corrections: {}, generatedAt: NOW });
		expect(result.errors).toEqual([]);
		const songs = expandCatalog(result.catalogs[0]?.catalog ?? catalogFor('hdd').catalog);
		const index = new SearchIndex(songs);
		expect(songs[index.search('42195').hits[0]?.index ?? -1]?.title).toBe('Zero Pressure');
	});
});

describe('shared catalog', () => {
	const song = (code: string, title: string): Catalog['songs'][number] => [
		code,
		title,
		null,
		[[0, 0]],
		0,
		[]
	];
	const catalog = (songbook: Songbook, songs: Catalog['songs']): Catalog => ({
		songbook,
		version: 'v1',
		generatedAt: NOW,
		artists: ['Artist'],
		releases: [['v1', '00001', '99999']],
		songs
	});

	test('merges by code, keeps the first spelling and records every list', () => {
		const shared = buildShared([
			catalog('ks', [song('07388', 'KS Spelling'), song('10002', 'Only KS')]),
			catalog('hdd', [song('7388', 'HDD Spelling')])
		]);
		expect(shared?.songbooks).toEqual(['hdd', 'ks']);
		expect(shared?.songs.map((row) => [row[0], row[1], row[4]])).toEqual([
			['7388', 'HDD Spelling', [0, 1]],
			['10002', 'Only KS', [1]]
		]);
	});

	test('P-Series joins last, so another list spells a shared code', () => {
		const shared = buildShared([
			catalog('p-series', [song('8260', 'Only P'), song('00001', 'Shared Song (Live)')]),
			catalog('hdd', [song('00001', 'Shared Song')])
		]);
		expect(shared?.songs.map((row) => [row[0], row[1], row[4]])).toEqual([
			['00001', 'Shared Song', [0, 1]],
			['8260', 'Only P', [1]]
		]);
	});

	test('P-Series only claims a shared code when the title matches', () => {
		const shared = buildShared([
			catalog('hdd', [song('18816', 'Kariton'), song('10001', 'Same Song Here')]),
			catalog('p-series', [song('18816', '7 Rings'), song('10001', 'Same Song Here')])
		]);
		expect(shared?.songs.map((row) => [row[0], row[1], row[4]])).toEqual([
			['10001', 'Same Song Here', [0, 1]],
			['18816', 'Kariton', [0]]
		]);
	});

	test('the engine separates its own songs from those only other lists print', async () => {
		const ks = catalog('ks', [song('10001', 'Mine')]);
		const hdd = catalog('hdd', [song('10001', 'Mine'), song('10002', 'Elsewhere')]);
		const shared = buildShared([ks, hdd]);
		const texts: Record<string, string> = {
			'/catalog-manifest.json': JSON.stringify({
				shared: 'catalog.shared.00000000.json',
				songbooks: [
					{
						slug: 'ks',
						name: 'KS',
						models: [],
						file: 'catalog.ks.11111111.json',
						version: 'v1',
						count: 1,
						codeRanges: []
					}
				]
			}),
			'/catalog.ks.11111111.json': JSON.stringify(ks),
			'/catalog.shared.00000000.json': JSON.stringify(shared)
		};
		const engine = new SearchEngine({
			fetchText: (url) => Promise.resolve(texts[url] ?? ''),
			cache: { get: () => Promise.resolve(undefined), put: () => Promise.resolve() }
		});
		expect((await engine.load('ks')).otherCount).toBe(1);

		const own = engine.search('');
		expect(own.hits.map((hit) => hit.song.code)).toEqual(['10001']);
		expect(own.hits[0].song.lists).toEqual(['hdd', 'ks']);
		const others = engine.search('', { others: true });
		expect(others.hits.map((hit) => [hit.song.code, hit.song.lists])).toEqual([['10002', ['hdd']]]);
		expect(engine.songsByCodes(['10002']).map((found) => found.title)).toEqual(['Elsewhere']);
	});
});
