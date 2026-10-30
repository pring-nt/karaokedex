import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	applyDiff,
	diffManifest,
	manifestFromSeed,
	monthlyLabel,
	SourcesFile,
	toManifest,
	volumeLabel
} from '../src/lib/sources/manifest';
import {
	fetchSongList,
	findAsset,
	parseSongList,
	SongListError,
	type FetchLike
} from '../src/lib/sources/songlist';

const dir = join(import.meta.dir, 'fixtures', 'sources');
const asset = await readFile(join(dir, 'songlist-update-data.js'), 'utf8');
const mutated = await readFile(join(dir, 'songlist-update-data.mutated.js'), 'utf8');
const page = await readFile(join(dir, 'songlist-update.html'), 'utf8');
const NOW = new Date('2026-10-30T12:00:00Z');
const ASSET = { url: 'https://example.test/songlist.js', version: '1' };

function fakeFetch(pageHtml: string, assetSource: string, log: string[] = []): FetchLike {
	return (url) => {
		log.push(url);
		const body = url.includes('songlist-update-data') ? assetSource : pageHtml;
		return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
	};
}

describe('labels', () => {
	test('months accept full names, abbreviations and any case', () => {
		expect(monthlyLabel(2026, 'November')).toBe('2026-11');
		expect(monthlyLabel(2017, 'Aug')).toBe('2017-08');
		expect(monthlyLabel(2015, 'JANUARY')).toBe('2015-01');
		expect(() => monthlyLabel(2015, 'Smarch')).toThrow('unrecognised month');
	});

	test('volumes become vol-<n> or vol-<a>-<b>', () => {
		expect(volumeLabel(108)).toBe('vol-108');
		expect(volumeLabel('53 - 59')).toBe('vol-53-59');
		expect(volumeLabel('104~105')).toBe('vol-104-105');
		expect(volumeLabel('87 (Training)')).toBe('vol-87-training');
		expect(() => volumeLabel('Training')).toThrow('no number');
	});
});

describe('parseSongList', () => {
	test('reads the trimmed real asset with both product shapes', () => {
		const list = parseSongList(asset);
		expect(list.map((product) => product.product)).toEqual([
			'MAJOR/ALPHA/CELLO/X3/PIANO XL HDD',
			'BMB / X2 / X1 / HDD',
			'P-SERIES',
			'BRAVO'
		]);
		expect(list.filter((product) => 'years' in product)).toHaveLength(2);
		expect(list.filter((product) => 'volumes' in product)).toHaveLength(2);
	});

	test('rejects a non-literal node instead of evaluating it', () => {
		expect(() => parseSongList(mutated)).toThrow(SongListError);
		expect(() => parseSongList(mutated)).toThrow('unsupported BinaryExpression');
	});

	test('rejects calls, identifiers and spreads inside songList', () => {
		for (const bad of [
			'const songList=[{product:"a",volumes:[{volume:1,link:f()}]}]',
			'const songList=[{product:"a",volumes:[{volume:x,link:"https://a.test"}]}]',
			'const songList=[...other]'
		]) {
			expect(() => parseSongList(bad)).toThrow(SongListError);
		}
	});

	test('reports a missing declaration and a wrong shape', () => {
		expect(() => parseSongList('const other=[]')).toThrow('not found');
		expect(() => parseSongList('const songList=[{product:"a"}]')).toThrow('unexpected shape');
		expect(() => parseSongList('const songList=[')).toThrow('not valid JavaScript');
	});
});

describe('fetchSongList', () => {
	test('finds the asset in the page, never hardcoding the theme number', () => {
		const found = findAsset(page);
		expect(found.url).toBe(
			'https://platinumkaraoke.com/cdn/shop/t/50/assets/songlist-update-data.js'
		);
		expect(found.version).toBe('155022796841148418491792385173');
		const moved = page.replace('/t/50/', '/t/51/');
		expect(findAsset(moved).url).toContain('/t/51/');
		expect(() => findAsset('<html></html>')).toThrow('page structure changed');
	});

	test('uses two requests, and one when the asset version is unchanged', async () => {
		const log: string[] = [];
		const first = await fetchSongList(fakeFetch(page, asset, log));
		expect(first.songList).toHaveLength(4);
		expect(log).toHaveLength(2);

		log.length = 0;
		const again = await fetchSongList(fakeFetch(page, asset, log), first.asset.version);
		expect(again.songList).toBeNull();
		expect(log).toHaveLength(1);
	});

	test('fails clearly on an HTTP error', () => {
		const failing: FetchLike = () =>
			Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') });
		expect(fetchSongList(failing)).rejects.toThrow('503');
	});
});

