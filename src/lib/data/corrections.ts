import { z } from 'zod';
import type { ParsedRow } from '../parser/schema';
import type { Songbook } from '../songbooks';

export const CorrectionsFile = z.record(
	z.string().regex(/^[a-z0-9-]+:\d{4,5}$/),
	z
		.object({
			title: z.string().min(1).optional(),
			creditRaw: z.string().optional(),
			versionNote: z.string().min(1).nullable().optional()
		})
		.strict()
);
export type CorrectionsFile = z.infer<typeof CorrectionsFile>;

export interface CorrectionResult {
	rows: ParsedRow[];
	missing: string[];
}

/**
 * Applies hand-written fixes after parse and lint. A corrected row is considered reviewed, so its
 * review flags are cleared. `missing` lists corrections whose code does not exist in `rows`.
 */
export function applyCorrections(
	songbook: Songbook,
	rows: readonly ParsedRow[],
	corrections: CorrectionsFile
): CorrectionResult {
	const prefix = `${songbook}:`;
	const wanted = new Map(
		Object.entries(corrections)
			.filter(([key]) => key.startsWith(prefix))
			.map(([key, value]) => [key.slice(prefix.length), value] as const)
	);

	const corrected = rows.map((row): ParsedRow => {
		const fix = wanted.get(row.code);
		if (!fix) return row;
		wanted.delete(row.code);
		return {
			...row,
			title: fix.title ?? row.title,
			creditRaw: fix.creditRaw ?? row.creditRaw,
			versionNote: fix.versionNote === undefined ? row.versionNote : fix.versionNote,
			needsReview: false,
			reviewReasons: []
		};
	});
	return { rows: corrected, missing: [...wanted.keys()].map((code) => `${prefix}${code}`) };
}
