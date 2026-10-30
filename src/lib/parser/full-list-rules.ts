import { boundedEditDistance } from '../normalize/distance';
import { normalize } from '../normalize/text';
import { extractVersionNote } from '../normalize/version';
import { lintRow } from './lint';
import type { ParsedRow, ReviewReason } from './schema';

/** One song as listed in a full songlist, in reading order (page, column, row). */
export interface FullListEntry {
	code: string;
	title: string;
	creditRaw: string;
	/** Section header the entry sits under: `0~9` or a single letter. */
	section: string;
	reviewReasons: ReviewReason[];
}

export interface MergeResult {
	rows: ParsedRow[];
	errors: string[];
}

/**
 * Collapses entries that share a code. The same code under two titles is one song with an
 * alternate title; the same code under different artists is an error.
 */
export function mergeDuplicateCodes(entries: readonly FullListEntry[]): MergeResult {
	const errors: string[] = [];
	const byCode = new Map<string, FullListEntry[]>();
	for (const entry of entries) {
		const group = byCode.get(entry.code);
		if (group) group.push(entry);
		else byCode.set(entry.code, [entry]);
	}

	const rows: ParsedRow[] = [];
	for (const [code, group] of byCode) {
		const first = group.at(0);
		if (!first) continue;
		const others = group.slice(1);
		for (const other of others) {
			if (normalize(other.creditRaw) !== normalize(first.creditRaw)) {
				errors.push(
					`${code} is listed with different artists: "${first.creditRaw}" and "${other.creditRaw}"`
				);
			}
		}

		const { title, versionNote } = extractVersionNote(first.title);
		const seen = new Set([normalize(first.title)]);
		const altTitles: string[] = [];
		for (const other of others) {
			if (!seen.has(normalize(other.title))) {
				seen.add(normalize(other.title));
				altTitles.push(other.title);
			}
		}

		const reviewReasons = [
			...new Set(
				group.flatMap((entry) => [...entry.reviewReasons, ...lintRow(entry.title, entry.creditRaw)])
			)
		];
		rows.push({
			code,
			title,
			versionNote,
			altTitles,
			creditRaw: first.creditRaw,
			needsReview: reviewReasons.length > 0,
			reviewReasons
		});
	}
	return { rows, errors };
}

/** Section by the raw first character: titles opening with a digit or symbol, like `(I've Had)`, sit under `0~9`. */
function sectionOf(title: string): string {
	const first = title.trimStart().normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase();
	return /^[A-Z]$/.test(first) ? first : '0~9';
}

/** Errors for entries whose title does not belong under the section header they were read under. */
export function sectionErrors(entries: readonly FullListEntry[]): string[] {
	return entries
		.filter((entry) => sectionOf(entry.title) !== entry.section)
		.map(
			(entry) =>
				`${entry.code} "${entry.title}" sits under section ${entry.section}, expected ${sectionOf(entry.title)}`
		);
}

/**
 * Warnings where normalized titles go backwards inside a section. That almost always means a
 * wrapped title was joined wrongly.
 */
export function alphabeticalWarnings(entries: readonly FullListEntry[]): string[] {
	const warnings: string[] = [];
	let previous: FullListEntry | null = null;
	for (const entry of entries) {
		if (previous?.section === entry.section && normalize(entry.title) < normalize(previous.title)) {
			warnings.push(
				`${entry.code} "${entry.title}" sorts before ${previous.code} "${previous.title}"`
			);
		}
		previous = entry;
	}
	return warnings;
}

/** Accent mojibake like `Jos``E` or `G'omez`: a backtick, or a quote before a lowercase letter inside a word. */
export function hasAccentMojibake(text: string): boolean {
	return /`|\p{L}'\p{Ll}/u.test(text);
}

/**
 * Pairs of artist names within `maxDistance` edits after normalization. Pairs already mapped to
 * the same canonical name are ignored, so the report only lists spellings still to be aliased.
 */
export function nearDuplicateArtists(
	names: readonly string[],
	canonical: (name: string) => string,
	maxDistance = 2
): [string, string][] {
	const unique = [
		...new Map(names.map((name) => [normalize(canonical(name)), canonical(name)])).entries()
	];
	const pairs: [string, string][] = [];
	for (let i = 0; i < unique.length; i++) {
		for (let j = i + 1; j < unique.length; j++) {
			const [aNorm, aName] = unique[i] ?? ['', ''];
			const [bNorm, bName] = unique[j] ?? ['', ''];
			if (Math.min(aNorm.length, bNorm.length) < 5) continue;
			if (boundedEditDistance(aNorm, bNorm, maxDistance) <= maxDistance) pairs.push([aName, bName]);
		}
	}
	return pairs;
}
