import type { ParsedRelease } from './schema';

export interface CodeRun {
	min: number;
	max: number;
	count: number;
}

/** Maximal runs of consecutive codes, in ascending order. Older releases print several. */
export function codeRuns(release: ParsedRelease): CodeRun[] {
	const codes = [...new Set(release.rows.map((row) => Number(row.code)))].sort((a, b) => a - b);
	const runs: CodeRun[] = [];
	for (const code of codes) {
		const last = runs.at(-1);
		if (last && code === last.max + 1) {
			last.max = code;
			last.count++;
		} else {
			runs.push({ min: code, max: code, count: 1 });
		}
	}
	return runs;
}

function mainRun(release: ParsedRelease): CodeRun | undefined {
	return codeRuns(release).sort((a, b) => b.count - a.count || a.min - b.min)[0];
}

/** Errors for a monthly release: codes must be unique and match the declared `codeMin..codeMax`. */
export function validateMonthlyRelease(release: ParsedRelease): string[] {
	const errors: string[] = [];
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const row of release.rows) {
		if (seen.has(row.code)) duplicates.add(row.code);
		seen.add(row.code);
	}
	if (duplicates.size > 0) {
		errors.push(`${release.label}: duplicate codes ${[...duplicates].join(', ')}`);
	}

	const codes = release.rows.map((row) => Number(row.code));
	const min = Math.min(...codes);
	const max = Math.max(...codes);
	if (min !== Number(release.codeMin) || max !== Number(release.codeMax)) {
		errors.push(
			`${release.label}: declared range ${release.codeMin}-${release.codeMax} but rows span ${String(min)}-${String(max)}`
		);
	}
	return errors;
}

/**
 * A single run is the clean case. Several runs are reported, not rejected: older releases mix a new
 * block with codes from earlier ranges, and a gap inside a recent release may still be a missed row.
 */
export function runWarnings(release: ParsedRelease): string[] {
	const runs = codeRuns(release);
	if (runs.length <= 1) return [];
	const listed = runs
		.slice(0, 6)
		.map((run) => `${String(run.min)}-${String(run.max)} (${String(run.count)})`)
		.join(', ');
	return [
		`${release.label}: ${String(runs.length)} code runs: ${listed}${runs.length > 6 ? ', ...' : ''}`
	];
}

/** Warnings where a release's main run does not start right after the previous release's main run. */
export function crossReleaseWarnings(releases: readonly ParsedRelease[]): string[] {
	const sorted = [...releases].sort((a, b) =>
		a.label.localeCompare(b.label, undefined, { numeric: true })
	);
	const warnings: string[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const previous = sorted[i - 1];
		const current = sorted[i];
		const before = mainRun(previous);
		const after = mainRun(current);
		if (!before || !after) continue;
		if (after.min !== before.max + 1) {
			warnings.push(
				`${current.label} starts at ${String(after.min)}, expected ${String(before.max + 1)} after ${previous.label} (${String(before.max)})`
			);
		}
	}
	return warnings;
}