describe('toManifest and diffManifest', () => {
	const manifest = toManifest(parseSongList(asset));

	test('maps products to songbooks with normalised labels', () => {
		expect(manifest.conflicts).toEqual([]);
		const hdd = manifest.entries.filter((entry) => entry.songbook === 'hdd');
		expect(hdd.map((entry) => entry.label)).toEqual([
			'2026-11',
			'2026-10',
			'2026-09',
			'2025-12',
			'2025-11',
			'2025-10'
		]);
		expect(manifest.entries.filter((entry) => entry.songbook === 'p-series')).toHaveLength(3);
	});

	test('an unknown product is reported, not dropped', () => {
		const list = parseSongList(
			'const songList=[{product:"NEW PLAYER",volumes:[{volume:1,link:"https://a.test/f.pdf"}]}]'
		);
		const unknown = toManifest(list);
		expect(unknown.entries).toHaveLength(1);
		const diff = diffManifest(null, unknown, '1');
		expect(diff.unknownProducts).toEqual(['NEW PLAYER']);
	});

	test('the first run adds everything: in-scope entries missing, the rest ignored', () => {
		const diff = diffManifest(null, manifest, ASSET.version);
		expect(diff.added).toHaveLength(manifest.entries.length);
		const file = applyDiff(null, diff, manifest, ASSET, NOW, () => false);
		expect(SourcesFile.safeParse(file).success).toBe(true);
		expect(file.entries.find((entry) => entry.label === '2026-11')).toMatchObject({
			songbook: 'hdd',
			status: 'missing',
			file: 'data/pdfs/hdd/2026-11.pdf',
			firstSeen: '2026-10-30'
		});
		expect(
			file.entries
				.filter((entry) => entry.songbook === 'bravo')
				.every((entry) => entry.status === 'ignored')
		).toBe(true);
	});

	test('a file already on disk starts as present', () => {
		const diff = diffManifest(null, manifest, ASSET.version);
		const file = applyDiff(null, diff, manifest, ASSET, NOW, (path) =>
			path.endsWith('2026-10.pdf')
		);
		expect(file.entries.find((entry) => entry.label === '2026-10')?.status).toBe('present');
	});

	test('re-running against the written file reports no changes', () => {
		const first = applyDiff(
			null,
			diffManifest(null, manifest, '1'),
			manifest,
			ASSET,
			NOW,
			() => false
		);
		const diff = diffManifest(first, manifest, '1');
		expect(diff.changed).toBe(false);
		expect(diff.assetVersion).toBeNull();
	});

	test('an injected new HDD month yields exactly one new missing entry', () => {
		const first = applyDiff(
			null,
			diffManifest(null, manifest, '1'),
			manifest,
			ASSET,
			NOW,
			() => false
		);
		const withNewMonth = {
			...manifest,
			entries: [
				{
					songbook: 'hdd',
					product: 'MAJOR/ALPHA/CELLO/X3/PIANO XL HDD',
					kind: 'monthly' as const,
					label: '2026-12',
					url: 'https://www.mediafire.com/file/new/HDD_2026_December.pdf/file'
				},
				...manifest.entries
			]
		};
		const diff = diffManifest(first, withNewMonth, '2');
		expect(diff.changed).toBe(true);
		expect(diff.added.map((entry) => entry.label)).toEqual(['2026-12']);
		expect(diff.assetVersion).toEqual({ from: '1', to: '2' });

		const next = applyDiff(first, diff, withNewMonth, { ...ASSET, version: '2' }, NOW, () => false);
		expect(
			next.entries.filter((entry) => entry.status === 'missing' && entry.label === '2026-12')
		).toHaveLength(1);
		expect(next.asset.version).toBe('2');
	});

	test('moved links update, vanished entries are kept and marked', () => {
		const first = applyDiff(
			null,
			diffManifest(null, manifest, '1'),
			manifest,
			ASSET,
			NOW,
			() => false
		);
		const moved = manifest.entries.at(0);
		const dropped = manifest.entries.at(1);
		if (!moved || !dropped) throw new Error('manifest too small');
		const rest = manifest.entries.slice(1);
		const changed = {
			...manifest,
			entries: [{ ...moved, url: 'https://new.test/a.pdf' }, ...rest.slice(1)]
		};
		const diff = diffManifest(first, changed, '1');
		expect(diff.urlChanged).toHaveLength(1);
		expect(diff.removedUpstream.map((entry) => entry.label)).toEqual([dropped.label]);

		const next = applyDiff(first, diff, changed, ASSET, NOW, () => false);
		expect(next.entries.find((entry) => entry.label === dropped.label)?.removedUpstream).toBe(true);
		expect(
			next.entries.find((entry) => entry.label === moved.label && entry.songbook === moved.songbook)
				?.url
		).toBe('https://new.test/a.pdf');
		expect(diffManifest(next, changed, '1').changed).toBe(false);
	});

	test('conflicting links for the same key are reported and the first wins', () => {
		const list = parseSongList(
			'const songList=[{product:"BRAVO",volumes:[{volume:1,link:"https://a.test/1.pdf"},{volume:1,link:"https://a.test/2.pdf"}]}]'
		);
		const result = toManifest(list);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.url).toBe('https://a.test/1.pdf');
		expect(result.conflicts).toHaveLength(1);
	});
});

