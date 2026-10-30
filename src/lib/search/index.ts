import type { Song } from '../catalog/schema';
import { boundedEditDistance } from '../normalize/distance';
import { normalize } from '../normalize/text';
import { parseQuery, type SearchField } from './query';

/**
 * Lower is better. Code matches come first, then title matches by how strongly the query anchors
 * to the title, then alternate titles, artists and finally typo-tolerant matches.
 */
export const Tier = {
	ExactCode: 0,
	PaddedCode: 1,
	CodePrefix: 2,
	TitleStart: 3,
	TitleWord: 4,
	TitleContains: 5,
	AltTitle: 6,
	Artist: 7,
	Fuzzy: 8
} as const;

interface Hit {
	/** Position in the song list the index was built from. */
	index: number;
	tier: number;
}

/** Restricts a search to some songs, by position in the list the index was built from. */
export type SongFilter = (index: number) => boolean;

export interface SearchResult {
	hits: Hit[];
	total: number;
}

type Mode = 'artist' | 'title' | 'both';

interface Entry {
	code: string;
	numeric: number;
	title: string;
	alternates: string[];
	artists: string[];
	/** Everything a title or alternate-title search may match, for a cheap reject. */
	titleHay: string;
	artistHay: string;
	haystack: string;
}

const FUZZY_MIN_LENGTH = 5;
/** A score is `tier * SUB + sub`, so one number orders hits. */
const SUB = 4;

/** A query with its space-prefixed forms prepared once, so scoring allocates nothing per song. */
interface Prepared {
	text: string;
	spaced: string;
	terms: readonly string[];
	spacedTerms: readonly string[];
}

function prepare(text: string): Prepared {
	const terms = text.split(' ').filter((term) => term !== '');
	return { text, spaced: ` ${text}`, terms, spacedTerms: terms.map((term) => ` ${term}`) };
}

function startsAtWord(text: string, query: string, spaced: string): boolean {
	return text.startsWith(query) || text.includes(spaced);
}

function containsAll(text: string, terms: readonly string[]): boolean {
	for (const term of terms) if (!text.includes(term)) return false;
	return true;
}

function wordStartsAll(text: string, query: Prepared): boolean {
	for (let i = 0; i < query.terms.length; i++) {
		if (!startsAtWord(text, query.terms[i] ?? '', query.spacedTerms[i] ?? '')) return false;
	}
	return true;
}

/** Linear index over pre-normalized strings. Fast enough for tens of thousands of songs. */
export class SearchIndex {
	private readonly entries: Entry[];
	private readonly byCode = new Map<string, number[]>();

	constructor(songs: readonly Song[]) {
		this.entries = songs.map((song, index) => {
			const title = normalize(song.title);
			const alternates = song.altTitles.map(normalize);
			const artists = song.artists.map((artist) => normalize(artist.name));
			const titleHay = [title, ...alternates].join('|');
			const artistHay = artists.join('|');
			const list = this.byCode.get(song.code);
			if (list) list.push(index);
			else this.byCode.set(song.code, [index]);
			return {
				code: song.code,
				numeric: Number(song.code),
				title,
				alternates,
				artists,
				titleHay,
				artistHay,
				haystack: `${titleHay}|${artistHay}`
			};
		});
	}

	get size(): number {
		return this.entries.length;
	}

	search(
		rawQuery: string,
		limit = 50,
		filter?: SongFilter,
		field: SearchField = 'all'
	): SearchResult {
		const query = parseQuery(rawQuery, field);
		if (query.mode === 'empty') return { hits: [], total: 0 };
		if (query.mode === 'code') {
			const codeResult = this.searchCode(query.digits, limit, filter);
			if (codeResult.total > 0 || field === 'code') return codeResult;
			return this.searchText(normalize(query.digits), 'both', limit, filter);
		}
		return this.searchText(query.text, query.mode, limit, filter);
	}

	private searchCode(digits: string, limit: number, filter?: SongFilter): SearchResult {
		const hits: Hit[] = [];
		const taken = new Set<number>();
		const take = (index: number, tier: number) => {
			if (taken.has(index) || (filter && !filter(index))) return;
			taken.add(index);
			hits.push({ index, tier });
		};

		for (const index of this.byCode.get(digits) ?? []) take(index, Tier.ExactCode);
		for (const width of [4, 5]) {
			if (digits.length >= width) continue;
			const tier = width === 4 ? Tier.ExactCode : Tier.PaddedCode;
			for (const index of this.byCode.get(digits.padStart(width, '0')) ?? []) take(index, tier);
		}
		this.entries.forEach((entry, index) => {
			if (entry.code.startsWith(digits)) take(index, Tier.CodePrefix);
		});

		const numeric = (hit: Hit) => this.entries[hit.index]?.numeric ?? 0;
		hits.sort((a, b) => a.tier - b.tier || numeric(a) - numeric(b));
		return { hits: hits.slice(0, limit), total: hits.length };
	}

