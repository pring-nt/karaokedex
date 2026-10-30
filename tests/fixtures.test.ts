import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractPages } from '../src/lib/parser/extract';
import { parseRelease } from '../src/lib/parser/parse-release';
import { parseMonthlyNewSongs } from '../src/lib/parser/profiles/monthly-new-songs';
import type { ParsedRelease } from '../src/lib/parser/schema';
import { crossReleaseWarnings } from '../src/lib/parser/validate';

const dir = join(import.meta.dir, 'fixtures', 'hdd');
/** Songlist PDFs are not in the repo. Without local copies, these tests skip. */
const files = existsSync(dir)
	? (await readdir(dir)).filter((name) => /^\d{4}-\d{2}\.pdf$/.test(name)).sort()
	: [];
const RECENT = ['2026-06.pdf', '2026-07.pdf', '2026-08.pdf', '2026-09.pdf', '2026-10.pdf'];
/** Platinum prints code 29386 twice in this release, for two different songs. */
const KNOWN_INVALID = ['2021-03.pdf'];

async function parse(name: string) {
	const data = new Uint8Array(await readFile(join(dir, name)));
	return parseRelease({ songbook: 'hdd', label: name.replace('.pdf', ''), data });
}

const parsed = new Map(
	await Promise.all(files.map(async (name) => [name, await parse(name)] as const))
);

describe.skipIf(files.length === 0)('HDD monthly fixtures', () => {
	test('every fixture parses with no errors', () => {
		expect(files.length).toBeGreaterThan(0);
		for (const [name, result] of parsed) {
			if (KNOWN_INVALID.includes(name)) continue;
			expect({ name, errors: result.errors }).toEqual({ name, errors: [] });
		}
	});

	test.each([
		['2026-06.pdf', '42227', '42306', 80, 3],
		['2026-07.pdf', '42307', '42376', 70, 2],
		['2026-08.pdf', '42377', '42446', 70, 2],
		['2026-09.pdf', '42447', '42516', 70, 2],
		['2026-10.pdf', '42517', '42586', 70, 2]
	])('%s spans %s-%s with %i rows in %i columns', (name, min, max, count, columns) => {
		const result = parsed.get(name);
		expect(result?.release.codeMin).toBe(min);
		expect(result?.release.codeMax).toBe(max);
		expect(result?.release.rows).toHaveLength(count);
		expect(result?.columns).toBe(columns);
	});

	test('releases chain without gaps', () => {
		const releases = RECENT.map((name) => parsed.get(name)?.release).filter(
			(entry) => entry !== undefined
		);
		expect(crossReleaseWarnings(releases)).toEqual([]);
	});

	function row(name: string, code: string) {
		const found = parsed.get(name)?.release.rows.find((entry) => entry.code === code);
		if (!found) throw new Error(`${code} missing from ${name}`);
		return found;
	}

	test('numbers inside titles are not mistaken for codes', () => {
		expect(row('2026-06.pdf', '42236')).toMatchObject({
			title: '24/7, 365',
			creditRaw: 'Elijah Woods'
		});
	});

	test('wrapped artist lines are joined with spaces and stay on their own row', () => {
		expect(row('2026-06.pdf', '42289').creditRaw).toBe('Ofenbach vs. Nick Waterhouse');
		expect(row('2026-06.pdf', '42291').creditRaw).toBe('Greyhoundz ft Gloc-9 and Francis M.');
		expect(row('2026-07.pdf', '42365').creditRaw).toBe('Janine Berdin ft. Illest Morena, Fana');
		expect(row('2026-10.pdf', '42573').creditRaw).toBe('Sleeping With Sirens');
	});

	test('wrapped titles are joined', () => {
		expect(row('2026-10.pdf', '42573').title).toBe("Don't You Ever Forget About Me");
		expect(row('2026-09.pdf', '42459').title).toBe('Yakap Mo (Nang Ngumiti Ang Langit Theme)');
	});

	test('version qualifiers move to versionNote, other parentheses stay in the title', () => {
		expect(row('2026-06.pdf', '42238')).toMatchObject({
			title: 'Biyahe',
			versionNote: 'R&B Cover'
		});
		expect(row('2026-06.pdf', '42242')).toMatchObject({
			title: 'Hanggang Ngayon',
			versionNote: 'Soul Cover'
		});
		expect(row('2026-08.pdf', '42400')).toMatchObject({
			title: 'Halik',
			versionNote: 'Funk Cover'
		});
		expect(row('2026-07.pdf', '42365')).toMatchObject({
			title: 'Tayo Lang (may alam)',
			versionNote: null
		});
	});

	test('a page without the "New Songs" signature is rejected', async () => {
		const pages = await extractPages(new Uint8Array(await readFile(join(dir, '2026-10.pdf'))));
		const stripped = pages.map((page) => ({
			...page,
			items: page.items.filter((item) => item.str.trim() !== 'New Songs')
		}));
		expect(() => parseMonthlyNewSongs(stripped)).toThrow('signature');
	});

	test('a file whose label disagrees with the page header is an error', async () => {
		const data = new Uint8Array(await readFile(join(dir, '2026-10.pdf')));
		const result = await parseRelease({ songbook: 'hdd', label: '2026-09', data });
		expect(result.errors.join()).toContain('page header says 2026-10');
	});

	test('parsing is deterministic', async () => {
		const again = await parse('2026-10.pdf');
		expect(JSON.stringify(again.release)).toBe(JSON.stringify(parsed.get('2026-10.pdf')?.release));
	});

	test('snapshot of every release', () => {
		const releases: Record<string, ParsedRelease> = {};
		for (const name of RECENT) {
			const result = parsed.get(name);
			if (result) releases[name] = result.release;
		}
		expect(releases).toMatchSnapshot();
	});
});

