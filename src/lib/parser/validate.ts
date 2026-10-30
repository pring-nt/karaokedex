import type { ParsedRelease } from './schema';

/** Errors for a monthly release: codes must be unique and contiguous, matching `codeMin..codeMax`. */
export function validateMonthlyRelease(release: ParsedRelease): string[] {
	const errors: string[] = [];
	const codes = release.rows.map((row) => Number(row.code));
	const unique = new Set(codes);

	if (unique.size !== codes.length) {
		const seen = new Set<number>();
		const duplicates = new Set<string>();
		for (const row of release.rows) {
			if (seen.has(Number(row.code))) duplicates.add(row.code);
			seen.add(Number(row.code));
		}
		errors.push(`${release.label}: duplicate codes ${[...duplicates].join(', ')}`);
	}

	const min = Math.min(...codes);
	const max = Math.max(...codes);
	if (min !== Number(release.codeMin) || max !== Number(release.codeMax)) {
		errors.push(
			`${release.label}: declared range ${release.codeMin}-${release.codeMax} but rows span ${String(min)}-${String(max)}`
		);
	}
	if (unique.size !== max - min + 1) {
		const missing: number[] = [];
		for (let code = min; code <= max; code++) if (!unique.has(code)) missing.push(code);
		errors.push(
			`${release.label}: ${String(unique.size)} rows for range ${String(min)}-${String(max)}, missing ${missing.join(', ')}`
		);
	}
	return errors;
}

/** Warnings where a release does not start right after the previous one ends. */
export function crossReleaseWarnings(releases: readonly ParsedRelease[]): string[] {
	const sorted = [...releases].sort((a, b) => a.label.localeCompare(b.label));
	const warnings: string[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const previous = sorted[i - 1];
		const current = sorted[i];
		const expected = Number(previous.codeMax) + 1;
		if (Number(current.codeMin) !== expected) {
			warnings.push(
				`${current.label} starts at ${current.codeMin}, expected ${String(expected)} after ${previous.label} (${previous.codeMax})`
			);
		}
	}
	return warnings;
}
