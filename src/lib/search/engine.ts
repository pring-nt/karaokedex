import { Catalog, CatalogManifest, expandCatalog, type Song } from '../catalog/schema';
import { artistSlug } from '../catalog/slug';
import type { Songbook } from '../songbooks';
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

/**
 * Fetches the manifest, then the chosen songbook's catalog (from the cache when its hash is known),
 * validates it and builds the search index. Framework-free so it can run in a worker or in tests.
 */
export class SearchEngine {
	private songs: Song[] = [];
	private index: SearchIndex | null = null;
	private current: Songbook | null = null;
	private releaseList: ReleaseSummary[] = [];
	private byArtist = new Map<string, Set<number>>();
	private byCode = new Map<string, Song[]>();

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
		const songs = expandCatalog(catalog);

		const counts = new Map<string, number>();
		const byArtist = new Map<string, Set<number>>();
		const byCode = new Map<string, Song[]>();
		songs.forEach((song, position) => {
			counts.set(song.release, (counts.get(song.release) ?? 0) + 1);
			byCode.set(song.code, [...(byCode.get(song.code) ?? []), song]);
			for (const artist of song.artists) {
				const slug = artistSlug(artist.name);
				const members = byArtist.get(slug);
				if (members) members.add(position);
				else byArtist.set(slug, new Set([position]));
			}
		});

		this.songs = songs;
		this.byArtist = byArtist;
		this.byCode = byCode;
		this.releaseList = catalog.releases
			.map(([label, codeMin, codeMax]) => ({
				label,
				codeMin,
				codeMax,
				count: counts.get(label) ?? 0
			}))
			.sort((a, b) => b.label.localeCompare(a.label));
		this.index = new SearchIndex(songs);
		this.current = songbook;
		return { songbook, version: catalog.version, count: songs.length, fromCache };
	}

	private filter(options: SearchOptions): SongFilter | undefined {
		const members = options.artist
			? (this.byArtist.get(options.artist) ?? new Set<number>())
			: null;
		const release = options.release;
		if (!members && !release) return undefined;
		return (position) =>
			(!members || members.has(position)) &&
			(!release || this.songs[position]?.release === release);
	}

	/**
	 * Ranked search. An empty query lists every song the filter lets through (all of them without
	 * one) in catalog order, which is how browsing and the artist and release pages are built.
	 */
	search(query: string, options: SearchOptions = {}): SearchResponse {
		const index = this.index;
		if (!index) throw new Error('no songbook loaded');
		const limit = options.limit ?? DEFAULT_LIMIT;
		const filter = this.filter(options);

		if (query.trim() === '') {
			const hits: SongHit[] = [];
			let total = 0;
			this.songs.forEach((song, position) => {
				if (filter && !filter(position)) return;
				total++;
				if (hits.length < limit) hits.push({ song, tier: 0 });
			});
			return { hits, total };
		}

		const result = index.search(query, limit, filter, options.field);
		return {
			total: result.total,
			hits: result.hits.map((hit) => ({ song: this.songs[hit.index], tier: hit.tier }))
		};
	}

	/** Songs for these codes, in the order given. Unknown codes are skipped. */
	songsByCodes(codes: readonly string[]): Song[] {
		if (!this.index) throw new Error('no songbook loaded');
		return codes.flatMap((code) => this.byCode.get(code) ?? []);
	}

	/** Releases newest first, with how many songs each first listed. */
	releases(): ReleaseSummary[] {
		if (!this.index) throw new Error('no songbook loaded');
		return this.releaseList;
	}
}
