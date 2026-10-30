import { extractVersionNote } from '../../normalize/version';
import { monthlyLabel } from '../../sources/manifest';
import type { PdfPage } from '../extract';
import type { ParsedRow } from '../schema';
import { parseFullList } from './full-list';

const MONTH_HEADER = /^([A-Za-z]{3,9}) (\d{4})(?: HDD)?$/;

class ProfileError extends Error {}

export interface MonthlyParse {
	label: string;
	rows: ParsedRow[];
	/** Code columns on the widest page: 3 for the older wide layout, 2 for the newer one. */
	columns: number;
	emptyPages: number[];
}

/** `June 2026`, `Jun 2015 HDD` and `March 2017 HDD` all name a month; anything else is not a header. */
function detectLabel(pages: readonly PdfPage[]): string {
	const labels = new Set<string>();
	for (const page of pages) {
		for (const item of page.items) {
			const match = MONTH_HEADER.exec(item.str.trim());
			if (!match?.[1] || !match[2]) continue;
			try {
				labels.add(monthlyLabel(Number(match[2]), match[1]));
			} catch {
				continue;
			}
		}
	}
	const [label, ...rest] = labels;
	if (!label || rest.length > 0) {
		throw new ProfileError(`expected exactly one month header, found ${String(labels.size)}`);
	}
	return label;
}

/**
 * Parses a monthly "New Songs" release of any age. It shares the stream-order row assembly of the
 * full-list profile: older files are several pages, carry table headers and adverts inside the
 * page, and print a code block plus codes from earlier ranges, so no layout or contiguity is assumed.
 */
export function parseMonthlyNewSongs(pages: readonly PdfPage[]): MonthlyParse {
	if (!pages.some((page) => page.items.some((item) => item.str.trim() === 'New Songs'))) {
		throw new ProfileError('page signature "New Songs" not found');
	}
	const label = detectLabel(pages);
	const parsed = parseFullList(pages, { allowEmptyPages: true, dropTableChrome: true });
	if (parsed.entries.length !== parsed.anchors) {
		throw new ProfileError(
			`${String(parsed.anchors)} code anchors but ${String(parsed.entries.length)} rows`
		);
	}

	const rows = parsed.entries.map((entry): ParsedRow => {
		const { title, versionNote } = extractVersionNote(entry.title);
		return {
			code: entry.code,
			title,
			versionNote,
			altTitles: [],
			creditRaw: entry.creditRaw,
			needsReview: entry.reviewReasons.length > 0,
			reviewReasons: entry.reviewReasons
		};
	});
	return {
		label,
		rows,
		columns: Math.max(0, ...parsed.columns),
		emptyPages: parsed.emptyPages
	};
}
