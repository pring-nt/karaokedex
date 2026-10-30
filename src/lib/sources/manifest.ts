import { z } from 'zod';
import type { SongList } from './songlist';

/** Product name on Platinum's page to the songbook slug. Unknown products are reported, never dropped. */
const PRODUCT_SONGBOOKS: Record<string, string> = {
	'MAJOR/ALPHA/CELLO/X3/PIANO XL HDD': 'hdd',
	'BMB / X2 / X1 / HDD': 'bmb-x2',
	'P-SERIES': 'p-series',
	'FLUTE/PIANO V1.5/PIANO XL SD/PK10': 'flute-piano',
	'REYNA SERIES': 'reyna',
	'T-X SERIES': 't-x',
	'KS-40 / KBOX-2 / KBOX-3': 'ks-40',
	'KS-5 / JUNIOR LITE / KS-10 / JUNIOR 2': 'ks-5',
	'KS-100 MINIBOX / KS-10 MINI SD': 'ks-100',
	'HERMOSA / N20 NANO PLUS': 'hermosa',
	'HOME 40 / NANO OLD': 'home-40',
	BRAVO: 'bravo'
};

/** Songbooks that are parsed. The rest are tracked so new volumes stay visible. */
const IN_SCOPE = new Set(['hdd', 'p-series', 'ks-40']);

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

const EntryStatus = z.enum(['missing', 'present', 'parsed', 'ignored']);
type EntryStatus = z.infer<typeof EntryStatus>;

export const SourceEntry = z.object({
	songbook: z.string().nullable(),
	product: z.string().min(1),
	kind: z.enum(['monthly', 'volume']),
	label: z.string().min(1),
	url: z.url(),
	firstSeen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	status: EntryStatus,
	file: z.string().optional(),
	sha256: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.optional(),
	removedUpstream: z.boolean().optional()
});
export type SourceEntry = z.infer<typeof SourceEntry>;

export const SourcesFile = z.object({
	asset: z.object({
		url: z.url(),
		version: z.string().min(1),
		checkedAt: z.string().min(1)
	}),
	entries: z.array(SourceEntry)
});
export type SourcesFile = z.infer<typeof SourcesFile>;

export interface ManifestEntry {
	songbook: string | null;
	product: string;
	kind: 'monthly' | 'volume';
	label: string;
	url: string;
}

/** `November`, `nov` or `Aug` to `YYYY-MM`. */
export function monthlyLabel(year: number, month: string): string {
	const wanted = month.trim().toLowerCase();
	const index = wanted.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(wanted)) : -1;
	if (index < 0) throw new Error(`unrecognised month "${month}"`);
	return `${String(year)}-${String(index + 1).padStart(2, '0')}`;
}

/** `108` to `vol-108`, `53 - 59` to `vol-53-59`, `87 (Training)` to `vol-87-training`. */
export function volumeLabel(volume: number | string): string {
	const slug = String(volume)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!/\d/.test(slug)) throw new Error(`volume "${String(volume)}" has no number`);
	return `vol-${slug}`;
}

export function entryKey(entry: Pick<ManifestEntry, 'songbook' | 'product' | 'label'>): string {
	return `${entry.songbook ?? entry.product}:${entry.label}`;
}

function isInScope(songbook: string | null): boolean {
	return songbook !== null && IN_SCOPE.has(songbook);
}

/** Where a listed PDF is expected on disk, relative to the repo root. */
export function expectedFile(entry: Pick<ManifestEntry, 'songbook' | 'label'>): string | null {
	return isInScope(entry.songbook) ? `data/pdfs/${entry.songbook ?? ''}/${entry.label}.pdf` : null;
}

export interface Manifest {
	entries: ManifestEntry[];
	/** Same key listed twice with different links. The first link wins. */
	conflicts: string[];
}

