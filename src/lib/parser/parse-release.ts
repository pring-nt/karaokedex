import { createHash } from 'node:crypto';
import { extractPages } from './extract';
import { parseMonthlyNewSongs } from './profiles/monthly-new-songs';
import { ParsedRelease } from './schema';
import { validateMonthlyRelease } from './validate';
import type { Songbook } from '../songbooks';

export interface ParseReleaseInput {
	songbook: Songbook;
	/** Expected release label (`YYYY-MM`), normally taken from the file name. */
	label: string;
	data: Uint8Array;
}

export interface ParseReleaseResult {
	release: ParsedRelease;
	columns: number;
	/** Hard errors. A non-empty list means the release must not be imported. */
	errors: string[];
}

/** Picks the parser profile from the songbook and parses one PDF into a validated release. */
export async function parseRelease(input: ParseReleaseInput): Promise<ParseReleaseResult> {
	if (input.songbook !== 'hdd') {
		throw new Error(`no parser profile for songbook "${input.songbook}" yet`);
	}
	const pages = await extractPages(input.data);
	const parsed = parseMonthlyNewSongs(pages);

	const errors: string[] = [];
	if (parsed.label !== input.label) {
		errors.push(`file is labelled ${input.label} but the page header says ${parsed.label}`);
	}

	const sorted = [...parsed.rows].sort((a, b) => Number(a.code) - Number(b.code));
	const release = ParsedRelease.parse({
		songbook: input.songbook,
		label: input.label,
		kind: 'monthly',
		profile: 'monthly-new-songs',
		fileHash: createHash('sha256').update(input.data).digest('hex'),
		codeMin: sorted[0]?.code,
		codeMax: sorted.at(-1)?.code,
		rows: sorted
	});
	errors.push(...validateMonthlyRelease(release));
	return { release, columns: parsed.columns, errors };
}
