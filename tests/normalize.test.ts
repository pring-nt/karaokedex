import { describe, expect, test } from 'bun:test';
import { splitCredit, type Aliases } from '../src/lib/normalize/credit';
import { normalize } from '../src/lib/normalize/text';
import { extractVersionNote } from '../src/lib/normalize/version';

const aliases: Aliases = {
	atomic: ['Macklemore & Ryan Lewis'],
	map: { tj: 'TJ Monterde', sugarcane: 'Sugarcane', 'one ok rock': 'ONE OK ROCK' }
};

describe('normalize', () => {
	test('strips diacritics, apostrophes and punctuation', () => {
		expect(normalize('Niño')).toBe('nino');
		expect(normalize('Don’t Stop Believin’')).toBe('dont stop believin');
		expect(normalize('(Everything I Do) I Do It For You')).toBe('everything i do i do it for you');
		expect(normalize('  Love   Hurts & You  ')).toBe('love hurts you');
	});

	test('keeps digits and leading zeros', () => {
		expect(normalize('0088')).toBe('0088');
	});
});

describe('extractVersionNote', () => {
	test('splits a trailing qualifier', () => {
		expect(extractVersionNote('Buksan Mo Funk Version')).toEqual({
			title: 'Buksan Mo',
			versionNote: 'Funk Version'
		});
	});

	test('splits a parenthesized qualifier', () => {
		expect(extractVersionNote('Hello (Cover)')).toEqual({ title: 'Hello', versionNote: 'Cover' });
	});

	test('leaves ordinary titles alone', () => {
		expect(extractVersionNote('I Can Do It With a Broken Heart')).toEqual({
			title: 'I Can Do It With a Broken Heart',
			versionNote: null
		});
	});

	test('never empties the title', () => {
		expect(extractVersionNote('Remix')).toEqual({ title: 'Remix', versionNote: null });
	});
});

describe('splitCredit', () => {
	test('splits on commas, ampersands and whole-token x', () => {
		expect(splitCredit('Tyga x Chris Brown, Doja Cat & SZA', aliases).map((a) => a.name)).toEqual([
			'Tyga',
			'Chris Brown',
			'Doja Cat',
			'SZA'
		]);
	});

	test('marks everything after ft/feat as featured', () => {
		expect(splitCredit('Doja Cat ft. SZA & Ice Spice', aliases)).toEqual([
			{ name: 'Doja Cat', role: 'primary' },
			{ name: 'SZA', role: 'featured' },
			{ name: 'Ice Spice', role: 'featured' }
		]);
	});

	test('splits a (feat. ...) group but not other parentheses', () => {
		expect(splitCredit('Artist (feat. Kyle, Tata)', aliases)).toEqual([
			{ name: 'Artist', role: 'primary' },
			{ name: 'Kyle', role: 'featured' },
			{ name: 'Tata', role: 'featured' }
		]);
		expect(splitCredit('41 (Kyle Richh, Tata, Jenn Carter)', aliases)).toEqual([
			{ name: '41 (Kyle Richh, Tata, Jenn Carter)', role: 'primary' }
		]);
	});

	test('never splits atomic names', () => {
		expect(splitCredit('macklemore & ryan lewis ft. Wanz', aliases)).toEqual([
			{ name: 'Macklemore & Ryan Lewis', role: 'primary' },
			{ name: 'Wanz', role: 'featured' }
		]);
	});

	test('applies the alias map after splitting and drops duplicates', () => {
		expect(splitCredit('Tj, SUGARCANE & Sugarcane', aliases).map((a) => a.name)).toEqual([
			'TJ Monterde',
			'Sugarcane'
		]);
	});

	test('tolerates dangling separators and empty credits', () => {
		expect(splitCredit('Jay Sean Ft.', aliases)).toEqual([{ name: 'Jay Sean', role: 'primary' }]);
		expect(splitCredit('', aliases)).toEqual([]);
	});

	test('does not split inside words that merely contain x or ft', () => {
		expect(splitCredit('Alex Left', aliases).map((a) => a.name)).toEqual(['Alex Left']);
	});
});
