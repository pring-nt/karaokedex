import {
	Catalog,
	CatalogManifest,
	expandCatalog,
	expandShared,
	SharedCatalog,
	sharedKey,
	type Song
} from '../catalog/schema';
import { artistSlug } from '../catalog/slug';
import { SHARED_SONGBOOKS, type Songbook } from '../songbooks';
import { SearchIndex, type SongFilter } from './index';
import type { SearchField } from './query';

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
	/** Songs other lists print that this one does not. */
	otherCount: number;
	fromCache: boolean;
}

export interface SongHit {
	song: Song;
	tier: number;
}

export interface SearchOptions {
	limit?: number;
	/** What the query is matched against, every field by default. */
	field?: SearchField;
	/** Only songs credited to the artist with this slug. */
	artist?: string;
	/** Only songs first listed in the release with this label. */
	release?: string;
	/** Search the songs of other lists instead of the loaded songbook's own. */
	others?: boolean;
}

export interface ReleaseSummary {
	label: string;
	count: number;
	codeMin: string;
	codeMax: string;
}

export interface SearchResponse {
	hits: SongHit[];
	total: number;
}

const DEFAULT_LIMIT = 50;

/** A set of songs with what searching them needs. */
interface Pool {
	songs: Song[];
	index: SearchIndex;
	byArtist: Map<string, Set<number>>;
	byCode: Map<string, Song[]>;
}

function buildPool(songs: Song[]): Pool {
	const byArtist = new Map<string, Set<number>>();
	const byCode = new Map<string, Song[]>();
	songs.forEach((song, position) => {
		byCode.set(song.code, [...(byCode.get(song.code) ?? []), song]);
		for (const artist of song.artists) {
			const slug = artistSlug(artist.name);
			const members = byArtist.get(slug);
			if (members) members.add(position);
			else byArtist.set(slug, new Set([position]));
		}
	});
	return { songs, index: new SearchIndex(songs), byArtist, byCode };
}

/**
 * Fetches the manifest, then the chosen songbook's catalog (from the cache when its hash is known),
 * validates it and builds the search index. Lists that share a numbering also get the merged
 * catalog, for what each song is listed on and for songs only other lists print. Framework-free
 * so it can run in a worker or in tests.
 */
export class SearchEngine {
	private own: Pool | null = null;
	private others: Pool | null = null;
	private current: Songbook | null = null;
	private releaseList: ReleaseSummary[] = [];

	constructor(private readonly deps: EngineDeps) {}

	get songbook(): Songbook | null {
		return this.current;
	}

	private async fetchFile(file: string): Promise<{ json: string; fromCache: boolean }> {
		const hash = /\.([0-9a-f]{8})\.json$/.exec(file)?.[1] ?? file;
		const cached = await this.deps.cache.get(hash);
		if (cached !== undefined) return { json: cached, fromCache: true };
		const json = await this.deps.fetchText(`${this.deps.baseUrl ?? '/'}${file}`);
		await this.deps.cache.put(hash, json);
		return { json, fromCache: false };
	}

	async load(songbook: Songbook): Promise<Loaded> {
		const base = this.deps.baseUrl ?? '/';
		const manifest = CatalogManifest.parse(
			JSON.parse(await this.deps.fetchText(`${base}catalog-manifest.json`))
		);
		const entry = manifest.songbooks.find((candidate) => candidate.slug === songbook);
		if (!entry) throw new Error(`songbook "${songbook}" is not in the catalog manifest`);

		const { json, fromCache } = await this.fetchFile(entry.file);
		const catalog = Catalog.parse(JSON.parse(json));
		if (catalog.songbook !== songbook) {
			throw new Error(`${entry.file} holds ${catalog.songbook}, not ${songbook}`);
		}
		const songs = expandCatalog(catalog);

		let otherSongs: Song[] = [];
		if (manifest.shared && SHARED_SONGBOOKS.includes(songbook)) {
			const shared = await this.fetchFile(manifest.shared);
			const merged = expandShared(SharedCatalog.parse(JSON.parse(shared.json)));
			const lists = new Map(merged.map((song) => [sharedKey(song.code), song.lists]));
			for (const song of songs) song.lists = lists.get(sharedKey(song.code)) ?? [songbook];
			const own = new Set(songs.map((song) => sharedKey(song.code)));
			otherSongs = merged.filter((song) => !own.has(sharedKey(song.code)));
		}

		const counts = new Map<string, number>();
		for (const song of songs) counts.set(song.release, (counts.get(song.release) ?? 0) + 1);
		const summaries = new Map<string, ReleaseSummary>();
		for (const [label, codeMin, codeMax] of catalog.releases) {
			const known = summaries.get(label);
			summaries.set(label, {
				label,
				codeMin: known && Number(known.codeMin) < Number(codeMin) ? known.codeMin : codeMin,
				codeMax: known && Number(known.codeMax) > Number(codeMax) ? known.codeMax : codeMax,
				count: counts.get(label) ?? 0
			});
		}

		this.releaseList = [...summaries.values()].sort((a, b) =>
			b.label.localeCompare(a.label, undefined, { numeric: true })
		);
		this.own = buildPool(songs);
		this.others = buildPool(otherSongs);
		this.current = songbook;
		return {
			songbook,
			version: catalog.version,
			count: songs.length,
			otherCount: otherSongs.length,
			fromCache
		};
	}

	private filter(pool: Pool, options: SearchOptions): SongFilter | undefined {
		const members = options.artist
			? (pool.byArtist.get(options.artist) ?? new Set<number>())
			: null;
		const release = options.release;
		if (!members && !release) return undefined;
		return (position) =>
			(!members || members.has(position)) &&
			(!release || pool.songs[position]?.release === release);
	}

	/**
	 * Ranked search. An empty query lists every song the filter lets through (all of them without
	 * one) in catalog order, which is how browsing and the artist and release pages are built.
	 */
	search(query: string, options: SearchOptions = {}): SearchResponse {
		const pool = options.others ? this.others : this.own;
		if (!pool) throw new Error('no songbook loaded');
		const limit = options.limit ?? DEFAULT_LIMIT;
		const filter = this.filter(pool, options);

		if (query.trim() === '') {
			const hits: SongHit[] = [];
			let total = 0;
			pool.songs.forEach((song, position) => {
				if (filter && !filter(position)) return;
				total++;
				if (hits.length < limit) hits.push({ song, tier: 0 });
			});
			return { hits, total };
		}

		const result = pool.index.search(query, limit, filter, options.field);
		return {
			total: result.total,
			hits: result.hits.map((hit) => ({ song: pool.songs[hit.index], tier: hit.tier }))
		};
	}

	/** Songs for these codes, in the order given. A code from another list still resolves. */
	songsByCodes(codes: readonly string[]): Song[] {
		const { own, others } = this;
		if (!own) throw new Error('no songbook loaded');
		return codes.flatMap((code) => own.byCode.get(code) ?? others?.byCode.get(code) ?? []);
	}

	/** Releases newest first, with how many songs each first listed. */
	releases(): ReleaseSummary[] {
		if (!this.own) throw new Error('no songbook loaded');
		return this.releaseList;
	}
}
