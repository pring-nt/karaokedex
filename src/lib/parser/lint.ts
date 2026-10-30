import type { ReviewReason } from './schema';

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const OPENERS = new Set(Object.values(PAIRS));
const DANGLING = /(?:(?:^|\s)(?:ft\.?|feat\.?|x)|[&,])\s*$/i;

function isBalanced(text: string): boolean {
	const stack: string[] = [];
	for (const char of text) {
		if (OPENERS.has(char)) {
			stack.push(char);
		} else if (char in PAIRS && stack.pop() !== PAIRS[char]) {
			return false;
		}
	}
	return stack.length === 0;
}

/** Heuristic flags for a row that probably needs a human look. Never an error by itself. */
export function lintRow(title: string, creditRaw: string): ReviewReason[] {
	const reasons: ReviewReason[] = [];
	if (!isBalanced(title) || !isBalanced(creditRaw)) reasons.push('unbalanced-brackets');
	if (creditRaw.trim().length === 0) reasons.push('empty-credit');
	else if (DANGLING.test(creditRaw)) reasons.push('dangling-credit');
	return reasons;
}
