import { z } from 'zod';

export const Songbook = z.enum([
	'ks',
	'hdd',
	't-x',
	'reyna',
	'flute-piano',
	'bmb-x2',
	'hermosa',
	'home-40',
	'bravo',
	'p-series'
]);
export type Songbook = z.infer<typeof Songbook>;

type SongbookKind = 'monthly' | 'volume';

export interface SongbookInfo {
	name: string;
	models: readonly string[];
	kind: SongbookKind;
}

export const DEFAULT_SONGBOOK: Songbook = 'ks';

export const SONGBOOKS: Record<Songbook, SongbookInfo> = {
	ks: {
		name: 'KS Series',
		models: [
			'LX15',
			'CX15',
			'DK88',
			'DK65',
			'Tango',
			'KS-5',
			'KS-10',
			'KS-10+',
			'KS-10 Mini SD',
			'KS-40',
			'KS-100 Minibox',
			'Junior 2',
			'Junior Lite',
			'KBOX-2',
			'KBOX-3'
		],
		kind: 'volume'
	},
	hdd: {
		name: 'Major / Alpha / Cello / X3 / Piano XL HDD',
		models: ['Major', 'Alpha', 'Cello', 'X3', 'Piano XL HDD'],
		kind: 'monthly'
	},
	't-x': { name: 'T-X Series', models: ['T-Series', 'X-Series'], kind: 'volume' },
	reyna: { name: 'Reyna Series', models: ['Reyna'], kind: 'volume' },
	'flute-piano': {
		name: 'Flute / Piano V1.5 / Piano XL SD / PK10',
		models: ['Flute', 'Piano V1.5', 'Piano XL SD', 'PK10'],
		kind: 'volume'
	},
	'bmb-x2': { name: 'BMB / X2 / X1 / HDD', models: ['BMB', 'X2', 'X1', 'HDD'], kind: 'monthly' },
	hermosa: {
		name: 'Hermosa / N20 Nano Plus',
		models: ['Hermosa', 'N20 Nano Plus'],
		kind: 'volume'
	},
	'home-40': { name: 'Home 40 / Nano Old', models: ['Home 40', 'Nano Old'], kind: 'volume' },
	bravo: { name: 'Bravo', models: ['Bravo'], kind: 'volume' },
	'p-series': { name: 'P-Series', models: ['P-Series'], kind: 'volume' }
};

/** Short names for tight spaces: the machine picker, table rows and the eyebrow of a song card. */
export const SONGBOOK_SHORT: Record<Songbook, string> = {
	ks: 'KS Series',
	hdd: 'HDD',
	't-x': 'T-X',
	reyna: 'Reyna',
	'flute-piano': 'Flute/Piano',
	'bmb-x2': 'BMB',
	hermosa: 'Hermosa',
	'home-40': 'Home 40',
	bravo: 'Bravo',
	'p-series': 'P-Series'
};

/**
 * Lists that share one numbering, best spelling first: a code means the same song in all of them.
 * P-Series reuses some of the same numbers for other songs, so it never joins.
 */
export const SHARED_SONGBOOKS: readonly Songbook[] = [
	'hdd',
	'ks',
	't-x',
	'reyna',
	'flute-piano',
	'bmb-x2',
	'hermosa',
	'home-40',
	'bravo'
];

/** The songbook of a product in `sources.json`, or undefined if it is not parsed. */
export function sourceSongbook(source: string | null): Songbook | undefined {
	if (source === 'ks-5' || source === 'ks-40' || source === 'ks-100') return 'ks';
	return Songbook.safeParse(source).data;
}
