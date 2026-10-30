import { createHash } from 'node:crypto';
import type { ParsedRelease, ParsedRow } from '../src/lib/parser/schema';

export function makeRow(code: string, overrides: Partial<ParsedRow> = {}): ParsedRow {
	return {
		code,
		title: `Song ${code}`,
		versionNote: null,
		altTitles: [],
		creditRaw: 'Artist',
		needsReview: false,
		reviewReasons: [],
		...overrides
	};
}

export function makeRelease(
	label: string,
	rows: ParsedRow[],
	overrides: Partial<ParsedRelease> = {}
): ParsedRelease {
	const codes = rows.map((row) => Number(row.code));
	return {
		songbook: 'hdd',
		label,
		kind: 'monthly',
		profile: 'monthly-new-songs',
		fileHash: createHash('sha256').update(label).digest('hex'),
		codeMin: String(Math.min(...codes)),
		codeMax: String(Math.max(...codes)),
		rows,
		...overrides
	};
}
