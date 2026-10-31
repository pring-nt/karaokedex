import { extractVersionNote } from '../../normalize/version';
import type { PdfPage, TextItem } from '../extract';
import type { ParsedRow } from '../schema';
import { parseFullList } from './full-list';

const CODE = /^\d{4,5}$/;
/** Page numbers, volume stamps and model notes share a footer below the last table row. */
const FOOTER_Y = 30;
/** A wrapped artist cell reaches this far below the row's code. */
const ROW_REACH = 8;

/** Whole-line text printed inside the table: site links, stamps, adverts and regional headings. */
const INLINE_CHROME =
	/^(?:(?:www\.)?platinumkaraoke\.ph|Vol\.? ?\d+(?: For P-Series| T-X-R-BMB Series)?|P-SERIES VOLUME \d+|v\.\s?\d+|recording\.|(?:Waray|Ilonggo|Ilongo|Bicol|Bicolano|Mindanao|Igorot|Pangasinan|Zambales|Tagalog Folk|Classic Male Love|New Christmas) Songs|Instantly hear and feel .*|We would like to ask you, .*|customers to try and evaluate .*|songs and let us know what .*|them\.|Please give us your feedback, .*|and suggestions along with .*|phone number at|platinumkaraokeph@yahoo\.com)$/;
const SIGNATURE = /^New (?:Training )?Songs$/;

/** P-Series volumes end some titles with a lone `a` or `q`, a marker that is not part of the name. */
const TITLE_MARKER = /\s+[aq]$/;

class ProfileError extends Error {}

export interface VolumeListOptions {
	stripMarkers?: boolean;
}

export interface VolumeListParse {
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
			return (
				item.y >= footer &&
				!INLINE_CHROME.test(item.str.trim()) &&
				!isTitleHeader(page.items, index)
			);
		})
	};
}

/**
 * Parses one update file of any list except HDD and P-Series. They print the monthly table layout,
 * so the shared row assembly applies once the footer is gone, but they carry no month header. The
 * volume number is not checked against the file: since Vol 25 some KS files only print the matching
 * T-X volume. A code printed twice in one file keeps its first row.
 */
export function parseVolumeList(
	pages: readonly PdfPage[],
	options: VolumeListOptions = {}
): VolumeListParse {
	if (!pages.some((page) => page.items.some((item) => SIGNATURE.test(item.str.trim())))) {
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
		if (printed.has(entry.code)) return false;
		printed.add(entry.code);
		return true;
	});

	const rows = unique.map((entry): ParsedRow => {
		const printed = options.stripMarkers ? entry.title.replace(TITLE_MARKER, '') : entry.title;
		const { title, versionNote } = extractVersionNote(printed);
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