	/** Score of a title, alternate-title or artist match, or -1. Only called after the cheap reject. */
	private score(entry: Entry, query: Prepared, mode: Mode): number {
		const { text, spaced, terms } = query;
		if (mode !== 'artist') {
			if (entry.title.startsWith(text)) return Tier.TitleStart * SUB;
			if (entry.title.includes(spaced) || wordStartsAll(entry.title, query)) {
				return Tier.TitleWord * SUB;
			}
			if (entry.title.includes(text) || containsAll(entry.title, terms)) {
				return Tier.TitleContains * SUB;
			}
			for (const alternate of entry.alternates) {
				if (startsAtWord(alternate, text, spaced) || wordStartsAll(alternate, query)) {
					return Tier.AltTitle * SUB;
				}
				if (alternate.includes(text)) return Tier.AltTitle * SUB + 1;
			}
		}
		if (mode !== 'title') {
			for (const artist of entry.artists) {
				if (artist.startsWith(text)) return Tier.Artist * SUB;
				if (startsAtWord(artist, text, spaced) || wordStartsAll(artist, query)) {
					return Tier.Artist * SUB + 1;
				}
			}
			if (mode === 'both') return Tier.Artist * SUB + 2;
		}
		return -1;
	}

	private before(
		score: number,
		entry: Entry,
		otherScore: number,
		other: Entry | undefined
	): boolean {
		if (score !== otherScore) return score < otherScore;
		if (!other) return true;
		if (entry.title.length !== other.title.length) return entry.title.length < other.title.length;
		return entry.numeric < other.numeric;
	}

	private searchText(text: string, mode: Mode, limit: number, filter?: SongFilter): SearchResult {
		const query = prepare(text);
		const terms = query.terms;
		const entries = this.entries;
		const best: { index: number; score: number }[] = [];

		for (let index = 0; index < entries.length; index++) {
			if (filter && !filter(index)) continue;
			const entry = entries[index];
			const hay =
				mode === 'artist' ? entry.artistHay : mode === 'title' ? entry.titleHay : entry.haystack;
			if (!containsAll(hay, terms)) continue;
			const score = this.score(entry, query, mode);
			if (score < 0) continue;
			best.push({ index, score });
		}

		if (best.length > 0) {
			best.sort((a, b) => {
				if (a.score !== b.score) return a.score - b.score;
				return this.before(a.score, entries[a.index], b.score, entries[b.index]) ? -1 : 1;
			});
			return {
				hits: best
					.slice(0, limit)
					.map(({ index, score }) => ({ index, tier: Math.floor(score / SUB) })),
				total: best.length
			};
		}
		return this.searchFuzzy(terms, mode, limit, filter);
	}

	/** Typo tolerance for when nothing matched: every term of 5+ letters may be one edit away from a word. */
	private searchFuzzy(
		terms: readonly string[],
		mode: Mode,
		limit: number,
		filter?: SongFilter
	): SearchResult {
		if (!terms.some((term) => term.length >= FUZZY_MIN_LENGTH)) return { hits: [], total: 0 };
		const hits: Hit[] = [];
		this.entries.forEach((entry, index) => {
			if (filter && !filter(index)) return;
			const hay =
				mode === 'artist' ? entry.artistHay : mode === 'title' ? entry.titleHay : entry.haystack;
			const words = hay.split(/[ |]/);
			const matched = terms.every((term) =>
				words.some((word) =>
					term.length >= FUZZY_MIN_LENGTH
						? boundedEditDistance(term, word, 1) <= 1
						: word.startsWith(term)
				)
			);
			if (matched) hits.push({ index, tier: Tier.Fuzzy });
		});
		const numeric = (hit: Hit) => this.entries[hit.index]?.numeric ?? 0;
		hits.sort((a, b) => numeric(a) - numeric(b));
		return { hits: hits.slice(0, limit), total: hits.length };
	}
}
