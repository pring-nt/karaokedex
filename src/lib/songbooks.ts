import { z } from 'zod';

export const Songbook = z.enum(['hdd', 'p-series']);
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
	}
};
