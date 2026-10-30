import { createHash } from 'node:crypto';
import { applyCorrections, type CorrectionsFile } from '../data/corrections';
import { extractPages } from './extract';
import { alphabeticalWarnings, mergeDuplicateCodes, sectionErrors } from './full-list-rules';
import { parseFullList } from './profiles/full-list';
import { parseKsVolume } from './profiles/ks-volume';
import { parseMonthlyNewSongs } from './profiles/monthly-new-songs';
import { ParsedRelease, type ParsedRow } from './schema';
import { runWarnings, validateMonthlyRelease } from './validate';
import type { Songbook } from '../songbooks';

export interface ParseReleaseInput {
	songbook: Songbook;
	/** Expected release label: `YYYY-MM` for monthly songbooks, e.g. `full-vol-59` for a full list. */
	label: string;
	data: Uint8Array;
	/** Hand-written fixes, applied after parsing and before validation. */
	corrections?: CorrectionsFile;
}

export interface ParseReleaseResult {
	release: ParsedRelease;
	/** Distinct code columns: the layout figure for monthly releases, the per-page maximum for full lists. */
	columns: number;
	/** Hard errors. A non-empty list means the release must not be imported. */
	errors: string[];
	warnings: string[];
	/** Corrections that matched a row in this release, as `songbook:code` keys. */
	appliedCorrections: string[];
}

function finish(
	input: ParseReleaseInput,
	parsedRows: readonly ParsedRow[],
	profile: ParsedRelease['profile'],
	errors: string[]
): { release: ParsedRelease; applied: string[] } {
	const corrected = applyCorrections(input.songbook, parsedRows, input.corrections ?? {});
	errors.push(
		...corrected.ambiguous.map((key) => `correction ${key} matches several rows; add ifTitle`)
	);
	const unmatched = new Set([...corrected.missing, ...corrected.ambiguous]);
	const applied = Object.keys(input.corrections ?? {}).filter(
		(key) => key.startsWith(`${input.songbook}:`) && !unmatched.has(key)
	);
	const sorted = [...corrected.rows].sort((a, b) => Number(a.code) - Number(b.code));
	const release = ParsedRelease.parse({
		songbook: input.songbook,
		label: input.label,
		kind: RELEASE_KIND[profile],
		profile,
		fileHash: createHash('sha256').update(input.data).digest('hex'),
		codeMin: sorted[0]?.code,
		codeMax: sorted.at(-1)?.code,
		rows: sorted
	});
	return { release, applied };
}

const RELEASE_KIND = {
	'monthly-new-songs': 'monthly',
	'full-list': 'full',
	'ks-volume': 'volume'
} as const;

/** Picks the parser profile from the songbook and parses one PDF into a validated release. */
export async function parseRelease(input: ParseReleaseInput): Promise<ParseReleaseResult> {
	const pages = await extractPages(input.data);

	if (input.songbook === 'p-series') {
		const parsed = parseFullList(pages);
		const merged = mergeDuplicateCodes(parsed.entries);
		const errors = [...merged.errors, ...sectionErrors(parsed.entries)];
		if (parsed.entries.length !== parsed.anchors) {
			errors.push(
				`${String(parsed.anchors)} code anchors but ${String(parsed.entries.length)} rows`
			);
		}
		const { release, applied } = finish(input, merged.rows, 'full-list', errors);
		return {
			release,
			columns: Math.max(...parsed.columns),
			errors,
			warnings: alphabeticalWarnings(parsed.entries),
			appliedCorrections: applied
		};
	}

	if (input.songbook === 'ks-40') {
		const parsed = parseKsVolume(pages);
		const errors: string[] = [];
		const { release, applied } = finish(input, parsed.rows, 'ks-volume', errors);
		errors.push(...validateMonthlyRelease(release));
		return {
			release,
			columns: parsed.columns,
			errors,
			warnings: runWarnings(release),
			appliedCorrections: applied
		};
	}

	const parsed = parseMonthlyNewSongs(pages);
	const errors: string[] = [];
	if (parsed.label !== input.label) {
		errors.push(`file is labelled ${input.label} but the page header says ${parsed.label}`);
	}
	const { release, applied } = finish(input, parsed.rows, 'monthly-new-songs', errors);
	errors.push(...validateMonthlyRelease(release));
	return {
		release,
		columns: parsed.columns,
		errors,
		warnings: runWarnings(release),
		appliedCorrections: applied
	};
}
