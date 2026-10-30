import { normalize } from '../normalize/text';

export type ParsedQuery =
	| { mode: 'empty' }
	| { mode: 'code'; digits: string }
	| { mode: 'artist' | 'title' | 'both'; text: string; terms: string[] };

/**
 * All digits is a code lookup, `a:` searches artists only, `t:` titles only, anything else both.
 * Text is normalized, so case, accents and punctuation never matter.
 */
export function parseQuery(raw: string): ParsedQuery {
	const trimmed = raw.trim();
	if (trimmed === '') return { mode: 'empty' };
	if (/^\d+$/.test(trimmed)) return { mode: 'code', digits: trimmed };

	const prefixed = /^([at]):\s*(.*)$/i.exec(trimmed);
	const mode = prefixed?.[1]?.toLowerCase() === 'a' ? 'artist' : prefixed ? 'title' : 'both';
	const text = normalize(prefixed ? prefixed[2] : trimmed);
	const terms = text.split(' ').filter((term) => term !== '');
	return terms.length === 0 ? { mode: 'empty' } : { mode, text, terms };
}
