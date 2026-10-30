import { z } from 'zod';
import { SEARCH_FIELDS } from '../search/query';
import { Songbook } from '../songbooks';
import { SORT_IDS } from './browse';

const KEYS = [
	'book',
	'q',
	'field',
	'artist',
	'release',
	'sort',
	'letter',
	'year',
	'versions'
] as const;

/** The app's query string. Anything invalid is dropped, never an error: URLs are user input. */
const Params = z.object({
	book: Songbook.optional().catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
	field: z.enum(SEARCH_FIELDS).optional().catch(undefined),
	artist: z
		.string()
		.regex(/^[\p{L}\p{N}-]{1,100}$/u)
		.optional()
		.catch(undefined),
	release: z
		.string()
		.regex(/^[\w-]{1,40}$/)
		.optional()
		.catch(undefined),
	sort: z.enum(SORT_IDS).optional().catch(undefined),
	letter: z
		.string()
		.regex(/^[a-z#]$/)
		.optional()
		.catch(undefined),
	year: z
		.string()
		.regex(/^\d{4}$/)
		.optional()
		.catch(undefined),
	versions: z.literal('1').optional().catch(undefined)
});
export type AppParams = z.infer<typeof Params>;

export function parseParams(search: { get(name: string): string | null }): AppParams {
	const raw: Record<string, string> = {};
	for (const key of KEYS) {
		const value = search.get(key);
		if (value !== null && value !== '') raw[key] = value;
	}
	return Params.parse(raw);
}

/** Query string for the given params, omitting empty values, in a fixed order. */
export function buildSearch(params: AppParams): string {
	const search = new URLSearchParams();
	for (const key of KEYS) {
		const value = params[key];
		if (value) search.set(key, value);
	}
	const text = search.toString();
	return text === '' ? '' : `?${text}`;
}
