import { normalize } from '../normalize/text';

export const SORT_IDS = [
	'title',
	'title-desc',
	'artist',
	'artist-desc',
	'code',
	'code-desc',
	'newest',
	'oldest'
] as const;
export type SortId = (typeof SORT_IDS)[number];

export type SortColumn = 'title' | 'artists' | 'code' | 'release';

/** Each column's first entry is the direction a header click starts with. */
export const SORTS: { id: SortId; column: SortColumn; desc: boolean; label: string }[] = [
	{ id: 'title', column: 'title', desc: false, label: 'Title, A to Z' },
	{ id: 'title-desc', column: 'title', desc: true, label: 'Title, Z to A' },
	{ id: 'artist', column: 'artists', desc: false, label: 'Artist, A to Z' },
	{ id: 'artist-desc', column: 'artists', desc: true, label: 'Artist, Z to A' },
	{ id: 'code', column: 'code', desc: false, label: 'Code, low to high' },
	{ id: 'code-desc', column: 'code', desc: true, label: 'Code, high to low' },
	{ id: 'newest', column: 'release', desc: true, label: 'Newest first' },
	{ id: 'oldest', column: 'release', desc: false, label: 'Oldest first' }
];

/** Empty without a sort: rows keep the order they came in, such as relevance. */
export function sortingFor(sort: SortId | undefined): { id: SortColumn; desc: boolean }[] {
	const entry = SORTS.find((candidate) => candidate.id === sort);
	return entry ? [{ id: entry.column, desc: entry.desc }] : [];
}

/** A header click: the column's first direction, or its other one if that is already on. */
export function nextSort(current: SortId | undefined, column: SortColumn): SortId {
	const [first, second] = SORTS.filter((entry) => entry.column === column);
	return current === first.id ? second.id : first.id;
}

/** Letter filter values. Anything else a title can start with goes in the `#` bucket. */
export const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** The A-Z bucket of normalized text, so `Élan` files under e. */
export function initial(normalized: string): string {
	const first = normalized.charAt(0);
	return first >= 'a' && first <= 'z' ? first : '#';
}

export function sortKey(text: string): string {
	return normalize(text);
}

/** Years of dated releases, newest first. Full-list labels such as `full-vol-59` have none. */
export function releaseYears(releases: Iterable<string>): string[] {
	const years = new Set<string>();
	for (const release of releases) {
		const year = /^(\d{4})-/.exec(release)?.[1];
		if (year) years.add(year);
	}
	return [...years].sort((a, b) => b.localeCompare(a));
}

export interface TableFilters {
	letter?: string;
	year?: string;
	versions?: boolean;
}

/** The letter follows the sort: while sorted by artist it picks artists, otherwise titles. */
export function columnFiltersFor(
	filters: TableFilters,
	sort: SortId | undefined
): { id: string; value: string | boolean }[] {
	const byArtist = sortingFor(sort).at(0)?.id === 'artists';
	const active: { id: string; value: string | boolean }[] = [];
	if (filters.letter) active.push({ id: byArtist ? 'artists' : 'title', value: filters.letter });
	if (filters.year) active.push({ id: 'release', value: filters.year });
	if (filters.versions) active.push({ id: 'version', value: true });
	return active;
}
