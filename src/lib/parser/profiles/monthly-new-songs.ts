import { extractVersionNote } from '../../normalize/version';
import type { PdfPage, TextItem } from '../extract';
import { lintRow } from '../lint';
import type { ParsedRow, ReviewReason } from '../schema';

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const MONTH_HEADER = new RegExp(`^(${MONTHS.join('|')}) (\\d{4})$`);
const CODE = /^\d{5}$/;

/** Points above the first code row beyond which an item is page chrome rather than part of a row. */
const CHROME_MARGIN = 12;
/** Points a following item must sit above the previous code to be the first row of the next column. */
const COLUMN_JUMP = 20;
const COLUMN_TOLERANCE = 3;

class ProfileError extends Error {}

export interface MonthlyParse {
	label: string;
	rows: ParsedRow[];
	columns: number;
}

interface RowDraft {
	title: TextItem[];
	code: TextItem | null;
	credit: TextItem[];
}

function joinFragments(items: readonly TextItem[]): { text: string; continuations: string[] } {
	let text = '';
	let previous: TextItem | null = null;
	let pendingSpace = false;
	const continuations: string[] = [];
	for (const item of items) {
		if (item.str === '') continue;
		if (item.str.trim() === '') {
			pendingSpace = text.length > 0;
			continue;
		}
		if (previous) {
			const gap = pendingSpace || previous.hasEOL || /\s$/.test(previous.str);
			text += gap ? ' ' : '';
			if (previous.hasEOL) continuations.push(item.str.trim());
		}
		text += item.str.trim();
		previous = item;
		pendingSpace = false;
	}
	return { text: text.replace(/\s+/g, ' ').trim(), continuations };
}

function detectLabel(items: readonly TextItem[]): string {
	const labels = new Set<string>();
	for (const item of items) {
		const match = MONTH_HEADER.exec(item.str.trim());
		if (match?.[1] && match[2]) {
			const month = MONTHS.indexOf(match[1]) + 1;
			labels.add(`${match[2]}-${String(month).padStart(2, '0')}`);
		}
	}
	const [label, ...rest] = labels;
	if (!label || rest.length > 0) {
		throw new ProfileError(
			`expected exactly one "Month YYYY" header, found ${String(labels.size)}`
		);
	}
	return label;
}

function mostCommonCodeFont(items: readonly TextItem[]): string {
	const counts = new Map<string, number>();
	for (const item of items) {
		if (CODE.test(item.str)) counts.set(item.font, (counts.get(item.font) ?? 0) + 1);
	}
	const best = [...counts].sort((a, b) => b[1] - a[1]).at(0);
	if (!best) throw new ProfileError('no 5-digit code items found');
	return best[0];
}

function countColumns(codes: readonly TextItem[]): number {
	const xs = codes.map((code) => code.x).sort((a, b) => a - b);
	let columns = 0;
	let last = -Infinity;
	for (const x of xs) {
		if (x - last > COLUMN_TOLERANCE) columns++;
		last = x;
	}
	return columns;
}

/**
 * Parses a single-page "New Songs" release. Rows are assembled in content-stream order
 * (title items, code, artist items), never by geometry, because cells overflow into
 * neighbouring rows. Column groups are implied by the code anchors, so two and three
 * column layouts need no configuration.
 */
export function parseMonthlyNewSongs(pages: readonly PdfPage[]): MonthlyParse {
	const page = pages.at(0);
	if (!page || pages.length !== 1) {
		throw new ProfileError(`expected a single page, found ${String(pages.length)}`);
	}
	if (!page.items.some((item) => item.str.trim() === 'New Songs')) {
		throw new ProfileError('page signature "New Songs" not found');
	}

	const label = detectLabel(page.items);
	const codeFont = mostCommonCodeFont(page.items);
	const isCode = (item: TextItem) => item.font === codeFont && CODE.test(item.str);
	const firstCode = page.items.findIndex(isCode);
	const firstY = page.items[firstCode]?.y ?? 0;
	const body = page.items.filter(
		(item, index) => index >= firstCode || item.y <= firstY + CHROME_MARGIN
	);

	const drafts: RowDraft[] = [];
	let draft: RowDraft = { title: [], code: null, credit: [] };
	for (const item of body) {
		if (isCode(item)) {
			if (draft.code)
				throw new ProfileError(`two codes in a row at ${draft.code.str}, ${item.str}`);
			draft.code = item;
			continue;
		}
		if (draft.code) {
			const startsNextRow =
				item.str.trim() !== '' &&
				(item.x < draft.code.x - 1 || item.y > draft.code.y + COLUMN_JUMP);
			if (startsNextRow) {
				drafts.push(draft);
				draft = { title: [item], code: null, credit: [] };
			} else {
				draft.credit.push(item);
			}
		} else {
			draft.title.push(item);
		}
	}
	if (draft.code || draft.title.length > 0) drafts.push(draft);

	const rows = drafts.map((entry): ParsedRow => {
		if (!entry.code)
			throw new ProfileError(`title without a code: ${joinFragments(entry.title).text}`);
		const { text: rawTitle, continuations: titleWraps } = joinFragments(entry.title);
		const { text: creditRaw, continuations: creditWraps } = joinFragments(entry.credit);
		if (rawTitle === '') throw new ProfileError(`code ${entry.code.str} has no title`);

		const { title, versionNote } = extractVersionNote(rawTitle);
		const reviewReasons: ReviewReason[] = lintRow(rawTitle, creditRaw);
		if ([...titleWraps, ...creditWraps].some((fragment) => fragment.length <= 2)) {
			reviewReasons.push('short-continuation');
		}
		return {
			code: entry.code.str,
			title,
			versionNote,
			altTitles: [],
			creditRaw,
			needsReview: reviewReasons.length > 0,
			reviewReasons
		};
	});

	const anchors = body.filter(isCode);
	if (rows.length !== anchors.length) {
		throw new ProfileError(
			`${String(anchors.length)} code anchors but ${String(rows.length)} rows`
		);
	}
	return { label, rows, columns: countColumns(anchors) };
}
