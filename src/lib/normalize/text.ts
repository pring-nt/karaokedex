const APOSTROPHES = /['‘’‛ʼ´`]/g;

/**
 * Search/match key: NFKC, lowercase, diacritics and apostrophes removed, other punctuation
 * collapsed to single spaces. Never use the result for display.
 */
export function normalize(input: string): string {
	return input
		.normalize('NFKC')
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(APOSTROPHES, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}