/** Flattens the page's data into one entry per listed PDF. */
export function toManifest(songList: SongList): Manifest {
	const entries = new Map<string, ManifestEntry>();
	const conflicts: string[] = [];
	const add = (product: string, kind: ManifestEntry['kind'], label: string, url: string) => {
		const entry = {
			songbook: PRODUCT_SONGBOOKS[product] ?? null,
			product,
			kind,
			label,
			url
		};
		const key = entryKey(entry);
		const existing = entries.get(key);
		if (!existing) entries.set(key, entry);
		else if (existing.url !== url) conflicts.push(`${key} is listed with two different links`);
	};

	for (const item of songList) {
		if ('years' in item) {
			for (const year of item.years) {
				for (const month of year.months) {
					add(item.product, 'monthly', monthlyLabel(year.year, month.month), month.link);
				}
			}
		} else {
			for (const volume of item.volumes) {
				add(item.product, 'volume', volumeLabel(volume.volume), volume.link);
			}
		}
	}
	return { entries: [...entries.values()], conflicts };
}

const SeedFile = z.object({
	products: z.array(
		z.object({
			product: z.string(),
			kind: z.enum(['monthly', 'volume']),
			entries: z.array(z.object({ label: z.string(), url: z.url() }))
		})
	)
});

/** Builds a manifest from `data/sources.seed.json`, the snapshot used when the live site is unreachable. */
export function manifestFromSeed(seed: unknown): Manifest {
	const parsed = SeedFile.parse(seed);
	return {
		entries: parsed.products.flatMap((product) =>
			product.entries.map((entry) => ({
				songbook: PRODUCT_SONGBOOKS[product.product] ?? null,
				product: product.product,
				kind: product.kind,
				label: entry.label,
				url: entry.url
			}))
		),
		conflicts: []
	};
}

export interface ManifestDiff {
	added: ManifestEntry[];
	urlChanged: { key: string; from: string; to: string }[];
	removedUpstream: SourceEntry[];
	unknownProducts: string[];
	assetVersion: { from: string; to: string } | null;
	changed: boolean;
}

export function diffManifest(
	current: SourcesFile | null,
	manifest: Manifest,
	assetVersion: string
): ManifestDiff {
	const known = new Map((current?.entries ?? []).map((entry) => [entryKey(entry), entry]));
	const listed = new Set(manifest.entries.map(entryKey));

	const added = manifest.entries.filter((entry) => !known.has(entryKey(entry)));
	const urlChanged = manifest.entries.flatMap((entry) => {
		const existing = known.get(entryKey(entry));
		return existing && existing.url !== entry.url
			? [{ key: entryKey(entry), from: existing.url, to: entry.url }]
			: [];
	});
	const removedUpstream = [...known]
		.filter(([key, entry]) => !listed.has(key) && !entry.removedUpstream)
		.map(([, entry]) => entry);
	const unknownProducts = [
		...new Set(added.filter((entry) => entry.songbook === null).map((entry) => entry.product))
	];
	const versionChanged = current !== null && current.asset.version !== assetVersion;

	return {
		added,
		urlChanged,
		removedUpstream,
		unknownProducts,
		assetVersion: versionChanged ? { from: current.asset.version, to: assetVersion } : null,
		changed: added.length + urlChanged.length + removedUpstream.length > 0
	};
}

function byKey(a: SourceEntry, b: SourceEntry): number {
	return entryKey(a).localeCompare(entryKey(b));
}

/**
 * Merges a diff into the manifest file. New entries start `missing` (or `ignored` out of scope),
 * moved links are updated, and entries gone upstream are kept and marked `removedUpstream`.
 */
export function applyDiff(
	current: SourcesFile | null,
	diff: ManifestDiff,
	manifest: Manifest,
	asset: { url: string; version: string },
	now: Date,
	exists: (path: string) => boolean
): SourcesFile {
	const today = now.toISOString().slice(0, 10);
	const urls = new Map(manifest.entries.map((entry) => [entryKey(entry), entry.url]));
	const removed = new Set(diff.removedUpstream.map(entryKey));

	const kept = (current?.entries ?? []).map((entry): SourceEntry => {
		const key = entryKey(entry);
		const url = urls.get(key) ?? entry.url;
		return removed.has(key) ? { ...entry, url, removedUpstream: true } : { ...entry, url };
	});
	const fresh = diff.added.map((entry): SourceEntry => {
		const file = expectedFile(entry);
		const status: EntryStatus = file === null ? 'ignored' : exists(file) ? 'present' : 'missing';
		return { ...entry, firstSeen: today, status, ...(file === null ? {} : { file }) };
	});

	return {
		asset: { url: asset.url, version: asset.version, checkedAt: now.toISOString() },
		entries: [...kept, ...fresh].sort(byKey)
	};
}
