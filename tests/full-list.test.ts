import { describe, expect, test } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import { createDb } from '../src/lib/db';
import { songTitles } from '../src/lib/db/schema';
import { writeRelease } from '../src/lib/db/write';
import { boundedEditDistance } from '../src/lib/normalize/distance';
import {
	alphabeticalWarnings,
	hasAccentMojibake,
	mergeDuplicateCodes,
	nearDuplicateArtists,
	sectionErrors,
	type FullListEntry
} from '../src/lib/parser/full-list-rules';
import { cutPages } from '../scripts/make-fixtures';
import { makeRelease, makeRow } from './factories';

function entry(code: string, title: string, creditRaw: string, section: string): FullListEntry {
	return { code, title, creditRaw, section, reviewReasons: [] };
}

describe('mergeDuplicateCodes', () => {
	test('same code under two titles is one song with an alternate title', () => {
		const { rows, errors } = mergeDuplicateCodes([
			entry('44387', 'I Surrender', 'Laura', 'I'),
			entry('44387', 'Surrender', 'Laura', 'S')
		]);
		expect(errors).toEqual([]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			code: '44387',
			title: 'I Surrender',
			altTitles: ['Surrender']
		});
	});

	test('different codes with the same title stay separate', () => {
		const { rows } = mergeDuplicateCodes([
			entry('8867', 'A Little Respect', 'Wheatus', 'A'),
			entry('9921', 'A Little Respect', 'Erasure', 'A')
		]);
		expect(rows.map((row) => row.code)).toEqual(['8867', '9921']);
	});

	test('same code with different artists is an error', () => {
		const { errors } = mergeDuplicateCodes([
			entry('1234', 'Song', 'Alice', 'S'),
			entry('1234', 'Other Song', 'Bob', 'O')
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('different artists');
	});

	test('leading zeros survive', () => {
		const { rows } = mergeDuplicateCodes([entry('0088', 'A Horse With No Name', 'America', 'A')]);
		expect(rows[0]?.code).toBe('0088');
	});
});

describe('section and alphabetical checks', () => {
	test('a title under the wrong section is an error', () => {
		const errors = sectionErrors([
			entry('1', 'Apple', 'x', 'A'),
			entry('2', 'Banana', 'x', 'A'),
			entry('3', '22', 'x', '0~9'),
			entry('4', '(Everything I Do) I Do It For You', 'x', 'E')
		]);
		expect(errors).toHaveLength(2);
		expect(errors[0]).toContain('"Banana"');
	});

	test('titles going backwards inside a section are warned about', () => {
		const warnings = alphabeticalWarnings([
			entry('1', 'Apple', 'x', 'A'),
			entry('2', 'Avocado', 'x', 'A'),
			entry('3', 'Ant', 'x', 'A'),
			entry('4', 'Baby', 'x', 'B')
		]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('"Ant"');
	});
});

describe('hasAccentMojibake', () => {
	test('detects backticks and quotes inside words', () => {
		expect(hasAccentMojibake('Jos`E Maria')).toBe(true);
		expect(hasAccentMojibake("G'omez")).toBe(true);
		expect(hasAccentMojibake("Ang Awit Ko Sa 'Yo")).toBe(false);
		expect(hasAccentMojibake("Sa'yo Lamang, Ngayo'y Ikaw, I'm Here")).toBe(false);
		expect(hasAccentMojibake("Don't Stop")).toBe(false);
		expect(hasAccentMojibake("I've Had It, She'll Know, Rock'n'Roll")).toBe(false);
	});
});

describe('nearDuplicateArtists', () => {
	test('lists close spellings but not ones already aliased together', () => {
		const alias: Record<string, string> = { 'david archuletta': 'David Archuleta' };
		const canonical = (name: string) => alias[name.toLowerCase()] ?? name;
		const pairs = nearDuplicateArtists(
			[
				'David Archuleta',
				'David Archuletta',
				'Engelbert Humperdinck',
				'Engelbert Humperdink',
				'Adele'
			],
			canonical
		);
		expect(pairs).toEqual([['Engelbert Humperdinck', 'Engelbert Humperdink']]);
	});
});

describe('boundedEditDistance', () => {
	test('computes small distances and bails out past the bound', () => {
		expect(boundedEditDistance('kitten', 'sitting', 3)).toBe(3);
		expect(boundedEditDistance('same', 'same', 2)).toBe(0);
		expect(boundedEditDistance('abc', 'xyzxyz', 2)).toBe(3);
	});
});

describe('alternate titles in the database', () => {
	test('altTitles are stored against the code', () => {
		const db = createDb();
		const release = makeRelease(
			'vol-59',
			[makeRow('44387', { title: 'I Surrender', altTitles: ['Surrender'] })],
			{ songbook: 'p-series', kind: 'full', profile: 'full-list' }
		);
		writeRelease(db, release, { atomic: [], map: {} });
		expect(db.select().from(songTitles).all()).toMatchObject([
			{ songbook: 'p-series', code: '44387', title: 'Surrender', titleNorm: 'surrender' }
		]);
	});
});

describe('cutPages', () => {
	test('keeps only the requested pages in order', async () => {
		const doc = await PDFDocument.create();
		for (const size of [100, 200, 300]) doc.addPage([size, size]);
		const cut = await PDFDocument.load(await cutPages(await doc.save(), [3, 1]));
		expect(cut.getPages().map((page) => page.getWidth())).toEqual([300, 100]);
	});

	test('rejects pages outside the document', async () => {
		const doc = await PDFDocument.create();
		doc.addPage();
		expect(cutPages(await doc.save(), [2])).rejects.toThrow('outside');
	});
});
