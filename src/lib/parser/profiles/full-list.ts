import type { PdfPage, TextItem } from '../extract';
import { hasAccentMojibake, type FullListEntry } from '../full-list-rules';
import { isBrokenWordTail, joinFragments } from '../join';
import { lintRow } from '../lint';
import type { ReviewReason } from '../schema';

const CODE = /^\d{4,5}$/;
const SECTION_HEADER = /^(?:0~9|[A-Z])$/;
const PAGE_CHROME =
	/^(?:platinumkaraoke\.ph|Vol\. \d+ P-series|Full Songlist|No Magic, Pure Technology)$/;

/** Section headers and page banners are set in much larger type than the 8-14 pt cells. */
const LARGE_TYPE = 15;
const CHROME_MARGIN = 12;
const COLUMN_JUMP = 20;
const COLUMN_TOLERANCE = 3;

class FullListError extends Error {}

export interface FullListParse {
	entries: FullListEntry[];
	/** Code anchors found across all pages. Every one must be consumed exactly once. */
	anchors: number;
	/** Distinct code-column positions per page, as a layout sanity figure. */
	columns: number[];
}

interface RowDraft {
	page: number;
	section: string;
	title: TextItem[];
	code: TextItem | null;
	credit: TextItem[];
}

function mostCommonCodeFont(page: PdfPage): string {
	const counts = new Map<string, number>();
	for (const item of page.items) {
		if (CODE.test(item.str) && item.fontSize < LARGE_TYPE) {
			counts.set(item.font, (counts.get(item.font) ?? 0) + 1);
		}
	}
	const best = [...counts].sort((a, b) => b[1] - a[1]).at(0);
	if (!best) throw new FullListError(`page ${String(page.number)}: no code items found`);
	return best[0];
}

function countColumns(codes: readonly TextItem[]): number {
	const edges = codes.map((code) => code.x + code.width).sort((a, b) => a - b);
	let columns = 0;
	let last = -Infinity;
	for (const edge of edges) {
		if (edge - last > COLUMN_TOLERANCE) columns++;
		last = edge;
	}
	return columns;
}

/**
 * Parses a full songlist (Title, Code, Artist per cell, three column groups per page, sorted by
 * title under section headers). Rows are assembled in content-stream order, not by geometry:
 * the PDF was printed from a Word table whose cells are vertically centred on the code, so a
 * wrapped title or artist overflows into the neighbouring row. Code anchors are taken by font,
 * never by digits alone, because titles such as `214` or `2001 C.C. Rider` are bare numbers.
 */
export function parseFullList(pages: readonly PdfPage[]): FullListParse {
	const entries: FullListEntry[] = [];
	const columns: number[] = [];
	let anchors = 0;
	let section = '0~9';

	for (const page of pages) {
		const codeFont = mostCommonCodeFont(page);
		const isCode = (item: TextItem) => item.font === codeFont && CODE.test(item.str);
		const firstCode = page.items.findIndex(isCode);
		const firstY = page.items[firstCode]?.y ?? 0;

		const drafts: RowDraft[] = [];
		const newDraft = (): RowDraft => ({
			page: page.number,
			section,
			title: [],
			code: null,
			credit: []
		});
		let draft: RowDraft | null = null;

		for (const [index, item] of page.items.entries()) {
			const text = item.str.trim();
			if (item.fontSize >= LARGE_TYPE) {
				if (SECTION_HEADER.test(text)) section = text;
				continue;
			}
			if (PAGE_CHROME.test(text)) continue;
			if (index < firstCode && item.y > firstY + CHROME_MARGIN) continue;

			if (isCode(item)) {
				draft ??= newDraft();
				if (draft.code) {
					throw new FullListError(
						`page ${String(page.number)}: two codes in a row at ${draft.code.str}, ${item.str}`
					);
				}
				draft.code = item;
			} else if (draft?.code) {
				const startsNextRow =
					text !== '' && (item.x < draft.code.x - 1 || item.y > draft.code.y + COLUMN_JUMP);
				if (startsNextRow) {
					drafts.push(draft);
					draft = newDraft();
					draft.title.push(item);
				} else {
					draft.credit.push(item);
				}
			} else if (text !== '' || draft) {
				draft ??= newDraft();
				draft.title.push(item);
			}
		}
		if (draft) drafts.push(draft);

		const pageAnchors = page.items.filter(
			(item, index) => isCode(item) && !(index < firstCode && item.y > firstY + CHROME_MARGIN)
		);
		anchors += pageAnchors.length;
		columns.push(countColumns(pageAnchors));

		for (const row of drafts) {
			if (!row.code) {
				throw new FullListError(
					`page ${String(row.page)}: title without a code: ${joinFragments(row.title).text}`
				);
			}
			const { text: title, continuations: titleWraps } = joinFragments(row.title);
			const { text: creditRaw, continuations: creditWraps } = joinFragments(row.credit);
			if (title === '')
				throw new FullListError(`page ${String(row.page)}: code ${row.code.str} has no title`);

			const reviewReasons: ReviewReason[] = lintRow(title, creditRaw);
			if ([...titleWraps, ...creditWraps].some(isBrokenWordTail)) {
				reviewReasons.push('short-continuation');
			}
			if (hasAccentMojibake(title) || hasAccentMojibake(creditRaw))
				reviewReasons.push('accent-mojibake');
			entries.push({ code: row.code.str, title, creditRaw, section: row.section, reviewReasons });
		}
	}
	return { entries, anchors, columns };
}
