const QUALIFIER = String.raw`(?:(?:soul|r&b|soulrock|soul jazz|funk)\s*)?(?:cover|version|remix|reimagined)`;
const PARENTHESIZED = new RegExp(String.raw`\s*\(\s*(${QUALIFIER})\s*\)\s*$`, 'i');
const TRAILING = new RegExp(String.raw`\s+(${QUALIFIER})\s*$`, 'i');

export interface TitleParts {
	title: string;
	versionNote: string | null;
}

/**
 * Splits a trailing or parenthesized version qualifier (`Funk Version`, `(Cover)`) off a title.
 * Font size is deliberately not used; small type is also how long titles are made to fit.
 */
export function extractVersionNote(rawTitle: string): TitleParts {
	const title = rawTitle.trim();
	for (const pattern of [PARENTHESIZED, TRAILING]) {
		const match = pattern.exec(title);
		const note = match?.[1];
		if (match && note) {
			const rest = title.slice(0, match.index).trim();
			if (rest.length > 0) {
				return { title: rest, versionNote: note.replace(/\s+/g, ' ') };
			}
		}
	}
	return { title, versionNote: null };
}
