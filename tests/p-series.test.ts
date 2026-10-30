import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb } from '../src/lib/db';
import { songs, songTitles } from '../src/lib/db/schema';
import { writeRelease } from '../src/lib/db/write';
import { parseRelease } from '../src/lib/parser/parse-release';
import type { ParsedRow } from '../src/lib/parser/schema';

const samplePath = join(import.meta.dir, 'fixtures', 'p-series', 'full-vol-59-sample.pdf');
const fullPath = join(import.meta.dir, '..', 'data', 'pdfs', 'p-series', 'full-vol-59.pdf');
const aliases = { atomic: [], map: {} };

async function parse(path: string, label: string) {
	return parseRelease({ songbook: 'p-series', label, data: new Uint8Array(await readFile(path)) });
}

const sample = await parse(samplePath, 'full-vol-59-sample');
const full = existsSync(fullPath) ? await parse(fullPath, 'full-vol-59') : null;

function row(rows: readonly ParsedRow[], code: string): ParsedRow {
	const found = rows.find((entry) => entry.code === code);
	if (!found) throw new Error(`${code} missing`);
	return found;
}

describe('P-series Vol. 59 sample (pages 1, 10, 40, 70, 78)', () => {
	test('is a full-list release with three code columns and no errors beyond missing section headers', () => {
		expect(sample.release).toMatchObject({
			songbook: 'p-series',
			kind: 'full',
			profile: 'full-list'
		});
		expect(sample.columns).toBe(3);
		// The sample skips the pages that carry most section headers, so section checks cannot pass.
		expect(sample.errors.filter((error) => !error.includes('sits under section'))).toEqual([]);
	});

	test('page 1: parenthesised titles and a leading-zero code stay intact', () => {
		const { rows } = sample.release;
		expect(row(rows, '3416')).toMatchObject({
			title: '(Everything I Do) I Do It For You',
			creditRaw: 'Bryan Adams',
			needsReview: false
		});
		expect(row(rows, '7538')).toMatchObject({
			title: "(I've Had) The Time Of My Life",
			creditRaw: 'Dirty Dancing Theme'
		});
		expect(row(rows, '0088')).toMatchObject({
			code: '0088',
			title: 'A Horse With No Name',
			creditRaw: 'America'
		});
	});

	test('page 1: bare-number titles are not mistaken for codes', () => {
		const { rows } = sample.release;
		expect(row(rows, '44862')).toMatchObject({ title: '22', creditRaw: 'Lily Allen' });
		expect(row(rows, '5872')).toMatchObject({ title: '214', creditRaw: 'Rivermaya' });
	});

	test('page 1: the same title under two codes yields two songs', () => {
		const { rows } = sample.release;
		expect(row(rows, '8867')).toMatchObject({ title: 'A Little Respect', creditRaw: 'Wheatus' });
		expect(row(rows, '9921')).toMatchObject({ title: 'A Little Respect', creditRaw: 'Erasure' });
	});

	test('page 40: an empty artist is flagged for review', () => {
		expect(row(sample.release.rows, '3514')).toMatchObject({
			title: 'Love Hurts & You Are Everything',
			creditRaw: '',
			needsReview: true,
			reviewReasons: ['empty-credit']
		});
	});

	test('page 70: overflowing artist lines stay with their own row, and mojibake is flagged', () => {
		const { rows } = sample.release;
		expect(row(rows, '2237')).toMatchObject({
			title: 'Total',
			creditRaw: "Jos`E Maria G'omez Meza",
			needsReview: true,
			reviewReasons: ['accent-mojibake']
		});
		expect(row(rows, '3410')).toMatchObject({
			title: 'Total Eclipse Of The Heart',
			creditRaw: 'Bonnie Tyler'
		});
	});

	test('parsing is deterministic', async () => {
		const again = await parse(samplePath, 'full-vol-59-sample');
		expect(JSON.stringify(again.release)).toBe(JSON.stringify(sample.release));
	});

	test('writes to the database with leading zeros intact', () => {
		const db = createDb();
		writeRelease(db, sample.release, aliases);
		const codes = db.select({ code: songs.code }).from(songs).all();
		expect(codes.map((entry) => entry.code)).toContain('0088');
		expect(codes).toHaveLength(sample.release.rows.length);
	});
});

describe.skipIf(!existsSync(fullPath))('P-series Vol. 59 full file @full', () => {
	test('every code anchor is consumed exactly once and nothing errors', () => {
		expect(full?.errors).toEqual([]);
		expect(full?.release.rows.length).toBeGreaterThan(7600);
	});

	test('724 codes carry leading zeros', () => {
		expect(full?.release.rows.filter((entry) => entry.code.startsWith('0'))).toHaveLength(724);
	});

	test('44387 and 44384 each have two titles', () => {
		const rows = full?.release.rows ?? [];
		expect(row(rows, '44387')).toMatchObject({ title: 'I Surrender', altTitles: ['Surrender'] });
		expect(row(rows, '44384')).toMatchObject({ title: 'Milkshake', altTitles: ['My Milkshake'] });
	});

	test('alternate titles reach the database', () => {
		if (!full) return;
		const db = createDb();
		writeRelease(db, full.release, aliases);
		const alternates = db.select().from(songTitles).all();
		expect(alternates.map((entry) => entry.code).sort()).toEqual(['44384', '44387']);
	});
});
