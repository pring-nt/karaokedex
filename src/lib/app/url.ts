import { z } from 'zod';
import { Songbook } from '../songbooks';

/** `?book=&q=&artist=&release=`. Anything invalid is dropped, never an error: URLs are user input. */
const Params = z.object({
	book: Songbook.optional().catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
	artist: z
		.string()
		.regex(/^[\p{L}\p{N}-]{1,100}$/u)
		.optional()
		.catch(undefined),
	release: z
		.string()
		.regex(/^[\w-]{1,40}$/)
		.optional()
		.catch(undefined)
});
export type AppParams = z.infer<typeof Params>;

export function parseParams(search: { get(name: string): string | null }): AppParams {
	const raw: Record<string, string> = {};
	for (const key of ['book', 'q', 'artist', 'release']) {
		const value = search.get(key);
		if (value !== null && value !== '') raw[key] = value;
	}
	return Params.parse(raw);
}

/** Query string for the given params, omitting empty values, in a fixed order. */
export function buildSearch(params: AppParams): string {
	const search = new URLSearchParams();
	for (const key of ['book', 'q', 'artist', 'release'] as const) {
		const value = params[key];
		if (value) search.set(key, value);
	}
	const text = search.toString();
	return text === '' ? '' : `?${text}`;
}
