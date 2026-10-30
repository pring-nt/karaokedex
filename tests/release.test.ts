import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { CorrectionsFile, applyCorrections } from '../src/lib/data/corrections';
import { loadAliases, loadCorrections } from '../src/lib/data/load';
import { createDb } from '../src/lib/db';
import { artists, releases, songArtists, songReleases, songs } from '../src/lib/db/schema';
import { writeRelease } from '../src/lib/db/write';
import { lintRow } from '../src/lib/parser/lint';
import { ParsedRelease } from '../src/lib/parser/schema';
import {
	codeRuns,
	crossReleaseWarnings,
	runWarnings,
	validateMonthlyRelease
} from '../src/lib/parser/validate';
import { makeRelease, makeRow } from './factories';

const dataPath = (name: string) => join(import.meta.dir, '..', 'data', name);

describe('lintRow', () => {
	test('flags unbalanced brackets', () => {
		expect(lintRow('Song', 'Bryan Adams (feat. Ray Dalton')).toContain('unbalanced-brackets');
		expect(lintRow('Song', 'Ray Dalton)')).toContain('unbalanced-brackets');
		expect(lintRow('Song', '41 (Kyle Richh, Tata)')).toEqual([]);
	});

	test('flags credits that end mid-separator', () => {
		for (const credit of ['Jay Sean Ft.', 'Artist &', 'Artist,', 'Artist x', 'Artist feat.']) {
			expect(lintRow('Song', credit)).toContain('dangling-credit');
		}
		expect(lintRow('Song', 'Alex')).toEqual([]);
	});

	test('flags an empty credit', () => {
		expect(lintRow('Song', '  ')).toEqual(['empty-credit']);
	});
});

describe('validateMonthlyRelease', () => {
	test('accepts a contiguous release', () => {
		const release = makeRelease('2026-03', [makeRow('41987'), makeRow('41988'), makeRow('41989')]);
		expect(validateMonthlyRelease(release)).toEqual([]);
	});

	test('reports duplicate codes as an error', () => {
		const dup = makeRelease('2026-03', [makeRow('41987'), makeRow('41987'), makeRow('41988')]);
		expect(validateMonthlyRelease(dup).join()).toContain('duplicate codes 41987');
	});

	test('a gap is a run report, not an error', () => {
		const gap = makeRelease('2026-03', [makeRow('41987'), makeRow('41989')]);
		expect(validateMonthlyRelease(gap)).toEqual([]);
		expect(codeRuns(gap)).toEqual([
			{ min: 41987, max: 41987, count: 1 },
			{ min: 41989, max: 41989, count: 1 }
		]);
		expect(runWarnings(gap)).toEqual(['2026-03: 2 code runs: 41987-41987 (1), 41989-41989 (1)']);
		expect(runWarnings(makeRelease('2026-03', [makeRow('41987'), makeRow('41988')]))).toEqual([]);
	});

	test('an old release mixes a new block with earlier codes; the longest run drives the lineage check', () => {
		const old = makeRelease('2015-06', [
			...['16860', '16861', '16862'].map((code) => makeRow(code)),
			...['11383', '11452'].map((code) => makeRow(code))
		]);
		const next = makeRelease(
			'2015-07',
			['16863', '16864'].map((code) => makeRow(code))
		);
		expect(validateMonthlyRelease(old)).toEqual([]);
		expect(crossReleaseWarnings([old, next])).toEqual([]);
	});

	test('reports a declared range that disagrees with the rows', () => {
		const release = makeRelease('2026-03', [makeRow('41987'), makeRow('41988')], {
			codeMax: '41990'
		});
		expect(validateMonthlyRelease(release).join()).toContain('declared range');
	});
});

describe('crossReleaseWarnings', () => {
	test('warns when a release does not follow the previous one', () => {
		const a = makeRelease('2026-03', [makeRow('41987'), makeRow('41988')]);
		const b = makeRelease('2026-04', [makeRow('41989')]);
		const c = makeRelease('2026-05', [makeRow('42000')]);
		expect(crossReleaseWarnings([c, a, b])).toEqual([
			'2026-05 starts at 42000, expected 41990 after 2026-04 (41989)'
		]);
	});
});

describe('applyCorrections', () => {
	const rows = [
		makeRow('41749', { needsReview: true, reviewReasons: ['unbalanced-brackets'] }),
		makeRow('41750')
	];

	test('overrides fields and clears review flags', () => {
		const { rows: out, missing } = applyCorrections(
			'hdd',
			rows,
			CorrectionsFile.parse({ 'hdd:41749': { creditRaw: 'Fixed' } })
		);
		expect(missing).toEqual([]);
		expect(out[0]).toMatchObject({ creditRaw: 'Fixed', needsReview: false, reviewReasons: [] });
		expect(out[1]).toEqual(rows[1]);
	});

	test('reports corrections for codes that do not exist and ignores other songbooks', () => {
		const corrections = CorrectionsFile.parse({
			'hdd:49999': { title: 'Nope' },
			'p-series:41749': { title: 'Other book' }
		});
		const { rows: out, missing } = applyCorrections('hdd', rows, corrections);
		expect(missing).toEqual(['hdd:49999']);
		expect(out).toEqual(rows);
	});

	test('rejects unknown fields and bad keys', () => {
		expect(CorrectionsFile.safeParse({ 'hdd:41749': { artist: 'x' } }).success).toBe(false);
		expect(CorrectionsFile.safeParse({ 'hdd-41749': { title: 'x' } }).success).toBe(false);
	});
});

