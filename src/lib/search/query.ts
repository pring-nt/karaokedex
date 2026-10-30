import { normalize } from '../normalize/text';

export const SEARCH_FIELDS = ['all', 'code', 'title', 'artist'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export type ParsedQuery =
	| { mode: 'empty' }
	| { mode: 'code'; digits: string }
	| { mode: 'artist' | 'title' | 'both'; text: string; terms: string[] };

function textQuery(mode: 'artist' | 'title' | 'both', raw: string): ParsedQuery {
	const text = normalize(raw);
	const terms = text.split(' ').filter((term) => term !== '');
	return terms.length === 0 ? { mode: 'empty' } : { mode, text, terms };
}

/**
 * With a field chosen, the query means exactly that: `214` under title is a title, and a code
 * search only takes digits. Under `all`, digits are a code lookup, `a:` searches artists only,
 * `t:` titles only, and anything else both. Text is normalized, so case, accents and punctuation
 * never matter.
 */
export function parseQuery(raw: string, field: SearchField = 'all'): ParsedQuery {
	const trimmed = raw.trim();
	if (trimmed === '') return { mode: 'empty' };
	if (field === 'title' || field === 'artist') return textQuery(field, trimmed);
	if (/^\d+$/.test(trimmed)) return { mode: 'code', digits: trimmed };
	if (field === 'code') return { mode: 'empty' };

	const prefixed = /^([at]):\s*(.*)$/i.exec(trimmed);
	const mode = prefixed?.[1]?.toLowerCase() === 'a' ? 'artist' : prefixed ? 'title' : 'both';
	return textQuery(mode, prefixed ? prefixed[2] : trimmed);
}
