import { z } from 'zod';
import { normalize } from './text';

export const AliasesFile = z.object({
	atomic: z.array(z.string().min(1)),
	map: z.record(z.string(), z.string().min(1))
});
export type Aliases = z.infer<typeof AliasesFile>;

type ArtistRole = 'primary' | 'featured';

export interface CreditArtist {
	name: string;
	role: ArtistRole;
}

const FEAT_GROUP = /\(\s*(?:featuring|feat\.?|ft\.?)\s+([^()]*)\)/gi;
const SEPARATOR = /\s*[,&]\s*|\s+x\s+|\s+(?:ft\.?|feat\.?|featuring)(?:\s+|$)/gi;
const FEAT_MARKER = /^\s*(?:ft|feat|featuring)/i;
const PLACEHOLDER = /(\d+)/g;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function mask(value: string, masked: string[]): string {
	masked.push(value);
	return `${String(masked.length - 1)}`;
}

function maskOutermostGroups(text: string, masked: string[]): string {
	let result = '';
	let last = 0;
	const open: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '(') {
			open.push(i);
		} else if (char === ')' && open.length > 0) {
			const start = open.pop();
			if (open.length === 0 && start !== undefined) {
				result += text.slice(last, start) + mask(text.slice(start, i + 1), masked);
				last = i + 1;
			}
		}
	}
	return result + text.slice(last);
}

function restore(value: string, masked: string[]): string {
	return value.replace(PLACEHOLDER, (_, index: string) => masked[Number(index)] ?? '');
}

/**
 * Splits a credit line into artists. `creditRaw` stays the display source of truth; this is
 * for indexing and linking. Parenthesized groups are never split except `(feat. ...)`, and
 * names listed as atomic in the aliases file are never split.
 */
export function splitCredit(creditRaw: string, aliases: Aliases): CreditArtist[] {
	const masked: string[] = [];
	let text = creditRaw;

	for (const name of aliases.atomic) {
		const pattern = new RegExp(
			name
				.trim()
				.split(/\s+/)
				.map(escapeRegExp)
				.join(String.raw`\s+`),
			'gi'
		);
		text = text.replace(pattern, () => mask(name, masked));
	}
	text = text.replace(FEAT_GROUP, ' feat. $1 ');
	text = maskOutermostGroups(text, masked);

	const artists: CreditArtist[] = [];
	const seen = new Set<string>();
	const push = (fragment: string, role: ArtistRole): void => {
		const name = restore(fragment, masked).replace(/\s+/g, ' ').trim();
		if (name.length === 0) return;
		const canonical = aliases.map[normalize(name)] ?? name;
		const key = normalize(canonical);
		if (seen.has(key)) return;
		seen.add(key);
		artists.push({ name: canonical, role });
	};

	let role: ArtistRole = 'primary';
	let last = 0;
	for (const match of text.matchAll(SEPARATOR)) {
		push(text.slice(last, match.index), role);
		if (FEAT_MARKER.test(match[0])) role = 'featured';
		last = match.index + match[0].length;
	}
	push(text.slice(last), role);
	return artists;
}
