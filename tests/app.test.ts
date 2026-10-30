import { describe, expect, test } from 'bun:test';
import {
	clearQueue,
	clearRecents,
	emptyLibrary,
	isFavorite,
	isQueued,
	Library,
	listFor,
	pushRecent,
	toggleFavorite,
	toggleQueued
} from '../src/lib/app/library';
import {
	columnFiltersFor,
	initial,
	nextSort,
	releaseYears,
	sortingFor,
	sortKey
} from '../src/lib/app/browse';
import { DEFAULT_FONT, FONTS, parseFontPreference } from '../src/lib/app/fonts';
import { parseThemePreference, resolveTheme, THEMES, themeMode } from '../src/lib/app/themes';
import { browserStorage, readJson, writeJson, type KeyValueStore } from '../src/lib/app/storage';
import { buildSearch, parseParams } from '../src/lib/app/url';
import { artistSlug } from '../src/lib/catalog/slug';

function params(query: string) {
	return parseParams(new URLSearchParams(query));
}

describe('URL params', () => {
	test('valid params round-trip in a fixed order', () => {
		const parsed = params('q=cup%20of%20joe&book=hdd&release=2026-05&artist=cup-of-joe');
		expect(parsed).toEqual({
			book: 'hdd',
			q: 'cup of joe',
			release: '2026-05',
			artist: 'cup-of-joe'
		});
		expect(buildSearch(parsed)).toBe('?book=hdd&q=cup+of+joe&artist=cup-of-joe&release=2026-05');
	});

	test('anything invalid is dropped, never thrown', () => {
		expect(params('book=unknown&q=ok')).toEqual({ q: 'ok' });
		expect(params(`q=${'x'.repeat(201)}`)).toEqual({});
		expect(params('artist=has%20spaces&release=a%2Fb')).toEqual({});
		expect(params('book=&q=')).toEqual({});
	});

	test('artist slugs may contain letters from any script', () => {
		expect(params('artist=%E3%81%82%E3%81%84')).toEqual({ artist: 'あい' });
	});

	test('no params give an empty query string', () => {
		expect(buildSearch({})).toBe('');
		expect(buildSearch({ book: 'p-series' })).toBe('?book=p-series');
	});
});

describe('artistSlug', () => {
	test('is the normalized name with hyphens', () => {
		expect(artistSlug('Cup of Joe')).toBe('cup-of-joe');
		expect(artistSlug('Beyoncé')).toBe('beyonce');
		expect(artistSlug("Guns N' Roses")).toBe('guns-n-roses');
		expect(artistSlug('!!!')).toBe('unknown');
	});
});

describe('library', () => {
	test('favorites and the queue are per songbook and toggle', () => {
		let library = emptyLibrary();
		library = toggleFavorite(library, 'hdd', '42195');
		library = toggleQueued(library, 'hdd', '42195');
		library = toggleQueued(library, 'hdd', '42196');
		expect(isFavorite(library, 'hdd', '42195')).toBe(true);
		expect(isFavorite(library, 'p-series', '42195')).toBe(false);
		expect(listFor(library, 'queue', 'hdd')).toEqual(['42195', '42196']);
		expect(listFor(library, 'queue', 'p-series')).toEqual([]);

		library = toggleQueued(library, 'hdd', '42195');
		library = toggleFavorite(library, 'hdd', '42195');
		expect(isQueued(library, 'hdd', '42195')).toBe(false);
		expect(isFavorite(library, 'hdd', '42195')).toBe(false);
		expect(listFor(clearQueue(library, 'hdd'), 'queue', 'hdd')).toEqual([]);
	});

	test('codes stay strings with their leading zeros', () => {
		const library = toggleFavorite(emptyLibrary(), 'p-series', '0088');
		expect(listFor(library, 'favorites', 'p-series')).toEqual(['0088']);
	});

	test('recent searches are newest first, case-insensitively unique, capped, and never blank', () => {
		let library = emptyLibrary();
		for (const query of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
			library = pushRecent(library, 'hdd', query);
		}
		expect(listFor(library, 'recents', 'hdd')).toEqual(['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c']);
		library = pushRecent(library, 'hdd', '  H  ');
		expect(listFor(library, 'recents', 'hdd').slice(0, 2)).toEqual(['H', 'j']);
		expect(pushRecent(library, 'hdd', '   ')).toBe(library);
		expect(listFor(clearRecents(library, 'hdd'), 'recents', 'hdd')).toEqual([]);
	});

	test('a stored library validates, and missing sections default to empty', () => {
		expect(Library.parse({})).toEqual({ favorites: {}, queue: {}, recents: {} });
		expect(Library.safeParse({ favorites: { hdd: [1] } }).success).toBe(false);
		expect(Library.safeParse({ favorites: { nope: ['1'] } }).success).toBe(false);
	});
});