describe.skipIf(files.length === 0)('older HDD layouts', () => {
	function row(name: string, code: string) {
		const found = parsed.get(name)?.release.rows.find((entry) => entry.code === code);
		if (!found) throw new Error(`${code} missing from ${name}`);
		return found;
	}

	test('the 2018 layout has an abbreviated "Jan 2018 HDD" header and no month spelled out', () => {
		const result = parsed.get('2018-01.pdf');
		expect(result?.release.label).toBe('2018-01');
		expect(result?.release.rows).toHaveLength(60);
		expect(row('2018-01.pdf', '26748')).toMatchObject({
			title: 'Almost Like Praying',
			creditRaw: 'Lin-Manuel Miranda'
		});
	});

	test('the in-page app advert and table headers never become rows', () => {
		for (const name of ['2018-10.pdf', '2019-12.pdf']) {
			const rows = parsed.get(name)?.release.rows ?? [];
			expect(
				rows.filter((entry) =>
					/instantly|browse, reserve|transform your|^130$/i.test(
						entry.title + ' ' + entry.creditRaw
					)
				)
			).toEqual([]);
		}
		expect(parsed.get('2018-10.pdf')?.release.rows).toHaveLength(62);
		expect(parsed.get('2019-12.pdf')?.release.rows).toHaveLength(69);
	});

	test('an artist cell merged over several rows is shared by all of them', () => {
		for (const code of ['03075', '07303', '03192', '08607', '03245']) {
			expect(row('2021-06.pdf', code).creditRaw).toBe('Earth, Wind & Fire');
		}
	});

	test('a second "Featured Artists" page keeps leading-zero codes and shares merged artists', () => {
		expect(parsed.get('2021-07.pdf')?.release.rows).toHaveLength(206);
		expect(row('2021-07.pdf', '00001')).toMatchObject({
			title: 'Roxanne',
			creditRaw: 'The Police'
		});
		expect(row('2021-07.pdf', '29175').creditRaw).toBe('The Police');
		expect(row('2021-07.pdf', '07898').creditRaw).toBe('Michael Learns To Rock');
	});

	test('a small month stamp beside a re-added artist is not part of the artist', () => {
		expect(row('2021-07.pdf', '08415').creditRaw).toBe('Janno Gibbs');
	});

	test('a release that mixes a new block with earlier codes is a run report, not an error', () => {
		const result = parsed.get('2021-07.pdf');
		expect(result?.errors).toEqual([]);
		expect(result?.warnings.join()).toContain('code runs');
	});

	test('a word broken mid-word across lines is joined and flagged', () => {
		expect(row('2026-02.pdf', '41967')).toMatchObject({
			title: 'Nakakapagpabagabag',
			needsReview: true,
			reviewReasons: ['short-continuation']
		});
		expect(parsed.get('2026-02.pdf')?.release).toMatchObject({
			codeMin: '41907',
			codeMax: '41986'
		});
		expect(parsed.get('2026-02.pdf')?.release.rows).toHaveLength(80);
	});

	test('a code printed twice for different songs is an error, fixable by a correction', async () => {
		const result = parsed.get('2021-03.pdf');
		expect(result?.errors).toEqual(['2021-03: duplicate codes 29386']);

		const data = new Uint8Array(await readFile(join(dir, '2021-03.pdf')));
		const fixed = await parseRelease({
			songbook: 'hdd',
			label: '2021-03',
			data,
			corrections: { 'hdd:29386': { ifTitle: 'Ako Ang Namingwit', code: '29369' } }
		});
		expect(fixed.errors).toEqual([]);
		expect(fixed.release.rows.find((entry) => entry.code === '29369')?.title).toBe(
			'Ako Ang Namingwit'
		);
		expect(fixed.release.rows.find((entry) => entry.code === '29386')?.title).toBe('Tagong Gugma');
	});
});
