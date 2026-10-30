import type { Song } from '../catalog/schema';
import type { Songbook } from '../songbooks';

export type WorkerRequest =
	| { type: 'load'; songbook: Songbook }
	| { type: 'search'; id: number; query: string; limit?: number };

export type WorkerResponse =
	| { type: 'ready'; songbook: Songbook; version: string; count: number; fromCache: boolean }
	| { type: 'results'; id: number; total: number; hits: { song: Song; tier: number }[] }
	| { type: 'error'; id?: number; message: string };
