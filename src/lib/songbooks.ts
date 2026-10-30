import { z } from 'zod';

export const Songbook = z.enum(['hdd', 'p-series', 'ks-40']);
export type Songbook = z.infer<typeof Songbook>;

type SongbookKind = 'monthly' | 'volume';

export interface SongbookInfo {
	name: string;
	models: readonly string[];
	kind: SongbookKind;
}

export const SONGBOOKS: Record<Songbook, SongbookInfo> = {
	hdd: {
		name: 'Major / Alpha / Cello / X3 / Piano XL HDD',
		models: ['Major', 'Alpha', 'Cello', 'X3', 'Piano XL HDD'],
		kind: 'monthly'
	},
	'p-series': {
		name: 'P-Series',
		models: ['P-Series'],
		kind: 'volume'
	},
	'ks-40': {
		name: 'KS-40 / KBOX-2 / KBOX-3',
		models: ['KS-40', 'KBOX-2', 'KBOX-3'],
		kind: 'volume'
	}
};

/** Short names for tight spaces: the switcher and the eyebrow of a song card. */
export const SONGBOOK_SHORT: Record<Songbook, string> = {
	hdd: 'HDD',
	'p-series': 'P-Series',
	'ks-40': 'KS-40'
};
