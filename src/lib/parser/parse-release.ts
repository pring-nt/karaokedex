import { createHash } from 'node:crypto';
import { extractPages } from './extract';
import { alphabeticalWarnings, mergeDuplicateCodes, sectionErrors } from './full-list-rules';
import { parseFullList } from './profiles/full-list';
import { parseMonthlyNewSongs } from './profiles/monthly-new-songs';
import { ParsedRelease, type ParsedRow } from './schema';
import { validateMonthlyRelease } from './validate';
import type { Songbook } from '../songbooks';

export interface ParseReleaseInput {
	songbook: Songbook;
	/** Expected release label: `YYYY-MM` for monthly songbooks, e.g. `full-vol-59` for a full list. */
	label: string;
	data: Uint8Array;
}

export interface ParseReleaseResult {
	release: ParsedRelease;
	/** Distinct code columns: the layout figure for monthly releases, the per-page maximum for full lists. */
	columns: number;
	/** Hard errors. A non-empty list means the release must not be imported. */
	errors: string[];
	warnings: string[];
}

function finish(
	input: ParseReleaseInput,
	rows: readonly ParsedRow[],
	profile: 'monthly-new-songs' | 'full-list'
): ParsedRelease {
	const sorted = [...rows].sort((a, b) => Number(a.code) - Number(b.code));
	return ParsedRelease.parse({
		songbook: input.songbook,
		label: input.label,
		kind: profile === 'full-list' ? 'full' : 'monthly',
		profile,
		fileHash: createHash('sha256').update(input.data).digest('hex'),
		codeMin: sorted[0]?.code,
		codeMax: sorted.at(-1)?.code,
		rows: sorted
	});
}

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
		return {
			release: finish(input, merged.rows, 'full-list'),
			columns: Math.max(...parsed.columns),
			errors,
			warnings: alphabeticalWarnings(parsed.entries)
		};
	}

	const parsed = parseMonthlyNewSongs(pages);
	const errors: string[] = [];
	if (parsed.label !== input.label) {
		errors.push(`file is labelled ${input.label} but the page header says ${parsed.label}`);
	}
	const release = finish(input, parsed.rows, 'monthly-new-songs');
	errors.push(...validateMonthlyRelease(release));
	return { release, columns: parsed.columns, errors, warnings: [] };
}
