import { describe, expect, test } from 'bun:test';
import type { Song } from '../src/lib/catalog/schema';
import { SearchIndex, Tier } from '../src/lib/search';
import { parseQuery } from '../src/lib/search/query';

function song(code: string, title: string, artists: string[] = [], altTitles: string[] = []): Song {
	return {
		code,
		title,
		versionNote: null,
		altTitles,
		artists: artists.map((name) => ({ name, role: 'primary' })),
		release: '2026-05'
	};
}

function codes(index: SearchIndex, query: string, limit = 50): string[] {
	return index.search(query, limit).hits.map((hit) => songs[hit.index]?.code ?? '?');
}

const songs: Song[] = [
	song('42195', 'Zero Pressure', ['BINI']),
	song('42196', 'Salamin', ['BINI']),
	song('42197', 'Bini Bini Bini', ['Someone Else']),
	song('42198', 'Cherry On Top', ['Cup of Joe']),
	song('42199', 'Bagyo', ['Cup of Joe']),
	song('42200', 'Cup of Joe Blues', ['Another Band']),
	song('0088', 'A Horse With No Name', ['America']),
	song('00088', 'Other Eighty Eight', ['Nobody']),
	song('3416', '(Everything I Do) I Do It For You', ['Bryan Adams']),
	song('44862', '22', ['Lily Allen']),
	song('5872', '214', ['Rivermaya']),
	song('44387', 'I Surrender', ['Laura Pausini'], ['Surrender']),
	song('44384', 'Milkshake', ['Kelis'], ['My Milkshake']),
	song('6001', 'Una Noche', ['Singer A']),
	song('6002', 'Mi Niño', ['Singer B']),
	song('6003', 'Hello', ['Adele']),
	song('6004', 'Say Hello To Goodbye', ['Someone']),
	song('6005', 'Metallica Tribute', ['Cover Band']),
	song('6006', 'Metallica', ['Metallica'])
];
const index = new SearchIndex(songs);

describe('parseQuery', () => {
	test('digits are a code, prefixes pick a field, text is normalized', () => {
		expect(parseQuery('0088')).toEqual({ mode: 'code', digits: '0088' });
		expect(parseQuery('  a: Bini ')).toEqual({ mode: 'artist', text: 'bini', terms: ['bini'] });
		expect(parseQuery('T:Niño Mío')).toEqual({
			mode: 'title',
			text: 'nino mio',
			terms: ['nino', 'mio']
		});
		expect(parseQuery("Don't Stop")).toEqual({
			mode: 'both',
			text: 'dont stop',
			terms: ['dont', 'stop']
		});
		expect(parseQuery('   ')).toEqual({ mode: 'empty' });
		expect(parseQuery('a:')).toEqual({ mode: 'empty' });
	});
});

describe('code search', () => {
	test('an exact code is first', () => {
		expect(codes(index, '42195')[0]).toBe('42195');
		expect(index.search('42195').hits[0]?.tier).toBe(Tier.ExactCode);
	});

	test('88 and 0088 both find the leading-zero code first', () => {
		expect(codes(index, '88')[0]).toBe('0088');
		expect(codes(index, '0088')[0]).toBe('0088');
		expect(codes(index, '88')).toContain('00088');
	});

	test('a prefix lists codes in order after the exact ones', () => {
		expect(codes(index, '4219')).toEqual(['42195', '42196', '42197', '42198', '42199']);
	});

	test('digits that match no code fall back to titles', () => {
		expect(codes(index, '214')).toEqual(['5872']);
		expect(codes(index, '22')).toEqual(['44862']);
	});
});