describe('themes', () => {
	test('a saved value is a known theme, a legacy value, or falls back to system', () => {
		expect(parseThemePreference('nord')).toBe('nord');
		expect(parseThemePreference('system')).toBe('system');
		expect(parseThemePreference('dark')).toBe('rose-pine');
		expect(parseThemePreference('light')).toBe('rose-pine-dawn');
		expect(parseThemePreference('nope')).toBe('system');
		expect(parseThemePreference('constructor')).toBe('system');
		expect(parseThemePreference(null)).toBe('system');
	});

	test('system follows the device, a chosen theme ignores it', () => {
		expect(resolveTheme('system', true)).toBe('rose-pine-dawn');
		expect(resolveTheme('system', false)).toBe('rose-pine');
		expect(resolveTheme('nord', true)).toBe('nord');
		expect(themeMode('catppuccin-latte')).toBe('light');
		expect(themeMode('tokyo-night')).toBe('dark');
	});

	test('every theme has a palette and is known to the pre-paint script', async () => {
		const tokens = await Bun.file('src/lib/styles/tokens.css').text();
		const html = await Bun.file('src/app.html').text();
		for (const { id, mode } of THEMES) {
			expect(tokens).toContain(`[data-theme='${id}']`);
			expect(html).toMatch(new RegExp(`'?${id}'?: '${mode}'`));
		}
	});
});

describe('fonts', () => {
	test('a saved value is a known font, or the default', () => {
		expect(parseFontPreference('editorial')).toBe('editorial');
		expect(parseFontPreference('comic-sans')).toBe(DEFAULT_FONT);
		expect(parseFontPreference(null)).toBe(DEFAULT_FONT);
	});

	test('every font has a token block and is known to the pre-paint script', async () => {
		const tokens = await Bun.file('src/lib/styles/tokens.css').text();
		const html = await Bun.file('src/app.html').text();
		for (const { id } of FONTS) {
			expect(tokens).toContain(`[data-font='${id}']`);
			expect(html).toContain(`'${id}'`);
		}
	});
});

describe('browsing', () => {
	test('a header click starts with the column default, then flips', () => {
		expect(nextSort(undefined, 'title')).toBe('title');
		expect(nextSort('title', 'title')).toBe('title-desc');
		expect(nextSort('title-desc', 'title')).toBe('title');
		expect(nextSort('title', 'release')).toBe('newest');
		expect(nextSort('newest', 'release')).toBe('oldest');
	});

	test('no sort keeps the incoming order', () => {
		expect(sortingFor(undefined)).toEqual([]);
		expect(sortingFor('newest')).toEqual([{ id: 'release', desc: true }]);
	});

	test('letters bucket normalized text, and everything else is #', () => {
		expect(initial(sortKey('Élan'))).toBe('e');
		expect(initial(sortKey('214'))).toBe('#');
		expect(initial('')).toBe('#');
	});

	test('the letter filter follows the sorted column', () => {
		expect(columnFiltersFor({ letter: 'b' }, 'title')).toEqual([{ id: 'title', value: 'b' }]);
		expect(columnFiltersFor({ letter: 'b' }, 'artist-desc')).toEqual([
			{ id: 'artists', value: 'b' }
		]);
		expect(columnFiltersFor({ year: '2024', versions: true }, undefined)).toEqual([
			{ id: 'release', value: '2024' },
			{ id: 'version', value: true }
		]);
	});

	test('only dated releases give years, newest first', () => {
		expect(releaseYears(['2024-01', '2026-05', '2024-09', 'full-vol-59'])).toEqual([
			'2026',
			'2024'
		]);
	});

	test('sort and filter params validate like the rest', () => {
		expect(params('field=code&sort=newest&letter=a&year=2024&versions=1')).toEqual({
			field: 'code',
			sort: 'newest',
			letter: 'a',
			year: '2024',
			versions: '1'
		});
		expect(params('letter=%23')).toEqual({ letter: '#' });
		expect(params('field=lyrics&sort=x&letter=ab&year=24&versions=2')).toEqual({});
	});
});

describe('storage', () => {
	function memory(initial: Record<string, string> = {}): KeyValueStore {
		const data = new Map(Object.entries(initial));
		return {
			getItem: (key) => data.get(key) ?? null,
			setItem: (key, value) => {
				data.set(key, value);
			}
		};
	}

	test('reads and validates, falling back on anything wrong', () => {
		const fallback = emptyLibrary();
		const good = memory({ k: JSON.stringify({ favorites: { hdd: ['1'] } }) });
		expect(readJson(good, 'k', Library, fallback).favorites).toEqual({ hdd: ['1'] });
		expect(readJson(memory({ k: '{not json' }), 'k', Library, fallback)).toBe(fallback);
		expect(readJson(memory({ k: '{"favorites":{"hdd":[1]}}' }), 'k', Library, fallback)).toBe(
			fallback
		);
		expect(readJson(memory(), 'k', Library, fallback)).toBe(fallback);
		expect(readJson(null, 'k', Library, fallback)).toBe(fallback);
	});

	test('writing reports failure instead of throwing', () => {
		const store = memory();
		expect(writeJson(store, 'k', { a: 1 })).toBe(true);
		expect(store.getItem('k')).toBe('{"a":1}');
		expect(writeJson(null, 'k', {})).toBe(false);
		const full: KeyValueStore = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			}
		};
		expect(writeJson(full, 'k', {})).toBe(false);
	});

	test('there is no browser storage outside a browser', () => {
		expect(browserStorage()).toBeNull();
	});
});