describe('manifestFromSeed', () => {
	test('turns the committed snapshot into manifest entries', async () => {
		const seed = JSON.parse(
			await readFile(join(import.meta.dir, '..', 'data', 'sources.seed.json'), 'utf8')
		) as unknown;
		const result = manifestFromSeed(seed);
		expect(result.entries.filter((entry) => entry.songbook === 'hdd')).toHaveLength(143);
		expect(result.entries.some((entry) => entry.songbook === null)).toBe(false);
	});
});

describe('sources:check CLI', () => {
	async function run(args: string[]) {
		const process = Bun.spawn(['bun', 'scripts/sources-check.ts', ...args], {
			cwd: join(import.meta.dir, '..'),
			stdout: 'pipe',
			stderr: 'pipe'
		});
		const [stdout, stderr] = await Promise.all([
			new Response(process.stdout).text(),
			new Response(process.stderr).text()
		]);
		return { code: await process.exited, stdout, stderr };
	}

	test('exit codes: 10 on the first write, 0 afterwards, 10 for one injected month, 1 for a bad asset', async () => {
		const work = await mkdtemp(join(tmpdir(), 'karaokedex-sources-'));
		const sources = join(work, 'sources.json');
		const fixture = join(dir, 'songlist-update-data.js');

		const first = await run(['--asset-file', fixture, '--sources', sources, '--write']);
		expect(first.code).toBe(10);
		expect(first.stdout).toContain('wrote');

		const second = await run(['--asset-file', fixture, '--sources', sources, '--write']);
		expect(second.code).toBe(0);
		expect(second.stdout).toContain('no changes');

		const injected = asset.replace(
			'{month:"November",',
			'{month:"December",link:"https://www.mediafire.com/file/inj/HDD_2026_December.pdf/file"},{month:"November",'
		);
		const injectedPath = join(work, 'injected.js');
		await writeFile(injectedPath, injected);
		const third = await run(['--asset-file', injectedPath, '--sources', sources]);
		expect(third.code).toBe(10);
		expect(third.stdout.match(/^new /gm)).toHaveLength(1);
		expect(third.stdout).toContain('2026-12');

		const broken = await run([
			'--asset-file',
			join(dir, 'songlist-update-data.mutated.js'),
			'--sources',
			sources
		]);
		expect(broken.code).toBe(1);
		expect(broken.stderr).toContain('unsupported BinaryExpression');
	});
});
