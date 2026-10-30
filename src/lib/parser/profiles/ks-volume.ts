import { normalize } from '../../normalize/text';
import { extractVersionNote } from '../../normalize/version';
import type { PdfPage, TextItem } from '../extract';
import type { ParsedRow } from '../schema';
import { parseFullList } from './full-list';

const CODE = /^\d{4,5}$/;
/** Page numbers, volume stamps and model notes share a footer below the last table row. */
const FOOTER_Y = 30;
/** A wrapped artist cell reaches this far below the row's code. */
const ROW_REACH = 8;

class ProfileError extends Error {}

export interface KsVolumeParse {
	rows: ParsedRow[];
	/** Code columns on the widest page: 2 for the older layout, 3 for the newer one. */
	columns: number;
}

/**
 * `Title` is also a real song, so the table header is only dropped when `Code` follows it, where
 * a song would be followed by its own code.
 */
function isTitleHeader(items: readonly TextItem[], index: number): boolean {
	if (items[index]?.str.trim() !== 'Title') return false;
	return (
		items
			.slice(index + 1)
			.find((item) => item.str.trim() !== '')
			?.str.trim() === 'Code'
	);
}

function withoutChrome(page: PdfPage): PdfPage {
	const codes = page.items.filter((item) => CODE.test(item.str.trim()));
	const lowestRow = Math.min(...codes.map((item) => item.y));
	const footer = Math.min(FOOTER_Y, lowestRow - ROW_REACH);
	return {
		...page,
		items: page.items.filter((item, index) => {
			return item.y >= footer && !isTitleHeader(page.items, index);
		})
	};
}

/**
 * Parses a KS-series "New Songs" volume. These print the monthly table layout, so the shared row
 * assembly applies once the footer is gone, but they carry no month header. The volume number is
 * not checked against the file: since Vol 25 some files only print the matching T-X volume. A song
 * printed twice in one volume, as Vol 14 does with 28289, counts once.
 */
export function parseKsVolume(pages: readonly PdfPage[]): KsVolumeParse {
	if (!pages.some((page) => page.items.some((item) => item.str.trim() === 'New Songs'))) {
		throw new ProfileError('page signature "New Songs" not found');
	}
	const parsed = parseFullList(pages.map(withoutChrome), {
		allowEmptyPages: true,
		dropTableChrome: true
	});
	if (parsed.entries.length !== parsed.anchors) {
		throw new ProfileError(
			`${String(parsed.anchors)} code anchors but ${String(parsed.entries.length)} rows`
		);
	}

	const printed = new Set<string>();
	const unique = parsed.entries.filter((entry) => {
		const key = `${entry.code} ${normalize(entry.title)}`;
		if (printed.has(key)) return false;
		printed.add(key);
		return true;
	});

	const rows = unique.map((entry): ParsedRow => {
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
	return { rows, columns: Math.max(0, ...parsed.columns) };
}
