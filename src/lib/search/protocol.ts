import type { Song } from '../catalog/schema';
import type { Songbook } from '../songbooks';
import type { ReleaseSummary, SearchOptions, SongHit } from './engine';

export type WorkerRequest =
	| { type: 'load'; songbook: Songbook }
	| { type: 'search'; id: number; query: string; options?: SearchOptions }
	| { type: 'codes'; id: number; codes: string[] }
	| { type: 'releases'; id: number };

export type WorkerResponse =
	| {
			type: 'ready';
			songbook: Songbook;
			version: string;
			count: number;
			otherCount: number;
			fromCache: boolean;
	  }
	| { type: 'results'; id: number; total: number; hits: SongHit[] }
	| { type: 'songs'; id: number; songs: Song[] }
	| { type: 'releases'; id: number; releases: ReleaseSummary[] }
	| { type: 'error'; id?: number; message: string };
