import { Catalog, CatalogManifest, expandCatalog, type Song } from '../catalog/schema';
import type { Songbook } from '../songbooks';
import { SearchIndex } from './index';

/** Where downloaded catalogs are kept between visits, keyed by the hash in the catalog file name. */
export interface CatalogCache {
	get(hash: string): Promise<string | undefined>;
	put(hash: string, json: string): Promise<void>;
}

export interface EngineDeps {
	fetchText(url: string): Promise<string>;
	cache: CatalogCache;
	/** Prefix for `catalog-manifest.json` and the catalog files, `/` by default. */
	baseUrl?: string;
}

export interface Loaded {
	songbook: Songbook;
	version: string;
	count: number;
	fromCache: boolean;
}

export interface SongHit {
	song: Song;
	tier: number;
}

/**
 * Fetches the manifest, then the chosen songbook's catalog (from the cache when its hash is known),
 * validates it and builds the search index. Framework-free so it can run in a worker or in tests.
 */
export class SearchEngine {
	private songs: Song[] = [];
	private index: SearchIndex | null = null;
	private current: Songbook | null = null;

	constructor(private readonly deps: EngineDeps) {}

	get songbook(): Songbook | null {
		return this.current;
	}

	async load(songbook: Songbook): Promise<Loaded> {
		const base = this.deps.baseUrl ?? '/';
		const manifest = CatalogManifest.parse(
			JSON.parse(await this.deps.fetchText(`${base}catalog-manifest.json`))
		);
		const entry = manifest.songbooks.find((candidate) => candidate.slug === songbook);
		if (!entry) throw new Error(`songbook "${songbook}" is not in the catalog manifest`);

		const hash = /\.([0-9a-f]{8})\.json$/.exec(entry.file)?.[1] ?? entry.file;
		let json = await this.deps.cache.get(hash);
		const fromCache = json !== undefined;
		if (json === undefined) {
			json = await this.deps.fetchText(`${base}${entry.file}`);
			await this.deps.cache.put(hash, json);
		}

		const catalog = Catalog.parse(JSON.parse(json));
		if (catalog.songbook !== songbook) {
			throw new Error(`${entry.file} holds ${catalog.songbook}, not ${songbook}`);
		}
		this.songs = expandCatalog(catalog);
		this.index = new SearchIndex(this.songs);
		this.current = songbook;
		return { songbook, version: catalog.version, count: this.songs.length, fromCache };
	}

	search(query: string, limit = 50): { hits: SongHit[]; total: number } {
		if (!this.index) throw new Error('no songbook loaded');
		const result = this.index.search(query, limit);
		return {
			total: result.total,
			hits: result.hits.map((hit) => ({ song: this.songs[hit.index], tier: hit.tier }))
		};
	}
}
