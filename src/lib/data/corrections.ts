import { z } from 'zod';
import { normalize } from '../normalize/text';
import type { ParsedRow } from '../parser/schema';
import type { Songbook } from '../songbooks';

export const CorrectionsFile = z.record(
	z.string().regex(/^[a-z0-9-]+:\d{4,5}$/),
	z
		.object({
			/** Only correct the row with this title; needed when the source prints one code twice. */
			ifTitle: z.string().min(1).optional(),
			/** Replace the code itself, for codes mistyped in the source PDF. */
			code: z
				.string()
				.regex(/^\d{4,5}$/)
				.optional(),
			title: z.string().min(1).optional(),
			creditRaw: z.string().optional(),
			versionNote: z.string().min(1).nullable().optional()
		})
		.strict()
);
export type CorrectionsFile = z.infer<typeof CorrectionsFile>;

export interface CorrectionResult {
	rows: ParsedRow[];
	/** Corrections whose code (and `ifTitle`) matches no row. */
	missing: string[];
	/** Corrections that match several rows and need an `ifTitle`. */
	ambiguous: string[];
}

/**
 * Applies hand-written fixes after parse and lint. A corrected row is considered reviewed, so its
 * review flags are cleared.
 */
export function applyCorrections(
	songbook: Songbook,
	rows: readonly ParsedRow[],
	corrections: CorrectionsFile
): CorrectionResult {
	const prefix = `${songbook}:`;
	const result: ParsedRow[] = [...rows];
	const missing: string[] = [];
	const ambiguous: string[] = [];

	for (const [key, fix] of Object.entries(corrections)) {
		if (!key.startsWith(prefix)) continue;
		const code = key.slice(prefix.length);
		const matches = result.flatMap((row, index) =>
			row.code === code && (!fix.ifTitle || normalize(row.title) === normalize(fix.ifTitle))
				? [index]
				: []
		);
		const index = matches.at(0);
		const row = index === undefined ? undefined : result[index];
		if (index === undefined || !row) missing.push(key);
		else if (matches.length > 1) ambiguous.push(key);
		else {
			result[index] = {
				...row,
				code: fix.code ?? row.code,
				title: fix.title ?? row.title,
				creditRaw: fix.creditRaw ?? row.creditRaw,
				versionNote: fix.versionNote === undefined ? row.versionNote : fix.versionNote,
				needsReview: false,
				reviewReasons: []
			};
		}
	}
	return { rows: result, missing, ambiguous };
}
