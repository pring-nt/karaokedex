import type { TextItem } from './extract';

/** Fraction of the font size a horizontal gap between two items must exceed to count as a space. */
const SPACE_GAP = 0.15;
const SAME_LINE = 2;

export interface JoinedText {
	text: string;
	/** Fragments that start a new line. Very short ones suggest a word broken mid-word. */
	continuations: string[];
}

/**
 * Joins the text items of one cell. A whitespace-only item, a line break, or a horizontal gap
 * wider than `SPACE_GAP` of the font size becomes one space; items are never split. Some PDFs
 * emit no space characters at all between words, so geometry is the only reliable signal.
 */
export function joinFragments(items: readonly TextItem[]): JoinedText {
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
			const sameLine = !previous.hasEOL && Math.abs(item.y - previous.y) <= SAME_LINE;
			const gap = item.x - (previous.x + previous.width);
			const brokenWord = previous.hasEOL && !pendingSpace && isBrokenWordTail(item.str.trim());
			const spaced =
				!brokenWord &&
				(pendingSpace ||
					previous.hasEOL ||
					/\s$/.test(previous.str) ||
					(sameLine && gap > SPACE_GAP * previous.fontSize));
			text += spaced ? ' ' : '';
			if (previous.hasEOL) continuations.push(item.str.trim());
		}
		text += item.str.trim();
		previous = item;
		pendingSpace = false;
	}
	return { text: text.replace(/\s+/g, ' ').trim(), continuations };
}

/**
 * A continuation line that is one or two lowercase characters (`g`, `ck`) is the tail of a word
 * broken mid-word, and is joined to it without a space. Every such case in the 143 HDD lists and the
 * P-series list was a broken word. Capitalised tails (`Go`) are words. Rows with one are still flagged.
 */
export function isBrokenWordTail(fragment: string): boolean {
	return fragment.length <= 2 && /^\p{Ll}/u.test(fragment);
}
