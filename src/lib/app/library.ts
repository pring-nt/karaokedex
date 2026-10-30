import { z } from 'zod';
import { Songbook } from '../songbooks';

const PerBook = z.partialRecord(Songbook, z.array(z.string()));

/** What the user keeps in this browser: favorites, tonight's queue and recent searches, per songbook. */
export const Library = z.object({
	favorites: PerBook.default({}),
	queue: PerBook.default({}),
	recents: PerBook.default({})
});
export type Library = z.infer<typeof Library>;

const MAX_RECENTS = 8;

export function emptyLibrary(): Library {
	return { favorites: {}, queue: {}, recents: {} };
}

function listOf(library: Library, kind: keyof Library, songbook: Songbook): string[] {
	return library[kind][songbook] ?? [];
}

function withList(
	library: Library,
	kind: keyof Library,
	songbook: Songbook,
	list: string[]
): Library {
	return { ...library, [kind]: { ...library[kind], [songbook]: list } };
}

export function isFavorite(library: Library, songbook: Songbook, code: string): boolean {
	return listOf(library, 'favorites', songbook).includes(code);
}

export function toggleFavorite(library: Library, songbook: Songbook, code: string): Library {
	const current = listOf(library, 'favorites', songbook);
	return withList(
		library,
		'favorites',
		songbook,
		current.includes(code) ? current.filter((entry) => entry !== code) : [code, ...current]
	);
}

export function isQueued(library: Library, songbook: Songbook, code: string): boolean {
	return listOf(library, 'queue', songbook).includes(code);
}

/** Adds a code to the end of tonight's queue, or removes it if it is already there. */
export function toggleQueued(library: Library, songbook: Songbook, code: string): Library {
	const current = listOf(library, 'queue', songbook);
	return withList(
		library,
		'queue',
		songbook,
		current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code]
	);
}

export function clearQueue(library: Library, songbook: Songbook): Library {
	return withList(library, 'queue', songbook, []);
}

/** Newest first, case-insensitive duplicates collapsed, capped. Blank queries are ignored. */
export function pushRecent(library: Library, songbook: Songbook, query: string): Library {
	const text = query.trim();
	if (text === '') return library;
	const rest = listOf(library, 'recents', songbook).filter(
		(entry) => entry.toLowerCase() !== text.toLowerCase()
	);
	return withList(library, 'recents', songbook, [text, ...rest].slice(0, MAX_RECENTS));
}

export function clearRecents(library: Library, songbook: Songbook): Library {
	return withList(library, 'recents', songbook, []);
}

export function listFor(library: Library, kind: keyof Library, songbook: Songbook): string[] {
	return listOf(library, kind, songbook);
}