describe('text ranking', () => {
	test('title starts, then word starts, then contains, then alternate title, then artist', () => {
		const ranked = new SearchIndex([
			song('1001', 'Zebra Hello'),
			song('1002', 'Hello World'),
			song('1003', 'Othello'),
			song('1004', 'Something Else', [], ['Hello Again']),
			song('1005', 'Different', ['Hello Band'])
		]);
		const result = ranked.search('hello').hits;
		expect(result.map((hit) => hit.index)).toEqual([1, 0, 2, 3, 4]);
		expect(result.map((hit) => hit.tier)).toEqual([
			Tier.TitleStart,
			Tier.TitleWord,
			Tier.TitleContains,
			Tier.AltTitle,
			Tier.Artist
		]);
	});

	test('cup of joe finds every song by the artist and the title match', () => {
		const found = codes(index, 'cup of joe');
		expect(found.slice(0, 1)).toEqual(['42200']);
		expect(found).toContain('42198');
		expect(found).toContain('42199');
		expect(found).toHaveLength(3);
	});

	test('accents and punctuation are ignored', () => {
		expect(codes(index, 'nino')).toEqual(['6002']);
		expect(codes(index, 'mi niño')).toEqual(['6002']);
		expect(codes(index, 'everything i do')).toEqual(['3416']);
	});

	test('a: only matches artists and never titles', () => {
		expect(codes(index, 'a:bini').sort()).toEqual(['42195', '42196']);
	});

	test('t: only matches titles and never artists', () => {
		expect(codes(index, 't:bini')).toEqual(['42197']);
	});

	test('an alternate title is found once, not twice', () => {
		expect(codes(index, 'surrender')).toEqual(['44387']);
		expect(codes(index, 'my milkshake')).toEqual(['44384']);
	});

	test('terms may be split between title and artist', () => {
		expect(codes(index, 'hello adele')).toEqual(['6003']);
	});

	test('the exact title ranks above a longer title with the same start', () => {
		expect(codes(index, 'hello')[0]).toBe('6003');
	});

	test('limit caps the hits but total counts every match', () => {
		const result = index.search('o', 3);
		expect(result.hits).toHaveLength(3);
		expect(result.total).toBeGreaterThan(3);
	});

	test('no match and empty queries return nothing', () => {
		expect(index.search('zzzzzz')).toEqual({ hits: [], total: 0 });
		expect(index.search('')).toEqual({ hits: [], total: 0 });
	});
});

describe('typo tolerance', () => {
	test('one edit on a term of five or more letters still matches, only when nothing else does', () => {
		const result = index.search('metalica');
		expect(result.hits.map((hit) => songs[hit.index]?.code).sort()).toEqual(['6005', '6006']);
		expect(result.hits.every((hit) => hit.tier === Tier.Fuzzy)).toBe(true);
	});

	test('short terms are not fuzzed', () => {
		expect(index.search('helx').total).toBe(0);
		expect(index.search('adel').total).toBeGreaterThan(0);
	});
});

describe('benchmark', () => {
	test('a query against a synthetic 60k-song catalog takes under 10 ms (median)', () => {
		let seed = 1234567;
		const random = () => {
			seed = (seed * 1664525 + 1013904223) % 4294967296;
			return seed / 4294967296;
		};
		const syllables = [
			'la',
			'ro',
			'mi',
			'sa',
			'ke',
			'to',
			'vi',
			'na',
			'ba',
			'do',
			'ri',
			'lu',
			'pe',
			'cha',
			'gon'
		];
		const word = () =>
			Array.from(
				{ length: 2 + Math.floor(random() * 3) },
				() => syllables[Math.floor(random() * syllables.length)]
			).join('');
		const many = Array.from({ length: 60_000 }, (_, position) =>
			song(
				String(position).padStart(5, '0'),
				`${word()} ${word()} ${word()}`,
				[`${word()} ${word()}`],
				position % 50 === 0 ? [`${word()} ${word()}`] : []
			)
		);
		const big = new SearchIndex(many);

		for (const query of ['lamiro', 'a:sake', 'roba dolu', '4242', 'chag']) {
			const times: number[] = [];
			for (let run = 0; run < 25; run++) {
				const start = performance.now();
				big.search(query, 50);
				times.push(performance.now() - start);
			}
			times.sort((a, b) => a - b);
			expect({ query, median: (times[12] ?? Infinity) < 10 }).toEqual({ query, median: true });
		}
	});
});
