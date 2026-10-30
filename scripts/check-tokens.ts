import { Glob } from 'bun';

export interface TokenViolation {
	file: string;
	line: number;
	rule: 'color' | 'radius' | 'duration';
	text: string;
}

const COLOR_LITERAL =
	/(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\(/i;
const RADIUS_LITERAL =
	/(?:border(?:-[a-z]+){0,2}-radius|--radius[\w-]*)\s*:[^;{}]*\d(?:px|r?em)\b|\brounded(?:-[a-z]{1,2})?-\[[^\]]*\d(?:px|r?em)[^\]]*\]/i;
const DURATION_LITERAL =
	/(?:(?:transition|animation)(?:-duration|-delay)?\s*:[^;{}]*\d\s?m?s\b)|\b(?:duration|delay)-\[[^\]]*\d\s?m?s[^\]]*\]|\b(?:duration|delay)\s*:\s*\d/i;

const RULES = [
	{ rule: 'color', pattern: COLOR_LITERAL },
	{ rule: 'radius', pattern: RADIUS_LITERAL },
	{ rule: 'duration', pattern: DURATION_LITERAL }
] as const;

const SCANNED = ['src/lib/components/**/*.{svelte,ts,css}', 'src/routes/**/*.{svelte,ts,css}'];

/**
 * Finds raw color, radius and duration literals in a source file.
 * Raw values may only live in `src/lib/styles/`.
 */
export function scanSource(file: string, source: string): TokenViolation[] {
	const violations: TokenViolation[] = [];
	source.split(/\r?\n/).forEach((text, index) => {
		for (const { rule, pattern } of RULES) {
			if (pattern.test(text)) {
				violations.push({ file, line: index + 1, rule, text: text.trim() });
			}
		}
	});
	return violations;
}

async function main(): Promise<void> {
	const violations: TokenViolation[] = [];
	for (const pattern of SCANNED) {
		for await (const file of new Glob(pattern).scan({ cwd: process.cwd() })) {
			const normalized = file.replaceAll('\\', '/');
			violations.push(...scanSource(normalized, await Bun.file(file).text()));
		}
	}

	for (const { file, line, rule, text } of violations) {
		console.error(`${file}:${String(line)} raw ${rule} value: ${text}`);
	}
	if (violations.length > 0) {
		console.error(`\ncheck:tokens found ${String(violations.length)} violation(s)`);
		process.exit(1);
	}
	console.log('check:tokens ok');
}

if (import.meta.main) {
	await main();
}
