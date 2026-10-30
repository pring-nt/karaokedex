import type { CorrectionsFile } from '../data/corrections';
import { createDb } from '../db';
import { writeRelease } from '../db/write';
import type { Aliases } from '../normalize/credit';
import { parseRelease } from '../parser/parse-release';
import { SONGBOOKS, type Songbook } from '../songbooks';
import { buildCatalog, buildShared, catalogFileName, manifestEntry, sharedFileName } from './build';
import { CatalogManifest, type Catalog } from './schema';

export interface PdfInput {
	songbook: Songbook;
	label: string;
	data: Uint8Array;
}

interface ReleaseReport {
	songbook: Songbook;
	label: string;
	rows: number;
	needsReview: number;
	errors: string[];
	warnings: string[];
}

interface BuiltCatalog {
	catalog: Catalog;
	file: string;
	json: string;
}

export interface PipelineResult {
	catalogs: BuiltCatalog[];
	/** The merged catalog of the shared numbering, as a file to write. */
	shared: { file: string; json: string } | null;
	manifest: CatalogManifest;
	reports: ReleaseReport[];
	/** Anything here means the build must fail. Releases with errors are left out of the catalogs. */
	errors: string[];
}

export interface PipelineOptions {
	aliases: Aliases;
	corrections: CorrectionsFile;
	generatedAt: string;
}

/**
 * Parses every PDF, writes them to a fresh in-memory database in songbook then label order, and
 * emits one catalog per songbook. A correction that never matched a row is an error.
 */
export async function buildCatalogs(
	inputs: readonly PdfInput[],
	options: PipelineOptions
): Promise<PipelineResult> {
	const db = createDb();
	const errors: string[] = [];
	const reports: ReleaseReport[] = [];
	const applied = new Set<string>();
	const written = new Set<Songbook>();

	const ordered = [...inputs].sort(
		(a, b) =>
			a.songbook.localeCompare(b.songbook) ||
			a.label.localeCompare(b.label, undefined, { numeric: true })
	);
	for (const input of ordered) {
		const result = await parseRelease({ ...input, corrections: options.corrections });
		for (const key of result.appliedCorrections) applied.add(key);
		reports.push({
			songbook: input.songbook,
			label: input.label,
			rows: result.release.rows.length,
			needsReview: result.release.rows.filter((row) => row.needsReview).length,
			errors: result.errors,
			warnings: result.warnings
		});
		if (result.errors.length > 0) {
			errors.push(...result.errors.map((error) => `${input.songbook} ${input.label}: ${error}`));
			continue;
		}
		writeRelease(db, result.release, options.aliases);
		written.add(input.songbook);
	}

	const present = new Set(inputs.map((input) => input.songbook));
	for (const key of Object.keys(options.corrections)) {
		const [songbook] = key.split(':');
		if (present.has(songbook as Songbook) && !applied.has(key)) {
			errors.push(`correction ${key} matches no row in any release`);
		}
	}

	const books = Object.keys(SONGBOOKS).filter((slug): slug is Songbook =>
		written.has(slug as Songbook)
	);
	const catalogs = books.map((songbook): BuiltCatalog => {
		const catalog = buildCatalog(db, songbook, options.generatedAt);
		return { catalog, file: catalogFileName(catalog), json: JSON.stringify(catalog) };
	});
	const merged = buildShared(catalogs.map(({ catalog }) => catalog));
	const shared = merged && { file: sharedFileName(merged), json: JSON.stringify(merged) };
	const manifest = CatalogManifest.parse({
		shared: shared?.file,
		songbooks: catalogs.map(({ catalog }) => manifestEntry(catalog))
	});
	return { catalogs, shared, manifest, reports, errors };
}