describe('data files', () => {
	test('committed aliases.json and corrections.json validate', async () => {
		const aliases = await loadAliases(dataPath('aliases.json'));
		expect(aliases.atomic).toContain('Macklemore & Ryan Lewis');
		const corrections = Object.keys(await loadCorrections(dataPath('corrections.json')));
		expect(corrections).toContain('hdd:29386');
		expect(corrections).toContain('ks:42243');
	});

	test('alias keys that are not normalized are rejected', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'karaokedex-'));
		const path = join(dir, 'aliases.json');
		await writeFile(path, JSON.stringify({ atomic: [], map: { 'ONE OK ROCK': 'x' } }));
		expect(loadAliases(path)).rejects.toThrow('must be normalized');
	});
});

describe('ParsedRelease', () => {
	test('keeps codes as strings with leading zeros out of the numeric domain', () => {
		const release = makeRelease('2026-03', [makeRow('41987')]);
		expect(ParsedRelease.safeParse(release).success).toBe(true);
		expect(ParsedRelease.safeParse({ ...release, codeMin: 41987 }).success).toBe(false);
	});
});

describe('writeRelease', () => {
	const aliases = { atomic: [], map: {} };

	test('writes songs, artists and credits; the same code is the only identity', () => {
		const db = createDb();
		const first = makeRelease('2026-04', [
			makeRow('42057', { title: 'I Drink Wine', creditRaw: 'Adele' }),
			makeRow('42058', { title: 'Zero Pressure', creditRaw: 'BINI ft. Maki' })
		]);
		const second = makeRelease('2026-05', [
			makeRow('42129', { title: 'I Drink Wine', creditRaw: 'Adele' })
		]);

		expect(writeRelease(db, first, aliases)).toBe('written');
		expect(writeRelease(db, second, aliases)).toBe('written');

		const wine = db.select().from(songs).where(eq(songs.title, 'I Drink Wine')).all();
		expect(wine.map((song) => song.code).sort()).toEqual(['42057', '42129']);
		expect(
			db
				.select()
				.from(artists)
				.all()
				.map((a) => a.name)
				.sort()
		).toEqual(['Adele', 'BINI', 'Maki']);
		const credits = db.select().from(songArtists).where(eq(songArtists.code, '42058')).all();
		expect(credits.map((c) => [c.position, c.role])).toEqual([
			[0, 'primary'],
			[1, 'featured']
		]);
	});

	test('skips a release whose file hash is already stored', () => {
		const db = createDb();
		const release = makeRelease('2026-04', [makeRow('42057')]);
		expect(writeRelease(db, release, aliases)).toBe('written');
		expect(writeRelease(db, release, aliases)).toBe('skipped');
		expect(db.select().from(releases).all()).toHaveLength(1);
	});

	test('rolls back the whole release when a code appears twice inside it', () => {
		const db = createDb();
		writeRelease(db, makeRelease('2026-04', [makeRow('42057')]), aliases);
		const clash = makeRelease('2026-05', [makeRow('42058'), makeRow('42059'), makeRow('42059')]);
		expect(() => writeRelease(db, clash, aliases)).toThrow();
		expect(db.select().from(releases).all()).toHaveLength(1);
		expect(db.select().from(songs).all()).toHaveLength(1);
	});

	test('a code re-listed by a later release keeps its first release, takes the later spelling and is recorded', () => {
		const db = createDb();
		writeRelease(
			db,
			makeRelease('2015-01', [
				makeRow('16417', { title: 'Break Free', creditRaw: 'Ariana Grande Feat. Zedd' })
			]),
			aliases
		);
		writeRelease(
			db,
			makeRelease('2015-12', [
				makeRow('16417', { title: 'Break Free', creditRaw: 'Ariana Grande ft. Zedd' })
			]),
			aliases
		);

		const all = db.select().from(songs).all();
		expect(all).toHaveLength(1);
		expect(all.at(0)?.creditRaw).toBe('Ariana Grande ft. Zedd');
		const first = db.select().from(releases).where(eq(releases.label, '2015-01')).all().at(0);
		expect(all.at(0)?.releaseId).toBe(first?.id);
		expect(db.select().from(songReleases).all()).toHaveLength(2);
		const credits = db.select().from(songArtists).where(eq(songArtists.code, '16417')).all();
		expect(credits).toHaveLength(2);
	});
});

describe('applyCorrections with ifTitle and code', () => {
	const rows = [
		makeRow('29386', { title: 'Tagong Gugma' }),
		makeRow('29386', { title: 'Ako Ang Namingwit' })
	];

	test('a code shared by two rows needs ifTitle', () => {
		const { ambiguous, rows: out } = applyCorrections(
			'hdd',
			rows,
			CorrectionsFile.parse({ 'hdd:29386': { code: '29369' } })
		);
		expect(ambiguous).toEqual(['hdd:29386']);
		expect(out).toEqual(rows);
	});

	test('ifTitle picks the row and code replaces it', () => {
		const { rows: out, missing } = applyCorrections(
			'hdd',
			rows,
			CorrectionsFile.parse({ 'hdd:29386': { ifTitle: 'ako ang namingwit', code: '29369' } })
		);
		expect(missing).toEqual([]);
		expect(out.map((row) => row.code)).toEqual(['29386', '29369']);
	});

	test('ifTitle that matches nothing is reported as missing', () => {
		const { missing } = applyCorrections(
			'hdd',
			rows,
			CorrectionsFile.parse({ 'hdd:29386': { ifTitle: 'Nope', code: '29369' } })
		);
		expect(missing).toEqual(['hdd:29386']);
	});
});

describe('lintRow and capital X', () => {
	test('a credit ending in a capital X is a name, not a dangling separator', () => {
		expect(lintRow('Song', 'Lil Nas X')).toEqual([]);
		expect(lintRow('Song', 'Tyga x')).toContain('dangling-credit');
	});
});
